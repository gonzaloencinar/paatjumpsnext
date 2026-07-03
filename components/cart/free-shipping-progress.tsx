"use client";

import { useDictionary, useLocale } from "components/i18n/locale-context";
import { localeTag } from "lib/i18n/config";

export const FREE_SHIPPING_THRESHOLD = 50;

export function FreeShippingProgress({
  subtotal,
  currencyCode,
  onContinue,
}: {
  subtotal: number;
  currencyCode: string;
  onContinue: () => void;
}) {
  const locale = useLocale();
  const t = useDictionary();
  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0);
  const qualified = remaining <= 0;
  const progress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);

  const formattedRemaining = new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "narrowSymbol",
  }).format(remaining);

  return (
    <div className="mb-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      {qualified ? (
        <p className="text-sm font-medium">
          {t.cart.freeShippingUnlockedPrefix}{" "}
          <span className="text-orange-500">
            {t.cart.freeShippingUnlockedHighlight}
          </span>
          .
        </p>
      ) : (
        <p className="text-sm">
          {t.cart.remainingPrefix}{" "}
          <span className="font-semibold text-orange-500">
            {formattedRemaining}
          </span>{" "}
          {t.cart.remainingMiddle}{" "}
          <span className="font-semibold">{t.cart.remainingHighlight}</span>.
        </p>
      )}

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className="h-full rounded-full bg-orange-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {!qualified ? (
        <button
          type="button"
          onClick={onContinue}
          className="mt-3 block w-full rounded-full border border-orange-600 p-2 text-center text-sm font-medium text-orange-500 transition-colors hover:bg-orange-600 hover:text-white"
        >
          {t.cart.addMoreItems}
        </button>
      ) : null}
    </div>
  );
}
