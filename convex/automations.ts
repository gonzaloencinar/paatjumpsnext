import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Automatizaciones (/admin/automations): secuencias, pasos e inscripciones.
// Primitivas de acceso a datos; el runner de secuencias (lib/crm/
// automation-engine.ts) es de otra área y aún no está portado. La regla de
// "paso efectivo" (activo Y con asunto Y con contenido) se replica aquí para
// que las inscripciones se creen con el delay correcto dentro de la misma
// transacción — misma semántica que effectiveSteps del engine.
//
// Unicidad legacy preservada en las mutations (check-before-write):
// inscripciones únicas por (automatización, contacto, checkout) y por
// (automatización, contacto) cuando no hay checkout y status='active'
// (los índices parciales del legacy) — vía by_automation_and_contact.

const FETCH_LIMIT = 1000;

const nullableString = v.union(v.string(), v.null());

type StepDoc = Doc<"automation_steps">;

function stepOut(doc: StepDoc) {
  return {
    id: doc._id as string,
    automationId: doc.automationId as string,
    position: doc.position,
    delayMinutes: doc.delayMinutes,
    subject: doc.subject ?? null,
    preheader: doc.preheader ?? null,
    bodyHtml: doc.bodyHtml ?? null,
    enabled: doc.enabled,
    createdAt: doc.createdAt,
  };
}

function automationOut(doc: Doc<"automations">) {
  return {
    id: doc._id as string,
    key: doc.key,
    name: doc.name,
    enabled: doc.enabled,
    trigger: doc.trigger,
    config: doc.config ?? null,
    createdAt: doc.createdAt,
  };
}

async function stepsOf(
  ctx: QueryCtx | MutationCtx,
  automationId: Id<"automations">,
) {
  return await ctx.db
    .query("automation_steps")
    .withIndex("by_automation_and_position", (q) =>
      q.eq("automationId", automationId),
    )
    .take(FETCH_LIMIT);
}

// Primer paso que enviaría el runner: activo y con contenido, menor posición
function firstEffectiveStep(steps: StepDoc[]) {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .find(
      (step) => step.enabled && step.subject?.trim() && step.bodyHtml?.trim(),
    );
}

async function byId(ctx: QueryCtx | MutationCtx, id: string) {
  const automationId = ctx.db.normalizeId("automations", id);
  if (!automationId) return null;
  return await ctx.db.get("automations", automationId);
}

// ─────────────────────────── lecturas ───────────────────────────

export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("automations").take(FETCH_LIMIT);
    const out = [];
    for (const doc of [...rows].sort((a, b) => a.createdAt - b.createdAt)) {
      const steps = await stepsOf(ctx, doc._id);
      out.push({ ...automationOut(doc), steps: steps.map(stepOut) });
    }
    return out;
  },
});

export const get = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    return doc ? automationOut(doc) : null;
  },
});

// Ficha completa: automatización + pasos + filas para las métricas por paso
// (email_sends de la automatización) + estados de inscripción
export const detail = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc) return null;
    const steps = await stepsOf(ctx, doc._id);
    const sends = await ctx.db
      .query("email_sends")
      .withIndex("by_automation", (q) => q.eq("automationId", doc._id))
      .take(10_000);
    const enrollments = await ctx.db
      .query("automation_enrollments")
      .withIndex("by_automation_and_contact", (q) =>
        q.eq("automationId", doc._id),
      )
      .take(10_000);
    return {
      automation: automationOut(doc),
      steps: steps.map(stepOut),
      sends: sends.map((s) => ({
        automationStepId: (s.automationStepId as string | undefined) ?? null,
        openedAt: s.openedAt ?? null,
        clickedAt: s.clickedAt ?? null,
      })),
      enrollmentStatuses: enrollments.map((e) => e.status as string),
    };
  },
});

// ─────────────────────────── escrituras ───────────────────────────

