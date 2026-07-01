"use client";

import { PlusIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { addItem } from "components/cart/actions";
import { useCart } from "components/cart/cart-context";
import { Product } from "lib/shopify/types";
import Link from "next/link";
import { useActionState } from "react";

const buttonClasses =
  "flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md ring-1 ring-black/10 backdrop-blur transition";
const enabledClasses =
  "bg-orange-600 hover:scale-105 hover:bg-orange-500 active:scale-95";

// A shopping cart marked with a small "+" badge — the classic "add to cart"
// glyph, clearer than a bare plus. Neither Heroicons nor Lucide ship one, so
// we compose it from the cart icon already used by the cart drawer.
function AddToCartIcon() {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <ShoppingCartIcon className="h-5 w-5" strokeWidth={1.8} />
      <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-white text-orange-600">
        <PlusIcon className="h-2 w-2" strokeWidth={4} />
      </span>
    </span>
  );
}

// Compact "quick add" affordance shown on product grid tiles so shoppers can
// drop a comba into the cart without opening its detail page. Rendered as a
// sibling of the tile's <Link>, so a tap on it never triggers navigation, and
// the cart drawer auto-opens on success (see CartModal quantity effect).
export function QuickAddButton({ product }: { product: Product }) {
  const { addCartItem } = useCart();
  const [message, formAction, isPending] = useActionState(addItem, null);

  // Every comba is a single-variant product, so it can be added straight from
  // the grid. If a product ever has several variants, send the shopper to the
  // detail page to choose one instead.
  const variant =
    product.variants.length === 1 ? product.variants[0] : undefined;

  return (
    <div className="absolute right-3 top-3 z-20">
      {!product.availableForSale ? (
        <span
          title="Agotado"
          aria-label={`${product.title} agotado`}
          className={clsx(
            buttonClasses,
            "cursor-not-allowed bg-neutral-900/70 text-white/40 ring-white/10",
          )}
        >
          <ShoppingCartIcon className="h-5 w-5" strokeWidth={1.8} />
        </span>
      ) : !variant ? (
        <Link
          href={`/product/${product.handle}`}
          aria-label={`Ver opciones de ${product.title}`}
          className={clsx(buttonClasses, enabledClasses)}
        >
          <AddToCartIcon />
        </Link>
      ) : (
        <form
          action={async () => {
            addCartItem(variant, product);
            formAction(variant.id);
          }}
        >
          <button
            type="submit"
            aria-label={`Añadir ${product.title} al carrito`}
            disabled={isPending}
            className={clsx(buttonClasses, enabledClasses, {
              "cursor-wait opacity-70": isPending,
            })}
          >
            <AddToCartIcon />
          </button>
          <p aria-live="polite" className="sr-only" role="status">
            {message}
          </p>
        </form>
      )}
    </div>
  );
}
