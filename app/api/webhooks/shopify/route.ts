import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDniRequest } from "@/lib/crm/dni-requests";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";
import { issueCreditNotesForOrder } from "@/lib/holded/credit-notes";

// Webhooks de Shopify (plan §7.2 y §8): orders/create + checkouts/create|update.
// Un solo endpoint; el topic viene en X-Shopify-Topic. HMAC-SHA256 del cuerpo
// crudo con el client secret de la app PaatJumpsNext (SHOPIFY_WEBHOOK_SECRET).
// Responder 200 rápido; Shopify reintenta los fallos — todo es idempotente.
// La ruta solo verifica y mapea el payload; las escrituras van en mutations
// Convex transaccionales (convex/shopifySync.ts): upsert por id de Shopify,
// atribución, evento order_placed único, cierre de checkouts y secuencias.

function verifyShopifyHmac(payload: string, headers: Headers): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const received = headers.get("x-shopify-hmac-sha256");
  if (!secret || !received) return false;
  const expected = createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  return (
    expectedBuf.length === receivedBuf.length &&
    timingSafeEqual(expectedBuf, receivedBuf)
  );
}

type OrderAddress = {
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  zip?: string | null;
  country?: string | null;
  country_code?: string | null;
};

type OrderPayload = {
  id?: number;
  name?: string | null;
  order_number?: number | null;
  email?: string | null;
  checkout_id?: number | null;
  checkout_token?: string | null;
  cart_token?: string | null;
  total_price?: string | null;
  subtotal_price?: string | null;
  total_tax?: string | null;
  total_discounts?: string | null;
  total_shipping_price_set?: { shop_money?: { amount?: string } } | null;
  currency?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  cancelled_at?: string | null;
  test?: boolean;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  source_name?: string | null;
  landing_site?: string | null;
  referring_site?: string | null;
  note_attributes?: { name?: string; value?: string | null }[];
  discount_codes?: { code?: string }[];
  customer?: { id?: number; email?: string | null } | null;
  shipping_lines?: { title?: string | null }[];
  shipping_address?: OrderAddress | null;
  billing_address?: OrderAddress | null;
  discount_applications?: {
    type?: string;
    title?: string | null;
  }[];
  line_items?: {
    title?: string;
    quantity?: number;
    price?: string;
    sku?: string | null;
    variant_title?: string | null;
    product_id?: number | null;
    discount_allocations?: {
      amount?: string;
      discount_application_index?: number;
    }[];
  }[];
};

const num = (value: string | null | undefined) =>
  value != null && value !== "" ? Number(value) : null;

const isoToMs = (iso: string | null | undefined) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

type CheckoutPayload = {
  id?: number;
  token?: string | null;
  cart_token?: string | null;
  email?: string | null;
  total_price?: string | null;
  currency?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  abandoned_checkout_url?: string | null;
  buyer_accepts_marketing?: boolean | null;
  customer?: {
    email?: string | null;
    first_name?: string | null;
  } | null;
  line_items?: {
    title?: string;
    quantity?: number;
    price?: string;
    variant_title?: string | null;
  }[];
};

// ───────────────────────── orders/create ─────────────────────────

