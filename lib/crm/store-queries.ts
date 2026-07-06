import { createClient } from "@/lib/supabase/server";
import {
  isUrgentShipping,
  madridToday,
  packlinkPhase,
  type PacklinkPhase,
} from "./packlink";

// Consultas de la parte "tienda" del panel (/admin/orders, /admin/customers,
// /admin/analytics). Los datos los alimentan el webhook orders/create y el
// cron shopify-sync (lib/crm/shopify-sync.ts). Las métricas se calculan en
// memoria sobre los pedidos válidos: a la escala actual (miles de pedidos)
// una pasada en TS es más simple y flexible que RPCs de agregación.

export const ORDERS_PER_PAGE = 25;
export const CUSTOMERS_PER_PAGE = 25;

const STORE_HANDLE = (
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com"
).split(".")[0];

export function shopifyAdminUrl(path: string) {
  return `https://admin.shopify.com/store/${STORE_HANDLE}/${path}`;
}

// El interpolado de .or() usa comas y paréntesis como sintaxis
const sanitizeSearch = (q: string) => q.replace(/[,()%]/g, " ").trim();

// ───────────────────────────── pedidos + envíos ─────────────────────────────

export type OrderShipment = {
  reference: string;
  /** "packlink" | "genei" */
  provider: string;
  state: string | null;
  phase: PacklinkPhase;
  carrier: string | null;
  service: string | null;
  service_id: string | null;
  price_base: number | null;
  price_total: number | null;
  cost: number | null;
  collection_date: string | null;
  collection_time: string | null;
  estimated_delivery_date: string | null;
  home_to_home: boolean | null;
  tracking: string | null;
  tracking_url: string | null;
  label_url: string | null;
};

// Si un pedido acumulara más de un envío se muestra el más relevante
const PHASE_RANK: Record<PacklinkPhase, number> = {
  cancelado: 0,
  borrador: 1,
  etiqueta: 2,
  recogida: 3,
  enviado: 4,
  entregado: 5,
  incidencia: 6,
};

const SHIPMENT_COLS =
  "reference, provider, custom_reference, order_id, state, carrier, service, service_id, price_base, price_total, cost, collection_date, collection_time, estimated_delivery_date, home_to_home, tracking, tracking_url, label_url";

type ShipmentRow = {
  reference: string;
  provider: string;
  custom_reference: string | null;
  order_id: number | null;
  state: string | null;
  carrier: string | null;
  service: string | null;
  service_id: string | null;
  price_base: number | null;
  price_total: number | null;
  cost: number | null;
  collection_date: string | null;
  collection_time: string | null;
  estimated_delivery_date: string | null;
  home_to_home: boolean | null;
  tracking: string | null;
  tracking_url: string | null;
  label_url: string | null;
};

function toShipment(row: ShipmentRow): OrderShipment {
  return {
    reference: row.reference,
    provider: row.provider,
    state: row.state,
    phase: packlinkPhase(row.state, row.collection_date),
    carrier: row.carrier,
    service: row.service,
    service_id: row.service_id,
    price_base: row.price_base,
    price_total: row.price_total,
    cost: row.cost,
    collection_date: row.collection_date,
    collection_time: row.collection_time,
    estimated_delivery_date: row.estimated_delivery_date,
    home_to_home: row.home_to_home,
    tracking: row.tracking,
    tracking_url: row.tracking_url,
    label_url: row.label_url,
  };
}

