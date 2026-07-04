// Envío estimado que mostramos en la UI del carrito (Next). El coste real lo
// calcula Shopify en el checkout según la dirección; esto es solo la estimación
// que enseñamos ANTES de conocer la dirección, deducida por geo-IP (cabeceras
// de Vercel). Best-effort: si la IP falla, manda el checkout de Shopify.
//
// Reglas + tarifas (decisión del usuario, jul-2026; espejo de lo configurado
// en Shopify):
//   · España Península + Baleares → gratis desde 35 €, si no 5,90 €
//   · Canarias, Ceuta y Melilla    → gratis desde 100 €, si no 14,90 €
//   · Resto de la UE + Reino Unido → gratis desde 100 €, si no 14,90 €
//   · Resto del mundo              → sin envío gratis prometido (zona oculta)
//
// ⚠️ Reino Unido: el mercado/envío aún no existe en Shopify (pendiente); la UI
// lo estima igual que la UE, pero el checkout de GB puede no funcionar todavía.

export const ES_MAINLAND_THRESHOLD = 35;
export const HIGH_THRESHOLD = 100;

const ES_MAINLAND_SHIPPING = 5.9;
const HIGH_ZONE_SHIPPING = 14.9;

export type ShippingZone = {
  // Umbral (€) a partir del cual el envío es gratis en esta zona.
  threshold: number;
  // Coste estimado (€) por debajo del umbral, en euros.
  estimated: number;
};

// Subdivisiones ISO 3166-2:ES (tal como las reporta el geo-IP de Vercel/MaxMind)
// de los territorios que tributan al umbral de 100 € en vez de 35 €. Metemos
// tanto el código de comunidad como el de provincia porque la fuente puede
// devolver cualquiera de los dos niveles.
const ES_HIGH_THRESHOLD_REGIONS = new Set([
  "CN", // Canarias (comunidad)
  "GC", // Las Palmas
  "TF", // Santa Cruz de Tenerife
  "CE", // Ceuta
  "ML", // Melilla
]);

// UE (sin ES) + Reino Unido. Alpha-2 en mayúsculas.
const EU_UK = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "SE", // UE menos España
  "GB", // Reino Unido
]);

// Devuelve la zona de envío (umbral + coste estimado) para el destino detectado,
// o null si no ofrecemos envío gratis allí (→ ocultar la UI de envío).
export function shippingZone(
  country: string | undefined | null,
  region: string | undefined | null,
): ShippingZone | null {
  const c = (country ?? "").toUpperCase();
  const r = (region ?? "").toUpperCase();

  if (c === "ES") {
    return ES_HIGH_THRESHOLD_REGIONS.has(r)
      ? { threshold: HIGH_THRESHOLD, estimated: HIGH_ZONE_SHIPPING }
      : { threshold: ES_MAINLAND_THRESHOLD, estimated: ES_MAINLAND_SHIPPING };
  }
  if (EU_UK.has(c)) {
    return { threshold: HIGH_THRESHOLD, estimated: HIGH_ZONE_SHIPPING };
  }
  return null;
}