async function handleOrderCreate(order: OrderPayload) {
  if (!order.id) return;
  const email =
    (order.email ?? order.customer?.email ?? "").trim().toLowerCase() || null;
  const discountCode = order.discount_codes?.[0]?.code?.toUpperCase() ?? null;

  // Atribución UTM: la tienda la adjunta como atributos del carrito con
  // prefijo "_" (lib/attribution.ts) y Shopify la entrega en note_attributes.
  const noteAttrs = new Map(
    (order.note_attributes ?? []).map((a) => [a.name ?? "", a.value ?? ""]),
  );
  const attr = (key: string) => {
    const value = (noteAttrs.get(`_${key}`) ?? noteAttrs.get(key))?.trim();
    return value || null;
  };

  const address = order.shipping_address ?? order.billing_address ?? {};

  // Upsell post-compra (ReConvert): el descuento del changeset llega como
  // discount_application de tipo "manual" asignado a la línea añadida; los
  // códigos promo llegan como "discount_code" y no se confunden con esto.
  const applications = order.discount_applications ?? [];
  let upsellRevenue = 0;
  const lineItems = (order.line_items ?? []).slice(0, 50).map((item) => {
    const allocations = item.discount_allocations ?? [];
    const upsell = allocations.some(
      (a) =>
        applications[a.discount_application_index ?? -1]?.type === "manual",
    );
    if (upsell) {
      const discounted = allocations.reduce(
        (sum, a) => sum + (Number(a.amount) || 0),
        0,
      );
      upsellRevenue +=
        (Number(item.price) || 0) * (item.quantity ?? 1) - discounted;
    }
    return {
      title: item.title ?? "",
      variant: item.variant_title ?? null,
      quantity: item.quantity ?? 1,
      price: item.price ?? null,
      sku: item.sku ?? null,
      product_id: item.product_id ?? null,
      ...(upsell ? { upsell: true } : {}),
    };
  });

  // Todo lo transaccional (redención de código, atribución por clic, upsert
  // del pedido, derivados y evento del contacto, cierre de checkouts y
  // secuencias) va en una sola mutation.
  await convexMutation(api.shopifySync.applyOrderWebhook, {
    orderId: order.id,
    name: order.name ?? null,
    orderNumber: order.order_number ?? null,
    email,
    customerId: order.customer?.id ?? null,
    checkoutId: order.checkout_id ?? null,
    checkoutToken: order.checkout_token ?? null,
    cartToken: order.cart_token ?? null,
    totalPrice: num(order.total_price),
    totalPriceRaw: order.total_price ?? null,
    subtotalPrice: num(order.subtotal_price),
    totalTax: num(order.total_tax),
    totalDiscounts: num(order.total_discounts),
    totalShipping: num(order.total_shipping_price_set?.shop_money?.amount),
    currency: order.currency ?? null,
    discountCode,
    financialStatus: order.financial_status ?? null,
    fulfillmentStatus: order.fulfillment_status ?? null,
    cancelledAt: isoToMs(order.cancelled_at),
    test: order.test ?? false,
    sourceName: order.source_name ?? null,
    shippingCity: address.city ?? null,
    shippingProvince: address.province ?? null,
    shippingZip: address.zip ?? null,
    shippingCountry: address.country ?? null,
    shippingCountryCode: address.country_code ?? null,
    shippingLineTitle: order.shipping_lines?.[0]?.title ?? null,
    lineItems,
    upsellRevenue: Math.round(upsellRevenue * 100) / 100,
    utmSource: attr("utm_source"),
    utmMedium: attr("utm_medium"),
    utmCampaign: attr("utm_campaign"),
    utmTerm: attr("utm_term"),
    utmContent: attr("utm_content"),
    gclid: attr("gclid"),
    fbclid: attr("fbclid"),
    landingPage: attr("landing_page"),
    referrer: attr("referrer"),
    firstUtmSource: attr("first_utm_source"),
    firstUtmMedium: attr("first_utm_medium"),
    firstUtmCampaign: attr("first_utm_campaign"),
    firstLandingPage: attr("first_landing_page"),
    firstReferrer: attr("first_referrer"),
    shopifyLandingSite: order.landing_site ?? null,
    shopifyReferringSite: order.referring_site ?? null,
    createdAt: isoToMs(order.created_at) ?? Date.now(),
    processedAt: isoToMs(order.processed_at),
  });

  // Destino con aduana (Canarias/Ceuta/Melilla → ES, internacional → EN):
  // petición de DNI por email con formulario propio (lib/crm/dni-requests.ts).
  // Solo pedidos vivos sin enviar; el cron de 1 min manda el primer email.
  if (
    email &&
    !order.test &&
    !order.cancelled_at &&
    !order.fulfillment_status
  ) {
    try {
      await ensureDniRequest({
        orderId: order.id,
        orderName: order.name ?? null,
        email,
        countryCode: address.country_code,
        zip: address.zip,
      });
    } catch (error) {
      console.error("[webhooks/shopify] dni request", error);
    }
  }
}

// ──────────────────── checkouts/create · checkouts/update ────────────────────

async function handleCheckout(checkout: CheckoutPayload) {
  if (!checkout.id) return;
  const email =
    (checkout.email ?? checkout.customer?.email ?? "").trim().toLowerCase() ||
    null;

  const lineItems = (checkout.line_items ?? []).slice(0, 25).map((item) => ({
    title: item.title ?? "",
    variant: item.variant_title ?? null,
    quantity: item.quantity ?? 1,
    price: item.price ?? null,
  }));

  // Alta por consentimiento (buyer_accepts_marketing), upsert del checkout,
  // relevo del carrito storefront por cart_token, conversión/vaciado e
  // inscripción en cart_recovery: todo en una mutation transaccional.
  await convexMutation(api.shopifySync.applyCheckoutWebhook, {
    checkoutId: checkout.id,
    token: checkout.token ?? null,
    cartToken: checkout.cart_token ?? null,
    email,
    customerFirstName: checkout.customer?.first_name ?? null,
    currency: checkout.currency ?? null,
    totalPrice: checkout.total_price ? Number(checkout.total_price) : null,
    lineItems,
    recoveryUrl: checkout.abandoned_checkout_url ?? null,
    buyerAcceptsMarketing: checkout.buyer_accepts_marketing ?? null,
    abandonedAt: isoToMs(checkout.created_at) ?? Date.now(),
    lastEventAt: isoToMs(checkout.updated_at) ?? Date.now(),
    completed: Boolean(checkout.completed_at),
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyShopifyHmac(payload, request.headers)) {
    return new NextResponse("invalid hmac", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }

  try {
    if (topic === "orders/create" || topic === "orders/updated") {
      // Mismo upsert idempotente: orders/updated refresca estados de pago/
      // envío y cancelaciones en tiempo real (los importes de reembolso
      // exactos los reconcilia el cron shopify-sync).
      await handleOrderCreate(body as OrderPayload);
    } else if (topic === "checkouts/create" || topic === "checkouts/update") {
      await handleCheckout(body as CheckoutPayload);
    } else if (topic === "refunds/create") {
      // Rectificativa automática en Holded si el pedido ya tenía ticket.
      // issueCreditNotesForOrder relee los refunds en vivo de la Admin API y
      // es idempotente por refund_id, así que los reintentos son inocuos.
      const refund = body as { order_id?: number };
      if (refund.order_id) {
        await issueCreditNotesForOrder(refund.order_id);
      }
    }
    // Topics no manejados: 200 igualmente (que Shopify no reintente)
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[webhooks/shopify] ${topic}`, error);
    return new NextResponse("error", { status: 500 });
  }
}
