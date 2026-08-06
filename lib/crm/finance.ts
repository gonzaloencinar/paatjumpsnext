import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { convexMutation, convexQuery } from "@/lib/convex/server";
import {
  FINANCE_FREQUENCIES,
  FINANCE_PARTNERS,
  type FinancePartner,
} from "./format";
import { isPurchasedShipment } from "./packlink-sync";
import { MADRID_TZ, madridLocalToUtc } from "./schedule";

// Finanzas de socios (/admin/finance): cuadre mensual entre Gonzalo y Patri.
// Ingresos = ventas cobradas de Shopify (sin IVA, netas de reembolsos, las
// cobra Gonzalo) + ingresos manuales; gastos manuales y recurrentes con quién
// los pagó. El % de IRPF se reserva SOLO sobre la base de Gonzalo (autónomo:
// sus ingresos − sus gastos deducibles; lo de Patri no tributa) y la retiene
// él. El beneficio neto se reparte al 50% y el saldo final dice quién
// transfiere a quién, estilo Tricount.
//
// Los datos viven en Convex (convex/finance.ts); este módulo adapta los docs
// a la forma legacy (snake_case, ISO, null) que esperan los componentes y
// conserva toda la lógica de agregación por mes de Madrid.

export type Partner = FinancePartner;

