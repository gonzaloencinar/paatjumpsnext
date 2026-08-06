import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";
import {
  cancelActiveEnrollmentsForCheckout,
  contactByEmail,
  enrollCheckoutInCartRecovery,
} from "./lib/crm";

// Carritos (/admin/carts): checkouts de Shopify + carritos sintéticos del
// storefront con su contacto, la inscripción de recuperación y los emails
// enviados (email_sends.checkoutId). Devuelve el conjunto completo (tabla
// pequeña): lib/crm/queries.ts filtra por estado, ordena, pagina y calcula
// los KPIs en memoria. Las escrituras de checkouts de Shopify son de los
// webhooks (convex/shopifySync.ts); aquí vive la del carrito sintético del
// storefront (lib/crm/local-cart.ts).

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

// Carrito del storefront pre-checkout (lib/crm/local-cart.ts): upsert del
// checkout sintético por cartToken (unique parcial origin='storefront' del
// legacy, aquí check-before-write transaccional), con id negativo nuevo de
// secuencia (el webhook de Shopify nunca lo pisa) e inscripción/cancelación
// de la secuencia cart_recovery según el contenido del carrito.
export const trackStorefrontCart = mutation({
  args: {
    serverKey: v.string(),
    email: v.string(), // ya en lowercase (verificado por la cookie pj_contact)
    cartToken: v.string(),
    currency: v.string(),
    totalPrice: v.number(),
    lineItems: v.array(
      v.object({
        title: v.string(),
        variant: v.union(v.string(), v.null()),
        quantity: v.number(),
        price: v.union(v.string(), v.null()),
      }),
    ),
    recoveryUrl: v.string(), // checkoutUrl del carrito: restaura todo en un clic
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const now = Date.now();

    const contact = await contactByEmail(ctx, args.email);
    if (!contact || contact.status !== "subscribed") return null;

    // Si este carrito ya pisó el checkout de Shopify, el webhook manda
    const byToken = await ctx.db
      .query("checkouts")
      .withIndex("by_cart_token", (q) => q.eq("cartToken", args.cartToken))
      .take(10);
    if (byToken.some((c) => c.origin === "shopify")) return null;

    const existing = byToken.find((c) => c.origin === "storefront");
    let checkoutDocId = existing?._id;
    if (existing) {
      // reached_checkout/converted no se reabren: ese carrito ya siguió su vida
      if (existing.status !== "abandoned") return null;
      await ctx.db.patch("checkouts", existing._id, {
        contactId: contact._id,
        email: args.email,
        currency: args.currency,
        totalPrice: args.totalPrice,
        lineItems: args.lineItems,
        recoveryUrl: args.recoveryUrl,
        lastEventAt: now,
      });
    } else {
      if (args.lineItems.length === 0) return null;
      // id negativo nuevo: por debajo del mínimo actual (los checkouts reales
      // de Shopify son positivos; la transacción garantiza que no se repite)
      const smallest = await ctx.db
        .query("checkouts")
        .withIndex("by_checkout_id")
        .order("asc")
        .first();
      const nextId = Math.min(smallest?.checkoutId ?? 0, 0) - 1;
      checkoutDocId = await ctx.db.insert("checkouts", {
        checkoutId: nextId,
        origin: "storefront",
        cartToken: args.cartToken,
        contactId: contact._id,
        email: args.email,
        currency: args.currency,
        totalPrice: args.totalPrice,
        lineItems: args.lineItems,
        recoveryUrl: args.recoveryUrl,
        status: "abandoned",
        abandonedAt: now,
        lastEventAt: now,
        createdAt: now,
      });
    }
    if (!checkoutDocId) return null;

    // Carrito vaciado a propósito → nada que recuperar
    if (args.lineItems.length === 0) {
      await cancelActiveEnrollmentsForCheckout(ctx, checkoutDocId);
      return null;
    }

    await enrollCheckoutInCartRecovery(ctx, contact._id, checkoutDocId);
    return null;
  },
});
