import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Facturación Holded (tablas order_invoices y order_credit_notes, PKs legacy
// orderId numérico y refundId string). Solo primitivas de acceso a datos: la
// API de Holded, el mapeo de líneas/IVA, los reintentos (MAX_ATTEMPTS) y el
// corte HOLDED_AUTO_SINCE viven en lib/holded/*. La lectura de `orders` para
// decidir qué facturar vive aquí (scoped, igual que hizo tienda). Tablas
// pequeñas (22 tickets, 0 abonos): collect()/take() + filtro en JS.
//
// Convención de patch (la de convex/shipments.ts): en updateInvoice /
// updateCreditNote la clave AUSENTE no toca el campo y `null` lo borra
// (p. ej. error: null al facturar con éxito, como el UPDATE legacy).

const FETCH_LIMIT = 1000;
// Mismo tope que el .limit(200) del SQL legacy previo al join con invoices
const CANDIDATE_POOL = 200;

async function invoiceByOrder(ctx: QueryCtx | MutationCtx, orderId: number) {
  return await ctx.db
    .query("order_invoices")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .unique();
}

async function creditNoteByRefund(
  ctx: QueryCtx | MutationCtx,
  refundId: string,
) {
  return await ctx.db
    .query("order_credit_notes")
    .withIndex("by_refund_id", (q) => q.eq("refundId", refundId))
    .unique();
}

// ─────────────────────────── tickets: lecturas ───────────────────────────

// Fila de estado del ticket de un pedido (claim/idempotencia en lib)
export const invoiceByOrderId = query({
  args: { serverKey: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, orderId }) => {
    assertServerKey(serverKey);
    const row = await invoiceByOrder(ctx, orderId);
    if (!row) return null;
    return {
      status: row.status,
      holdedId: row.holdedId ?? null,
      documentNumber: row.documentNumber ?? null,
      attempts: row.attempts,
    };
  },
});

// Pedidos cobrados sin ticket todavía, en un rango de processedAt (ms epoch,
// [sinceMs, beforeMs)), en orden cronológico. Réplica del SQL legacy:
// paid + no cancelado + rango → orden asc → tope 200 → sin tests → fuera los
// ya facturados/omitidos/agotados (maxAttempts lo pasa la lib). Los pedidos
// sin processedAt quedan fuera (el rango legacy también los excluía).
export const invoiceCandidates = query({
  args: {
    serverKey: v.string(),
    sinceMs: v.optional(v.number()),
    beforeMs: v.optional(v.number()),
    limit: v.number(),
    maxAttempts: v.number(),
  },
  handler: async (
    ctx,
    { serverKey, sinceMs, beforeMs, limit, maxAttempts },
  ) => {
    assertServerKey(serverKey);
    const all = await ctx.db.query("orders").take(FETCH_LIMIT);
    const inRange = all
      .filter(
        (o) =>
          o.financialStatus === "paid" &&
          o.cancelledAt === undefined &&
          o.processedAt !== undefined &&
          (sinceMs === undefined || o.processedAt >= sinceMs) &&
          (beforeMs === undefined || o.processedAt < beforeMs),
      )
      .sort((a, b) => a.processedAt! - b.processedAt!)
      .slice(0, CANDIDATE_POOL)
      .filter((o) => !o.test);

    const invoices = await ctx.db.query("order_invoices").collect();
    const done = new Set(
      invoices
        .filter(
          (i) =>
            i.status === "created" ||
            i.status === "skipped" ||
            i.attempts >= maxAttempts,
        )
        .map((i) => i.orderId),
    );

    return inRange
      .filter((o) => !done.has(o.orderId))
      .slice(0, limit)
      .map((o) => ({
        orderId: o.orderId,
        name: o.name ?? null,
        email: o.email ?? null,
        financialStatus: o.financialStatus ?? null,
        cancelledAt: o.cancelledAt ?? null,
        test: o.test,
        totalRefunded: o.totalRefunded,
        totalPrice: o.totalPrice ?? null,
        processedAt: o.processedAt ?? null,
      }));
  },
});

// ─────────────────────────── tickets: escrituras ───────────────────────────

