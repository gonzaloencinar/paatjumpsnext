import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { convexQuery, msToIso } from "@/lib/convex/server";
import {
  isUrgentShipping,
  madridToday,
  packlinkPhase,
  type PacklinkPhase,
} from "./packlink";

// Consultas de la parte "tienda" del panel (/admin/orders, /admin/customers,
// /admin/analytics). Los datos los alimentan el webhook orders/create y el
// cron shopify-sync (lib/crm/shopify-sync.ts). Los datos viven en Convex
// (convex/store.ts); este módulo adapta los docs a la forma legacy
// (snake_case, ISO, null) que esperan las páginas y calcula las métricas en
// memoria sobre los pedidos válidos: a la escala actual (miles de pedidos)
// una pasada en TS es más simple y flexible que agregar en la query.

export const ORDERS_PER_PAGE = 25;
export const CUSTOMERS_PER_PAGE = 25;

const STORE_HANDLE = (
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? "ars0a5-xx.myshopify.com"
).split(".")[0];

export function shopifyAdminUrl(path: string) {
  return `https://admin.shopify.com/store/${STORE_HANDLE}/${path}`;
}

// Herencia del interpolado de .or() de PostgREST (comas y paréntesis eran
// sintaxis): se conserva para que las búsquedas se comporten igual que antes
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

type ShipmentRow = FunctionReturnType<
  typeof api.store.shipmentsForOrders
>[number];

function toShipment(row: ShipmentRow): OrderShipment {
  return {
    reference: row.reference,
    provider: row.provider,
    state: row.state,
    phase: packlinkPhase(row.state, row.collectionDate),
    carrier: row.carrier,
    service: row.service,
    service_id: row.serviceId,
    price_base: row.priceBase,
    price_total: row.priceTotal,
    cost: row.cost,
    collection_date: row.collectionDate,
    collection_time: row.collectionTime,
    estimated_delivery_date: row.estimatedDeliveryDate,
    home_to_home: row.homeToHome,
    tracking: row.tracking,
    tracking_url: row.trackingUrl,
    label_url: row.labelUrl,
  };
}

