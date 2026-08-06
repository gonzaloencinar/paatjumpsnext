import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";
import { isEffectiveStep } from "./lib/crm";

// Primitivas de datos de los motores del CRM (lib/crm/campaign-engine.ts y
// lib/crm/automation-engine.ts). Los RPC legacy con FOR UPDATE SKIP LOCKED
// se vuelven mutations transaccionales normales: en Convex cada mutation es
// una transacción serializable, así que dos ticks solapados del cron no se
// pisan — el "lote reclamado" queda sellado (claimedAt / nextRunAt adelantado)
// antes de que el siguiente tick pueda leerlo. El envío real por Resend ocurre
// fuera (en la lib), con Idempotency-Key determinista: repetir un claim
// rescatado tras un crash no duplica emails.

const CLAIM_LEASE_MS = 15 * 60_000; // rescate de claims colgados (crash a mitad de tick)

const nullableNumber = v.union(v.number(), v.null());

// ─────────────────────────── campañas ───────────────────────────

// Programadas que ya tocan (la lib materializa el snapshot y las promueve)
export const dueScheduledCampaigns = query({
  args: { serverKey: v.string(), now: v.number() },
  handler: async (ctx, { serverKey, now }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "scheduled"))
      .take(100);
    return rows
      .filter((c) => c.scheduledAt !== undefined && c.scheduledAt <= now)
      .map((c) => ({ id: c._id as string, segment: c.segment ?? null }));
  },
});

// scheduled → sending, condicional (equivale al update .eq("status") legacy).
// A diferencia de campaigns.startSending no exige destinatarios: una audiencia
// vacía pasa a sending y el finalize del mismo tick la deja en sent.
export const promoteScheduled = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const campaignId = ctx.db.normalizeId("campaigns", id);
    const doc = campaignId ? await ctx.db.get("campaigns", campaignId) : null;
    if (!campaignId || !doc || doc.status !== "scheduled") return false;
    await ctx.db.patch("campaigns", campaignId, { status: "sending" });
    return true;
  },
});

// Campañas en envío, más antiguas primero (presupuesto compartido del tick)
export const sendingCampaigns = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "sending"))
      .take(100);
    return [...rows]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => ({
        id: c._id as string,
        name: c.name,
        subject: c.subject ?? null,
        preheader: c.preheader ?? null,
        bodyHtml: c.bodyHtml ?? null,
      }));
  },
});

// claim_campaign_batch: reclama un lote atómicamente — pendientes + rescate de
// 'sending' colgados >15 min — marcándolo 'sending' con claimedAt=now
export const claimCampaignBatch = mutation({
  args: { serverKey: v.string(), id: v.string(), limit: v.number() },
  handler: async (ctx, { serverKey, id, limit }) => {
    assertServerKey(serverKey);
    const campaignId = ctx.db.normalizeId("campaigns", id);
    if (!campaignId || limit <= 0) return [];
    const now = Date.now();

    const pending = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaignId).eq("status", "pending"),
      )
      .take(limit);
    const stale = (
      await ctx.db
        .query("campaign_recipients")
        .withIndex("by_campaign_and_status", (q) =>
          q.eq("campaignId", campaignId).eq("status", "sending"),
        )
        .take(1000)
    ).filter((r) => (r.claimedAt ?? 0) < now - CLAIM_LEASE_MS);

    const batch = [...pending, ...stale]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
    for (const recipient of batch) {
      await ctx.db.patch("campaign_recipients", recipient._id, {
        status: "sending",
        claimedAt: now,
      });
    }
    return batch.map((r) => ({
      id: r._id as string,
      contactId: r.contactId as string,
      email: r.email,
      firstName: r.firstName ?? null,
    }));
  },
});

// Sella el resultado del envío de un destinatario
export const markRecipient = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    emailSendId: v.optional(v.string()),
  },
  handler: async (ctx, { serverKey, id, status, emailSendId }) => {
    assertServerKey(serverKey);
    const recipientId = ctx.db.normalizeId("campaign_recipients", id);
    if (!recipientId) return null;
    const recipient = await ctx.db.get("campaign_recipients", recipientId);
    if (!recipient) return null;
    const sendId = emailSendId
      ? (ctx.db.normalizeId("email_sends", emailSendId) ?? undefined)
      : undefined;
    await ctx.db.patch("campaign_recipients", recipientId, {
      status,
      ...(sendId ? { emailSendId: sendId } : {}),
    });
    return null;
  },
});

// Cierra la campaña cuando no quedan pendientes ni en vuelo (sending→sent,
// condicional). Devuelve si terminó en esta llamada.
export const finalizeCampaignIfDone = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const campaignId = ctx.db.normalizeId("campaigns", id);
    if (!campaignId) return false;
    const pending = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaignId).eq("status", "pending"),
      )
      .first();
    if (pending) return false;
    const sending = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaignId).eq("status", "sending"),
      )
      .first();
    if (sending) return false;
    const doc = await ctx.db.get("campaigns", campaignId);
    if (doc && doc.status === "sending") {
      await ctx.db.patch("campaigns", campaignId, {
        status: "sent",
        sentAt: Date.now(),
      });
    }
    return true;
  },
});

