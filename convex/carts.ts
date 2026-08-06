import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Carritos (/admin/carts): checkouts de Shopify + carritos sintéticos del
// storefront con su contacto, la inscripción de recuperación y los emails
// enviados (email_sends.checkoutId). Devuelve el conjunto completo (tabla
// pequeña): lib/crm/queries.ts filtra por estado, ordena, pagina y calcula
// los KPIs en memoria. Las escrituras de checkouts son de los webhooks
// (otra área).

const FETCH_LIMIT = 1000;

export const listForAdmin = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const checkouts = await ctx.db.query("checkouts").take(FETCH_LIMIT);
    const out = [];
    for (const doc of checkouts) {
      const contact = doc.contactId
        ? await ctx.db.get("contacts", doc.contactId)
        : null;
      const enrollments = await ctx.db
        .query("automation_enrollments")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", doc._id))
        .take(50);
      const sends = await ctx.db
        .query("email_sends")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", doc._id))
        .take(50);
      out.push({
        id: doc.checkoutId, // id legacy de Shopify (negativo = sintético)
        origin: doc.origin,
        status: doc.status,
        email: doc.email ?? null,
        contactId: (doc.contactId as string | undefined) ?? null,
        contactFirstName: contact?.firstName ?? null,
        lineItems: doc.lineItems ?? null,
        totalPrice: doc.totalPrice ?? null,
        currency: doc.currency ?? null,
        createdAt: doc.createdAt,
        abandonedAt: doc.abandonedAt ?? null,
        lastEventAt: doc.lastEventAt ?? null,
        recoverySentAt: doc.recoverySentAt ?? null,
        recoveryUrl: doc.recoveryUrl ?? null,
        buyerAcceptsMarketing: doc.buyerAcceptsMarketing ?? null,
        enrollments: enrollments.map((e) => ({
          step: e.step,
          status: e.status,
          nextRunAt: e.nextRunAt ?? null,
        })),
        sends: sends.map((s) => ({
          id: s._id as string,
          subject: s.subject ?? null,
          status: s.status,
          sentAt: s.sentAt ?? null,
          openedAt: s.openedAt ?? null,
          clickedAt: s.clickedAt ?? null,
        })),
      });
    }
    return out;
  },
});
