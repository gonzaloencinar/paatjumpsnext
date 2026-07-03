import { CartProvider } from "components/cart/cart-context";
import { LocaleProvider } from "components/i18n/locale-context";
import { Navbar } from "components/layout/navbar";
import { AnnouncementBar } from "components/marketing/announcement-bar";
import { DiscountCodeHandler } from "components/marketing/discount-code-handler";
import { WelcomeToast } from "components/welcome-toast";
import { getAnnouncedPromotion } from "lib/crm/promotions";
import { isLocale, locales } from "lib/i18n/config";
import { getCart } from "lib/shopify";
import { notFound } from "next/navigation";
import { ReactNode } from "react";

// Prerender both language trees (Spanish is served at the root via the
// middleware rewrite; English lives under /en).
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Don't await the fetch, pass the Promise to the context provider
  const cart = getCart();
  // Barra de captación: la gobierna el toggle "Anuncio web" de /admin/promotions
  const promo = await getAnnouncedPromotion();

  return (
    <LocaleProvider locale={locale}>
      <CartProvider cartPromise={cart}>
        {promo ? (
          <AnnouncementBar
            name={promo.name}
            percentage={promo.percentage}
            endsAt={promo.ends_at}
          />
        ) : null}
        <Navbar locale={locale} />
        <main>
          {children}
          <WelcomeToast />
        </main>
        <DiscountCodeHandler />
      </CartProvider>
    </LocaleProvider>
  );
}