// ─────────────────────────── automatizaciones ───────────────────────────

// claim_due_enrollments: adelanta nextRunAt +15 min de las inscripciones
// vencidas de automatizaciones enabled y devuelve las filas con todo lo que
// el runner necesita (automatización, pasos, contacto y checkout) — una sola
// transacción en vez del RPC + 4 selects del legacy.
export const claimDueEnrollments = mutation({
  args: { serverKey: v.string(), limit: v.number() },
  handler: async (ctx, { serverKey, limit }) => {
    assertServerKey(serverKey);
    if (limit <= 0) return [];
    const now = Date.now();

    const candidates = await ctx.db
      .query("automation_enrollments")
      .withIndex("by_status_and_next_run_at", (q) =>
        q.eq("status", "active").lte("nextRunAt", now),
      )
      .take(500);

    const automationCache = new Map<
      string,
      { doc: { _id: unknown; name: string; enabled: boolean } | null }
    >();
    const out = [];
    for (const enrollment of candidates) {
      // nextRunAt undefined queda fuera (lte lo incluiría como "menor")
      if (enrollment.nextRunAt === undefined) continue;
      if (out.length >= limit) break;

      const key = enrollment.automationId as string;
      let cached = automationCache.get(key);
      if (!cached) {
        cached = { doc: await ctx.db.get("automations", enrollment.automationId) };
        automationCache.set(key, cached);
      }
      const automation = cached.doc;
      if (!automation || !automation.enabled) continue;

      // Lease de 15 min: el siguiente tick no la re-reclama; un crash reintenta solo
      await ctx.db.patch("automation_enrollments", enrollment._id, {
        nextRunAt: now + CLAIM_LEASE_MS,
      });

      const steps = await ctx.db
        .query("automation_steps")
        .withIndex("by_automation_and_position", (q) =>
          q.eq("automationId", enrollment.automationId),
        )
        .take(200);

      const contact = await ctx.db.get("contacts", enrollment.contactId);
      const checkout = enrollment.checkoutId
        ? await ctx.db.get("checkouts", enrollment.checkoutId)
        : null;

      out.push({
        id: enrollment._id as string,
        step: enrollment.step,
        automationId: enrollment.automationId as string,
        automationName: automation.name,
        hasCheckout: enrollment.checkoutId !== undefined,
        steps: steps.map((s) => ({
          id: s._id as string,
          position: s.position,
          delayMinutes: s.delayMinutes,
          subject: s.subject ?? null,
          preheader: s.preheader ?? null,
          bodyHtml: s.bodyHtml ?? null,
          enabled: s.enabled,
          effective: isEffectiveStep(s),
        })),
        contact: contact
          ? {
              id: contact._id as string,
              email: contact.email,
              firstName: contact.firstName ?? null,
              status: contact.status as string,
            }
          : null,
        checkout: checkout
          ? {
              id: checkout._id as string,
              checkoutId: checkout.checkoutId, // id legacy de Shopify (negativo = sintético)
              status: checkout.status as string,
              recoveryUrl: checkout.recoveryUrl ?? null,
              lineItems: checkout.lineItems ?? null,
              totalPrice: checkout.totalPrice ?? null,
              currency: checkout.currency ?? null,
            }
          : null,
      });
    }
    return out;
  },
});

// Avance/cierre de una inscripción. Convención de patch del proyecto:
// clave ausente no toca el campo, null lo borra.
export const updateEnrollment = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    status: v.optional(
      v.union(v.literal("active"), v.literal("completed"), v.literal("canceled")),
    ),
    step: v.optional(v.number()),
    nextRunAt: v.optional(nullableNumber),
  },
  handler: async (ctx, { serverKey, id, status, step, nextRunAt }) => {
    assertServerKey(serverKey);
    const enrollmentId = ctx.db.normalizeId("automation_enrollments", id);
    if (!enrollmentId) return null;
    const doc = await ctx.db.get("automation_enrollments", enrollmentId);
    if (!doc) return null;
    await ctx.db.patch("automation_enrollments", enrollmentId, {
      ...(status !== undefined ? { status } : {}),
      ...(step !== undefined ? { step } : {}),
      ...(nextRunAt !== undefined ? { nextRunAt: nextRunAt ?? undefined } : {}),
    });
    return null;
  },
});

// Primer email de recuperación enviado → sella recovery_sent_at (base de la
// métrica "recuperados"); solo la primera vez (.is null del legacy)
export const sealRecoverySent = mutation({
  args: { serverKey: v.string(), checkoutId: v.string() },
  handler: async (ctx, { serverKey, checkoutId }) => {
    assertServerKey(serverKey);
    const id = ctx.db.normalizeId("checkouts", checkoutId);
    const doc = id ? await ctx.db.get("checkouts", id) : null;
    if (!id || !doc || doc.recoverySentAt !== undefined) return null;
    await ctx.db.patch("checkouts", id, { recoverySentAt: Date.now() });
    return null;
  },
});