// Envío Packlink por pedido: match por order_id (creados desde el CRM) y por
// custom_reference = nombre del pedido (respaldo hasta que el sync enlaza).
async function getOrderShipments(
  orders: { id: number; name: string | null }[],
): Promise<Map<number, OrderShipment>> {
  const best = new Map<number, OrderShipment>();
  if (orders.length === 0) return best;
  const supabase = await createClient();

  const ids = orders.map((o) => o.id);
  const names = orders.map((o) => o.name).filter(Boolean) as string[];
  const [byId, byName] = await Promise.all([
    supabase
      .from("packlink_shipments")
      .select(SHIPMENT_COLS)
      .in("order_id", ids),
    names.length > 0
      ? supabase
          .from("packlink_shipments")
          .select(SHIPMENT_COLS)
          .in("custom_reference", names)
      : Promise.resolve({ data: [] as ShipmentRow[] }),
  ]);

  const nameToId = new Map(
    orders.filter((o) => o.name).map((o) => [o.name!, o.id]),
  );
  const seen = new Set<string>();
  for (const row of [
    ...((byId.data ?? []) as ShipmentRow[]),
    ...((byName.data ?? []) as ShipmentRow[]),
  ]) {
    if (seen.has(row.reference)) continue;
    seen.add(row.reference);
    const orderId =
      row.order_id ?? nameToId.get(row.custom_reference ?? "") ?? null;
    if (orderId == null) continue;
    const shipment = toShipment(row);
    const current = best.get(orderId);
    if (!current || PHASE_RANK[shipment.phase] > PHASE_RANK[current.phase]) {
      best.set(orderId, shipment);
    }
  }
  return best;
}

export type OrdersViewParams = {
  q?: string;
  fuente?: string;
  /** "pendientes" = pagados/por enviar; "enviados" = fulfillment completo */
  estado?: string;
  /** fase del envío Packlink o "sin" (pedidos sin envío) */
  envio?: string;
  /** fecha pedido desde/hasta (YYYY-MM-DD) */
  desde?: string;
  hasta?: string;
  /** recogida programada: "hoy" | "manana" | YYYY-MM-DD */
  recogida?: string;
  /** rango de recogida personalizado (YYYY-MM-DD) */
  rdesde?: string;
  rhasta?: string;
  /** "1" = solo pedidos con envío urgente 24h en el checkout */
  urgente?: string;
  page?: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Máximo de pedidos que se filtran/paginan en memoria (escala actual: cientos)
const VIEW_FETCH_LIMIT = 1000;

function madridDayOffset(base: string, days: number): string {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Vista de /admin/orders: pedidos + su envío Packlink + KPIs operativos.
// Los filtros de envío/recogida/urgente se aplican en memoria sobre el
// conjunto ya filtrado por SQL (mismo criterio in-memory que analytics).
export async function getOrdersView(params: OrdersViewParams) {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, name, email, created_at, total_price, total_refunded, currency, financial_status, fulfillment_status, cancelled_at, test, utm_source, utm_medium, utm_campaign, discount_code, shipping_city, shipping_province, shipping_country_code, shipping_line_title, line_items",
    )
    .order("created_at", { ascending: false })
    .limit(VIEW_FETCH_LIMIT);

  if (params.q) {
    const q = sanitizeSearch(params.q);
    if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }
  if (params.fuente) query = query.eq("utm_source", params.fuente);
  if (params.estado === "pendientes") {
    query = query
      .is("cancelled_at", null)
      .eq("test", false)
      .neq("financial_status", "refunded")
      .or("fulfillment_status.is.null,fulfillment_status.neq.fulfilled");
  } else if (params.estado === "enviados") {
    query = query.eq("fulfillment_status", "fulfilled");
  }
  if (params.desde && DATE_RE.test(params.desde)) {
    query = query.gte("created_at", `${params.desde}T00:00:00+02:00`);
  }
  if (params.hasta && DATE_RE.test(params.hasta)) {
    query = query.lte("created_at", `${params.hasta}T23:59:59+02:00`);
  }

  const { data, error } = await query;
  if (error) throw error;
  let orders = data ?? [];

  const shipments = await getOrderShipments(orders);

  // Filtros en memoria: fase del envío, recogida y urgente 24h
  const today = madridToday();
  const tomorrow = madridDayOffset(today, 1);
  if (params.envio) {
    orders = orders.filter((order) => {
      const shipment = shipments.get(order.id);
      if (params.envio === "sin") return !shipment;
      return shipment?.phase === params.envio;
    });
  }
  if (params.recogida) {
    const target =
      params.recogida === "hoy"
        ? today
        : params.recogida === "manana"
          ? tomorrow
          : DATE_RE.test(params.recogida)
            ? params.recogida
            : null;
    if (target) {
      orders = orders.filter(
        (order) => shipments.get(order.id)?.collection_date === target,
      );
    }
  } else if (params.rdesde || params.rhasta) {
    const from =
      params.rdesde && DATE_RE.test(params.rdesde) ? params.rdesde : null;
    const to =
      params.rhasta && DATE_RE.test(params.rhasta) ? params.rhasta : null;
    if (from || to) {
      orders = orders.filter((order) => {
        const date = shipments.get(order.id)?.collection_date;
        return date != null && (!from || date >= from) && (!to || date <= to);
      });
    }
  }
  if (params.urgente === "1") {
    orders = orders.filter((order) =>
      isUrgentShipping(order.shipping_line_title),
    );
  }

  // KPIs globales (independientes de los filtros activos)
  const [pendingRes, shipmentKpiRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, shipping_line_title")
      .is("cancelled_at", null)
      .eq("test", false)
      .neq("financial_status", "refunded")
      .or("fulfillment_status.is.null,fulfillment_status.neq.fulfilled")
      .limit(VIEW_FETCH_LIMIT),
    supabase
      .from("packlink_shipments")
      .select("reference, state, collection_date")
      .not("state", "in", "(CANCELED,CANCELLED)")
      .limit(VIEW_FETCH_LIMIT),
  ]);
  const pendingOrders = pendingRes.data ?? [];
  const kpiPhases = (shipmentKpiRes.data ?? []).map((s) => ({
    phase: packlinkPhase(s.state, s.collection_date),
    collection_date: s.collection_date,
  }));

  const kpis = {
    pendientes: pendingOrders.length,
    urgentes: pendingOrders.filter((o) =>
      isUrgentShipping(o.shipping_line_title),
    ).length,
    recogidaHoy: kpiPhases.filter(
      (s) => s.phase === "recogida" && s.collection_date === today,
    ).length,
    recogidaManana: kpiPhases.filter(
      (s) => s.phase === "recogida" && s.collection_date === tomorrow,
    ).length,
    incidencias: kpiPhases.filter((s) => s.phase === "incidencia").length,
  };

  // Paginación en memoria sobre el conjunto filtrado
  const page = Math.max(1, params.page ?? 1);
  const total = orders.length;
  const start = (page - 1) * ORDERS_PER_PAGE;
  const pageOrders = orders.slice(start, start + ORDERS_PER_PAGE);

  // Pedidos "Esperando ID": petición de DNI (aduana/internacional) aún sin
  // responder (lib/crm/dni-requests.ts) → badge en la columna Envío
  const awaitingId = new Set<number>();
  if (pageOrders.length > 0) {
    const { data: pendingDni } = await supabase
      .from("order_dni_requests")
      .select("order_id")
      .is("submitted_at", null)
      .in(
        "order_id",
        pageOrders.map((o) => o.id),
      );
    for (const row of pendingDni ?? []) awaitingId.add(row.order_id);
  }

  return {
    orders: pageOrders,
    shipments,
    awaitingId,
    total,
    page,
    perPage: ORDERS_PER_PAGE,
    kpis,
    today,
    tomorrow,
  };
}

