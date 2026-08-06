import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Lecturas de la parte "tienda" del panel (/admin/orders, /admin/customers,
// /admin/analytics). Solo primitivas de acceso a datos: los filtros de envío,
// KPIs, paginación y toda la agregación de analytics viven en
// lib/crm/store-queries.ts. Tablas pequeñas (decenas de filas): take() +
// filtro/orden en JS es suficiente. Las fechas llegan como argumentos: las
// queries no leen el reloj.
//
// packlink_shipments y order_dni_requests se leen aquí SOLO para vincular
// envíos/estado DNI a pedidos; sus escrituras son de otras áreas.

// Máximo de pedidos que se filtran/paginan en memoria (escala actual: cientos)
const VIEW_FETCH_LIMIT = 1000;

// Sustituto del ilike '%q%' de Postgres: substring case-insensitive
function matchesSearch(needle: string, ...fields: (string | undefined)[]) {
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

// ───────────────────────────── pedidos ─────────────────────────────

// Listado de /admin/orders: filtros por búsqueda/fuente/estado en JS sobre el
// conjunto acotado por fechas (índice by_created_at), más reciente primero.
// A diferencia del SQL original el take(1000) corre antes de los filtros; a
// la escala actual (decenas de pedidos) es equivalente.
export const ordersForView = query({
  args: {
    serverKey: v.string(),
    q: v.optional(v.string()),
    fuente: v.optional(v.string()),
    estado: v.optional(
      v.union(v.literal("pendientes"), v.literal("enviados")),
    ),
    desdeMs: v.optional(v.number()),
    hastaMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { serverKey, q, fuente, estado, desdeMs, hastaMs },
  ) => {
    assertServerKey(serverKey);
    let rows = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (ix) =>
        desdeMs !== undefined && hastaMs !== undefined
          ? ix.gte("createdAt", desdeMs).lte("createdAt", hastaMs)
          : desdeMs !== undefined
            ? ix.gte("createdAt", desdeMs)
            : hastaMs !== undefined
              ? ix.lte("createdAt", hastaMs)
              : ix,
      )
      .order("desc")
      .take(VIEW_FETCH_LIMIT);

    const needle = q?.toLowerCase();
    if (needle) {
      rows = rows.filter((o) => matchesSearch(needle, o.email, o.name));
    }
    if (fuente !== undefined) {
      rows = rows.filter((o) => o.utmSource === fuente);
    }
    if (estado === "pendientes") {
      // Mismo criterio que el SQL legacy: el neq de Postgres también dejaba
      // fuera los pedidos sin financial_status
      rows = rows.filter(
        (o) =>
          o.cancelledAt === undefined &&
          o.test === false &&
          o.financialStatus !== undefined &&
          o.financialStatus !== "refunded" &&
          o.fulfillmentStatus !== "fulfilled",
      );
    } else if (estado === "enviados") {
      rows = rows.filter((o) => o.fulfillmentStatus === "fulfilled");
    }

    return rows.map((o) => ({
      orderId: o.orderId,
      name: o.name ?? null,
      email: o.email ?? null,
      createdAt: o.createdAt,
      totalPrice: o.totalPrice ?? null,
      totalRefunded: o.totalRefunded,
      currency: o.currency ?? null,
      financialStatus: o.financialStatus ?? null,
      fulfillmentStatus: o.fulfillmentStatus ?? null,
      cancelledAt: o.cancelledAt ?? null,
      test: o.test,
      utmSource: o.utmSource ?? null,
      utmMedium: o.utmMedium ?? null,
      utmCampaign: o.utmCampaign ?? null,
      discountCode: o.discountCode ?? null,
      shippingCity: o.shippingCity ?? null,
      shippingProvince: o.shippingProvince ?? null,
      shippingCountryCode: o.shippingCountryCode ?? null,
      shippingLineTitle: o.shippingLineTitle ?? null,
      lineItems: o.lineItems ?? null,
    }));
  },
});

// KPIs globales de /admin/orders (independientes de los filtros activos):
// pedidos pendientes de enviar + envíos vivos para contar recogidas e
// incidencias (la fase la calcula la lib con la fecha de hoy en Madrid).
export const orderKpis = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const orders = await ctx.db.query("orders").take(VIEW_FETCH_LIMIT);
    const pending = orders
      .filter(
        (o) =>
          o.cancelledAt === undefined &&
          o.test === false &&
          o.financialStatus !== undefined &&
          o.financialStatus !== "refunded" &&
          o.fulfillmentStatus !== "fulfilled",
      )
      .map((o) => ({
        orderId: o.orderId,
        shippingLineTitle: o.shippingLineTitle ?? null,
      }));

    const shipmentRows = await ctx.db
      .query("packlink_shipments")
      .take(VIEW_FETCH_LIMIT);
    // Mismo criterio que el `not in` de Postgres: los envíos sin estado
    // tampoco cuentan para los KPIs
    const shipments = shipmentRows
      .filter(
        (s) =>
          s.state !== undefined &&
          s.state !== "CANCELED" &&
          s.state !== "CANCELLED",
      )
      .map((s) => ({
        state: s.state ?? null,
        collectionDate: s.collectionDate ?? null,
      }));

    return { pending, shipments };
  },
});

// ───────────────────────────── envíos por pedido ─────────────────────────────

