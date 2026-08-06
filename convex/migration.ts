import { internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { TableNames } from "./_generated/dataModel";

// Volcado one-shot desde Supabase (tools/convex-migrate/import.mjs).
// Las filas llegan ya en camelCase con timestamps en ms; aquí solo se
// resuelven las referencias legacy (uuid de Postgres / id bigint de
// checkouts) a Ids de Convex y se inserta. Re-ejecutar requiere wipe previo.

const TABLES = [
  "contacts",
  "events",
  "checkouts",
  "campaigns",
  "campaign_recipients",
  "discount_codes",
  "automations",
  "automation_steps",
  "automation_enrollments",
  "email_sends",
  "suppressions",
  "admin_users",
  "promotions",
  "orders",
  "customers",
  "sync_state",
  "packlink_shipments",
  "order_dni_requests",
  "order_invoices",
  "order_credit_notes",
  "finance_recurring",
  "finance_entries",
  "finance_settings",
  "finance_month_irpf",
  "blog_posts",
  "short_links",
] as const satisfies readonly TableNames[];

async function byLegacyId(
  ctx: MutationCtx,
  table:
    | "contacts"
    | "campaigns"
    | "automations"
    | "automation_steps"
    | "email_sends"
    | "finance_recurring",
  legacyId: string | undefined,
) {
  if (legacyId === undefined) return undefined;
  const doc = await ctx.db
    .query(table)
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
    .unique();
  return doc?._id;
}

async function checkoutByLegacy(ctx: MutationCtx, checkoutId: number | undefined) {
  if (checkoutId === undefined) return undefined;
  const doc = await ctx.db
    .query("checkouts")
    .withIndex("by_checkout_id", (q) => q.eq("checkoutId", checkoutId))
    .unique();
  return doc?._id;
}

export const importChunk = internalMutation({
  args: { table: v.string(), rows: v.array(v.any()) },
  handler: async (ctx, { table, rows }) => {
    const warnings: string[] = [];
    const warnMissing = <T extends TableNames>(
      kind: string,
      key: unknown,
      id: Id<T> | undefined,
    ) => {
      if (id === undefined && key !== undefined)
        warnings.push(`${table}: ${kind} legacy ${String(key)} no encontrado`);
      return id;
    };

    for (const row of rows) {
      const {
        contactLegacyId,
        campaignLegacyId,
        automationLegacyId,
        automationStepLegacyId,
        emailSendLegacyId,
        checkoutLegacyId,
        recurringLegacyId,
        ...rest
      } = row;
      const doc: Record<string, unknown> = { ...rest };

      if (contactLegacyId !== undefined)
        doc.contactId = warnMissing(
          "contact",
          contactLegacyId,
          await byLegacyId(ctx, "contacts", contactLegacyId),
        );
      if (campaignLegacyId !== undefined)
        doc.campaignId = warnMissing(
          "campaign",
          campaignLegacyId,
          await byLegacyId(ctx, "campaigns", campaignLegacyId),
        );
      if (automationLegacyId !== undefined)
        doc.automationId = warnMissing(
          "automation",
          automationLegacyId,
          await byLegacyId(ctx, "automations", automationLegacyId),
        );
      if (automationStepLegacyId !== undefined)
        doc.automationStepId = warnMissing(
          "automation_step",
          automationStepLegacyId,
          await byLegacyId(ctx, "automation_steps", automationStepLegacyId),
        );
      if (emailSendLegacyId !== undefined)
        doc.emailSendId = warnMissing(
          "email_send",
          emailSendLegacyId,
          await byLegacyId(ctx, "email_sends", emailSendLegacyId),
        );
      if (checkoutLegacyId !== undefined)
        doc.checkoutId = warnMissing(
          "checkout",
          checkoutLegacyId,
          await checkoutByLegacy(ctx, checkoutLegacyId),
        );
      if (recurringLegacyId !== undefined)
        doc.recurringId = warnMissing(
          "finance_recurring",
          recurringLegacyId,
          await byLegacyId(ctx, "finance_recurring", recurringLegacyId),
        );

      for (const key of Object.keys(doc)) if (doc[key] === undefined) delete doc[key];
      await ctx.db.insert(table as TableNames, doc as never);
    }
    return { inserted: rows.length, warnings };
  },
});

export const generateLabelUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const attachLabel = internalMutation({
  args: { reference: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { reference, storageId }) => {
    const doc = await ctx.db
      .query("packlink_shipments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!doc) throw new Error(`packlink_shipments ${reference} no existe`);
    await ctx.db.patch("packlink_shipments", doc._id, { labelStorageId: storageId });
    return null;
  },
});

export const wipeAllForReimport = internalMutation({
  args: {},
  handler: async (ctx) => {
    const deleted: Record<string, number> = {};
    for (const shipment of await ctx.db.query("packlink_shipments").collect()) {
      if (shipment.labelStorageId) await ctx.storage.delete(shipment.labelStorageId);
    }
    for (const table of TABLES) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) await ctx.db.delete(table, doc._id);
      deleted[table] = docs.length;
    }
    return deleted;
  },
});

export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, number> = {};
    for (const table of TABLES) {
      out[table] = (await ctx.db.query(table).collect()).length;
    }
    return out;
  },
});

export const labelUrl = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const doc = await ctx.db
      .query("packlink_shipments")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    return doc?.labelStorageId ? await ctx.storage.getUrl(doc.labelStorageId) : null;
  },
});

export const sample = internalQuery({
  args: { table: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { table, limit }) => {
    return await ctx.db.query(table as TableNames).take(limit ?? 3);
  },
});
