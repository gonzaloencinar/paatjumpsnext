import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Campañas de email (/admin/campaigns) y su snapshot de destinatarios.
// Primitivas de acceso a datos: la validación de formularios, las quiet
// hours y el cálculo de audiencia por facetas viven en lib/crm/actions.ts y
// lib/crm/segments.ts. Las transiciones de estado van con guarda dentro de
// la mutation (equivalen a los `.eq("status", ...)` del update legacy).
//
// Unicidad legacy preservada en las mutations: campaign_recipients único por
// (campaña, contacto) — check-before-write con el índice
// by_campaign_and_contact dentro de la transacción (el upsert
// ignoreDuplicates del legacy).

const FETCH_LIMIT = 1000;

const nullableString = v.union(v.string(), v.null());

function campaignOut(doc: Doc<"campaigns">) {
  return {
    id: doc._id as string,
    name: doc.name,
    subject: doc.subject ?? null,
    preheader: doc.preheader ?? null,
    bodyHtml: doc.bodyHtml ?? null,
    segment: doc.segment ?? null,
    status: doc.status,
    scheduledAt: doc.scheduledAt ?? null,
    sentAt: doc.sentAt ?? null,
    pausedAt: doc.pausedAt ?? null,
    createdAt: doc.createdAt,
  };
}

async function byId(ctx: QueryCtx | MutationCtx, id: string) {
  const campaignId = ctx.db.normalizeId("campaigns", id);
  if (!campaignId) return null;
  return await ctx.db.get("campaigns", campaignId);
}

// Campos de formulario compartidos por create/update (null = campo vacío)
const formFields = {
  name: v.string(),
  subject: nullableString,
  preheader: nullableString,
  bodyHtml: nullableString,
  segment: v.any(), // facetas ya saneadas por parseFacets en la lib
};

// ─────────────────────────── lecturas ───────────────────────────

export const list = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("campaigns").take(FETCH_LIMIT);
    return [...rows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(campaignOut);
  },
});

export const get = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    return doc ? campaignOut(doc) : null;
  },
});

// Estados de los destinatarios + aperturas/clics de email_sends; los totales
// los agrega la lib
export const sendStats = query({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const campaignId = ctx.db.normalizeId("campaigns", id);
    if (!campaignId) return { statuses: [], opened: 0, clicked: 0 };
    const recipients = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_contact", (q) =>
        q.eq("campaignId", campaignId),
      )
      .take(10_000);
    const sends = await ctx.db
      .query("email_sends")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .take(10_000);
    return {
      statuses: recipients.map((r) => r.status as string),
      opened: sends.filter((s) => s.openedAt !== undefined).length,
      clicked: sends.filter((s) => s.clickedAt !== undefined).length,
    };
  },
});

// ─────────────────────────── escrituras ───────────────────────────

export const create = mutation({
  args: { serverKey: v.string(), ...formFields },
  handler: async (
    ctx,
    { serverKey, name, subject, preheader, bodyHtml, segment },
  ) => {
    assertServerKey(serverKey);
    const id = await ctx.db.insert("campaigns", {
      name,
      subject: subject ?? undefined,
      preheader: preheader ?? undefined,
      bodyHtml: bodyHtml ?? undefined,
      segment: segment ?? undefined,
      status: "draft",
      createdAt: Date.now(),
    });
    return id as string;
  },
});

// Solo se editan borradores (misma regla que la action legacy)
export const update = mutation({
  args: { serverKey: v.string(), id: v.string(), ...formFields },
  handler: async (
    ctx,
    { serverKey, id, name, subject, preheader, bodyHtml, segment },
  ) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc) return { status: "not_found" as const };
    if (doc.status !== "draft") return { status: "not_draft" as const };
    await ctx.db.patch("campaigns", doc._id, {
      name,
      subject: subject ?? undefined,
      preheader: preheader ?? undefined,
      bodyHtml: bodyHtml ?? undefined,
      segment: segment ?? undefined,
    });
    return { status: "ok" as const };
  },
});

export const remove = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || doc.status !== "draft") return { status: "not_draft" as const };
    const recipients = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_contact", (q) => q.eq("campaignId", doc._id))
      .take(10_000);
    for (const r of recipients) {
      await ctx.db.delete("campaign_recipients", r._id);
    }
    await ctx.db.delete("campaigns", doc._id);
    return { status: "ok" as const };
  },
});