// Envíos (Packlink/Genei) de los pedidos dados: match por orderId (creados
// desde el CRM) y por customReference = nombre del pedido (respaldo hasta que
// el sync enlaza). Tabla pequeña: una pasada sobre todo el conjunto.
export const shipmentsForOrders = query({
  args: {
    serverKey: v.string(),
    orderIds: v.array(v.number()),
    names: v.array(v.string()),
  },
  handler: async (ctx, { serverKey, orderIds, names }) => {
    assertServerKey(serverKey);
    const idSet = new Set(orderIds);
    const nameSet = new Set(names);
    const rows = await ctx.db
      .query("packlink_shipments")
      .take(VIEW_FETCH_LIMIT);
    return rows
      .filter(
        (s) =>
          (s.orderId !== undefined && idSet.has(s.orderId)) ||
          (s.customReference !== undefined && nameSet.has(s.customReference)),
      )
      .map((s) => ({
        reference: s.reference,
        provider: s.provider,
        customReference: s.customReference ?? null,
        orderId: s.orderId ?? null,
        state: s.state ?? null,
        carrier: s.carrier ?? null,
        service: s.service ?? null,
        serviceId: s.serviceId ?? null,
        priceBase: s.priceBase ?? null,
        priceTotal: s.priceTotal ?? null,
        cost: s.cost ?? null,
        collectionDate: s.collectionDate ?? null,
        collectionTime: s.collectionTime ?? null,
        estimatedDeliveryDate: s.estimatedDeliveryDate ?? null,
        homeToHome: s.homeToHome ?? null,
        tracking: s.tracking ?? null,
        trackingUrl: s.trackingUrl ?? null,
        labelUrl: s.labelUrl ?? null,
      }));
  },
});

// Pedidos con petición de DNI (aduana/internacional) aún sin responder →
// badge "Esperando ID" en la columna Envío
export const pendingDniOrderIds = query({
  args: { serverKey: v.string(), orderIds: v.array(v.number()) },
  handler: async (ctx, { serverKey, orderIds }) => {
    assertServerKey(serverKey);
    const pending: number[] = [];
    for (const orderId of orderIds) {
      const requests = await ctx.db
        .query("order_dni_requests")
        .withIndex("by_order_id", (ix) => ix.eq("orderId", orderId))
        .collect();
      if (requests.some((r) => r.submittedAt === undefined)) {
        pending.push(orderId);
      }
    }
    return pending;
  },
});

// ───────────────────────────── clientes ─────────────────────────────

// Listado completo (filtrado por búsqueda) ordenado por gasto total y nº de
// pedidos; la lib pagina en memoria y usa la longitud como count exacto.
export const customersForList = query({
  args: { serverKey: v.string(), q: v.optional(v.string()) },
  handler: async (ctx, { serverKey, q }) => {
    assertServerKey(serverKey);
    let rows = await ctx.db
      .query("customers")
      .withIndex("by_total_spent")
      .order("desc")
      .take(VIEW_FETCH_LIMIT);
    const needle = q?.toLowerCase();
    if (needle) {
      rows = rows.filter((c) =>
        matchesSearch(needle, c.email, c.firstName, c.lastName),
      );
    }
    // Orden secundario por nº de pedidos (el índice solo cubre totalSpent)
    rows = [...rows].sort(
      (a, b) => b.totalSpent - a.totalSpent || b.ordersCount - a.ordersCount,
    );
    return rows.map((c) => ({
      customerId: c.customerId,
      email: c.email ?? null,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      phone: c.phone ?? null,
      ordersCount: c.ordersCount,
      totalSpent: c.totalSpent,
      currency: c.currency ?? null,
      city: c.city ?? null,
      province: c.province ?? null,
      country: c.country ?? null,
      countryCode: c.countryCode ?? null,
      acceptsEmailMarketing: c.acceptsEmailMarketing ?? null,
      shopifyCreatedAt: c.shopifyCreatedAt ?? null,
    }));
  },
});

// Pedidos válidos de los clientes listados, más recientes primero (la lib se
// queda con el primero de cada cliente = su último pedido)
export const lastOrdersForCustomers = query({
  args: { serverKey: v.string(), customerIds: v.array(v.number()) },
  handler: async (ctx, { serverKey, customerIds }) => {
    assertServerKey(serverKey);
    const idSet = new Set(customerIds);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_created_at")
      .order("desc")
      .take(2000);
    return rows
      .filter(
        (o) =>
          o.customerId !== undefined &&
          idSet.has(o.customerId) &&
          o.cancelledAt === undefined &&
          o.test === false,
      )
      .map((o) => ({ customerId: o.customerId!, createdAt: o.createdAt }));
  },
});

// ───────────────────────────── analítica ─────────────────────────────

// Todos los pedidos válidos en orden cronológico con solo los campos que
// agrega la lib (KPIs, series, desgloses y LTV se calculan en TS).
export const ordersForAnalytics = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_created_at")
      .order("asc")
      .filter((q) =>
        q.and(
          q.eq(q.field("test"), false),
          q.eq(q.field("cancelledAt"), undefined),
        ),
      )
      .take(10_000);
    return rows.map((o) => ({
      orderId: o.orderId,
      createdAt: o.createdAt,
      totalPrice: o.totalPrice ?? null,
      totalRefunded: o.totalRefunded,
      customerId: o.customerId ?? null,
      email: o.email ?? null,
      utmSource: o.utmSource ?? null,
      utmMedium: o.utmMedium ?? null,
      utmCampaign: o.utmCampaign ?? null,
      firstUtmSource: o.firstUtmSource ?? null,
      discountCode: o.discountCode ?? null,
      shippingProvince: o.shippingProvince ?? null,
      shippingCountry: o.shippingCountry ?? null,
      shippingCountryCode: o.shippingCountryCode ?? null,
      lineItems: o.lineItems ?? null,
      upsellRevenue: o.upsellRevenue,
    }));
  },
});
