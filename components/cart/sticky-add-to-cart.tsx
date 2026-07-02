"use client";

import clsx from "clsx";
import { useAddToCartForm } from "components/cart/add-to-cart";
import Price from "components/price";
import { Product } from "lib/shopify/types";

/**
 * Mobile-only sticky bottom bar for the product page: price + compact
 * "Añadir al carrito", visible without scrolling past the gallery.
 * Desktop already shows the main button above the fold, so it's hidden there.
 */
export function StickyAddToCart({ product }: { product: Product }) {
  const { selectedVariantId, message, action } = useAddToCartForm(product);
  const disabled = !product.availableForSale || !selectedVariantId;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-neutral-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <form
        action={action}
        className="flex items-center justify-between gap-4 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {product.title}
          </p>
          <Price
            className="text-sm text-white/70"
            amount={product.priceRange.maxVariantPrice.amount}
            currencyCode={product.priceRange.maxVariantPrice.currencyCode}
          />
        </div>
        <button
          disabled={disabled}
          aria-label={
            product.availableForSale ? "Añadir al carrito" : "Agotado"
          }
          className={clsx(
            "flex-none rounded-full bg-orange-600 px-6 py-3 text-sm font-semibold text-white transition",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:bg-orange-500 active:scale-[0.98]",
          )}
        >
          {product.availableForSale ? "Añadir al carrito" : "Agotado"}
        </button>
        <p aria-live="polite" className="sr-only" role="status">
          {message}
        </p>
      </form>
    </div>
  );
}
