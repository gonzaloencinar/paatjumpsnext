import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Peticiones de DNI/NIE post-pedido (tabla order_dni_requests, PK legacy
// orderId numérico). Solo primitivas de acceso a datos: la decisión de qué
// destinos exigen DNI, los tokens firmados del formulario /id/<token>, los
// emails y los umbrales de recordatorio/aviso viven en lib/crm/dni-requests.ts.
// Tabla pequeña (unidades): take() + filtro en JS es suficiente.
//
// convex/store.ts lee esta tabla (badge "Esperando ID" en /admin/orders);
// aquí viven sus escrituras y las lecturas del flujo de peticiones.

const FETCH_LIMIT = 1000;

const dniLocale = v.union(v.literal("es"), v.literal("en"));

async function requestByOrder(ctx: QueryCtx | MutationCtx, orderId: number) {
  return await ctx.db
    .query("order_dni_requests")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .unique();
}

function toView(row: NonNullable<Awaited<ReturnType<typeof requestByOrder>>>) {
  return {
    orderId: row.orderId,
    orderName: row.orderName ?? null,
    email: row.email,
    locale: row.locale,
    dni: row.dni ?? null,
    submittedAt: row.submittedAt ?? null,
    firstSentAt: row.firstSentAt ?? null,
    reminderSentAt: row.reminderSentAt ?? null,
    alertedAt: row.alertedAt ?? null,
  };
}

// ─────────────────────────── lecturas ───────────────────────────

// Petición de un pedido (formulario público /id/<token> y DNI para el envío)
export const requestByOrderId = query({
  args: { serverKey: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, orderId }) => {
    assertServerKey(serverKey);
    const row = await requestByOrder(ctx, orderId);
    return row ? toView(row) : null;
  },
});

// Peticiones vivas para el tick del cron: sin responder y sin aviso interno
// aún (mismo criterio que el select legacy; los umbrales los aplica la lib)
export const pendingRequests = query({
  args: { serverKey: v.string(), limit: v.number() },
  handler: async (ctx, { serverKey, limit }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("order_dni_requests").take(FETCH_LIMIT);
    return rows
      .filter((r) => r.submittedAt === undefined && r.alertedAt === undefined)
      .slice(0, limit)
      .map(toView);
  },
});

// ─────────────────────────── escrituras ───────────────────────────

// Alta idempotente desde el webhook orders/create (equivalente al upsert
// legacy con onConflict order_id + ignoreDuplicates: si ya existe, no toca)
export const ensureRequest = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    orderName: v.optional(v.string()),
    email: v.string(),
    locale: dniLocale,
  },
  handler: async (ctx, { serverKey, orderId, orderName, email, locale }) => {
    assertServerKey(serverKey);
    const existing = await requestByOrder(ctx, orderId);
    if (existing) return null;
    await ctx.db.insert("order_dni_requests", {
      orderId,
      ...(orderName !== undefined ? { orderName } : {}),
      email,
      locale,
      createdAt: Date.now(),
    });
    return null;
  },
});

// Marca de progreso del cron (primer email / recordatorio 24 h / aviso 48 h);
// el timestamp se sella aquí, como el new Date() del UPDATE legacy
export const markSent = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    mark: v.union(
      v.literal("first"),
      v.literal("reminder"),
      v.literal("alerted"),
    ),
  },
  handler: async (ctx, { serverKey, orderId, mark }) => {
    assertServerKey(serverKey);
    const existing = await requestByOrder(ctx, orderId);
    if (!existing) return null;
    const now = Date.now();
    await ctx.db.patch("order_dni_requests", existing._id, {
      ...(mark === "first" ? { firstSentAt: now } : {}),
      ...(mark === "reminder" ? { reminderSentAt: now } : {}),
      ...(mark === "alerted" ? { alertedAt: now } : {}),
    });
    return null;
  },
});

// Guarda el DNI (formulario del cliente o resolución manual del admin).
// onlyIfUnsubmitted replica el `.is("submitted_at", null)` del caso manual:
// no pisa un DNI ya enviado por el cliente. No-op si no hay petición (el
// update legacy sobre 0 filas tampoco fallaba).
export const submitDni = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    dni: v.string(),
    onlyIfUnsubmitted: v.boolean(),
  },
  handler: async (ctx, { serverKey, orderId, dni, onlyIfUnsubmitted }) => {
    assertServerKey(serverKey);
    const existing = await requestByOrder(ctx, orderId);
    if (!existing) return null;
    if (onlyIfUnsubmitted && existing.submittedAt !== undefined) return null;
    await ctx.db.patch("order_dni_requests", existing._id, {
      dni,
      submittedAt: Date.now(),
    });
    return null;
  },
});
