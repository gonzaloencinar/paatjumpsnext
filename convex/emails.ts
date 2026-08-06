import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertServerKey } from "./lib/server";

// Registro de envíos de email (email_sends) para lib/email/send.ts: el gate
// de supresiones y el insert 'queued' van en la MISMA transacción (mejora
// sobre el legacy, que hacía select + insert separados); el envío real por
// Resend ocurre fuera y después se sella sent/failed.
//
// Los ids de vínculo (contacto/campaña/automatización/paso) llegan como
// string y se normalizan: si no son ids de Convex válidos (p. ej. uuids del
// engine aún no portado) el envío se registra sin ese vínculo en vez de
// fallar. El checkout llega con su id legacy de Shopify (número, negativo si
// es carrito sintético) y se resuelve por el índice by_checkout_id.

export const createQueued = mutation({
  args: {
    serverKey: v.string(),
    email: v.string(), // ya en lowercase (lo garantiza sendCrmEmail)
    template: v.string(),
    subject: v.string(),
    contactId: v.union(v.string(), v.null()),
    campaignId: v.union(v.string(), v.null()),
    automationId: v.union(v.string(), v.null()),
    automationStepId: v.union(v.string(), v.null()),
    checkoutId: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);

    const suppressed = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (suppressed) return { status: "suppressed" as const };

    const contactId = args.contactId
      ? (ctx.db.normalizeId("contacts", args.contactId) ?? undefined)
      : undefined;
    const campaignId = args.campaignId
      ? (ctx.db.normalizeId("campaigns", args.campaignId) ?? undefined)
      : undefined;
    const automationId = args.automationId
      ? (ctx.db.normalizeId("automations", args.automationId) ?? undefined)
      : undefined;
    const automationStepId = args.automationStepId
      ? (ctx.db.normalizeId("automation_steps", args.automationStepId) ??
        undefined)
      : undefined;

    let checkoutId = undefined;
    if (args.checkoutId !== null) {
      const legacyId = args.checkoutId;
      const checkout = await ctx.db
        .query("checkouts")
        .withIndex("by_checkout_id", (q) => q.eq("checkoutId", legacyId))
        .first();
      checkoutId = checkout?._id;
    }

    const id = await ctx.db.insert("email_sends", {
      contactId,
      campaignId,
      automationId,
      automationStepId,
      checkoutId,
      template: args.template,
      subject: args.subject,
      status: "queued",
      createdAt: Date.now(),
    });
    return { status: "queued" as const, id: id as string };
  },
});

// El proveedor aceptó el email: sella sent + provider_message_id y registra
// el evento email_sent en el timeline del contacto (si está vinculado)
export const markSent = mutation({
  args: {
    serverKey: v.string(),
    id: v.string(),
    providerMessageId: v.string(),
  },
  handler: async (ctx, { serverKey, id, providerMessageId }) => {
    assertServerKey(serverKey);
    const sendId = ctx.db.normalizeId("email_sends", id);
    const send = sendId ? await ctx.db.get("email_sends", sendId) : null;
    if (!sendId || !send) return null;
    await ctx.db.patch("email_sends", sendId, {
      status: "sent",
      sentAt: Date.now(),
      providerMessageId,
    });
    if (send.contactId) {
      await ctx.db.insert("events", {
        contactId: send.contactId,
        type: "email_sent",
        payload: { template: send.template ?? null, email_send_id: id },
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const markFailed = mutation({
  args: { serverKey: v.string(), id: v.string() },
  handler: async (ctx, { serverKey, id }) => {
    assertServerKey(serverKey);
    const sendId = ctx.db.normalizeId("email_sends", id);
    if (!sendId) return null;
    const send = await ctx.db.get("email_sends", sendId);
    if (!send) return null;
    await ctx.db.patch("email_sends", sendId, { status: "failed" });
    return null;
  },
});

// Webhook de Resend (app/api/webhooks/resend/route.ts): entregas/rebotes/
// quejas/aperturas/clics → email_sends + suppressions + events + actividad
// derivada del contacto, todo en una transacción. La verificación Svix queda
// en la ruta; aquí solo llegan eventos ya autenticados.
export const applyResendEvent = mutation({
  args: {
    serverKey: v.string(),
    type: v.union(
      v.literal("email.delivered"),
      v.literal("email.bounced"),
      v.literal("email.complained"),
      v.literal("email.opened"),
      v.literal("email.clicked"),
    ),
    emailId: v.union(v.string(), v.null()), // provider_message_id
    email: v.union(v.string(), v.null()), // destinatario, ya en lowercase
  },
  handler: async (ctx, { serverKey, type, emailId, email }) => {
    assertServerKey(serverKey);
    const now = Date.now();

    const send = emailId
      ? await ctx.db
          .query("email_sends")
          .withIndex("by_provider_message_id", (q) =>
            q.eq("providerMessageId", emailId),
          )
          .first()
      : null;

    let eventType: string | null = null;
    if (send) {
      if (type === "email.delivered") {
        await ctx.db.patch("email_sends", send._id, { status: "delivered" });
      } else if (type === "email.bounced") {
        // Conservador: cualquier rebote suprime (deliverability > cobertura)
        await ctx.db.patch("email_sends", send._id, { status: "bounced" });
      } else if (type === "email.complained") {
        await ctx.db.patch("email_sends", send._id, { status: "complained" });
      }
    }
    if (type === "email.opened") {
      if (send && send.openedAt === undefined) {
        await ctx.db.patch("email_sends", send._id, { openedAt: now });
      }
      eventType = "email_opened";
    }
    if (type === "email.clicked") {
      if (send && send.clickedAt === undefined) {
        await ctx.db.patch("email_sends", send._id, { clickedAt: now });
      }
      eventType = "email_clicked";
    }

    // Rebote/queja → supresión espejo + estado del contacto
    if (email && (type === "email.bounced" || type === "email.complained")) {
      const reason = type === "email.bounced" ? "hard_bounce" : "complaint";
      const suppression = await ctx.db
        .query("suppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (suppression) {
        await ctx.db.patch("suppressions", suppression._id, { reason });
      } else {
        await ctx.db.insert("suppressions", { email, reason, createdAt: now });
      }
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (contact) {
        await ctx.db.patch("contacts", contact._id, {
          status: type === "email.bounced" ? "bounced" : "complained",
        });
      }
    }

    // Actividad derivada para segmentos (§16.2): activos vs dormidos
    if (eventType && send?.contactId) {
      await ctx.db.insert("events", {
        contactId: send.contactId,
        type: eventType,
        payload: { email_send_id: send._id as string },
        createdAt: now,
      });
      await ctx.db.patch(
        "contacts",
        send.contactId,
        eventType === "email_opened"
          ? { lastOpenAt: now }
          : { lastClickAt: now },
      );
    }

    return null;
  },
});
