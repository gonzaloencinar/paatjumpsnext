/**
 * Prompts maestros para recolorear la cuerda de saltar con cuentas (beads) de Paat Jumps.
 *
 * Producto: "beaded skipping rope" / comba segmentada. Cuentas cilíndricas de plástico
 * brillante ensartadas en un cable de acero recubierto negro, con dos mangos de aluminio
 * negro mate grabados con el wordmark en script blanco "Paat Jumps".
 *
 * Estrategia: usamos GPT Image 2 en modo IMAGE-TO-IMAGE (edición). La COMPOSICIÓN, la luz,
 * los mangos, el logo, el cable y el fondo los aporta la propia imagen de referencia: por eso
 * el prompt operativo NO describe la escena, solo da la INSTRUCCIÓN DE EDICIÓN (recolorear las
 * cuentas y no tocar nada más). El MASTER_PROMPT de abajo es la descripción completa de la
 * escena, para documentación o por si algún día se quiere generar text-to-image desde cero.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Descripción maestra de la escena (documentación / text-to-image opcional)
// ─────────────────────────────────────────────────────────────────────────────
export const MASTER_PROMPT = [
  "Professional studio product photograph of a beaded skipping rope (segmented jump rope).",
  "The rope is made of short glossy cylindrical plastic beads threaded on a thin black",
  "coated-steel cable, with two matte-black cylindrical aluminium handles, each engraved with",
  "the white cursive script wordmark 'Paat Jumps'.",
  "Dark charcoal, near-black seamless background with a soft radial vignette, premium",
  "high-end e-commerce lighting, crisp focus, subtle soft reflections and shadows.",
  "Square 1:1 format, photorealistic, commercial quality.",
].join(" ");

// Notas por estilo (descriptivo, para documentación). La clave coincide con el nombre del
// fichero de referencia (sin extensión, en minúsculas): fotoproductoprincipal / fotoproductosecundaria.
export const STYLE_NOTES = {
  fotoproductoprincipal: {
    label: "Principal · packshot cenital",
    note: [
      "Top-down flat-lay. The rope is neatly coiled into several concentric oval loops that",
      "fill the frame; the two handles lie parallel and vertical, side by side, in the dead",
      "centre pointing downward; the black cable tail loops at the bottom-centre. Symmetrical.",
    ].join(" "),
  },
  fotoproductosecundaria: {
    label: "Secundaria · macro de detalle",
    note: [
      "Extreme close-up hero shot of the two parallel handles laid diagonally across the lower",
      "centre, logos sharp and legible; the coiled beaded rope wraps around the upper and side",
      "edges, rendered with a shallow depth of field so the beads fall softly out of focus",
      "(bokeh). Dramatic, premium, tactile.",
    ].join(" "),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt operativo (el que se envía a GPT Image 2 image-to-image)
// ─────────────────────────────────────────────────────────────────────────────

const KEEP_INTACT =
  "Keep the composition, framing, the two matte-black handles, the white 'Paat Jumps' " +
  "cursive script logos, the black cable, the dark background, the lighting, reflections " +
  "and shadows EXACTLY as they are in the reference image. Do NOT alter the handles, the " +
  "logo or any text. Photorealistic result, identical to the original except for the bead colour.";

// Acabado de las cuentas: COMO EN EL PROMPT INICIAL — plástico brillante, sin añadidos.
const BEAD_FINISH =
  "Keep the same glossy plastic finish and specular highlights on every bead.";

/**
 * Construye la instrucción de recoloreado.
 * @param {Object} opts
 * @param {"mono"|"bicolor"} opts.mode
 * @param {string} opts.colorA  color principal (nombre libre o hex, p.ej. "rojo fuego" o "#E11D2A")
 * @param {string} [opts.colorB] segundo color (solo bicolor)
 * @returns {string}
 */
export function buildRecolorPrompt({ mode, colorA, colorB, finish, colorRefNote }) {
  const fin = finish || BEAD_FINISH; // permite override por color (p.ej. negro mate)
  const ref = colorRefNote ? [colorRefNote] : []; // guía de color por imagen de referencia extra
  if (mode === "bicolor") {
    if (!colorB) throw new Error("modo bicolor requiere colorA y colorB");
    return [
      "Edit this product photo.",
      `The ONLY change: recolour the cylindrical beads. Replace them with an alternating`,
      `two-colour pattern of ${colorA} and ${colorB}, following the same alternating rhythm`,
      `and bead layout as the original.`,
      ...ref,
      fin,
      KEEP_INTACT,
    ].join(" ");
  }
  // mono
  return [
    "Edit this product photo.",
    `The ONLY change: recolour ALL the cylindrical beads to a single uniform colour:`,
    `${colorA} (every bead exactly the same colour).`,
    ...ref,
    fin,
    KEEP_INTACT,
  ].join(" ");
}
