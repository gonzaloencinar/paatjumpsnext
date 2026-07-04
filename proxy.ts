import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  IDENTITY_COOKIE,
  IDENTITY_MAX_AGE,
  IDENTITY_PARAM,
} from "@/lib/crm/identity";
import {
  COUNTRY_COOKIE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import {
  legacyRedirect,
  publicToInternal,
  translatePath,
} from "@/lib/i18n/routes";

// Crawlers keep the canonical URLs: Spanish at the root, English at /en
// (linked via hreflang). Auto-redirecting bots by IP would get the root
// indexed in English (Googlebot crawls from the US), so bots never redirect.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|pinterest|preview/i;

function detectLocale(request: NextRequest, country: string): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  if (country) return country === "ES" ? "es" : "en";
  // Local dev / no geo header: fall back to the browser language.
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage && !/^\s*es\b/i.test(acceptLanguage)) return "en";
  return "es";
}

// Next 16 renamed the "middleware" file convention to "proxy" (same runtime).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El CRM mantiene su middleware de sesión; la tienda no toca Supabase.
  if (pathname.startsWith("/admin")) return updateSession(request);

  // Acortador de enlaces del CRM (app/l/[slug]/route.ts): vive fuera del
  // árbol de locales — pasa sin rewrite ni redirección de idioma.
  if (pathname === "/l" || pathname.startsWith("/l/")) {
    return NextResponse.next();
  }

  // Identidad del CRM: los enlaces de los emails llegan con ?pj=<token
  // firmado>. A cookie httpOnly y URL limpia (el token no debe quedarse en
  // barra/historial/compartidos); la firma se verifica al USARLA — aquí no hay
  // node:crypto. El redirect re-entra al proxy y sigue el flujo de locale.
  const identity = request.nextUrl.searchParams.get(IDENTITY_PARAM);
  if (identity) {
    const url = request.nextUrl.clone();
    url.searchParams.delete(IDENTITY_PARAM);
    const response = NextResponse.redirect(url, 307);
    response.cookies.set(IDENTITY_COOKIE, identity, {
      maxAge: IDENTITY_MAX_AGE,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return response;
  }

  const country =
    request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const isBot = BOT_RE.test(request.headers.get("user-agent") ?? "");

  // Retired URLs (pre-localization /search & /product) → new localized slugs.
  const legacy = legacyRedirect(pathname);
  if (legacy) {
    const url = request.nextUrl.clone();
    url.pathname = legacy;
    return NextResponse.redirect(url, 301);
  }

  // /es/* is internal-only (the root IS Spanish): canonicalize away.
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/es/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  const isEnglishPath = pathname === "/en" || pathname.startsWith("/en/");
  const preferred = detectLocale(request, country);

  let response: NextResponse;
  if (isEnglishPath) {
    // Real route segment: rewrite the localized public path onto the internal
    // /search|/product route (app/(store)/[locale] with locale = "en").
    const rel = pathname === "/en" ? "/" : pathname.slice(3);
    const url = request.nextUrl.clone();
    url.pathname = `/en${publicToInternal("en", rel)}`;
    response = NextResponse.rewrite(url);
  } else if (preferred === "en" && !isBot) {
    // Non-Spanish visitor on an unprefixed (Spanish) URL → the matching English
    // URL. Must translate slugs, not blind-prefix /en (that breaks /combas/pvc).
    const url = request.nextUrl.clone();
    url.pathname = translatePath("es", "en", pathname);
    response = NextResponse.redirect(url, 307);
  } else {
    const url = request.nextUrl.clone();
    url.pathname = `/es${publicToInternal("es", pathname)}`;
    response = NextResponse.rewrite(url);
  }

  if (!isBot) {
    const cookieOptions = { maxAge: 60 * 60 * 24 * 180, path: "/" };
    if (request.cookies.get(LOCALE_COOKIE)?.value !== preferred) {
      response.cookies.set(LOCALE_COOKIE, preferred, cookieOptions);
    }
    // Buyer country for the cart's buyerIdentity (Shopify Markets/checkout).
    if (country && request.cookies.get(COUNTRY_COOKIE)?.value !== country) {
      response.cookies.set(COUNTRY_COOKIE, country, cookieOptions);
    }
  }

  return response;
}

export const config = {
  // Store + admin. Excluded: API routes, Next internals, Vercel internals and
  // any path with an extension (assets, sitemap.xml, robots.txt, favicon...).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
