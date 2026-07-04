"use server";

import {
  ATTRIBUTION_COOKIE,
  attributionToCartAttributes,
  parseAttribution,
} from "lib/attribution";
import { TAGS } from "lib/constants";
import {
  addToCart,
  applyCartDiscount,
  createCart,
  getCart,
  removeFromCart,
  updateCart,
  updateCartAttributes,
} from "lib/shopify";
import { trackStorefrontCart } from "lib/crm/local-cart";
import { getPromotionByCode } from "lib/crm/promotions";
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

export async function addItem(
  prevState: any,
  selectedVariantId: string | undefined,
) {
  if (!selectedVariantId) {
    return "Error adding item to cart";
  }

  try {
    await addToCart([{ merchandiseId: selectedVariantId, quantity: 1 }]);
    updateTag(TAGS.cart);
    // Tras responder al cliente: carrito → CRM si el visitante está
    // identificado (recuperación pre-checkout, lib/crm/local-cart.ts)
    after(trackStorefrontCart);
  } catch (e) {
    return "Error adding item to cart";
  }
}

export async function removeItem(prevState: any, merchandiseId: string) {
  try {
    const cart = await getCart();

    if (!cart) {
      return "Error fetching cart";
    }

    const lineItem = cart.lines.find(
      (line) => line.merchandise.id === merchandiseId,
    );

    if (lineItem && lineItem.id) {
      await removeFromCart([lineItem.id]);
      updateTag(TAGS.cart);
      after(trackStorefrontCart);
    } else {
      return "Item not found in cart";
    }
  } catch (e) {
    return "Error removing item from cart";
  }
}

export async function updateItemQuantity(
  prevState: any,
  payload: {
    merchandiseId: string;
    quantity: number;
  },
) {
  const { merchandiseId, quantity } = payload;

  try {
    const cart = await getCart();

    if (!cart) {
      return "Error fetching cart";
    }

    const lineItem = cart.lines.find(
      (line) => line.merchandise.id === merchandiseId,
    );

    if (lineItem && lineItem.id) {
      if (quantity === 0) {
        await removeFromCart([lineItem.id]);
      } else {
        await updateCart([
          {
            id: lineItem.id,
            merchandiseId,
            quantity,
          },
        ]);
      }
    } else if (quantity > 0) {
      // If the item doesn't exist in the cart and quantity > 0, add it
      await addToCart([{ merchandiseId, quantity }]);
    }

    updateTag(TAGS.cart);
    after(trackStorefrontCart);
  } catch (e) {
    console.error(e);
    return "Error updating item quantity";
  }
}

export async function redirectToCheckout(locale?: string) {
  let cart = await getCart();
  let checkoutUrl = cart!.checkoutUrl;

  // Atribución (lib/attribution.ts): volcar los UTMs de la cookie al carrito
  // como atributos ocultos justo antes del salto — vuelven en el pedido vía
  // webhook y alimentan /admin/analytics. Nunca bloquea la compra.
  const attribution = parseAttribution(
    (await cookies()).get(ATTRIBUTION_COOKIE)?.value,
  );
  if (attribution) {
    try {
      await updateCartAttributes(attributionToCartAttributes(attribution));
    } catch {
      // Sin atribución el checkout sigue adelante.
    }
  }

  try {
    const url = new URL(checkoutUrl);
    // Force the checkout language to match the page the buyer is on (belt and
    // braces on top of the cart's @inContext). Requires the language to be
    // published in Shopify (Settings → Languages).
    if (locale === "es" || locale === "en") {
      url.searchParams.set("locale", locale);
    }
    // Repetir los UTM del último touch en la URL: la analítica propia de
    // Shopify (customer journey) también los registra.
    const last = attribution?.last;
    if (last?.source) {
      url.searchParams.set("utm_source", last.source);
      if (last.medium) url.searchParams.set("utm_medium", last.medium);
      if (last.campaign) url.searchParams.set("utm_campaign", last.campaign);
    }
    checkoutUrl = url.toString();
  } catch {
    // Malformed URL: fall back to Shopify's default.
  }
  redirect(checkoutUrl);
}

export async function createCartAndSetCookie() {
  let cart = await createCart();
  const cookieStore = await cookies();
  cookieStore.set("cartId", cart.id!);
  // Si hay un código de descuento pendiente (link del email), aplicarlo al
  // carrito recién creado.
  const pending = cookieStore.get(DISCOUNT_COOKIE)?.value;
  if (pending) {
    try {
      await applyCartDiscount([pending]);
    } catch {
      // El código sigue en la cookie; el cliente puede pegarlo en el checkout.
    }
  }
}

const DISCOUNT_COOKIE = "pj_discount";

export async function applyDiscountCode(rawCode: string) {
  const code = rawCode.trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9-]{4,}$/.test(code)) {
    return { applied: false, saved: false, code };
  }

  const cookieStore = await cookies();
  // La cookie caduca cuando termina la promo (así deja de re-aplicarse un código
  // muerto y la barra sticky vuelve a salir para futuras promos). Sin fecha de
  // fin (p.ej. afiliados) → 90 días. Ver getPromotionByCode / layout.
  const promo = await getPromotionByCode(code);
  const expires = promo?.ends_at ? new Date(promo.ends_at) : null;
  cookieStore.set(DISCOUNT_COOKIE, code, {
    path: "/",
    ...(expires && expires.getTime() > Date.now()
      ? { expires }
      : { maxAge: 60 * 60 * 24 * 90 }),
  });

  let cart = await getCart();
  if (!cart) {
    cart = await createCart();
    cookieStore.set("cartId", cart.id!);
  }

  try {
    const applied = await applyCartDiscount([code]);
    updateTag(TAGS.cart);
    after(trackStorefrontCart);
    return { applied, saved: true, code };
  } catch {
    return { applied: false, saved: true, code };
  }
}
