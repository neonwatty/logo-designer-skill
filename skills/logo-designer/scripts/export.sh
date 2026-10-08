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

# Resolve bundled adapters from this script, independent of the caller's directory.
EXPORT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$EXPORT_SCRIPT_DIR/../lib/integrations/svg-renderer.sh"
detect_svg_renderer

echo "Using: $TOOL"
echo ""

render_svg() {
  local source="$1"
  local basename="$2"
  local size="$3"
  local output="$OUTPUT_DIR/${basename}-${size}.png"

  render_svg_to_png "$TOOL" "$source" "$output" "$size"
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
