// Maps human color names (Spanish + a few English) to display hex values, used
// to render color swatches for the "Color" facet. This is presentation only —
// the actual filter values still come from Shopify's facet data.
const COLOR_HEX: Record<string, string> = {
  negra: "#1c1c1c",
  negro: "#1c1c1c",
  blanca: "#f5f5f5",
  blanco: "#f5f5f5",
  gris: "#9ca3af",
  naranja: "#ea580c",
  amarilla: "#facc15",
  amarillo: "#facc15",
  roja: "#dc2626",
  rojo: "#dc2626",
  rosa: "#ec4899",
  fucsia: "#e11d8f",
  morada: "#9333ea",
  morado: "#9333ea",
  purpura: "#9333ea",
  violeta: "#7c3aed",
  azul: "#2563eb",
  celeste: "#38bdf8",
  turquesa: "#14b8a6",
  verde: "#16a34a",
  lima: "#84cc16",
  marron: "#92400e",
  beige: "#e7d8b1",
  dorada: "#d4af37",
  dorado: "#d4af37",
  plateada: "#c7cdd4",
  plateado: "#c7cdd4",
};

const normalize = (label: string) =>
  label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents

const STOP_WORDS = new Set(["y", "de", "con", "la", "el"]);

/**
 * Returns up to two hex colors found in a label. Handles multi-tone names like
 * "Rosa y Negra" so the swatch can render a split/gradient.
 */
export function swatchColors(label: string): string[] {
  const normalizedFull = normalize(label);
  const hexes: string[] = [];

  const exact = COLOR_HEX[normalizedFull];
  if (exact) hexes.push(exact);

  if (hexes.length < 2) {
    for (const token of normalizedFull.split(/[\s/\-,]+/)) {
      if (STOP_WORDS.has(token)) continue;
      const hex = COLOR_HEX[token];
      if (hex && !hexes.includes(hex)) {
        hexes.push(hex);
        if (hexes.length === 2) break;
      }
    }
  }

  return hexes;
}
