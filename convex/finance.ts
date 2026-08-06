import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Finanzas de socios (/admin/finance). Primitivas de acceso a datos: las
// agregaciones por mes de Madrid, el cálculo de IRPF y la liquidación viven en
// lib/crm/finance.ts. Aquí solo lecturas acotadas y upserts transaccionales.
// Tablas pequeñas: collect() + orden en JS es suficiente.

const financeType = v.union(v.literal("income"), v.literal("expense"));
const financePartner = v.union(v.literal("gonzalo"), v.literal("patri"));
const financeFrequency = v.union(
  v.literal("monthly"),
  v.literal("bimonthly"),
  v.literal("quarterly"),
  v.literal("semiannual"),
  v.literal("yearly"),
);

const entryFields = {
  type: financeType,
  concept: v.string(),
  amount: v.number(),
  partner: financePartner,
  entryDate: v.string(), // YYYY-MM-DD
  notes: v.optional(v.string()),
};

const recurringFields = {
  type: financeType,
  concept: v.string(),
  amount: v.number(),
  partner: financePartner,
  frequency: financeFrequency,
  dayOfMonth: v.number(),
  startsOn: v.string(), // YYYY-MM-DD
  endsOn: v.optional(v.string()),
  notes: v.optional(v.string()),
};

// ─────────────────────────── lecturas ───────────────────────────

// Singleton (antes fila con PK boolean id=true)
export const settings = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    return await ctx.db.query("finance_settings").first();
  },
});

export const recurrings = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("finance_recurring").collect();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const monthIrpf = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("finance_month_irpf").collect();
    return rows.map((row) => ({ month: row.month, irpfPct: row.irpfPct }));
  },
});

// Movimientos vivos del año (los tombstones deletedAt se quedan fuera)
export const entriesForYear = query({
  args: { serverKey: v.string(), year: v.string() },
  handler: async (ctx, { serverKey, year }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("finance_entries")
      .withIndex("by_entry_date", (q) =>
        q.gte("entryDate", `${year}-01-01`).lte("entryDate", `${year}-12-31`),
      )
      .collect();
    return rows.filter((row) => row.deletedAt === undefined);
  },
});

// Pedidos del rango [startMs, endMs) con solo los campos que agrega la lib
// (ventas Shopify por mes de Madrid). El rango lo calcula la lib (regla: las
// queries no leen el reloj ni saben de zonas horarias).
export const ordersForFinance = query({
  args: { serverKey: v.string(), startMs: v.number(), endMs: v.number() },
  handler: async (ctx, { serverKey, startMs, endMs }) => {
    assertServerKey(serverKey);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) =>
        q.gte("createdAt", startMs).lt("createdAt", endMs),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("test"), false),
          q.eq(q.field("cancelledAt"), undefined),
        ),
      )
      .take(10_000);
    return orders.map((o) => ({
      createdAt: o.createdAt,
      financialStatus: o.financialStatus ?? null,
      totalPrice: o.totalPrice ?? null,
      totalTax: o.totalTax ?? null,
      totalRefunded: o.totalRefunded,
      totalShipping: o.totalShipping ?? null,
    }));
  },
});

// Envíos sincronizados (Packlink/Genei) con los campos del coste por mes
export const shipmentsForFinance = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const shipments = await ctx.db.query("packlink_shipments").take(5_000);
    return shipments.map((s) => ({
      provider: s.provider,
      cost: s.cost ?? null,
      state: s.state ?? null,
      shipmentDate: s.shipmentDate ?? null,
      syncedAt: s.syncedAt,
    }));
  },
});

// Arranque de la actividad (primer movimiento y primer pedido válido), para
// congelar el IRPF de los meses ya pasados al cambiar el tipo global
export const startDates = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const firstEntry = await ctx.db
      .query("finance_entries")
      .withIndex("by_entry_date")
      .order("asc")
      .first();
    const firstOrder = await ctx.db
      .query("orders")
      .withIndex("by_created_at")
      .filter((q) =>
        q.and(
          q.eq(q.field("test"), false),
          q.eq(q.field("cancelledAt"), undefined),
        ),
      )
      .order("asc")
      .first();
    return {
      firstEntryDate: firstEntry?.entryDate ?? null,
      firstOrderCreatedAt: firstOrder?.createdAt ?? null,
    };
  },
});

