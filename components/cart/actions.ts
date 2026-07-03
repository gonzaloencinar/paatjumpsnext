"use server";

import { TAGS } from "lib/constants";
import {
  addToCart,
  applyCartDiscount,
  createCart,
  getCart,
  removeFromCart,
  updateCart,
} from "lib/shopify";
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
  } catch (e) {
    console.error(e);
    return "Error updating item quantity";
  }
}

export async function redirectToCheckout() {
  let cart = await getCart();
  redirect(cart!.checkoutUrl);
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
  // Persistir 35 días: si el carrito caduca o aún no existe, se re-aplica al
  // crearlo (createCartAndSetCookie).
  cookieStore.set(DISCOUNT_COOKIE, code, {
    maxAge: 60 * 60 * 24 * 35,
    path: "/",
  });

  let cart = await getCart();
  if (!cart) {
    cart = await createCart();
    cookieStore.set("cartId", cart.id!);
  }

  try {
    const applied = await applyCartDiscount([code]);
    updateTag(TAGS.cart);
    return { applied, saved: true, code };
  } catch {
    return { applied: false, saved: true, code };
  }
}
