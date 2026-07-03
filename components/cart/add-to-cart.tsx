"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { addItem } from "components/cart/actions";
import { useDictionary } from "components/i18n/locale-context";
import { Product, ProductVariant } from "lib/shopify/types";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useCart } from "./cart-context";

function SubmitButton({
  availableForSale,
  selectedVariantId,
}: {
  availableForSale: boolean;
  selectedVariantId: string | undefined;
}) {
  const t = useDictionary();
  const buttonClasses =
    "relative flex w-full items-center justify-center rounded-full bg-orange-600 p-4 tracking-wide text-white";
  const disabledClasses = "cursor-not-allowed opacity-60 hover:opacity-60";

  if (!availableForSale) {
    return (
      <button disabled className={clsx(buttonClasses, disabledClasses)}>
        {t.cart.soldOut}
      </button>
    );
  }

  if (!selectedVariantId) {
    return (
      <button
        aria-label={t.cart.selectOption}
        disabled
        className={clsx(buttonClasses, disabledClasses)}
      >
        <div className="absolute left-0 ml-4">
          <PlusIcon className="h-5" />
        </div>
        {t.cart.addToCart}
      </button>
    );
  }

  return (
    <button
      aria-label={t.cart.addToCart}
      className={clsx(buttonClasses, {
        "hover:opacity-90": true,
      })}
    >
      <div className="absolute left-0 ml-4">
        <PlusIcon className="h-5" />
      </div>
      {t.cart.addToCart}
    </button>
  );
}

// Variant resolution + optimistic add + server action, shared by every
// "add to cart" UI (main button, mobile sticky bar).
export function useAddToCartForm(product: Product) {
  const { variants } = product;
  const { addCartItem } = useCart();
  const searchParams = useSearchParams();
  const [message, formAction] = useActionState(addItem, null);

  const variant = variants.find((variant: ProductVariant) =>
    variant.selectedOptions.every(
      (option) => option.value === searchParams.get(option.name.toLowerCase()),
    ),
  );
  const defaultVariantId = variants.length === 1 ? variants[0]?.id : undefined;
  const selectedVariantId = variant?.id || defaultVariantId;
  const addItemAction = formAction.bind(null, selectedVariantId);
  const finalVariant = variants.find(
    (variant) => variant.id === selectedVariantId,
  )!;

  return {
    selectedVariantId,
    message,
    action: async () => {
      addCartItem(finalVariant, product);
      addItemAction();
    },
  };
}

export function AddToCart({ product }: { product: Product }) {
  const { selectedVariantId, message, action } = useAddToCartForm(product);

  return (
    <form action={action}>
      <SubmitButton
        availableForSale={product.availableForSale}
        selectedVariantId={selectedVariantId}
      />
      <p aria-live="polite" className="sr-only" role="status">
        {message}
      </p>
    </form>
  );
}
