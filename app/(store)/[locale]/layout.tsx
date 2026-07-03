import { CartProvider } from "components/cart/cart-context";
import { LocaleProvider } from "components/i18n/locale-context";
import { Navbar } from "components/layout/navbar";
import { AnnouncementBar } from "components/marketing/announcement-bar";
import { DiscountCodeHandler } from "components/marketing/discount-code-handler";
import { WelcomeToast } from "components/welcome-toast";
import { getAnnouncedPromotion } from "lib/crm/promotions";
import { geist } from "lib/fonts";
import { defaultLocale, isLocale, localeHref, locales } from "lib/i18n/config";
import { getCart } from "lib/shopify";
import { baseUrl, cn } from "lib/utils";
import { ReactNode } from "react";
import { Toaster } from "sonner";
import "../../globals.css";

const { SITE_NAME } = process.env;

// Root layout of the store tree (the admin CRM has its own under app/admin):
// each route group owning its <html> is what lets `lang` follow the locale.
export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: SITE_NAME!,
    template: `%s | ${SITE_NAME}`,
  },
  robots: {
    follow: true,
    index: true,
  },
  twitter: {
    card: "summary_large_image" as const,
  },
};

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
  // Invalid locales (junk one-segment URLs like /favicon.ico that skip the
  // middleware rewrite) 404 in the PAGES — a notFound() thrown from a layout
  // has no boundary and breaks the render. Normalize here for the providers.
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;

  // Don't await the fetch, pass the Promise to the context provider
  const cart = getCart();
  // Barra de captación: la gobierna el toggle "Anuncio web" de /admin/promotions
  const promo = await getAnnouncedPromotion();

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    logo: `${baseUrl}/icon.svg`,
  };
  const webSiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${baseUrl}${locale === "en" ? "/en" : ""}`,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}${localeHref(locale, "/search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang={locale} className={cn("dark", "font-sans", geist.variable)}>
      <body className="bg-neutral-50 text-black selection:bg-orange-500 selection:text-white dark:bg-neutral-950 dark:text-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
        <LocaleProvider locale={locale}>
          <CartProvider cartPromise={cart}>
            {promo ? (
              <AnnouncementBar
                name={promo.name}
                percentage={promo.percentage}
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
        <Toaster closeButton />
      </body>
    </html>
  );
}