// ─────────────────────────── movimientos ───────────────────────────

export const createEntry = mutation({
  args: { serverKey: v.string(), ...entryFields },
  handler: async (ctx, { serverKey, ...fields }) => {
    assertServerKey(serverKey);
    const now = Date.now();
    await ctx.db.insert("finance_entries", {
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const updateEntry = mutation({
  args: { serverKey: v.string(), id: v.string(), ...entryFields },
  handler: async (ctx, { serverKey, id, ...fields }) => {
    assertServerKey(serverKey);
    const entryId = ctx.db.normalizeId("finance_entries", id);
    if (!entryId) return { error: "Movimiento no encontrado." };
    const entry = await ctx.db.get("finance_entries", entryId);
    if (!entry) return { error: "Movimiento no encontrado." };
    // Claves siempre presentes: undefined elimina el campo (= poner a null)
    await ctx.db.patch("finance_entries", entryId, {
      type: fields.type,
      concept: fields.concept,
      amount: fields.amount,
      partner: fields.partner,
      entryDate: fields.entryDate,
      notes: fields.notes,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// Las entradas generadas por un recurrente se marcan con deletedAt (tombstone)
// para que la materialización no las recree; las manuales se borran de verdad.
export const deleteEntry = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const entryId = ctx.db.normalizeId("finance_entries", id);
    const entry = entryId
      ? await ctx.db.get("finance_entries", entryId)
      : null;
    if (!entryId || !entry) return { error: "Movimiento no encontrado." };
    if (entry.recurringId && entry.period) {
      await ctx.db.patch("finance_entries", entryId, {
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.delete("finance_entries", entryId);
    }
    return { ok: true };
  },
});

// Upsert transaccional de las ocurrencias vencidas que la lib ya calculó.
// Idempotente por (recurringId, period); los tombstones también cuentan como
// existentes y bloquean la re-creación de entradas borradas a propósito.
export const materializeRecurring = mutation({
  args: {
    serverKey: v.string(),
    rows: v.array(
      v.object({
        recurringId: v.id("finance_recurring"),
        period: v.string(), // YYYY-MM
        type: financeType,
        concept: v.string(),
        amount: v.number(),
        partner: financePartner,
        entryDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, { serverKey, rows }) => {
    assertServerKey(serverKey);
    const now = Date.now();
    for (const row of rows) {
      const existing = await ctx.db
        .query("finance_entries")
        .withIndex("by_recurring_and_period", (q) =>
          q.eq("recurringId", row.recurringId).eq("period", row.period),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("finance_entries", {
        ...row,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

// ─────────────────────────── recurrentes ───────────────────────────

export const createRecurring = mutation({
  args: { serverKey: v.string(), ...recurringFields },
  handler: async (ctx, { serverKey, ...fields }) => {
    assertServerKey(serverKey);
    const now = Date.now();
    await ctx.db.insert("finance_recurring", {
      ...fields,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

// Actualiza el recurrente y regenera lo ya materializado desde fromPeriod
// (mes actual de Madrid, lo pasa la lib): esas entradas se borran y la próxima
// materialización las recrea con los datos nuevos. Los meses pasados no se
// tocan y los tombstones se respetan.
export const updateRecurring = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    fromPeriod: v.string(), // YYYY-MM
    ...recurringFields,
  },
  handler: async (ctx, { serverKey, id, fromPeriod, ...fields }) => {
    assertServerKey(serverKey);
    const recurringId = ctx.db.normalizeId("finance_recurring", id);
    if (!recurringId) return { error: "El recurrente ya no existe." };
    const current = await ctx.db.get("finance_recurring", recurringId);
    if (!current) return { error: "El recurrente ya no existe." };
    // Claves siempre presentes: undefined elimina el campo (= poner a null)
    await ctx.db.patch("finance_recurring", recurringId, {
      type: fields.type,
      concept: fields.concept,
      amount: fields.amount,
      partner: fields.partner,
      frequency: fields.frequency,
      dayOfMonth: fields.dayOfMonth,
      startsOn: fields.startsOn,
      endsOn: fields.endsOn,
      notes: fields.notes,
      updatedAt: Date.now(),
    });

    const materialized = await ctx.db
      .query("finance_entries")
      .withIndex("by_recurring_and_period", (q) =>
        q.eq("recurringId", recurringId).gte("period", fromPeriod),
      )
      .collect();
    for (const entry of materialized) {
      if (entry.deletedAt !== undefined) continue; // tombstone: se respeta
      await ctx.db.delete("finance_entries", entry._id);
    }
    return { ok: true };
  },
});

export const toggleRecurring = mutation({
  args: { serverKey: v.string(), id: v.string(), active: v.boolean() },
  handler: async (ctx, { serverKey, id, active }) => {
    assertServerKey(serverKey);
    const recurringId = ctx.db.normalizeId("finance_recurring", id);
    if (!recurringId) return { error: "El recurrente ya no existe." };
    await ctx.db.patch("finance_recurring", recurringId, {
      active,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// Al borrar el recurrente, sus movimientos ya generados se conservan como
// movimientos sueltos (equivale al FK con set null de Postgres).
export const deleteRecurring = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const recurringId = ctx.db.normalizeId("finance_recurring", id);
    if (!recurringId) return { error: "El recurrente ya no existe." };
    const entries = await ctx.db
      .query("finance_entries")
      .withIndex("by_recurring_and_period", (q) =>
        q.eq("recurringId", recurringId),
      )
      .collect();
    for (const entry of entries) {
      await ctx.db.patch("finance_entries", entry._id, {
        recurringId: undefined,
      });
    }
    await ctx.db.delete("finance_recurring", recurringId);
    return { ok: true };
  },
});

// ─────────────────────────── IRPF ───────────────────────────

export const setGlobalIrpf = mutation({
  args: { serverKey: v.string(), irpfPct: v.number() },
  handler: async (ctx, { serverKey, irpfPct }) => {
    assertServerKey(serverKey);
    const existing = await ctx.db.query("finance_settings").first();
    if (existing) {
      await ctx.db.patch("finance_settings", existing._id, {
        irpfPct,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("finance_settings", {
        irpfPct,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

// Congela meses pasados con el tipo vigente: solo inserta los meses SIN fila
// propia (equivale al upsert con ignoreDuplicates de Supabase)
export const freezeMonthsIrpf = mutation({
  args: {
    serverKey: v.string(),
    rows: v.array(v.object({ month: v.string(), irpfPct: v.number() })),
  },
  handler: async (ctx, { serverKey, rows }) => {
    assertServerKey(serverKey);
    const now = Date.now();
    for (const row of rows) {
      const existing = await ctx.db
        .query("finance_month_irpf")
        .withIndex("by_month", (q) => q.eq("month", row.month))
        .first();
      if (existing) continue;
      await ctx.db.insert("finance_month_irpf", {
        month: row.month,
        irpfPct: row.irpfPct,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const upsertMonthIrpf = mutation({
  args: { serverKey: v.string(), month: v.string(), irpfPct: v.number() },
  handler: async (ctx, { serverKey, month, irpfPct }) => {
    assertServerKey(serverKey);
    const existing = await ctx.db
      .query("finance_month_irpf")
      .withIndex("by_month", (q) => q.eq("month", month))
      .first();
    if (existing) {
      await ctx.db.patch("finance_month_irpf", existing._id, {
        irpfPct,
        updatedAt: Date.now(),
      });
    } else {
      const now = Date.now();
      await ctx.db.insert("finance_month_irpf", {
        month,
        irpfPct,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const deleteMonthIrpf = mutation({
  args: { serverKey: v.string(), month: v.string() },
  handler: async (ctx, { serverKey, month }) => {
    assertServerKey(serverKey);
    const existing = await ctx.db
      .query("finance_month_irpf")
      .withIndex("by_month", (q) => q.eq("month", month))
      .first();
    if (existing) await ctx.db.delete("finance_month_irpf", existing._id);
    return { ok: true };
  },
});
