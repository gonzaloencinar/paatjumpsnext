// Atribución de marketing (UTMs + click IDs). El AttributionTracker guarda en
// una cookie first-party el primer y el último touch del visitante; al saltar
// al checkout, redirectToCheckout los vuelca al carrito como atributos ocultos
// (prefijo "_" → Shopify no los muestra al cliente) y vuelven en el webhook
// orders/create como note_attributes, donde se persisten en la tabla orders
// para los informes de /admin/analytics.

export const ATTRIBUTION_COOKIE = "pj_attr";
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90; // 90 días

export type AttributionTouch = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  gclid?: string;
  fbclid?: string;
  landing?: string;
  referrer?: string;
  at?: string;
};

export type Attribution = {
  first?: AttributionTouch;
  last?: AttributionTouch;
};

export function parseAttribution(
  raw: string | undefined | null,
): Attribution | null {
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Attribution;
    } catch {
      // Cookie corrupta o de un formato anterior: se ignora.
    }
  }
  return null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

// Atributos del carrito para el checkout. Claves con "_" → ocultas para el
// cliente pero presentes en el pedido (note_attributes / customAttributes).
export function attributionToCartAttributes(
  attribution: Attribution,
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const push = (key: string, value: string | undefined) => {
    const trimmed = value?.trim().slice(0, 250);
    if (trimmed) out.push({ key, value: trimmed });
  };

  const last = attribution.last ?? {};
  const first = attribution.first ?? {};
  push("_utm_source", last.source);
  push("_utm_medium", last.medium);
  push("_utm_campaign", last.campaign);
  push("_utm_term", last.term);
  push("_utm_content", last.content);
  push("_gclid", last.gclid ?? first.gclid);
  push("_fbclid", last.fbclid ?? first.fbclid);
  push("_landing_page", last.landing);
  push("_referrer", last.referrer);
  push("_first_utm_source", first.source);
  push("_first_utm_medium", first.medium);
  push("_first_utm_campaign", first.campaign);
  push("_first_landing_page", first.landing);
  push("_first_referrer", first.referrer);
  return out;
}