export const schedule = mutation({
  args: { serverKey: v.string(), id: v.string(), scheduledAt: v.number() },
  handler: async (ctx, { serverKey, id, scheduledAt }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || !["draft", "scheduled"].includes(doc.status)) {
      return { status: "bad_status" as const };
    }
    await ctx.db.patch("campaigns", doc._id, {
      status: "scheduled",
      scheduledAt,
    });
    return { status: "ok" as const };
  },
});

export const unschedule = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || doc.status !== "scheduled") {
      return { status: "bad_status" as const };
    }
    await ctx.db.patch("campaigns", doc._id, {
      status: "draft",
      scheduledAt: undefined,
    });
    return { status: "ok" as const };
  },
});

// Arranca el envío tras materializar el snapshot (lo hace la lib antes):
// exige al menos un destinatario y estado draft/scheduled
export const startSending = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || !["draft", "scheduled"].includes(doc.status)) {
      return { status: "bad_status" as const };
    }
    const first = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_contact", (q) => q.eq("campaignId", doc._id))
      .first();
    if (!first) return { status: "no_recipients" as const };
    await ctx.db.patch("campaigns", doc._id, {
      status: "sending",
      scheduledAt: undefined,
    });
    return { status: "ok" as const };
  },
});

export const pause = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || doc.status !== "sending") {
      return { status: "bad_status" as const };
    }
    await ctx.db.patch("campaigns", doc._id, {
      status: "paused",
      pausedAt: Date.now(),
    });
    return { status: "ok" as const };
  },
});

export const resume = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || doc.status !== "paused") {
      return { status: "bad_status" as const };
    }
    await ctx.db.patch("campaigns", doc._id, {
      status: "sending",
      pausedAt: undefined,
    });
    return { status: "ok" as const };
  },
});

// Cancela y deja los pendientes como 'skipped' (un lote ya reclamado en
// vuelo puede terminar de salir, igual que en el legacy)
export const cancel = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc || !["scheduled", "sending", "paused"].includes(doc.status)) {
      return { status: "bad_status" as const };
    }
    await ctx.db.patch("campaigns", doc._id, { status: "canceled" });
    const pending = await ctx.db
      .query("campaign_recipients")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", doc._id).eq("status", "pending"),
      )
      .take(10_000);
    for (const r of pending) {
      await ctx.db.patch("campaign_recipients", r._id, { status: "skipped" });
    }
    return { status: "ok" as const };
  },
});

export const duplicate = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const doc = await byId(ctx, id);
    if (!doc) return null;
    const copyId = await ctx.db.insert("campaigns", {
      name: `${doc.name} (copia)`,
      subject: doc.subject,
      preheader: doc.preheader,
      bodyHtml: doc.bodyHtml,
      segment: doc.segment,
      status: "draft",
      createdAt: Date.now(),
    });
    return copyId as string;
  },
});

// Snapshot de audiencia (§16.3): inserta los destinatarios que aún no están,
// transaccional e idempotente por (campaña, contacto). Devuelve los nuevos.
export const addRecipients = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    rows: v.array(
      v.object({
        contactId: v.string(),
        email: v.string(),
        firstName: nullableString,
      }),
    ),
  },
  handler: async (ctx, { serverKey, id, rows }) => {
    assertServerKey(serverKey);
    const campaign = await byId(ctx, id);
    if (!campaign) return 0;
    const now = Date.now();
    let inserted = 0;
    for (const row of rows) {
      const contactId = ctx.db.normalizeId("contacts", row.contactId);
      if (!contactId) continue;
      const existing = await ctx.db
        .query("campaign_recipients")
        .withIndex("by_campaign_and_contact", (q) =>
          q.eq("campaignId", campaign._id).eq("contactId", contactId),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("campaign_recipients", {
        campaignId: campaign._id,
        contactId,
        email: row.email,
        firstName: row.firstName ?? undefined,
        status: "pending",
        createdAt: now,
      });
      inserted += 1;
    }
    return inserted;
  },
});
