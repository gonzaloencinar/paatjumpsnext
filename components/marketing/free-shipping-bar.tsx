"use client";

import { useCart } from "components/cart/cart-context";
import { useShippingZone } from "components/cart/shipping-context";
import { useDictionary, useLocale } from "components/i18n/locale-context";
import { localeTag } from "lib/i18n/config";

// Barra sticky con el progreso hacia el envío gratis, visible en toda la web
// (no solo en el carrito). Releva a la barra de captación cuando esta no
// procede: email ya dado (cookie pj_contact), código ya en mano, barra cerrada
// o sin promo anunciada. Mismos datos que FreeShippingProgress del carrito;
// si la zona no tiene envío gratis prometido (lib/shipping.ts) no se muestra.

export function FreeShippingBar() {
  const zone = useShippingZone();
  const { cart } = useCart();
  const locale = useLocale();
  const t = useDictionary();

  if (!zone) return null;

  const subtotal = cart ? Number(cart.cost.subtotalAmount.amount) : 0;
  const currencyCode = cart?.cost.subtotalAmount.currencyCode ?? "EUR";
  const remaining = Math.max(zone.threshold - subtotal, 0);
  const qualified = subtotal > 0 && remaining <= 0;
  const progress = Math.min((subtotal / zone.threshold) * 100, 100);

  // Enteros sin decimales ("35 €" mejor que "35,00 €"); el resto con céntimos.
  const money = (value: number) =>
    new Intl.NumberFormat(localeTag(locale), {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      ...(Number.isInteger(value) ? { minimumFractionDigits: 0 } : {}),
    }).format(value);

  return (
    <aside
      aria-label={t.shippingBar.ariaLabel}
      className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950 text-white"
    >
      <p className="mx-auto max-w-(--breakpoint-2xl) px-4 py-2 text-center text-sm">
        {qualified ? (
          <>
            {t.cart.freeShippingUnlockedPrefix}{" "}
            <span className="font-semibold text-orange-400">
              {t.cart.freeShippingUnlockedHighlight}
            </span>
            .
          </>
        ) : subtotal <= 0 ? (
          <>
            🚚 {t.shippingBar.fromPrefix}{" "}
            <span className="font-semibold text-orange-400">
              {money(zone.threshold)}
            </span>
          </>
        ) : (
          <>
            🚚 {t.cart.remainingPrefix}{" "}
            <span className="font-semibold text-orange-400">
              {money(remaining)}
            </span>{" "}
            {t.cart.remainingMiddle}{" "}
            <span className="font-semibold">{t.cart.remainingHighlight}</span>.
          </>
        )}
      </p>
      <div className="h-0.5 w-full bg-white/10">
        <div
          className="h-full bg-orange-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </aside>
  );
}
