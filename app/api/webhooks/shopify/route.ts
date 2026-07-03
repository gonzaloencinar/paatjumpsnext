import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { effectiveSteps } from "@/lib/crm/automation-engine";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhooks de Shopify (plan §7.2 y §8): orders/create + checkouts/create|update.
// Un solo endpoint; el topic viene en X-Shopify-Topic. HMAC-SHA256 del cuerpo
// crudo con el client secret de la app PaatJumpsNext (SHOPIFY_WEBHOOK_SECRET).
// Responder 200 rápido; Shopify reintenta los fallos — todo es idempotente
// (upserts por id de Shopify, recuentos recalculados desde tabla).

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

type Supabase = ReturnType<typeof createAdminClient>;

type OrderPayload = {
  id?: number;
  email?: string | null;
  checkout_id?: number | null;
  checkout_token?: string | null;
  cart_token?: string | null;
  total_price?: string | null;
  currency?: string | null;
  created_at?: string | null;
  discount_codes?: { code?: string }[];
  customer?: { email?: string | null } | null;
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

const CONSENT_CHECKOUT =
  "Aceptó marketing en el checkout de Shopify (buyer_accepts_marketing)";

async function findContactByEmail(supabase: Supabase, email: string) {
  const { data } = await supabase
    .from("contacts")
    .select("id, status, first_name")
    .eq("email", email)
    .maybeSingle();
  return data;
}

// ───────────────────────── orders/create ─────────────────────────

async function handleOrderCreate(supabase: Supabase, order: OrderPayload) {
  if (!order.id) return;
  const email =
    (order.email ?? order.customer?.email ?? "").trim().toLowerCase() || null;
  const contact = email ? await findContactByEmail(supabase, email) : null;
  const discountCode = order.discount_codes?.[0]?.code?.toUpperCase() ?? null;

  // Atribución por ventana de clic (§16.6): último clic ≤5 días en una
  // campaña. La atribución por promo enlazada llega con 3d.
  let campaignId: string | null = null;
  if (contact) {
    const { data: clicked } = await supabase
      .from("email_sends")
      .select("campaign_id, clicked_at")
      .eq("contact_id", contact.id)
      .not("campaign_id", "is", null)
      .not("clicked_at", "is", null)
      .gte("clicked_at", new Date(Date.now() - 5 * 86_400_000).toISOString())
      .order("clicked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    campaignId = clicked?.campaign_id ?? null;
  }

  await supabase.from("orders").upsert({
    id: order.id,
    contact_id: contact?.id ?? null,
    email,
    checkout_token: order.checkout_token ?? null,
    cart_token: order.cart_token ?? null,
    total_price: order.total_price ? Number(order.total_price) : null,
    currency: order.currency ?? null,
    discount_code: discountCode,
    campaign_id: campaignId,
    created_at: order.created_at ?? new Date().toISOString(),
  });

  if (contact) {
    // Derivados recalculados desde la tabla → idempotente ante reintentos
    const { data: rows } = await supabase
      .from("orders")
      .select("total_price, created_at")
      .eq("contact_id", contact.id)
      .limit(5000);
    const totals = rows ?? [];
    await supabase
      .from("contacts")
      .update({
        orders_count: totals.length,
        total_spent: totals.reduce((sum, o) => sum + (o.total_price ?? 0), 0),
        last_order_at: totals.reduce<string | null>(
          (max, o) => (max && max > o.created_at ? max : o.created_at),
          null,
        ),
      })
      .eq("id", contact.id);

    const { data: dup } = await supabase
      .from("events")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("type", "order_placed")
      .eq("payload->>order_id", String(order.id))
      .maybeSingle();
    if (!dup) {
      await supabase.from("events").insert({
        contact_id: contact.id,
        type: "order_placed",
        payload: {
          order_id: order.id,
          total: order.total_price,
          discount_code: discountCode,
        },
      });
    }
  }

  // Conversión del checkout → no recuperar lo ya comprado (§7.2)
  if (order.checkout_id) {
    await supabase
      .from("checkouts")
      .update({ status: "converted", last_event_at: new Date().toISOString() })
      .eq("id", order.checkout_id);
    await supabase
      .from("automation_enrollments")
      .update({ status: "canceled", next_run_at: null })
      .eq("checkout_id", order.checkout_id)
      .eq("status", "active");
  } else if (order.checkout_token) {
    const { data: checkout } = await supabase
      .from("checkouts")
      .select("id")
      .eq("token", order.checkout_token)
      .maybeSingle();
    if (checkout) {
      await supabase
        .from("checkouts")
        .update({
          status: "converted",
          last_event_at: new Date().toISOString(),
        })
        .eq("id", checkout.id);
      await supabase
        .from("automation_enrollments")
        .update({ status: "canceled", next_run_at: null })
        .eq("checkout_id", checkout.id)
        .eq("status", "active");
    }
  }

  // Salida por compra (§16.4): automatizaciones con cancel_on_order
  if (contact) {
    const { data: automations } = await supabase
      .from("automations")
      .select("id, config")
      .eq("trigger", "signup");
    const cancelable = (automations ?? [])
      .filter(
        (a) => (a.config as { cancel_on_order?: boolean })?.cancel_on_order,
      )
      .map((a) => a.id);
    if (cancelable.length > 0) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "canceled", next_run_at: null })
        .eq("contact_id", contact.id)
        .eq("status", "active")
        .is("checkout_id", null)
        .in("automation_id", cancelable);
    }
  }
}

