#!/usr/bin/env bash
# Genera las 2 fotos de producto para una lista de colores (monocolor).
# Corre varios colores en paralelo (MAXP). Uso: bash tools/recolor/batch.sh
set -u
cd "$(dirname "$0")/../.."

MAXP="${MAXP:-4}"
RES="${RES:-2K}"

# Paleta: "<nombre legible> #HEX"  (el nombre va al prompt y al nombre de carpeta)
# Hex muestreados de public/sample colors.png (albedo difuso real de cada cuenta)
colors=(
  "magenta #B02F62"
  "deep jet black, not grey #000000"
  "bright orange #F45F0F"
  "emerald green #287F47"
  "violet purple #4F3A92"
  "chartreuse green #97A947"
  "grass green #4CA227"
  "cobalt blue #043E9E"
)

echo "▶ Batch de ${#colors[@]} colores · ${RES} · paralelismo ${MAXP}"
for c in "${colors[@]}"; do
  node tools/recolor/recolor.mjs --color "$c" --resolution "$RES" 2>&1 | sed "s/^/[$c] /" &
  while [ "$(jobs -r | wc -l | tr -d ' ')" -ge "$MAXP" ]; do sleep 2; done
done
wait
echo "✅ BATCH DONE — $(ls -1 tools/recolor/resultados | wc -l | tr -d ' ') carpetas de color"
