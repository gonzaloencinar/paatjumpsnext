import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertServerKey } from "./lib/server";
import {
  cancelActiveEnrollmentsForCheckout,
  checkoutByLegacyId,
  contactByEmail,
  enrollCheckoutInCartRecovery,
  insertOrderPlacedEventUnique,
  markCheckoutConverted,
  recomputeContactOrders,
} from "./lib/crm";

// Escrituras de la sincronización Shopify → Convex (lib/crm/shopify-sync.ts)
// y de los webhooks de Shopify (app/api/webhooks/shopify/route.ts). El parseo
// del payload, el HMAC y las llamadas a la Admin API viven fuera; aquí cada
// mutation es una transacción: el upsert del pedido, la atribución, el evento
// order_placed (único por contacto+order_id), los derivados del contacto y el
// cierre de checkouts se confirman juntos.
//
// Convención de patch del proyecto: en los campos nullable, `null` borra el
// campo y el valor lo fija. Los upserts reescriben exactamente las columnas
// que reescribía el upsert legacy (p. ej. el sync nunca toca campaignId ni
// checkoutToken/cartToken; el webhook nunca toca totalRefunded/syncedAt).

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableBoolean = v.union(v.boolean(), v.null());

const u = <T>(value: T | null): T | undefined => value ?? undefined;

// ───────────────────────────── cursores ─────────────────────────────

export const getCursor = query({
  args: { serverKey: v.string(), key: v.string() },
  handler: async (ctx, { serverKey, key }) => {
    assertServerKey(serverKey);
    const row = await ctx.db
      .query("sync_state")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return (
      (row?.value as { updated_since?: string } | null)?.updated_since ?? null
    );
  },
});

