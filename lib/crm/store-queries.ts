import { createClient } from "@/lib/supabase/server";

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

// ───────────────────────────── pedidos ─────────────────────────────

export async function listOrders(params: {
  q?: string;
  fuente?: string;
  page?: number;
}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * ORDERS_PER_PAGE;

  let query = supabase
    .from("orders")
    .select(
      "id, name, email, created_at, total_price, total_refunded, currency, financial_status, fulfillment_status, cancelled_at, test, utm_source, utm_medium, utm_campaign, discount_code, shipping_city, shipping_province, shipping_country_code, line_items",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + ORDERS_PER_PAGE - 1);

  if (params.q) {
    const q = sanitizeSearch(params.q);
    if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }
  if (params.fuente) query = query.eq("utm_source", params.fuente);

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    orders: data ?? [],
    total: count ?? 0,
    page,
    perPage: ORDERS_PER_PAGE,
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
      "id, email, first_name, last_name, orders_count, total_spent, currency, city, province, country, country_code, accepts_email_marketing, shopify_created_at",
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

const net = (o: AnalyticsOrder) => (o.total_price ?? 0) - (o.total_refunded ?? 0);

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
      "id, created_at, total_price, total_refunded, customer_id, email, utm_source, utm_medium, utm_campaign, first_utm_source, discount_code, shipping_province, shipping_country, shipping_country_code, line_items",
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

  const inPeriod = days
    ? all.filter((o) => o.created_at >= startIso)
    : all;
  const inPrevious = days
    ? all.filter(
        (o) => o.created_at >= prevStartIso && o.created_at < startIso,
      )
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
      o.utm_campaign
        ? { key: o.utm_campaign, detail: o.utm_source }
        : null,
    ).slice(0, 10),
    countries: groupBy(inPeriod, (o) => ({
      key:
        o.shipping_country ??
        o.shipping_country_code ??
        "(sin dirección)",
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
