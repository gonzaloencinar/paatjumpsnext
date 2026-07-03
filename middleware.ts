import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  COUNTRY_COOKIE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El CRM mantiene su middleware de sesión; la tienda no toca Supabase.
  if (pathname.startsWith("/admin")) return updateSession(request);

  const country =
    request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";

  // /es/* is internal-only (the root IS Spanish): canonicalize away.
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/es/, "") || "/";
    return NextResponse.redirect(url, 308);
  }

  const isEnglishPath = pathname === "/en" || pathname.startsWith("/en/");
  const preferred = detectLocale(request, country);
  const isBot = BOT_RE.test(request.headers.get("user-agent") ?? "");

  let response: NextResponse;
  if (isEnglishPath) {
    // Real route segment (app/(store)/[locale] with locale = "en").
    response = NextResponse.next();
  } else if (preferred === "en" && !isBot) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
    response = NextResponse.redirect(url, 307);
  } else {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/es" : `/es${pathname}`;
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