export const create = mutation({
  args: {
    serverKey: v.string(),
    name: v.string(),
    trigger: v.union(v.literal("signup"), v.literal("manual")),
    key: v.string(), // slug generado por la action
  },
  handler: async (ctx, { serverKey, name, trigger, key }) => {
    assertServerKey(serverKey);
    const id = await ctx.db.insert("automations", {
      key,
      name,
      enabled: false,
      trigger,
      createdAt: Date.now(),
    });
    return id as string;
  },
});

// Borra la secuencia con sus pasos e inscripciones. Si ya registró envíos se
// conserva el histórico (mismo criterio que el FK restrictivo del legacy).
export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc) return { status: "not_found" as const };
    const anySend = await ctx.db
      .query("email_sends")
      .withIndex("by_automation", (q) => q.eq("automationId", doc._id))
      .first();
    if (anySend) return { status: "has_sends" as const };

    const steps = await stepsOf(ctx, doc._id);
    for (const step of steps) {
      await ctx.db.delete("automation_steps", step._id);
    }
    const enrollments = await ctx.db
      .query("automation_enrollments")
      .withIndex("by_automation_and_contact", (q) =>
        q.eq("automationId", doc._id),
      )
      .take(10_000);
    for (const enrollment of enrollments) {
      await ctx.db.delete("automation_enrollments", enrollment._id);
    }
    await ctx.db.delete("automations", doc._id);
    return { status: "ok" as const };
  },
});

export const toggle = mutation({
  args: { serverKey: v.string(), id: v.string(), enabled: v.boolean() },
  handler: async (ctx, { serverKey, id, enabled }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc) return null;
    await ctx.db.patch("automations", doc._id, { enabled });
    return null;
  },
});

// Nuevo paso al final (posición = última + 1, espera por defecto 1 día)
export const addStep = mutation({
  args: { serverKey: v.string(), automationId: v.string() },
  handler: async (ctx, { serverKey, automationId }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, automationId);
    if (!doc) return null;
    const steps = await stepsOf(ctx, doc._id);
    const last = steps.reduce((max, s) => Math.max(max, s.position), 0);
    await ctx.db.insert("automation_steps", {
      automationId: doc._id,
      position: last + 1,
      delayMinutes: 1440,
      enabled: true, // default de la columna legacy
      createdAt: Date.now(),
    });
    return null;
  },
});

export const updateStep = mutation({
  args: {
    serverKey: v.string(),
    stepId: v.string(),
    delayMinutes: v.number(),
    subject: nullableString,
    preheader: nullableString,
    bodyHtml: nullableString,
  },
  handler: async (
    ctx,
    { serverKey, stepId, delayMinutes, subject, preheader, bodyHtml },
  ) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("automation_steps", stepId);
    const step = id ? await ctx.db.get("automation_steps", id) : null;
    if (!id || !step) return { status: "not_found" as const };
    await ctx.db.patch("automation_steps", id, {
      delayMinutes,
      subject: subject ?? undefined,
      preheader: preheader ?? undefined,
      bodyHtml: bodyHtml ?? undefined,
    });
    return { status: "ok" as const };
  },
});

export const toggleStep = mutation({
  args: { serverKey: v.string(), stepId: v.string(), enabled: v.boolean() },
  handler: async (ctx, { serverKey, stepId, enabled }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("automation_steps", stepId);
    if (!id) return null;
    const step = await ctx.db.get("automation_steps", id);
    if (!step) return null;
    await ctx.db.patch("automation_steps", id, { enabled });
    return null;
  },
});

export const deleteStep = mutation({
  args: { serverKey: v.string(), stepId: v.string() },
  handler: async (ctx, { serverKey, stepId }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("automation_steps", stepId);
    if (!id) return null;
    const step = await ctx.db.get("automation_steps", id);
    if (!step) return null;
    await ctx.db.delete("automation_steps", id);
    return null;
  },
});

