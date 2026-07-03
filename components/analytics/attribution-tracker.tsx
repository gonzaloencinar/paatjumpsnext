"use client";

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  parseAttribution,
  type Attribution,
  type AttributionTouch,
} from "lib/attribution";
import { useEffect } from "react";

// Captura la atribución de marketing en cada carga completa de página (las
// navegaciones SPA no traen UTMs externos, así que con el mount del layout
// basta). Guarda first touch (solo la primera vez) y last touch (último clic
// no directo) en la cookie pj_attr; redirectToCheckout la lee en el servidor.

const REFERRER_SOURCES: [RegExp, { source: string; medium: string }][] = [
  [/(^|\.)google\./, { source: "google", medium: "organic" }],
  [/(^|\.)bing\./, { source: "bing", medium: "organic" }],
  [/(^|\.)duckduckgo\./, { source: "duckduckgo", medium: "organic" }],
  [/(^|\.)ecosia\./, { source: "ecosia", medium: "organic" }],
  [/(^|\.)instagram\./, { source: "instagram", medium: "social" }],
  [/(^|\.)(facebook\.|fb\.me)/, { source: "facebook", medium: "social" }],
  [/(^|\.)tiktok\./, { source: "tiktok", medium: "social" }],
  [/(^|\.)(youtube\.|youtu\.be)/, { source: "youtube", medium: "social" }],
  [/(^|\.)pinterest\./, { source: "pinterest", medium: "social" }],
  [/(^|\.)(twitter\.com|x\.com|t\.co)/, { source: "x", medium: "social" }],
  [/(^|\.)reddit\./, { source: "reddit", medium: "social" }],
];

function clean(value: string | null | undefined, max = 150) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function AttributionTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const get = (key: string) => clean(params.get(key));

      let source = get("utm_source");
      let medium = get("utm_medium");
      const gclid = get("gclid");
      const fbclid = get("fbclid");

      // Referrer externo (otro dominio): si no hay UTMs, deducir la fuente
      // (buscadores y redes conocidas; el resto queda como "referral").
      let referrer: string | undefined;
      let referrerHost: string | undefined;
      if (document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (refUrl.host !== window.location.host) {
            referrer = clean(document.referrer, 200);
            referrerHost = refUrl.hostname.toLowerCase();
          }
        } catch {
          // Referrer ilegible: se ignora.
        }
      }
      if (!source && referrerHost) {
        const known = REFERRER_SOURCES.find(([re]) => re.test(referrerHost));
        source = known ? known[1].source : referrerHost;
        medium = medium ?? (known ? known[1].medium : "referral");
      }
      // Click IDs sin utm_source explícito → asumir el canal de pago.
      if (!source && gclid) [source, medium] = ["google", "cpc"];
      if (!source && fbclid) [source, medium] = ["facebook", "paid"];

      const touch: AttributionTouch = {
        source,
        medium,
        campaign: get("utm_campaign"),
        term: get("utm_term"),
        content: get("utm_content"),
        gclid,
        fbclid,
        landing: clean(
          window.location.pathname + window.location.search,
          200,
        ),
        referrer,
        at: new Date().toISOString(),
      };

      const cookieValue = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))
        ?.split("=")
        .slice(1)
        .join("=");
      const existing = parseAttribution(cookieValue);

      const next: Attribution = { ...existing };
      // First touch: solo la primera visita (aunque sea directa — su landing y
      // referrer ya cuentan la historia de cómo nos descubrió).
      if (!next.first) next.first = touch;
      // Last touch: solo clics con fuente (último clic no directo).
      if (source) next.last = touch;

      if (JSON.stringify(next) !== JSON.stringify(existing)) {
        document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(
          JSON.stringify(next),
        )}; max-age=${ATTRIBUTION_MAX_AGE}; path=/; SameSite=Lax; Secure`;
      }
    } catch {
      // La atribución nunca debe romper la tienda.
    }
  }, []);

  return null;
}
