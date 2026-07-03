import { locales, type Locale } from "./config";

/**
 * Localized URL scheme: public URLs are fully translated per language, while the
 * internal App Router routes (/search, /search/<handle>, /product/<handle>) stay
 * unchanged. The proxy (see proxy.ts) rewrites public → internal, so page code
 * keeps receiving the canonical Shopify handle.
 *
 *   Browse hub   ES /combas              EN /en/jump-ropes
 *   Category     ES /combas/pvc          EN /en/jump-ropes/pvc
 *                ES /combas/segmentada   EN /en/jump-ropes/beaded
 *   Product      ES /productos/<handle>  EN /en/products/<en-slug>
 *
 * Spanish is served at the root; English under /en.
 */

// Canonical Shopify collection handles (the store's real, Spanish handles).
export const COL_PVC = "combas-pvc";
export const COL_BEADED = "combas-segmentadas";
const CANONICAL_COLLECTIONS = [COL_PVC, COL_BEADED];

// Localized first-segment vocabulary.
const BROWSE_ROOT: Record<Locale, string> = { es: "combas", en: "jump-ropes" };
const PRODUCTS_ROOT: Record<Locale, string> = {
  es: "productos",
  en: "products",
};

// Category subslug per locale, keyed by canonical collection handle.
const CATEGORY_SUBSLUG: Record<string, Record<Locale, string>> = {
  [COL_PVC]: { es: "pvc", en: "pvc" },
  [COL_BEADED]: { es: "segmentada", en: "beaded" },
};

// English product slug per canonical (Spanish) handle. The Spanish slug is the
// handle itself, so only English needs a map. A new product falls back to its
// handle until added here (functional, just not translated) — keep in sync with
// tools/shopify-create when adding products.
const PRODUCT_EN_SLUG: Record<string, string> = {
  "comba-pvc-negra": "pvc-jump-rope-black",
  "comba-pvc-naranja": "pvc-jump-rope-orange",
  "comba-pvc-rosa": "pvc-jump-rope-pink",
  "comba-pvc-verde": "pvc-jump-rope-green",
  "comba-segmentada-negra": "beaded-jump-rope-black",
  "comba-segmentada-naranja": "beaded-jump-rope-orange",
  "comba-segmentada-verde-manzana": "beaded-jump-rope-apple-green",
  "comba-segmentada-verde-bosque": "beaded-jump-rope-forest-green",
  "comba-segmentada-azul-cobalto": "beaded-jump-rope-cobalt-blue",
  "comba-segmentada-magenta": "beaded-jump-rope-magenta",
  "comba-segmentada-violeta": "beaded-jump-rope-violet",
  "comba-segmentada-naranja-y-negra": "beaded-jump-rope-orange-black",
  "comba-segmentada-magenta-y-negra": "beaded-jump-rope-magenta-black",
  "comba-segmentada-lima-y-negra": "beaded-jump-rope-lime-black",
};

// Reverse lookups, built once at module load.
const SUBSLUG_TO_HANDLE: Record<Locale, Record<string, string>> = {
  es: {},
  en: {},
};
for (const handle of CANONICAL_COLLECTIONS) {
  const perLocale = CATEGORY_SUBSLUG[handle];
  if (!perLocale) continue;
  for (const locale of locales) {
    SUBSLUG_TO_HANDLE[locale][perLocale[locale]] = handle;
  }
}
const EN_SLUG_TO_HANDLE: Record<string, string> = {};
for (const [handle, slug] of Object.entries(PRODUCT_EN_SLUG)) {
  EN_SLUG_TO_HANDLE[slug] = handle;
}

// rel is "" (home) or a path starting with "/". English gets the /en prefix.
function withPrefix(locale: Locale, rel: string): string {
  if (locale === "en") return rel ? `/en${rel}` : "/en";
  return rel || "/";
}

function stripLocale(locale: Locale, pathname: string): string {
  if (locale === "en") {
    if (pathname === "/en") return "";
    if (pathname.startsWith("/en/")) return pathname.slice(3);
  }
  return pathname === "/" ? "" : pathname;
}

// ── Outbound link builders (full public path, incl. /en for English) ─────────

export function homePath(locale: Locale): string {
  return withPrefix(locale, "");
}

export function browsePath(locale: Locale): string {
  return withPrefix(locale, `/${BROWSE_ROOT[locale]}`);
}

export function categoryPath(locale: Locale, handle: string): string {
  const sub = CATEGORY_SUBSLUG[handle]?.[locale] ?? handle;
  return withPrefix(locale, `/${BROWSE_ROOT[locale]}/${sub}`);
}

export function productPath(locale: Locale, handle: string): string {
  const slug = locale === "en" ? (PRODUCT_EN_SLUG[handle] ?? handle) : handle;
  return withPrefix(locale, `/${PRODUCTS_ROOT[locale]}/${slug}`);
}

export function pagePath(locale: Locale, handle: string): string {
  return withPrefix(locale, `/${handle}`);
}

// ── Proxy (middleware) helpers ───────────────────────────────────────────────

/**
 * Locale-relative PUBLIC path → locale-relative INTERNAL route path.
 * "" for home; "/search", "/search/<handle>", "/product/<handle>" for browse,
 * category and product; the path unchanged for static pages and anything else.
 */
export function publicToInternal(locale: Locale, publicRel: string): string {
  const segments = publicRel.split("/").filter(Boolean);
  const first = segments[0];
  const second = segments[1];
  if (!first) return "";

  if (first === BROWSE_ROOT[locale]) {
    if (!second) return "/search";
    return `/search/${SUBSLUG_TO_HANDLE[locale][second] ?? second}`;
  }
  if (first === PRODUCTS_ROOT[locale] && second) {
    const handle =
      locale === "en" ? (EN_SLUG_TO_HANDLE[second] ?? second) : second;
    return `/product/${handle}`;
  }
  return publicRel;
}

/**
 * Retired URLs (the pre-localization /search and /product routes) → their new
 * localized public path, or null when `pathname` isn't a legacy URL. Locale is
 * inferred from the /en prefix.
 */
export function legacyRedirect(pathname: string): string | null {
  const enPrefixed = pathname === "/en" || pathname.startsWith("/en/");
  const locale: Locale = enPrefixed ? "en" : "es";
  const segments = stripLocale(locale, pathname).split("/").filter(Boolean);
  const first = segments[0];
  const second = segments[1];
  if (!first) return null;

  if (first === "search")
    return second ? categoryPath(locale, second) : browsePath(locale);
  if (first === "product" && second) return productPath(locale, second);
  return null;
}

/**
 * Translate a full pathname from one locale to another. Used by the geo redirect
 * (so a non-Spanish visitor on a Spanish URL lands on the matching English URL,
 * not a broken blind /en prefix) and to build hreflang alternates.
 */
export function translatePath(
  from: Locale,
  to: Locale,
  pathname: string,
): string {
  const rel = stripLocale(from, pathname);
  const segments = rel.split("/").filter(Boolean);
  const first = segments[0];
  const second = segments[1];
  if (!first) return homePath(to);

  if (first === BROWSE_ROOT[from]) {
    if (!second) return browsePath(to);
    const handle = SUBSLUG_TO_HANDLE[from][second];
    return handle
      ? categoryPath(to, handle)
      : withPrefix(to, `/${BROWSE_ROOT[to]}/${second}`);
  }
  if (first === PRODUCTS_ROOT[from] && second) {
    const handle =
      from === "en" ? (EN_SLUG_TO_HANDLE[second] ?? second) : second;
    return productPath(to, handle);
  }
  return withPrefix(to, rel); // static page / unknown
}
