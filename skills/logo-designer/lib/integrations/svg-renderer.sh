#!/usr/bin/env bash
# Sourced by export.sh. Detection sets TOOL; rendering accepts explicit arguments.

detect_svg_renderer() {
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
    return 1
  fi
}

render_svg_to_png() {
  local renderer="$1"
  local source="$2"
  local output="$3"
  local size="$4"

  case "$renderer" in
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
}
