# SVG Conventions

When generating SVG logos, follow these rules:

- **viewBox sizing** — Always use `viewBox="0 0 W H"` without fixed `width`/`height` attributes. Use 512x512 for icons, 1024x512 for wordmarks/combination marks.
- **Self-contained** — No external fonts, images, or `<use>` references to other files. Everything inline.
- **Text handling** — Use widely available system fonts (Arial, Helvetica, Georgia, etc.) or convert text to `<path>` elements. When using system fonts, always include a generic fallback (e.g., `font-family="Helvetica, Arial, sans-serif"`).
- **Meaningful groups** — Wrap logical sections in `<g>` elements with descriptive IDs: `id="icon"`, `id="wordmark"`, `id="tagline"`. This makes iteration easier when the user says "make the icon bigger" or "change the wordmark color".
- **Flat fills by default** — Use solid `fill` colors. Only use gradients (`<linearGradient>`, `<radialGradient>`) when the user requests them or the style clearly calls for it.
- **Small-size legibility** — Logos must work at 16-32px (favicons). Prefer solid fills over thin strokes, avoid fine details that disappear at small sizes, and use `stroke-width` of 6+ for any outlines that need to remain visible. Test this mentally: if a detail won't survive being 32px wide, simplify it.
- **Clean markup** — No unnecessary transforms, no empty groups, no default namespace clutter. Keep the SVG readable.
