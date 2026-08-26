#!/usr/bin/env bash
set -euo pipefail

# Usage: export.sh <input.svg> <output-dir> [icon.svg]
# Exports SVGs to PNG at standard logo sizes using the best available tool.

INPUT_SVG="${1:?Usage: export.sh <input.svg> <output-dir> [icon.svg]}"
OUTPUT_DIR="${2:?Usage: export.sh <input.svg> <output-dir> [icon.svg]}"
ICON_SVG="${3:-}"
SIZES=(16 32 48 192 512 1024 2048)

mkdir -p "$OUTPUT_DIR"

copy_unless_same_file() {
  local source="$1"
  local target="$2"
  local source_path target_path

  source_path="$(cd "$(dirname "$source")" && pwd -P)/$(basename "$source")"
  target_path="$(cd "$(dirname "$target")" && pwd -P)/$(basename "$target")"
  if [[ "$source_path" != "$target_path" ]]; then
    cp "$source" "$target"
  fi
}

copy_unless_same_file "$INPUT_SVG" "$OUTPUT_DIR/logo.svg"
if [[ -n "$ICON_SVG" ]]; then
  copy_unless_same_file "$ICON_SVG" "$OUTPUT_DIR/icon.svg"
fi

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

render_svg() {
  local source="$1"
  local basename="$2"
  local size="$3"
  local output="$OUTPUT_DIR/${basename}-${size}.png"

  case "$TOOL" in
    resvg)
      resvg "$source" "$output" --width "$size"
      ;;
    npx-resvg)
      npx --yes @aspect-build/resvg "$source" "$output" --width "$size"
      ;;
    sharp)
      node - "$source" "$output" "$size" <<'NODE'
        const sharp = require('sharp');
        const [source, output, sizeText] = process.argv.slice(2);
        const size = Number(sizeText);
        sharp(source)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(output)
          .then(() => process.exit(0))
          .catch(e => { console.error(e); process.exit(1); });
NODE
      ;;
    inkscape)
      inkscape "$source" --export-type=png --export-filename="$output" --export-width="$size"
      ;;
    rsvg-convert)
      rsvg-convert -w "$size" -o "$output" "$source"
      ;;
  esac
  echo "  Exported: ${basename}-${size}.png (${size}x${size})"
}

for SIZE in "${SIZES[@]}"; do
  render_svg "$INPUT_SVG" "logo" "$SIZE"
done

if [[ -n "$ICON_SVG" ]]; then
  for SIZE in "${SIZES[@]}"; do
    render_svg "$ICON_SVG" "icon" "$SIZE"
  done
fi

echo ""
echo "Done. Files in: $OUTPUT_DIR"