// Claim previo a llamar a Holded. Si la fila ya existe no la toca (mismo
// comportamiento que el insert legacy tras el maybeSingle).
export const insertPendingInvoice = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    orderName: v.optional(v.string()),
  },
  handler: async (ctx, { serverKey, orderId, orderName }) => {
    assertServerKey(serverKey);
    const existing = await invoiceByOrder(ctx, orderId);
    if (existing) return null;
    const now = Date.now();
    await ctx.db.insert("order_invoices", {
      orderId,
      ...(orderName !== undefined ? { orderName } : {}),
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

// Update parcial por orderId (clave ausente = no tocar, null = borrar).
// updatedAt se sella aquí en cada escritura, como el UPDATE legacy.
export const updateInvoice = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    status: v.optional(v.string()),
    error: v.optional(v.union(v.string(), v.null())),
    holdedId: v.optional(v.string()),
    documentNumber: v.optional(v.union(v.string(), v.null())),
    total: v.optional(v.number()),
    tax: v.optional(v.number()),
    emailedAt: v.optional(v.number()),
    attempts: v.optional(v.number()),
  },
  handler: async (ctx, { serverKey, orderId, ...input }) => {
    assertServerKey(serverKey);
    const existing = await invoiceByOrder(ctx, orderId);
    if (!existing) return null;
    await ctx.db.patch("order_invoices", existing._id, {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.error !== undefined
        ? { error: input.error ?? undefined }
        : {}),
      ...(input.holdedId !== undefined ? { holdedId: input.holdedId } : {}),
      ...(input.documentNumber !== undefined
        ? { documentNumber: input.documentNumber ?? undefined }
        : {}),
      ...(input.total !== undefined ? { total: input.total } : {}),
      ...(input.tax !== undefined ? { tax: input.tax } : {}),
      ...(input.emailedAt !== undefined
        ? { emailedAt: input.emailedAt }
        : {}),
      ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ─────────────────────────── rectificativas ───────────────────────────

// Estado del abono de un refund (idempotencia por refundId)
export const creditNoteByRefundId = query({
  args: { serverKey: v.string(), refundId: v.string() },
  handler: async (ctx, { serverKey, refundId }) => {
    assertServerKey(serverKey);
    const row = await creditNoteByRefund(ctx, refundId);
    if (!row) return null;
    return {
      status: row.status,
      holdedId: row.holdedId ?? null,
      attempts: row.attempts,
    };
  },
});

// Datos para la reconciliación de respaldo del cron: pedidos ya facturados
// (status created) con devoluciones (totalRefunded > 0) y sus abonos. El
// criterio de cobertura (±0,02 €, maxAttempts) lo aplica la lib.
export const refundReconciliationCandidates = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const invoices = await ctx.db.query("order_invoices").collect();
    const invoicedIds = [
      ...new Set(
        invoices.filter((i) => i.status === "created").map((i) => i.orderId),
      ),
    ];

    const orders: { orderId: number; totalRefunded: number }[] = [];
    for (const orderId of invoicedIds) {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
        .first();
      if (order && order.totalRefunded > 0) {
        orders.push({ orderId: order.orderId, totalRefunded: order.totalRefunded });
      }
    }

    const refundedIds = new Set(orders.map((o) => o.orderId));
    const notes = (await ctx.db.query("order_credit_notes").collect())
      .filter((n) => refundedIds.has(n.orderId))
      .map((n) => ({
        orderId: n.orderId,
        status: n.status,
        total: n.total ?? null,
        attempts: n.attempts,
      }));

    return { orders, notes };
  },
});

// Claim del abono previo a llamar a Holded (no toca la fila si ya existe)
export const insertPendingCreditNote = mutation({
  args: { serverKey: v.string(), refundId: v.string(), orderId: v.number() },
  handler: async (ctx, { serverKey, refundId, orderId }) => {
    assertServerKey(serverKey);
    const existing = await creditNoteByRefund(ctx, refundId);
    if (existing) return null;
    const now = Date.now();
    await ctx.db.insert("order_credit_notes", {
      refundId,
      orderId,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

// Update parcial por refundId (misma convención que updateInvoice)
export const updateCreditNote = mutation({
  args: {
    serverKey: v.string(),
    refundId: v.string(),
    status: v.optional(v.string()),
    error: v.optional(v.union(v.string(), v.null())),
    holdedId: v.optional(v.string()),
    documentNumber: v.optional(v.union(v.string(), v.null())),
    total: v.optional(v.number()),
    tax: v.optional(v.number()),
    attempts: v.optional(v.number()),
  },
  handler: async (ctx, { serverKey, refundId, ...input }) => {
    assertServerKey(serverKey);
    const existing = await creditNoteByRefund(ctx, refundId);
    if (!existing) return null;
    await ctx.db.patch("order_credit_notes", existing._id, {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.error !== undefined
        ? { error: input.error ?? undefined }
        : {}),
      ...(input.holdedId !== undefined ? { holdedId: input.holdedId } : {}),
      ...(input.documentNumber !== undefined
        ? { documentNumber: input.documentNumber ?? undefined }
        : {}),
      ...(input.total !== undefined ? { total: input.total } : {}),
      ...(input.tax !== undefined ? { tax: input.tax } : {}),
      ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