// Envío Packlink por pedido: match por order_id (creados desde el CRM) y por
// custom_reference = nombre del pedido (respaldo hasta que el sync enlaza).
async function getOrderShipments(
  orders: { id: number; name: string | null }[],
): Promise<Map<number, OrderShipment>> {
  const best = new Map<number, OrderShipment>();
  if (orders.length === 0) return best;

  const names = orders.map((o) => o.name).filter(Boolean) as string[];
  const rows = await convexQuery(api.store.shipmentsForOrders, {
    orderIds: orders.map((o) => o.id),
    names,
  });

  const nameToId = new Map(
    orders.filter((o) => o.name).map((o) => [o.name!, o.id]),
  );
  for (const row of rows) {
    const orderId =
      row.orderId ?? nameToId.get(row.customReference ?? "") ?? null;
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

// Pedido en la forma legacy que renderiza /admin/orders
type OrderRow = {
  id: number;
  name: string | null;
  email: string | null;
  created_at: string;
  total_price: number | null;
  total_refunded: number;
  currency: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  test: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  discount_code: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_country_code: string | null;
  shipping_line_title: string | null;
  line_items: unknown;
};

function madridDayOffset(base: string, days: number): string {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Vista de /admin/orders: pedidos + su envío Packlink + KPIs operativos.
// Los filtros de búsqueda/fuente/estado/fechas los aplica la query Convex;
// los de envío/recogida/urgente se aplican en memoria sobre ese conjunto
// (mismo criterio in-memory que analytics).
export async function getOrdersView(params: OrdersViewParams) {
  const q = params.q ? sanitizeSearch(params.q) : "";
  const estado =
    params.estado === "pendientes" || params.estado === "enviados"
      ? params.estado
      : undefined;
  // Mismos límites del día que el SQL legacy (offset fijo +02:00 de Madrid)
  const desdeMs =
    params.desde && DATE_RE.test(params.desde)
      ? Date.parse(`${params.desde}T00:00:00+02:00`)
      : undefined;
  const hastaMs =
    params.hasta && DATE_RE.test(params.hasta)
      ? Date.parse(`${params.hasta}T23:59:59+02:00`)
      : undefined;

  const [rows, kpiData] = await Promise.all([
    convexQuery(api.store.ordersForView, {
      q: q || undefined,
      fuente: params.fuente || undefined,
      estado,
      desdeMs,
      hastaMs,
    }),
    convexQuery(api.store.orderKpis, {}),
  ]);

  let orders: OrderRow[] = rows.map((o) => ({
    id: o.orderId,
    name: o.name,
    email: o.email,
    created_at: new Date(o.createdAt).toISOString(),
    total_price: o.totalPrice,
    total_refunded: o.totalRefunded,
    currency: o.currency,
    financial_status: o.financialStatus,
    fulfillment_status: o.fulfillmentStatus,
    cancelled_at: msToIso(o.cancelledAt ?? undefined),
    test: o.test,
    utm_source: o.utmSource,
    utm_medium: o.utmMedium,
    utm_campaign: o.utmCampaign,
    discount_code: o.discountCode,
    shipping_city: o.shippingCity,
    shipping_province: o.shippingProvince,
    shipping_country_code: o.shippingCountryCode,
    shipping_line_title: o.shippingLineTitle,
    line_items: o.lineItems,
  }));

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
  const kpiPhases = kpiData.shipments.map((s) => ({
    phase: packlinkPhase(s.state, s.collectionDate),
    collection_date: s.collectionDate,
  }));

  const kpis = {
    pendientes: kpiData.pending.length,
    urgentes: kpiData.pending.filter((o) =>
      isUrgentShipping(o.shippingLineTitle),
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
    const pendingDni = await convexQuery(api.store.pendingDniOrderIds, {
      orderIds: pageOrders.map((o) => o.id),
    });
    for (const orderId of pendingDni) awaitingId.add(orderId);
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
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * CUSTOMERS_PER_PAGE;
  const q = params.q ? sanitizeSearch(params.q) : "";

  // La query devuelve el conjunto completo filtrado y ordenado por gasto;
  // el count exacto es la longitud y la página se recorta en memoria.
  const all = await convexQuery(api.store.customersForList, {
    q: q || undefined,
  });
  const customers = all
    .slice(from, from + CUSTOMERS_PER_PAGE)
    .map((c) => ({
      id: c.customerId,
      email: c.email,
      first_name: c.firstName,
      last_name: c.lastName,
      phone: c.phone,
      orders_count: c.ordersCount,
      total_spent: c.totalSpent,
      currency: c.currency,
      city: c.city,
      province: c.province,
      country: c.country,
      country_code: c.countryCode,
      accepts_email_marketing: c.acceptsEmailMarketing,
      shopify_created_at: msToIso(c.shopifyCreatedAt ?? undefined),
    }));

  // Último pedido de los clientes listados (una consulta para la página;
  // llegan más recientes primero → el primero de cada cliente es el último)
  const lastOrderAt = new Map<number, string>();
  if (customers.length > 0) {
    const orderRows = await convexQuery(api.store.lastOrdersForCustomers, {
      customerIds: customers.map((c) => c.id),
    });
    for (const row of orderRows) {
      if (!lastOrderAt.has(row.customerId)) {
        lastOrderAt.set(row.customerId, new Date(row.createdAt).toISOString());
      }
    }
  }

  return {
    customers,
    lastOrderAt,
    total: all.length,
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
  const rows = await convexQuery(api.store.ordersForAnalytics, {});
  // Llegan en orden cronológico (la agrupación por cliente depende de ello)
  const all: AnalyticsOrder[] = rows.map((o) => ({
    id: o.orderId,
    created_at: new Date(o.createdAt).toISOString(),
    total_price: o.totalPrice,
    total_refunded: o.totalRefunded,
    customer_id: o.customerId,
    email: o.email,
    utm_source: o.utmSource,
    utm_medium: o.utmMedium,
    utm_campaign: o.utmCampaign,
    first_utm_source: o.firstUtmSource,
    discount_code: o.discountCode,
    shipping_province: o.shippingProvince,
    shipping_country: o.shippingCountry,
    shipping_country_code: o.shippingCountryCode,
    line_items: o.lineItems,
    upsell_revenue: o.upsellRevenue,
  }));

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
