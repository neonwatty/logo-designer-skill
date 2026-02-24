#!/usr/bin/env bash
set -euo pipefail

# Usage: export.sh <input.svg> <output-dir>
# Exports SVG to PNG at standard logo sizes using the best available tool.

INPUT_SVG="${1:?Usage: export.sh <input.svg> <output-dir>}"
OUTPUT_DIR="${2:?Usage: export.sh <input.svg> <output-dir>}"
SIZES=(16 32 48 192 512 1024 2048)
BASENAME="logo"

mkdir -p "$OUTPUT_DIR"

# Copy SVG to output
cp "$INPUT_SVG" "$OUTPUT_DIR/$BASENAME.svg"

# Detect available tool
TOOL=""
if command -v resvg &>/dev/null; then
  TOOL="resvg"
elif npx --yes @aspect-build/resvg --help &>/dev/null 2>&1; then
  TOOL="npx-resvg"
elif command -v node &>/dev/null && node -e "require('sharp')" &>/dev/null 2>&1; then
  TOOL="sharp"
elif command -v inkscape &>/dev/null; then
  TOOL="inkscape"
elif command -v rsvg-convert &>/dev/null; then
  TOOL="rsvg-convert"
else
  echo "ERROR: No SVG-to-PNG converter found."
  echo ""
  echo "Install one of the following:"
  echo "  npm install -g @aspect-build/resvg     (recommended)"
  echo "  brew install inkscape"
  echo "  brew install librsvg"
  exit 1
fi

echo "Using: $TOOL"
echo ""

for SIZE in "${SIZES[@]}"; do
  OUTPUT="$OUTPUT_DIR/${BASENAME}-${SIZE}.png"
  case "$TOOL" in
    resvg)
      resvg "$INPUT_SVG" "$OUTPUT" --width "$SIZE"
      ;;
    npx-resvg)
      npx --yes @aspect-build/resvg "$INPUT_SVG" "$OUTPUT" --width "$SIZE"
      ;;
    sharp)
      node -e "
        const sharp = require('sharp');
        sharp('$INPUT_SVG')
          .resize($SIZE, $SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile('$OUTPUT')
          .then(() => process.exit(0))
          .catch(e => { console.error(e); process.exit(1); });
      "
      ;;
    inkscape)
      inkscape "$INPUT_SVG" --export-type=png --export-filename="$OUTPUT" --export-width="$SIZE"
      ;;
    rsvg-convert)
      rsvg-convert -w "$SIZE" -o "$OUTPUT" "$INPUT_SVG"
      ;;
  esac
  echo "  Exported: ${BASENAME}-${SIZE}.png (${SIZE}x${SIZE})"
done

echo ""
echo "Done. Files in: $OUTPUT_DIR"
