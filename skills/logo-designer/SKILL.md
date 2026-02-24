---
name: logo-designer
description: |
  Design and iterate on logos using SVG. Use this skill when the user asks to
  "create a logo", "design a logo", "make me a logo", "iterate on this logo",
  "logo for my project", or discusses logo design, branding icons, or wordmarks.
version: 1.0.0
license: MIT
---

# Logo Designer

Design and iterate on logos using SVG. Generates side-by-side previews and exports to PNG at standard sizes.

## Phase 1: Interview

Before generating anything, ask the user these questions **one at a time**:

1. **Brand name** — What name should appear in the logo (if any)?
2. **Purpose/vibe** — What is this logo for? What feeling should it convey? (e.g., "a developer tool that feels fast and minimal", "a kids' learning app that's playful and colorful")
3. **Style** — What style direction? Offer these as starting points:
   - Minimal / geometric
   - Playful / hand-drawn
   - Bold / corporate
   - Retro / vintage
   - Organic / natural
   - Or "surprise me"
4. **Color preferences** — Any specific colors, or "surprise me"?
5. **Format** — Icon only (512x512), wordmark only (1024x512), or combination mark (1024x512)?

Keep the interview conversational. If the user gives a rich initial description, skip questions they've already answered. Move to Phase 2 once you have enough to generate distinct concepts.

## SVG Conventions

When generating SVG logos, follow these rules:

- **viewBox sizing** — Always use `viewBox="0 0 W H"` without fixed `width`/`height` attributes. Use 512x512 for icons, 1024x512 for wordmarks/combination marks.
- **Self-contained** — No external fonts, images, or `<use>` references to other files. Everything inline.
- **Text handling** — Use widely available system fonts (Arial, Helvetica, Georgia, etc.) or convert text to `<path>` elements. When using system fonts, always include a generic fallback (e.g., `font-family="Helvetica, Arial, sans-serif"`).
- **Meaningful groups** — Wrap logical sections in `<g>` elements with descriptive IDs: `id="icon"`, `id="wordmark"`, `id="tagline"`. This makes iteration easier when the user says "make the icon bigger" or "change the wordmark color".
- **Flat fills by default** — Use solid `fill` colors. Only use gradients (`<linearGradient>`, `<radialGradient>`) when the user requests them or the style clearly calls for it.
- **Clean markup** — No unnecessary transforms, no empty groups, no default namespace clutter. Keep the SVG readable.