export const setCursor = mutation({
  args: { serverKey: v.string(), key: v.string(), iso: v.string() },
  handler: async (ctx, { serverKey, key, iso }) => {
    assertServerKey(serverKey);
    const row = await ctx.db
      .query("sync_state")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const value = { updated_since: iso };
    if (row) {
      await ctx.db.patch("sync_state", row._id, {
        value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("sync_state", { key, value, updatedAt: Date.now() });
    }
    return null;
  },
});

// Mapa email → id de contacto para enlazar pedidos con el CRM (tabla pequeña)
export const contactEmailIndex = query({
  args: { serverKey: v.string() },
  handler: async (ctx, { serverKey }) => {
    assertServerKey(serverKey);
    const rows = await ctx.db.query("contacts").take(10_000);
    return rows.map((c) => ({ id: c._id as string, email: c.email }));
  },
});

// ───────────────────────────── pedidos (sync) ─────────────────────────────

// Columnas que reescribe el sync (las de mapOrder del legacy). campaignId,
// checkoutToken, cartToken y shopifyLanding/ReferringSite son del webhook y
// aquí no se tocan.
const syncedOrderRow = v.object({
  orderId: v.number(),
  name: nullableString,
  orderNumber: nullableNumber,
  contactId: nullableString, // id de Convex resuelto por email en la lib (o null)
  customerId: nullableNumber,
  email: nullableString,
  totalPrice: nullableNumber,
  subtotalPrice: nullableNumber,
  totalTax: nullableNumber,
  totalDiscounts: nullableNumber,
  totalShipping: nullableNumber,
  totalRefunded: v.number(),
  currency: nullableString,
  discountCode: nullableString,
  financialStatus: nullableString,
  fulfillmentStatus: nullableString,
  cancelledAt: nullableNumber,
  test: v.boolean(),
  sourceName: nullableString,
  shippingCity: nullableString,
  shippingProvince: nullableString,
  shippingZip: nullableString,
  shippingCountry: nullableString,
  shippingCountryCode: nullableString,
  shippingLineTitle: nullableString,
  lineItems: v.any(),
  upsellRevenue: v.number(),
  utmSource: nullableString,
  utmMedium: nullableString,
  utmCampaign: nullableString,
  utmTerm: nullableString,
  utmContent: nullableString,
  gclid: nullableString,
  fbclid: nullableString,
  landingPage: nullableString,
  referrer: nullableString,
  firstUtmSource: nullableString,
  firstUtmMedium: nullableString,
  firstUtmCampaign: nullableString,
  firstLandingPage: nullableString,
  firstReferrer: nullableString,
  createdAt: v.number(),
  processedAt: nullableNumber,
  syncedAt: v.number(),
});

type SyncedOrderRow = typeof syncedOrderRow.type;

function syncedOrderPatch(ctx: MutationCtx, row: SyncedOrderRow) {
  const contactId = row.contactId
    ? (ctx.db.normalizeId("contacts", row.contactId) ?? undefined)
    : undefined;
  return {
    name: u(row.name),
    orderNumber: u(row.orderNumber),
    contactId,
    customerId: u(row.customerId),
    email: u(row.email),
    totalPrice: u(row.totalPrice),
    subtotalPrice: u(row.subtotalPrice),
    totalTax: u(row.totalTax),
    totalDiscounts: u(row.totalDiscounts),
    totalShipping: u(row.totalShipping),
    totalRefunded: row.totalRefunded,
    currency: u(row.currency),
    discountCode: u(row.discountCode),
    financialStatus: u(row.financialStatus),
    fulfillmentStatus: u(row.fulfillmentStatus),
    cancelledAt: u(row.cancelledAt),
    test: row.test,
    sourceName: u(row.sourceName),
    shippingCity: u(row.shippingCity),
    shippingProvince: u(row.shippingProvince),
    shippingZip: u(row.shippingZip),
    shippingCountry: u(row.shippingCountry),
    shippingCountryCode: u(row.shippingCountryCode),
    shippingLineTitle: u(row.shippingLineTitle),
    lineItems: row.lineItems ?? undefined,
    upsellRevenue: row.upsellRevenue,
    utmSource: u(row.utmSource),
    utmMedium: u(row.utmMedium),
    utmCampaign: u(row.utmCampaign),
    utmTerm: u(row.utmTerm),
    utmContent: u(row.utmContent),
    gclid: u(row.gclid),
    fbclid: u(row.fbclid),
    landingPage: u(row.landingPage),
    referrer: u(row.referrer),
    firstUtmSource: u(row.firstUtmSource),
    firstUtmMedium: u(row.firstUtmMedium),
    firstUtmCampaign: u(row.firstUtmCampaign),
    firstLandingPage: u(row.firstLandingPage),
    firstReferrer: u(row.firstReferrer),
    createdAt: row.createdAt,
    processedAt: u(row.processedAt),
    syncedAt: row.syncedAt,
  };
}

async function orderByOrderId(ctx: MutationCtx, orderId: number) {
  return await ctx.db
    .query("orders")
    .withIndex("by_order_id", (q) => q.eq("orderId", orderId))
    .first();
}

// Upsert batch por orderId (una página del backfill; idempotente)
export const upsertSyncedOrders = mutation({
  args: { serverKey: v.string(), rows: v.array(syncedOrderRow) },
  handler: async (ctx, { serverKey, rows }) => {
    assertServerKey(serverKey);
    for (const row of rows) {
      const patch = syncedOrderPatch(ctx, row);
      const existing = await orderByOrderId(ctx, row.orderId);
      if (existing) {
        await ctx.db.patch("orders", existing._id, patch);
      } else {
        await ctx.db.insert("orders", { orderId: row.orderId, ...patch });
      }
    }
    return rows.length;
  },
});

// Derivados de contactos tocados por el sync (mismo cálculo que el webhook)
export const recomputeContactsOrders = mutation({
  args: { serverKey: v.string(), contactIds: v.array(v.string()) },
  handler: async (ctx, { serverKey, contactIds }) => {
    assertServerKey(serverKey);
    for (const id of contactIds) {
      const contactId = ctx.db.normalizeId("contacts", id);
      if (!contactId) continue;
      if (!(await ctx.db.get("contacts", contactId))) continue;
      await recomputeContactOrders(ctx, contactId);
    }
    return null;
  },
});

// ───────────────────────────── clientes (sync) ─────────────────────────────

const syncedCustomerRow = v.object({
  customerId: v.number(),
  email: nullableString,
  firstName: nullableString,
  lastName: nullableString,
  phone: nullableString,
  note: nullableString,
  verifiedEmail: v.boolean(),
  ordersCount: v.number(),
  totalSpent: v.number(),
  currency: nullableString,
  acceptsEmailMarketing: v.boolean(),
  tags: v.array(v.string()),
  city: nullableString,
  province: nullableString,
  provinceCode: nullableString,
  zip: nullableString,
  country: nullableString,
  countryCode: nullableString,
  shopifyCreatedAt: nullableNumber,
  shopifyUpdatedAt: nullableNumber,
  syncedAt: v.number(),
});

// Upsert batch por customerId + enlaza contactos del CRM sin shopifyCustomerId
export const upsertSyncedCustomers = mutation({
  args: { serverKey: v.string(), rows: v.array(syncedCustomerRow) },
  handler: async (ctx, { serverKey, rows }) => {
    assertServerKey(serverKey);
    for (const row of rows) {
      const patch = {
        email: u(row.email),
        firstName: u(row.firstName),
        lastName: u(row.lastName),
        phone: u(row.phone),
        note: u(row.note),
        verifiedEmail: row.verifiedEmail,
        ordersCount: row.ordersCount,
        totalSpent: row.totalSpent,
        currency: u(row.currency),
        acceptsEmailMarketing: row.acceptsEmailMarketing,
        tags: row.tags,
        city: u(row.city),
        province: u(row.province),
        provinceCode: u(row.provinceCode),
        zip: u(row.zip),
        country: u(row.country),
        countryCode: u(row.countryCode),
        shopifyCreatedAt: u(row.shopifyCreatedAt),
        shopifyUpdatedAt: u(row.shopifyUpdatedAt),
        syncedAt: row.syncedAt,
      };
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_customer_id", (q) => q.eq("customerId", row.customerId))
        .first();
      if (existing) {
        await ctx.db.patch("customers", existing._id, patch);
      } else {
        await ctx.db.insert("customers", {
          customerId: row.customerId,
          createdAt: Date.now(),
          ...patch,
        });
      }

      if (row.email) {
        const contact = await contactByEmail(ctx, row.email);
        if (contact && contact.shopifyCustomerId === undefined) {
          await ctx.db.patch("contacts", contact._id, {
            shopifyCustomerId: String(row.customerId),
          });
        }
      }
    }
    return rows.length;
  },
});

// ───────────────────── webhook orders/create · orders/updated ─────────────────────

const CLICK_WINDOW_MS = 5 * 86_400_000; // atribución por ventana de clic (§16.6)

export const applyOrderWebhook = mutation({
  args: {
    serverKey: v.string(),
    orderId: v.number(),
    name: nullableString,
    orderNumber: nullableNumber,
    email: nullableString, // ya en lowercase (lo garantiza la ruta)
    customerId: nullableNumber,
    checkoutId: nullableNumber, // id legacy del checkout de Shopify
    checkoutToken: nullableString,
    cartToken: nullableString,
    totalPrice: nullableNumber,
    totalPriceRaw: nullableString, // para el payload de eventos (forma legacy)
    subtotalPrice: nullableNumber,
    totalTax: nullableNumber,
    totalDiscounts: nullableNumber,
    totalShipping: nullableNumber,
    currency: nullableString,
    discountCode: nullableString,
    financialStatus: nullableString,
    fulfillmentStatus: nullableString,
    cancelledAt: nullableNumber,
    test: v.boolean(),
    sourceName: nullableString,
    shippingCity: nullableString,
    shippingProvince: nullableString,
    shippingZip: nullableString,
    shippingCountry: nullableString,
    shippingCountryCode: nullableString,
    shippingLineTitle: nullableString,
    lineItems: v.any(),
    upsellRevenue: v.number(),
    utmSource: nullableString,
    utmMedium: nullableString,
    utmCampaign: nullableString,
    utmTerm: nullableString,
    utmContent: nullableString,
    gclid: nullableString,
    fbclid: nullableString,
    landingPage: nullableString,
    referrer: nullableString,
    firstUtmSource: nullableString,
    firstUtmMedium: nullableString,
    firstUtmCampaign: nullableString,
    firstLandingPage: nullableString,
    firstReferrer: nullableString,
    shopifyLandingSite: nullableString,
    shopifyReferringSite: nullableString,
    createdAt: v.number(),
    processedAt: nullableNumber,
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const now = Date.now();

    // Código personal de recuperación usado → canjeado (no-op para promos)
    if (args.discountCode) {
      const codes = await ctx.db
        .query("discount_codes")
        .withIndex("by_code", (q) => q.eq("code", args.discountCode as string))
        .take(10);
      for (const code of codes) {
        if (!code.redeemed) {
          await ctx.db.patch("discount_codes", code._id, { redeemed: true });
        }
      }
    }

    const contact = args.email ? await contactByEmail(ctx, args.email) : null;

    // Atribución por ventana de clic: último clic ≤5 días en una campaña
    let campaignId: Id<"campaigns"> | undefined;
    if (contact) {
      const sends = await ctx.db
        .query("email_sends")
        .withIndex("by_contact_and_created_at", (q) =>
          q.eq("contactId", contact._id),
        )
        .take(2000);
      const clicked = sends
        .filter(
          (s) =>
            s.campaignId !== undefined &&
            s.clickedAt !== undefined &&
            s.clickedAt >= now - CLICK_WINDOW_MS,
        )
        .sort((a, b) => (b.clickedAt ?? 0) - (a.clickedAt ?? 0))[0];
      campaignId = clicked?.campaignId;
    }

    // Upsert idempotente por orderId. Solo se escribe campaignId cuando hay
    // clic atribuible: en orders/updated (semanas después) la ventana ya
    // expiró y un undefined pisaría la atribución original.
    const patch = {
      name: u(args.name),
      orderNumber: u(args.orderNumber),
      contactId: contact?._id,
      customerId: u(args.customerId),
      email: u(args.email),
      checkoutToken: u(args.checkoutToken),
      cartToken: u(args.cartToken),
      totalPrice: u(args.totalPrice),
      subtotalPrice: u(args.subtotalPrice),
      totalTax: u(args.totalTax),
      totalDiscounts: u(args.totalDiscounts),
      totalShipping: u(args.totalShipping),
      currency: u(args.currency),
      discountCode: u(args.discountCode),
      ...(campaignId ? { campaignId } : {}),
      financialStatus: u(args.financialStatus),
      fulfillmentStatus: u(args.fulfillmentStatus),
      cancelledAt: u(args.cancelledAt),
      test: args.test,
      sourceName: u(args.sourceName),
      shippingCity: u(args.shippingCity),
      shippingProvince: u(args.shippingProvince),
      shippingZip: u(args.shippingZip),
      shippingCountry: u(args.shippingCountry),
      shippingCountryCode: u(args.shippingCountryCode),
      shippingLineTitle: u(args.shippingLineTitle),
      lineItems: args.lineItems ?? undefined,
      upsellRevenue: args.upsellRevenue,
      utmSource: u(args.utmSource),
      utmMedium: u(args.utmMedium),
      utmCampaign: u(args.utmCampaign),
      utmTerm: u(args.utmTerm),
      utmContent: u(args.utmContent),
      gclid: u(args.gclid),
      fbclid: u(args.fbclid),
      landingPage: u(args.landingPage),
      referrer: u(args.referrer),
      firstUtmSource: u(args.firstUtmSource),
      firstUtmMedium: u(args.firstUtmMedium),
      firstUtmCampaign: u(args.firstUtmCampaign),
      firstLandingPage: u(args.firstLandingPage),
      firstReferrer: u(args.firstReferrer),
      shopifyLandingSite: u(args.shopifyLandingSite),
      shopifyReferringSite: u(args.shopifyReferringSite),
      createdAt: args.createdAt,
      processedAt: u(args.processedAt),
    };

    const existing = await orderByOrderId(ctx, args.orderId);
    if (existing) {
      await ctx.db.patch("orders", existing._id, patch);
    } else {
      await ctx.db.insert("orders", {
        orderId: args.orderId,
        totalRefunded: 0,
        ...patch,
      });
    }

    if (contact) {
      await recomputeContactOrders(ctx, contact._id);
      await insertOrderPlacedEventUnique(ctx, contact._id, {
        order_id: args.orderId,
        total: args.totalPriceRaw,
        discount_code: args.discountCode,
      });
    }

    const orderRef = { orderId: args.orderId, total: args.totalPriceRaw };

    // Conversión del checkout → no recuperar lo ya comprado (§7.2)
    if (args.checkoutId !== null) {
      const checkout = await checkoutByLegacyId(ctx, args.checkoutId);
      if (checkout) {
        await markCheckoutConverted(ctx, checkout, orderRef, contact?._id ?? null);
      }
    } else if (args.checkoutToken) {
      const checkout = await ctx.db
        .query("checkouts")
        .withIndex("by_token", (q) => q.eq("token", args.checkoutToken as string))
        .first();
      if (checkout) {
        await markCheckoutConverted(ctx, checkout, orderRef, contact?._id ?? null);
      }
    }

    // Carrito del storefront (recuperación pre-checkout) que siguiera abierto:
    // el pedido también lo cierra por cart_token
    if (args.cartToken) {
      const locals = await ctx.db
        .query("checkouts")
        .withIndex("by_cart_token", (q) =>
          q.eq("cartToken", args.cartToken as string),
        )
        .take(10);
      const local = locals.find(
        (c) => c.origin === "storefront" && c.status === "abandoned",
      );
      if (local) {
        await markCheckoutConverted(ctx, local, orderRef, contact?._id ?? null);
      }
    }

    // Salida por compra (§16.4): automatizaciones signup con cancel_on_order
    if (contact) {
      const automations = await ctx.db.query("automations").take(200);
      const cancelable = new Set(
        automations
          .filter(
            (a) =>
              a.trigger === "signup" &&
              (a.config as { cancel_on_order?: boolean } | undefined)
                ?.cancel_on_order,
          )
          .map((a) => a._id as string),
      );
      if (cancelable.size > 0) {
        const enrollments = await ctx.db
          .query("automation_enrollments")
          .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
          .take(200);
        for (const enrollment of enrollments) {
          if (
            enrollment.status === "active" &&
            enrollment.checkoutId === undefined &&
            cancelable.has(enrollment.automationId as string)
          ) {
            await ctx.db.patch("automation_enrollments", enrollment._id, {
              status: "canceled",
              nextRunAt: undefined,
            });
          }
        }
      }
    }

    return null;
  },
});

// ──────────────────── webhook checkouts/create · checkouts/update ────────────────────

const CONSENT_CHECKOUT =
  "Aceptó marketing en el checkout de Shopify (buyer_accepts_marketing)";

export const applyCheckoutWebhook = mutation({
  args: {
    serverKey: v.string(),
    checkoutId: v.number(), // id legacy de Shopify
    token: nullableString,
    cartToken: nullableString,
    email: nullableString, // ya en lowercase
    customerFirstName: nullableString,
    currency: nullableString,
    totalPrice: nullableNumber,
    lineItems: v.any(), // array ya recortado por la ruta
    recoveryUrl: nullableString,
    buyerAcceptsMarketing: nullableBoolean,
    abandonedAt: v.number(),
    lastEventAt: v.number(),
    completed: v.boolean(), // completed_at presente en el payload
  },
  handler: async (ctx, args) => {
    assertServerKey(args.serverKey);
    const now = Date.now();

    let contact = args.email ? await contactByEmail(ctx, args.email) : null;

    // Sin contacto pero con consentimiento de marketing en el checkout → alta
    // como contacto (source 'checkout', §7.1/§11)
    if (!contact && args.email && args.buyerAcceptsMarketing) {
      const suppressed = await ctx.db
        .query("suppressions")
        .withIndex("by_email", (q) => q.eq("email", args.email as string))
        .first();
      if (!suppressed) {
        const contactId = await ctx.db.insert("contacts", {
          email: args.email,
          firstName: u(args.customerFirstName),
          status: "subscribed",
          source: "checkout",
          consent: true,
          consentText: CONSENT_CHECKOUT,
          consentAt: now,
          ordersCount: 0,
          totalSpent: 0,
          tags: [],
          createdAt: now,
          updatedAt: now,
        });
        contact = await ctx.db.get("contacts", contactId);
        await ctx.db.insert("events", {
          contactId,
          type: "signup",
          payload: { source: "checkout" },
          createdAt: now,
        });
      }
    }

    const lineItems = Array.isArray(args.lineItems) ? args.lineItems : [];

    // status fuera del upsert: si ya está converted, un update tardío no lo
    // devuelve a abandoned (el default 'abandoned' solo aplica al insertar)
    const patch = {
      token: u(args.token),
      cartToken: u(args.cartToken),
      contactId: contact?._id,
      email: u(args.email),
      currency: u(args.currency),
      totalPrice: u(args.totalPrice),
      lineItems,
      recoveryUrl: u(args.recoveryUrl),
      buyerAcceptsMarketing: u(args.buyerAcceptsMarketing),
      abandonedAt: args.abandonedAt,
      lastEventAt: args.lastEventAt,
    };
    let checkout = await checkoutByLegacyId(ctx, args.checkoutId);
    if (checkout) {
      await ctx.db.patch("checkouts", checkout._id, patch);
      checkout = await ctx.db.get("checkouts", checkout._id);
    } else {
      const id = await ctx.db.insert("checkouts", {
        checkoutId: args.checkoutId,
        origin: "shopify",
        status: "abandoned",
        createdAt: now,
        ...patch,
      });
      checkout = await ctx.db.get("checkouts", id);
    }
    if (!checkout) return null;

    // ¿Este carrito venía trackeado del storefront (lib/crm/local-cart.ts)?
    // El checkout real toma el relevo: si es el mismo contacto, su inscripción
    // MIGRA al checkout real (la secuencia continúa donde estaba, sin duplicar
    // emails); si es de otro contacto, se cancela. Sin contacto aún, el
    // carrito local sigue siendo la mejor pista y no se toca.
    if (args.cartToken) {
      const locals = await ctx.db
        .query("checkouts")
        .withIndex("by_cart_token", (q) =>
          q.eq("cartToken", args.cartToken as string),
        )
        .take(10);
      const local = locals.find(
        (c) => c.origin === "storefront" && c._id !== checkout._id,
      );
      if (local && contact) {
        const localEnrollments = await ctx.db
          .query("automation_enrollments")
          .withIndex("by_checkout", (q) => q.eq("checkoutId", local._id))
          .take(50);
        const realEnrollments = await ctx.db
          .query("automation_enrollments")
          .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
          .take(50);
        for (const enrollment of localEnrollments) {
          if (enrollment.status !== "active") continue;
          if (local.contactId !== contact._id) {
            await ctx.db.patch("automation_enrollments", enrollment._id, {
              status: "canceled",
              nextRunAt: undefined,
            });
            continue;
          }
          // Único caso de conflicto: el checkout real ya tiene inscripción
          // propia (única por automatización+contacto+checkout) → la local sobra
          const conflict = realEnrollments.some(
            (r) =>
              r.automationId === enrollment.automationId &&
              r.contactId === enrollment.contactId,
          );
          if (conflict) {
            await ctx.db.patch("automation_enrollments", enrollment._id, {
              status: "canceled",
              nextRunAt: undefined,
            });
          } else {
            await ctx.db.patch("automation_enrollments", enrollment._id, {
              checkoutId: checkout._id,
            });
          }
        }
        if (local.status === "abandoned") {
          await ctx.db.patch("checkouts", local._id, {
            status: "reached_checkout",
            lastEventAt: now,
          });
        }
      }
    }

    // Checkout ya completado (update tardío): marcar converted sin esperar a
    // orders/create — sin pisar un 'recovered' — y cortar la secuencia
    if (args.completed) {
      if (checkout.status === "abandoned") {
        await ctx.db.patch("checkouts", checkout._id, {
          status: "converted",
          lastEventAt: now,
        });
      }
      await cancelActiveEnrollmentsForCheckout(ctx, checkout._id);
      return null;
    }

    // Carrito vaciado a propósito → nada que recuperar
    if (lineItems.length === 0) {
      await cancelActiveEnrollmentsForCheckout(ctx, checkout._id);
      return null;
    }

    // Recuperación de carrito (§7.2): solo contactos suscritos
    if (!contact || contact.status !== "subscribed") return null;
    await enrollCheckoutInCartRecovery(ctx, contact._id, checkout._id);
    return null;
  },
});