// Intercambio de posiciones con el vecino, en una sola transacción
export const moveStep = mutation({
  args: {
    serverKey: v.string(),
    automationId: v.string(),
    stepId: v.string(),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { serverKey, automationId, stepId, direction }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, automationId);
    if (!doc) return null;
    const steps = [...(await stepsOf(ctx, doc._id))].sort(
      (a, b) => a.position - b.position,
    );
    const index = steps.findIndex((step) => (step._id as string) === stepId);
    const current = steps[index];
    const other = direction === "up" ? steps[index - 1] : steps[index + 1];
    if (!current || !other) return null;
    await ctx.db.patch("automation_steps", current._id, {
      position: other.position,
    });
    await ctx.db.patch("automation_steps", other._id, {
      position: current.position,
    });
    return null;
  },
});

// Trigger manual: inscribe a los suscritos actuales que nunca pasaron por la
// secuencia (los que completaron/cancelaron no se re-inscriben), saltando
// suprimidos. Todo en una transacción — el filtro de "ya inscritos" hace de
// check-before-write.
export const enrollSubscribers = mutation({
  args: { serverKey: v.string(), automationId: v.string() },
  handler: async (ctx, { serverKey, automationId }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, automationId);
    if (!doc) return { status: "not_found" as const };

    const first = firstEffectiveStep(await stepsOf(ctx, doc._id));
    if (!first) return { status: "no_steps" as const };

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_status", (q) => q.eq("status", "subscribed"))
      .take(10_000);
    const suppressions = await ctx.db.query("suppressions").take(10_000);
    const suppressed = new Set(suppressions.map((s) => s.email));
    const enrolled = await ctx.db
      .query("automation_enrollments")
      .withIndex("by_automation_and_contact", (q) =>
        q.eq("automationId", doc._id),
      )
      .take(10_000);
    const already = new Set(enrolled.map((e) => e.contactId));

    const audience = contacts.filter(
      (contact) => !suppressed.has(contact.email) && !already.has(contact._id),
    );
    if (audience.length === 0) return { status: "none" as const };

    const nextRunAt = Date.now() + first.delayMinutes * 60_000;
    for (const contact of audience) {
      await ctx.db.insert("automation_enrollments", {
        automationId: doc._id,
        contactId: contact._id,
        step: 0,
        status: "active",
        nextRunAt,
        createdAt: Date.now(),
      });
    }
    return { status: "ok" as const, count: audience.length };
  },
});

// Alta nueva (o re-suscripción) → inscribir en las secuencias 'signup'
// activas con al menos un paso efectivo (lo llama /api/subscribe). Respeta
// la unicidad parcial del legacy: como mucho una inscripción activa sin
// checkout por (automatización, contacto).
export const enrollOnSignup = mutation({
  args: { serverKey: v.string(), contactId: v.string() },
  handler: async (ctx, { serverKey, contactId }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("contacts", contactId);
    if (!id) return null;
    const contact = await ctx.db.get("contacts", id);
    if (!contact) return null;

    const automations = await ctx.db.query("automations").take(FETCH_LIMIT);
    for (const automation of automations) {
      if (automation.trigger !== "signup" || !automation.enabled) continue;
      const first = firstEffectiveStep(await stepsOf(ctx, automation._id));
      if (!first) continue;

      // "on conflict do nothing" del índice parcial legacy
      const existing = await ctx.db
        .query("automation_enrollments")
        .withIndex("by_automation_and_contact", (q) =>
          q.eq("automationId", automation._id).eq("contactId", id),
        )
        .take(FETCH_LIMIT);
      const hasActive = existing.some(
        (e) => e.checkoutId === undefined && e.status === "active",
      );
      if (hasActive) continue;

      await ctx.db.insert("automation_enrollments", {
        automationId: automation._id,
        contactId: id,
        step: 0,
        status: "active",
        nextRunAt: Date.now() + first.delayMinutes * 60_000,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