export type FinanceEntry = {
  id: string;
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: string;
  entry_date: string;
  notes: string | null;
  recurring_id: string | null;
  period: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceRecurring = {
  id: string;
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: "gonzalo" | "patri";
  frequency: string;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function entryToLegacy(doc: Doc<"finance_entries">): FinanceEntry {
  return {
    id: doc._id,
    type: doc.type,
    concept: doc.concept,
    amount: doc.amount,
    partner: doc.partner,
    entry_date: doc.entryDate,
    notes: doc.notes ?? null,
    recurring_id: doc.recurringId ?? null,
    period: doc.period ?? null,
    deleted_at: null, // la query solo devuelve entradas vivas
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

function recurringToLegacy(doc: Doc<"finance_recurring">): FinanceRecurring {
  return {
    id: doc._id,
    type: doc.type,
    concept: doc.concept,
    amount: doc.amount,
    partner: doc.partner,
    frequency: doc.frequency,
    day_of_month: doc.dayOfMonth,
    starts_on: doc.startsOn,
    ends_on: doc.endsOn ?? null,
    active: doc.active,
    notes: doc.notes ?? null,
    created_at: new Date(doc.createdAt).toISOString(),
    updated_at: new Date(doc.updatedAt).toISOString(),
  };
}

// ─────────────────────────── meses (Madrid) ───────────────────────────

export const MONTH_RE = /^\d{4}-\d{2}$/;

export function currentMadridMonth(): string {
  // en-CA formatea YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y!, m! - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─────────────────────────── Shopify ───────────────────────────

// Estados en los que el dinero se llegó a cobrar (REST y GraphQL en minúsculas;
// los reembolsos se descuentan aparte vía total_refunded).
const CHARGED_STATUSES = new Set(["paid", "partially_refunded", "refunded"]);

type FinanceOrder = {
  createdAt: number;
  financialStatus: string | null;
  totalPrice: number | null;
  totalTax: number | null;
  totalRefunded: number;
  totalShipping: number | null;
};

// Venta efectiva sin IVA: base imponible del pedido menos los reembolsos
// prorrateados (no guardamos el desglose de impuestos de cada refund).
function orderNetExTax(o: FinanceOrder): number {
  const total = o.totalPrice ?? 0;
  if (total <= 0) return 0;
  const exTaxRatio = (total - (o.totalTax ?? 0)) / total;
  const collected = Math.max(total - (o.totalRefunded ?? 0), 0);
  return collected * exTaxRatio;
}

export type ShopifySummary = {
  orders: number;
  gross: number; // cobrado con IVA, neto de reembolsos
  net: number; // sin IVA, neto de reembolsos → ingreso del cuadre
  // Envío cobrado a los clientes (informativo; el gasto real sale del sync
  // de Packlink)
  shipping: number;
};

// Los envíos los paga Gonzalo: el coste real sin IVA del mes (sync de
// Packlink) entra al cuadre como gasto automático suyo.
export function shippingExpenseEntry(
  shipping: number,
): Pick<FinanceEntry, "type" | "amount" | "partner">[] {
  return shipping > 0
    ? [{ type: "expense", amount: shipping, partner: "gonzalo" }]
    : [];
}

// ─────────────────────────── recurrentes ───────────────────────────

type Occurrence = {
  type: "income" | "expense";
  concept: string;
  amount: number;
  partner: "gonzalo" | "patri";
  entry_date: string;
  recurring_id: string;
  period: string;
};

function occurrencesFor(
  rec: FinanceRecurring,
  fromMonth: string,
  toMonth: string,
): Occurrence[] {
  const interval = FINANCE_FREQUENCIES[rec.frequency]?.months ?? 1;
  const anchor = rec.starts_on.slice(0, 7);
  const endCap = rec.ends_on ? rec.ends_on.slice(0, 7) : toMonth;
  const start = anchor > fromMonth ? anchor : fromMonth;
  const end = endCap < toMonth ? endCap : toMonth;
  const result: Occurrence[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) {
    const diff = monthDiff(anchor, m);
    if (diff < 0 || diff % interval !== 0) continue;
    result.push({
      type: rec.type,
      concept: rec.concept,
      amount: rec.amount,
      partner: rec.partner,
      entry_date: `${m}-${String(rec.day_of_month).padStart(2, "0")}`,
      recurring_id: rec.id,
      period: m,
    });
  }
  return result;
}

// Inserta las ocurrencias vencidas (hasta el mes actual incluido) que falten.
// Idempotente por el índice (recurringId, period) — el upsert es transaccional
// en Convex; los tombstones (deletedAt) bloquean la re-creación de entradas
// borradas a propósito.
export async function materializeRecurring(
  recurrings: FinanceRecurring[],
  uptoMonth: string,
) {
  const rows = recurrings
    .filter((rec) => rec.active)
    .flatMap((rec) =>
      occurrencesFor(rec, rec.starts_on.slice(0, 7), uptoMonth),
    );
  if (rows.length === 0) return;
  await convexMutation(api.finance.materializeRecurring, {
    rows: rows.map((occ) => ({
      recurringId: occ.recurring_id as Id<"finance_recurring">,
      period: occ.period,
      type: occ.type,
      concept: occ.concept,
      amount: occ.amount,
      partner: occ.partner,
      entryDate: occ.entry_date,
    })),
  });
}

// ─────────────────────────── cuadre ───────────────────────────

export type PartnerBalance = {
  received: number; // ingresos que cobró
  paidExpenses: number; // gastos que adelantó
  irpfReserve: number; // reserva de IRPF que retiene (solo Gonzalo)
  share: number; // su mitad del beneficio neto
  balance: number; // >0 → debe transferir al otro
};

export type MonthTotals = {
  shopifyNet: number;
  manualIncome: number;
  income: number;
  expenses: number;
  gross: number;
  irpfBase: number; // ingresos − gastos de Gonzalo (lo único que él declara)
  irpf: number;
  netProfit: number;
  share: number;
  partners: Record<Partner, PartnerBalance>;
  transfer: { from: Partner; to: Partner; amount: number } | null;
};

export function computeMonthTotals(
  shopifyNet: number,
  entries: Pick<FinanceEntry, "type" | "amount" | "partner">[],
  irpfPct: number,
): MonthTotals {
  const incomeBy: Record<Partner, number> = { gonzalo: shopifyNet, patri: 0 };
  const expenseBy: Record<Partner, number> = { gonzalo: 0, patri: 0 };
  let manualIncome = 0;
  for (const entry of entries) {
    const partner = (
      entry.partner === "patri" ? "patri" : "gonzalo"
    ) as Partner;
    if (entry.type === "income") {
      incomeBy[partner] += entry.amount;
      manualIncome += entry.amount;
    } else {
      expenseBy[partner] += entry.amount;
    }
  }

  const income = incomeBy.gonzalo + incomeBy.patri;
  const expenses = expenseBy.gonzalo + expenseBy.patri;
  const gross = income - expenses;
  // El IRPF sale solo de lo que declara Gonzalo (autónomo): sus ingresos menos
  // los gastos que paga él (los deducibles). Lo de Patri no tributa — sus
  // ingresos (efectivo) entran ya limpios al reparto y sus gastos no deducen.
  const irpfBase = incomeBy.gonzalo - expenseBy.gonzalo;
  const irpf = irpfBase > 0 ? (irpfBase * irpfPct) / 100 : 0;
  const netProfit = gross - irpf;
  const share = netProfit / 2;

  const partners = {} as Record<Partner, PartnerBalance>;
  for (const partner of FINANCE_PARTNERS) {
    const irpfReserve = partner === "gonzalo" ? irpf : 0;
    const received = incomeBy[partner];
    const paidExpenses = expenseBy[partner];
    partners[partner] = {
      received,
      paidExpenses,
      irpfReserve,
      share,
      balance: received - paidExpenses - irpfReserve - share,
    };
  }

  const debtor = partners.gonzalo.balance > 0 ? "gonzalo" : "patri";
  const amount = partners[debtor].balance;
  const transfer =
    amount > 0.005
      ? { from: debtor, to: debtor === "gonzalo" ? "patri" : "gonzalo", amount }
      : null;

  return {
    shopifyNet,
    manualIncome,
    income,
    expenses,
    gross,
    irpfBase,
    irpf,
    netProfit,
    share,
    partners,
    transfer: transfer as MonthTotals["transfer"],
  };
}

// ─────────────────────────── datos de la página ───────────────────────────

export type ProjectedEntry = Occurrence & { projected: true };

export type YearRow = {
  month: string;
  income: number;
  expenses: number;
  irpfPct: number;
  netProfit: number;
  transfer: MonthTotals["transfer"];
};

// Envíos ya pagados del mes (coste real SIN IVA, sincronizado por cron),
// desglosados por proveedor: entran directos como gasto automático de
// Gonzalo (él paga tanto Packlink PRO como el saldo de Genei).
export type PacklinkSummary = {
  count: number;
  cost: number;
  missingCost: number; // envíos sin coste extraíble (revisar extractor)
};

type ShippingByProvider = { packlink: PacklinkSummary; genei: PacklinkSummary };

const emptyShipping = (): ShippingByProvider => ({
  packlink: { count: 0, cost: 0, missingCost: 0 },
  genei: { count: 0, cost: 0, missingCost: 0 },
});

export type FinanceData = {
  month: string;
  currentMonth: string;
  irpfPct: number; // efectivo del mes visto (override si existe, si no global)
  globalIrpfPct: number;
  irpfOverridden: boolean;
  shopify: ShopifySummary;
  entries: FinanceEntry[];
  projected: ProjectedEntry[];
  totals: MonthTotals;
  recurrings: FinanceRecurring[];
  yearRows: YearRow[];
  packlink: PacklinkSummary;
  genei: PacklinkSummary;
};

export async function getFinanceData(
  requestedMonth?: string,
): Promise<FinanceData> {
  const currentMonth = currentMadridMonth();
  const month =
    requestedMonth && MONTH_RE.test(requestedMonth)
      ? requestedMonth
      : currentMonth;

  const [settings, recurringDocs, irpfRows] = await Promise.all([
    convexQuery(api.finance.settings, {}),
    convexQuery(api.finance.recurrings, {}),
    convexQuery(api.finance.monthIrpf, {}),
  ]);
  const globalIrpfPct = settings?.irpfPct ?? 37;
  const recurrings = recurringDocs.map(recurringToLegacy);

  // Tipo del mes: override/cierre si hay fila, si no el global vigente
  const irpfByMonth = new Map(
    irpfRows.map((row) => [row.month, row.irpfPct]),
  );
  const pctFor = (m: string) => irpfByMonth.get(m) ?? globalIrpfPct;
  const irpfPct = pctFor(month);

  // Materializa lo vencido antes de leer los movimientos
  await materializeRecurring(recurrings, currentMonth);

  const year = month.slice(0, 4);
  const [entryDocs, shopifyByMonth, shippingByMonth] = await Promise.all([
    convexQuery(api.finance.entriesForYear, { year }),
    getShopifyByMonth(year),
    getShippingByMonth(),
  ]);
  // La query ya devuelve solo entradas vivas del año, ordenadas por fecha
  const yearEntries = entryDocs.map(entryToLegacy);

  const entries = yearEntries.filter((e) => e.entry_date.startsWith(month));
  const shopify = shopifyByMonth.get(month) ?? {
    orders: 0,
    gross: 0,
    net: 0,
    shipping: 0,
  };

  // Mes futuro: proyección de recurrentes sin materializar
  const projected: ProjectedEntry[] =
    month > currentMonth
      ? recurrings
          .filter((rec) => rec.active)
          .flatMap((rec) => occurrencesFor(rec, month, month))
          .map((occ) => ({ ...occ, projected: true as const }))
      : [];

  const shippingFor = (m: string) => shippingByMonth.get(m) ?? emptyShipping();
  const shippingCost = (m: string) => {
    const s = shippingFor(m);
    return s.packlink.cost + s.genei.cost;
  };

  const totals = computeMonthTotals(
    shopify.net,
    [...entries, ...projected, ...shippingExpenseEntry(shippingCost(month))],
    irpfPct,
  );

  // Resumen del año: meses con actividad hasta el mes actual (o el visto)
  const lastMonth = month > currentMonth ? month : currentMonth;
  const yearRows: YearRow[] = [];
  for (
    let m = `${year}-01`;
    m <= lastMonth && m <= `${year}-12`;
    m = addMonths(m, 1)
  ) {
    const monthEntries = yearEntries.filter((e) => e.entry_date.startsWith(m));
    const monthShopify = shopifyByMonth.get(m) ?? {
      orders: 0,
      gross: 0,
      net: 0,
      shipping: 0,
    };
    const monthShipping = shippingFor(m);
    if (
      monthEntries.length === 0 &&
      monthShopify.orders === 0 &&
      monthShipping.packlink.count === 0 &&
      monthShipping.genei.count === 0 &&
      m !== month
    ) {
      continue;
    }
    const t = computeMonthTotals(
      monthShopify.net,
      [...monthEntries, ...shippingExpenseEntry(shippingCost(m))],
      pctFor(m),
    );
    yearRows.push({
      month: m,
      income: t.income,
      expenses: t.expenses,
      irpfPct: pctFor(m),
      netProfit: t.netProfit,
      transfer: t.transfer,
    });
  }

  return {
    month,
    currentMonth,
    irpfPct,
    globalIrpfPct,
    irpfOverridden: irpfByMonth.has(month),
    shopify,
    entries,
    projected,
    totals,
    recurrings,
    yearRows,
    packlink: shippingFor(month).packlink,
    genei: shippingFor(month).genei,
  };
}

const MADRID_MONTH_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: MADRID_TZ,
  year: "numeric",
  month: "2-digit",
});

// Cierre de meses: al cambiar el tipo global de IRPF, los meses ya pasados
// sin fila propia se congelan con el tipo que estaba vigente — el cambio solo
// afecta al mes en curso y siguientes.
export async function freezePastMonthsIrpf(oldPct: number) {
  const currentMonth = currentMadridMonth();
  const { firstEntryDate, firstOrderCreatedAt } = await convexQuery(
    api.finance.startDates,
    {},
  );
  const starts = [
    firstEntryDate?.slice(0, 7),
    firstOrderCreatedAt !== null
      ? MADRID_MONTH_FMT.format(new Date(firstOrderCreatedAt)).slice(0, 7)
      : undefined,
  ].filter((m): m is string => Boolean(m));
  if (starts.length === 0) return;

  const rows: { month: string; irpfPct: number }[] = [];
  for (let m = starts.sort()[0]!; m < currentMonth; m = addMonths(m, 1)) {
    rows.push({ month: m, irpfPct: oldPct });
  }
  if (rows.length === 0) return;
  await convexMutation(api.finance.freezeMonthsIrpf, { rows });
}

// Envíos ya pagados (sync del cron) agrupados por mes de Madrid y desglosados
// por proveedor (Packlink PRO / Genei). Solo cuentan los estados post-compra;
// volumen pequeño → todo en TS.
async function getShippingByMonth(): Promise<Map<string, ShippingByProvider>> {
  const shipments = await convexQuery(api.finance.shipmentsForFinance, {});

  const map = new Map<string, ShippingByProvider>();
  for (const shipment of shipments) {
    if (!isPurchasedShipment(shipment.state)) continue;
    const date = shipment.shipmentDate ?? shipment.syncedAt;
    const month = MADRID_MONTH_FMT.format(new Date(date)).slice(0, 7);
    const both = map.get(month) ?? emptyShipping();
    const row = shipment.provider === "genei" ? both.genei : both.packlink;
    row.count += 1;
    if (shipment.cost === null) row.missingCost += 1;
    else row.cost += shipment.cost;
    map.set(month, both);
  }
  return map;
}

// Ventas cobradas del año agrupadas por mes de Madrid (sin IVA y netas de
// reembolsos). A la escala actual una pasada en TS es más simple que agregar
// en la query.
async function getShopifyByMonth(
  year: string,
): Promise<Map<string, ShopifySummary>> {
  const start = madridLocalToUtc(`${year}-01-01T00:00`);
  const end = madridLocalToUtc(`${Number(year) + 1}-01-01T00:00`);
  if (!start || !end) throw new Error(`Año no válido: ${year}`);
  const orders = await convexQuery(api.finance.ordersForFinance, {
    startMs: start.getTime(),
    endMs: end.getTime(),
  });

  const map = new Map<string, ShopifySummary>();
  for (const order of orders as FinanceOrder[]) {
    const status = order.financialStatus?.toLowerCase() ?? "";
    if (!CHARGED_STATUSES.has(status)) continue;
    const month = MADRID_MONTH_FMT.format(new Date(order.createdAt)).slice(
      0,
      7,
    );
    const row = map.get(month) ?? { orders: 0, gross: 0, net: 0, shipping: 0 };
    row.orders += 1;
    row.gross += Math.max(
      (order.totalPrice ?? 0) - (order.totalRefunded ?? 0),
      0,
    );
    row.net += orderNetExTax(order);
    row.shipping += order.totalShipping ?? 0;
    map.set(month, row);
  }
  return map;
}