// ───────────────────────────── clientes ─────────────────────────────

export async function listCustomers(params: { q?: string; page?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CUSTOMERS_PER_PAGE;

  let query = supabase
    .from("customers")
    .select(
      "id, email, first_name, last_name, phone, orders_count, total_spent, currency, city, province, country, country_code, accepts_email_marketing, shopify_created_at",
      { count: "exact" },
    )
    .order("total_spent", { ascending: false })
    .order("orders_count", { ascending: false })
    .range(from, from + CUSTOMERS_PER_PAGE - 1);

  if (params.q) {
    const q = sanitizeSearch(params.q);
    if (q) {
      query = query.or(
        `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
      );
    }
  }

  const { data, count, error } = await query;
  if (error) throw error;
  const customers = data ?? [];

  // Último pedido de los clientes listados (una consulta para la página)
  const lastOrderAt = new Map<number, string>();
  if (customers.length > 0) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("customer_id, created_at")
      .in(
        "customer_id",
        customers.map((c) => c.id),
      )
      .is("cancelled_at", null)
      .eq("test", false)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const row of orderRows ?? []) {
      if (row.customer_id != null && !lastOrderAt.has(row.customer_id)) {
        lastOrderAt.set(row.customer_id, row.created_at);
      }
    }
  }

  return {
    customers,
    lastOrderAt,
    total: count ?? 0,
    page,
    perPage: CUSTOMERS_PER_PAGE,
  };
}

// ───────────────────────────── analítica ─────────────────────────────

type AnalyticsOrder = {
  id: number;
  created_at: string;
  total_price: number | null;
  total_refunded: number;
  customer_id: number | null;
  email: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  first_utm_source: string | null;
  discount_code: string | null;
  shipping_province: string | null;
  shipping_country: string | null;
  shipping_country_code: string | null;
  line_items: unknown;
  upsell_revenue: number | null;
};

type LineItem = {
  title?: string;
  quantity?: number;
  price?: string | null;
};

export type BreakdownRow = {
  key: string;
  detail?: string | null;
  orders: number;
  revenue: number;
};

const net = (o: AnalyticsOrder) =>
  (o.total_price ?? 0) - (o.total_refunded ?? 0);

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function groupBy(
  orders: AnalyticsOrder[],
  key: (o: AnalyticsOrder) => { key: string; detail?: string | null } | null,
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const order of orders) {
    const entry = key(order);
    if (!entry) continue;
    const row = map.get(entry.key) ?? {
      key: entry.key,
      detail: entry.detail ?? null,
      orders: 0,
      revenue: 0,
    };
    row.orders += 1;
    row.revenue += net(order);
    map.set(entry.key, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

const DAY_MS = 86_400_000;

// `days = null` → todo el histórico
export async function getStoreAnalytics(days: number | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, total_price, total_refunded, customer_id, email, utm_source, utm_medium, utm_campaign, first_utm_source, discount_code, shipping_province, shipping_country, shipping_country_code, line_items, upsell_revenue",
    )
    .eq("test", false)
    .is("cancelled_at", null)
    .order("created_at", { ascending: true })
    .limit(10_000);
  if (error) throw error;
  const all = (data ?? []) as AnalyticsOrder[];

  const now = Date.now();
  const startMs = days ? now - days * DAY_MS : 0;
  const prevStartMs = days ? now - 2 * days * DAY_MS : 0;
  const startIso = new Date(startMs).toISOString();
  const prevStartIso = new Date(prevStartMs).toISOString();

  const inPeriod = days ? all.filter((o) => o.created_at >= startIso) : all;
  const inPrevious = days
    ? all.filter((o) => o.created_at >= prevStartIso && o.created_at < startIso)
    : [];

  // Pedidos por cliente (histórico completo; llegan ordenados por fecha)
  const byCustomer = new Map<string, AnalyticsOrder[]>();
  for (const order of all) {
    const key =
      order.customer_id != null
        ? `c:${order.customer_id}`
        : order.email
          ? `e:${order.email}`
          : `o:${order.id}`;
    const list = byCustomer.get(key);
    if (list) list.push(order);
    else byCustomer.set(key, [order]);
  }

  const revenue = inPeriod.reduce((sum, o) => sum + net(o), 0);
  const prevRevenue = inPrevious.reduce((sum, o) => sum + net(o), 0);

  // Clientes del periodo: nuevo = su primer pedido histórico cae en el periodo
  let newCustomers = 0;
  let returningCustomers = 0;
  const seenInPeriod = new Set<string>();
  for (const [key, orders] of byCustomer) {
    const periodOrders = days
      ? orders.filter((o) => o.created_at >= startIso)
      : orders;
    if (periodOrders.length === 0) continue;
    seenInPeriod.add(key);
    if (!days || orders[0]!.created_at >= startIso) newCustomers += 1;
    else returningCustomers += 1;
  }

  // Métricas de recurrencia y LTV (histórico completo)
  const customerCount = byCustomer.size;
  const repeatCustomers = [...byCustomer.values()].filter(
    (orders) => orders.length >= 2,
  ).length;
  const gapsFirstToSecond: number[] = [];
  const gapsBetweenOrders: number[] = [];
  let lifetimeRevenue = 0;
  for (const orders of byCustomer.values()) {
    lifetimeRevenue += orders.reduce((sum, o) => sum + net(o), 0);
    for (let i = 1; i < orders.length; i++) {
      const gap =
        (new Date(orders[i]!.created_at).getTime() -
          new Date(orders[i - 1]!.created_at).getTime()) /
        DAY_MS;
      gapsBetweenOrders.push(gap);
      if (i === 1) gapsFirstToSecond.push(gap);
    }
  }

  // Serie temporal: diaria hasta 90 días; mensual para rangos largos
  const daily = days !== null && days <= 90;
  const seriesMap = new Map<string, number>();
  if (daily) {
    for (let i = days! - 1; i >= 0; i--) {
      seriesMap.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), 0);
    }
  }
  for (const order of inPeriod) {
    const bucket = daily
      ? order.created_at.slice(0, 10)
      : order.created_at.slice(0, 7);
    if (daily && !seriesMap.has(bucket)) continue; // fuera de la ventana
    seriesMap.set(
      bucket,
      Math.round(((seriesMap.get(bucket) ?? 0) + net(order)) * 100) / 100,
    );
  }
  const series = [...seriesMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ingresos]) => ({ date, ingresos }));

  const parseItems = (o: AnalyticsOrder): LineItem[] =>
    Array.isArray(o.line_items) ? (o.line_items as LineItem[]) : [];

  // Top productos del periodo (título + unidades + ingresos aprox por línea)
  const productMap = new Map<string, { units: number; revenue: number }>();
  for (const order of inPeriod) {
    for (const item of parseItems(order)) {
      const title = item.title?.trim();
      if (!title) continue;
      const row = productMap.get(title) ?? { units: 0, revenue: 0 };
      row.units += item.quantity ?? 1;
      row.revenue += (Number(item.price) || 0) * (item.quantity ?? 1);
      productMap.set(title, row);
    }
  }
  const products = [...productMap.entries()]
    .map(([title, row]) => ({ title, ...row }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    period: {
      days,
      revenue,
      orders: inPeriod.length,
      aov: inPeriod.length ? revenue / inPeriod.length : 0,
      newCustomers,
      returningCustomers,
      prevRevenue,
      prevOrders: inPrevious.length,
      withDiscount: inPeriod.filter((o) => o.discount_code).length,
      upsellRevenue: inPeriod.reduce(
        (sum, o) => sum + (o.upsell_revenue ?? 0),
        0,
      ),
      upsellOrders: inPeriod.filter((o) => (o.upsell_revenue ?? 0) > 0).length,
      prevUpsellRevenue: inPrevious.reduce(
        (sum, o) => sum + (o.upsell_revenue ?? 0),
        0,
      ),
    },
    lifetime: {
      customers: customerCount,
      repeatRate: customerCount ? repeatCustomers / customerCount : 0,
      avgLtv: customerCount ? lifetimeRevenue / customerCount : 0,
      ordersPerCustomer: customerCount ? all.length / customerCount : 0,
      medianDaysFirstToSecond: median(gapsFirstToSecond),
      medianDaysBetweenOrders: median(gapsBetweenOrders),
    },
    series: { daily, points: series },
    sources: groupBy(inPeriod, (o) => ({
      key: o.utm_source ?? "(directo / sin atribución)",
      detail: o.utm_medium,
    })).slice(0, 12),
    firstTouchSources: groupBy(inPeriod, (o) =>
      o.first_utm_source ? { key: o.first_utm_source } : null,
    ).slice(0, 8),
    campaigns: groupBy(inPeriod, (o) =>
      o.utm_campaign ? { key: o.utm_campaign, detail: o.utm_source } : null,
    ).slice(0, 10),
    countries: groupBy(inPeriod, (o) => ({
      key: o.shipping_country ?? o.shipping_country_code ?? "(sin dirección)",
    })).slice(0, 10),
    provinces: groupBy(
      inPeriod.filter((o) => o.shipping_country_code === "ES"),
      (o) => ({ key: o.shipping_province ?? "(sin provincia)" }),
    ).slice(0, 12),
    discountCodes: groupBy(inPeriod, (o) =>
      o.discount_code ? { key: o.discount_code } : null,
    ).slice(0, 10),
    products,
    totalOrdersEver: all.length,
  };
}
