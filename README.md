# Logo Designer Skill

A Claude Code plugin for iterative logo design using SVG. Guides you through a structured interview, exploration, and refinement process to produce polished logos exported as PNGs.

## Installation

```bash
claude plugin add neonwatty/logo-designer-skill
```

## Usage

The skill activates automatically when you ask Claude to design a logo. Try prompts like:

- "Create a logo for my project"
- "Design a logo for Moonbeam"
- "Make me a logo"

## Workflow

The skill walks you through four phases:

1. **Interview** -- Claude asks about your brand, audience, and aesthetic preferences.
2. **Explore** -- Generates 3-5 distinct SVG concepts displayed in a side-by-side preview.
3. **Refine** -- Iterate on your chosen direction with adjustments to color, layout, and detail.
4. **Export** -- Renders final PNGs at standard sizes: 16, 32, 48, 192, 512, 1024, and 2048 px.

## PNG Export Prerequisites

The export step requires one of the following SVG-to-PNG tools. The skill auto-detects which is available.

| Tool | Install command |
|------|----------------|
| **resvg** (recommended) | `npm install -g @aspect-build/resvg` |
| Inkscape | `brew install inkscape` |
| librsvg | `brew install librsvg` |

## License

MIT
