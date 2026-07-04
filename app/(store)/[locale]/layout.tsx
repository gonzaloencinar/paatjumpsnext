import { AttributionTracker } from "components/analytics/attribution-tracker";
import { CartProvider } from "components/cart/cart-context";
import { ShippingProvider } from "components/cart/shipping-context";
import { LocaleProvider } from "components/i18n/locale-context";
import { Navbar } from "components/layout/navbar";
import { AnnouncementBar } from "components/marketing/announcement-bar";
import { DiscountCodeHandler } from "components/marketing/discount-code-handler";
import { FreeShippingBar } from "components/marketing/free-shipping-bar";
import { WelcomeToast } from "components/welcome-toast";
import { getAnnouncedPromotion, getPromotionByCode } from "lib/crm/promotions";
import { geist } from "lib/fonts";
import { defaultLocale, isLocale, locales } from "lib/i18n/config";
import { browsePath } from "lib/i18n/routes";
import { getCart } from "lib/shopify";
import { IDENTITY_COOKIE } from "lib/crm/identity";
import { COUNTRY_COOKIE } from "lib/i18n/config";
import { shippingZone } from "lib/shipping";
import { baseUrl, cn } from "lib/utils";
import { cookies, headers } from "next/headers";
import Script from "next/script";
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

  // Zona de envío para el carrito (umbral gratis + coste estimado), deducida por
  // geo-IP (Vercel). El cookie pj_country (lo fija el proxy) es el respaldo
  // cuando la cabecera no viaja. Región = subdivisión ISO 3166-2 para distinguir
  // Canarias/Ceuta/Melilla dentro de ES. Ver lib/shipping.ts.
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const country =
    headerList.get("x-vercel-ip-country") ??
    cookieStore.get(COUNTRY_COOKIE)?.value ??
    "";
  const region = headerList.get("x-vercel-ip-country-region") ?? "";
  const zone = shippingZone(country, region);

  // Barra sticky de captación: la ocultamos si el visitante ya tiene el
  // código de la promo anunciada AHORA (no le pedimos lo que ya tiene), si
  // tiene un código de afiliado (no lo pisamos con la promo general), o si ya
  // nos dio su email en este navegador (cookie pj_contact: la fija el alta de
  // /api/subscribe y también llegar desde un email del CRM con ?pj=). Cuando
  // no procede, en su lugar va la barra de envío gratis (FreeShippingBar).
  // La cookie pj_discount la fija el proxy al aterrizar con ?code=… (así este
  // primer render ya la ve) y applyDiscountCode la re-fija con la caducidad
  // real de la promo.
  const pendingCode = cookieStore.get("pj_discount")?.value ?? null;
  const heldPromo = pendingCode ? await getPromotionByCode(pendingCode) : null;
  const holdsAnnounced = Boolean(promo) && pendingCode === promo?.code;
  const holdsAffiliate = heldPromo?.type === "affiliate";
  const identified = Boolean(cookieStore.get(IDENTITY_COOKIE)?.value);
  const showAnnouncement =
    Boolean(promo) && !holdsAnnounced && !holdsAffiliate && !identified;

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
      target: `${baseUrl}${browsePath(locale)}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang={locale} className={cn("dark", "font-sans", geist.variable)}>
      <body className="bg-neutral-50 text-black selection:bg-orange-500 selection:text-white dark:bg-neutral-950 dark:text-white">
        <Script id="ms-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "xgqyi46lw3");`}
        </Script>
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
          <ShippingProvider zone={zone}>
            <CartProvider cartPromise={cart}>
              {showAnnouncement && promo ? (
                <AnnouncementBar
                  name={promo.name}
                  percentage={promo.percentage}
                  code={promo.code}
                />
              ) : (
                <FreeShippingBar />
              )}
              <Navbar locale={locale} />
              <main>
                {children}
                <WelcomeToast />
              </main>
              <DiscountCodeHandler />
              <AttributionTracker />
            </CartProvider>
          </ShippingProvider>
        </LocaleProvider>
        <Toaster closeButton />
      </body>
    </html>
  );
}
