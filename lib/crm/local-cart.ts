import { cookies } from "next/headers";
import { getCart } from "lib/shopify";
import { IDENTITY_COOKIE } from "@/lib/crm/identity";
import { api } from "@/convex/_generated/api";
import { convexMutation } from "@/lib/convex/server";
import { verifyIdentityToken } from "@/lib/email/tokens";

// Recuperación de carritos que NO llegan al checkout de Shopify: si el
// visitante está identificado (cookie pj_contact — llegó desde un email del
// CRM o se acaba de suscribir), cada mutación del carrito upsertea una fila
// origin='storefront' en checkouts (id negativo de secuencia; el webhook de
// Shopify nunca la pisa) y lo inscribe en la MISMA secuencia cart_recovery.
// El recovery_url es el checkoutUrl del carrito: restaura todo en un clic.
// Si el cliente sí pisa el checkout, el webhook casa por cart_token y el
// checkout real toma el relevo (route.ts). Best-effort: jamás rompe el carrito.
// Toda la lógica de datos (contacto suscrito, unicidad por cart_token, id
// negativo, inscripción/cancelación) vive en la mutation transaccional
// api.carts.trackStorefrontCart.

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

    await convexMutation(api.carts.trackStorefrontCart, {
      email,
      cartToken,
      currency: cart.cost.totalAmount.currencyCode,
      totalPrice: Number(cart.cost.totalAmount.amount),
      lineItems,
      recoveryUrl: cart.checkoutUrl,
    });
  } catch (error) {
    console.error("[local-cart] tracking falló", error);
  }
}