// ──────────────────── checkouts/create · checkouts/update ────────────────────

async function handleCheckout(supabase: Supabase, checkout: CheckoutPayload) {
  if (!checkout.id) return;
  const email =
    (checkout.email ?? checkout.customer?.email ?? "").trim().toLowerCase() ||
    null;

  let contact = email ? await findContactByEmail(supabase, email) : null;

  // Sin contacto pero con consentimiento de marketing en el checkout → alta
  // como contacto (source 'checkout', §7.1/§11)
  if (!contact && email && checkout.buyer_accepts_marketing) {
    const { data: suppressed } = await supabase
      .from("suppressions")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (!suppressed) {
      const { data: created } = await supabase
        .from("contacts")
        .upsert(
          {
            email,
            first_name: checkout.customer?.first_name ?? null,
            status: "subscribed",
            source: "checkout",
            consent: true,
            consent_text: CONSENT_CHECKOUT,
            consent_at: new Date().toISOString(),
          },
          { onConflict: "email", ignoreDuplicates: false },
        )
        .select("id, status, first_name")
        .single();
      if (created) {
        contact = created;
        await supabase.from("events").insert({
          contact_id: created.id,
          type: "signup",
          payload: { source: "checkout" },
        });
      }
    }
  }

  const lineItems = (checkout.line_items ?? []).slice(0, 25).map((item) => ({
    title: item.title ?? "",
    variant: item.variant_title ?? null,
    quantity: item.quantity ?? 1,
    price: item.price ?? null,
  }));

  // status fuera del upsert: si ya está converted, un update tardío del
  // checkout no lo devuelve a abandoned (el default 'abandoned' solo aplica
  // al insertar)
  await supabase.from("checkouts").upsert({
    id: checkout.id,
    token: checkout.token ?? null,
    cart_token: checkout.cart_token ?? null,
    contact_id: contact?.id ?? null,
    email,
    currency: checkout.currency ?? null,
    total_price: checkout.total_price ? Number(checkout.total_price) : null,
    line_items: lineItems,
    recovery_url: checkout.abandoned_checkout_url ?? null,
    buyer_accepts_marketing: checkout.buyer_accepts_marketing ?? null,
    abandoned_at: checkout.created_at ?? new Date().toISOString(),
    last_event_at: checkout.updated_at ?? new Date().toISOString(),
  });

  // Recuperación de carrito (§7.2): solo contactos suscritos (la creación de
  // arriba ya cubre buyer_accepts_marketing; el resto, sin email de cortesía
  // por ahora — decisión conservadora §11)
  if (!contact || contact.status !== "subscribed") return;

  const { data: automation } = await supabase
    .from("automations")
    .select("id, enabled, automation_steps(*)")
    .eq("key", "cart_recovery")
    .maybeSingle();
  if (!automation?.enabled) return;
  const [first] = effectiveSteps(automation.automation_steps ?? []);
  if (!first) return;

  const nextRunAt = new Date(
    Date.now() + first.delay_minutes * 60_000,
  ).toISOString();

  // Nueva inscripción (ignora si ya existe para este checkout)…
  await supabase.from("automation_enrollments").upsert(
    {
      automation_id: automation.id,
      contact_id: contact.id,
      checkout_id: checkout.id,
      step: 0,
      status: "active",
      next_run_at: nextRunAt,
    },
    { ignoreDuplicates: true },
  );

  // …y si sigue en el paso 0 sin enviar, cada update reinicia el reloj
  // (el cliente sigue activo en el checkout — aún no está "abandonado")
  await supabase
    .from("automation_enrollments")
    .update({ next_run_at: nextRunAt })
    .eq("automation_id", automation.id)
    .eq("checkout_id", checkout.id)
    .eq("status", "active")
    .eq("step", 0);
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

  const supabase = createAdminClient();
  try {
    if (topic === "orders/create") {
      await handleOrderCreate(supabase, body as OrderPayload);
    } else if (topic === "checkouts/create" || topic === "checkouts/update") {
      await handleCheckout(supabase, body as CheckoutPayload);
    }
    // Topics no manejados: 200 igualmente (que Shopify no reintente)
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[webhooks/shopify] ${topic}`, error);
    return new NextResponse("error", { status: 500 });
  }
}
