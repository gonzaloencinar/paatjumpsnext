// Store locales. Spanish is served at the root (canonical URLs unchanged);
// English lives under /en. The middleware rewrites "/" → "/es" internally and
// redirects non-Spanish visitors to /en on first visit (see middleware.ts).
export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export const LOCALE_COOKIE = "pj_locale";
export const COUNTRY_COOKIE = "pj_country";

export function isLocale(value: string | undefined): value is Locale {
  return value === "es" || value === "en";
}

// Shopify Storefront API `LanguageCode` for @inContext.
export function localeToLanguage(locale: Locale): "ES" | "EN" {
  return locale === "en" ? "EN" : "ES";
}

// BCP 47 tag for Intl formatters (prices, dates).
export function localeTag(locale: Locale): string {
  return locale === "en" ? "en-GB" : "es-ES";
}

// Prefixes internal hrefs with /en for the English locale. Spanish keeps the
// canonical unprefixed URLs. External/anchor/query-only hrefs pass through.
export function localeHref(locale: Locale, href: string): string {
  if (locale === "es" || !href.startsWith("/")) return href;
  if (href === "/en" || href.startsWith("/en/")) return href;
  return href === "/" ? "/en" : `/en${href}`;
}
