import { cookies } from "next/headers";
import { getCart } from "lib/shopify";
import { enrollCheckoutInCartRecovery } from "@/lib/crm/automation-engine";
import { IDENTITY_COOKIE } from "@/lib/crm/identity";
import { verifyIdentityToken } from "@/lib/email/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

// Recuperación de carritos que NO llegan al checkout de Shopify: si el
// visitante está identificado (cookie pj_contact — llegó desde un email del
// CRM o se acaba de suscribir), cada mutación del carrito upsertea una fila
// origin='storefront' en checkouts (id negativo de secuencia; el webhook de
// Shopify nunca la pisa) y lo inscribe en la MISMA secuencia cart_recovery.
// El recovery_url es el checkoutUrl del carrito: restaura todo en un clic.
// Si el cliente sí pisa el checkout, el webhook casa por cart_token y el
// checkout real toma el relevo (route.ts). Best-effort: jamás rompe el carrito.

export async function trackStorefrontCart() {
  try {
    const email = verifyIdentityToken(
      (await cookies()).get(IDENTITY_COOKIE)?.value,
    );
    if (!email) return;

    const cart = await getCart();
    if (!cart?.id) return;
    // gid://shopify/Cart/c1-abc…?key=xyz → "c1-abc…" (== cart_token que
    // Shopify pone en checkouts/orders: la llave del matching del webhook)
    const cartToken = cart.id.split("/").pop()?.split("?")[0];
    if (!cartToken) return;

    const supabase = createAdminClient();
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();
    if (!contact || contact.status !== "subscribed") return;

    // Si este carrito ya pisó el checkout de Shopify, el webhook manda
    const { data: shopifyCheckout } = await supabase
      .from("checkouts")
      .select("id")
      .eq("cart_token", cartToken)
      .eq("origin", "shopify")
      .limit(1)
      .maybeSingle();
    if (shopifyCheckout) return;

    const lineItems = cart.lines.slice(0, 25).map((line) => ({
      title: line.merchandise.product.title,
      variant:
        line.merchandise.title === "Default Title"
          ? null
          : line.merchandise.title,
      quantity: line.quantity,
      price:
        line.quantity > 0
          ? (Number(line.cost.totalAmount.amount) / line.quantity).toFixed(2)
          : line.cost.totalAmount.amount,
    }));
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("checkouts")
      .select("id, status")
      .eq("cart_token", cartToken)
      .eq("origin", "storefront")
      .maybeSingle();

    let checkoutId: number;
    if (existing) {
      // reached_checkout/converted no se reabren: ese carrito ya siguió su vida
      if (existing.status !== "abandoned") return;
      checkoutId = existing.id;
      await supabase
        .from("checkouts")
        .update({
          contact_id: contact.id,
          email,
          currency: cart.cost.totalAmount.currencyCode,
          total_price: Number(cart.cost.totalAmount.amount),
          line_items: lineItems,
          recovery_url: cart.checkoutUrl,
          last_event_at: now,
        })
        .eq("id", existing.id);
    } else {
      if (lineItems.length === 0) return;
      const { data: created, error } = await supabase
        .from("checkouts")
        .insert({
          origin: "storefront",
          cart_token: cartToken,
          contact_id: contact.id,
          email,
          currency: cart.cost.totalAmount.currencyCode,
          total_price: Number(cart.cost.totalAmount.amount),
          line_items: lineItems,
          recovery_url: cart.checkoutUrl,
          status: "abandoned",
          abandoned_at: now,
          last_event_at: now,
        })
        .select("id")
        .single();
      // Carrera entre dos mutaciones simultáneas: el unique parcial por
      // cart_token deja ganar a una; la siguiente mutación actualizará.
      if (error || !created) return;
      checkoutId = created.id;
    }

    // Carrito vaciado a propósito → nada que recuperar
    if (lineItems.length === 0) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "canceled", next_run_at: null })
        .eq("checkout_id", checkoutId)
        .eq("status", "active");
      return;
    }

    await enrollCheckoutInCartRecovery(supabase, contact.id, checkoutId);
  } catch (error) {
    console.error("[local-cart] tracking falló", error);
  }
}
