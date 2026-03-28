# Logo Designer Skill

A Claude Code plugin for iterative logo design using SVG. Guides you through a structured interview, exploration, and refinement process to produce polished logos exported as PNGs.

> **Read the full walkthrough:** [Claude Code SVG Logo Design: A Reusable Skill for Generating Logos](https://neonwatty.com/posts/logo-designer-skill-claude-code/) — how the skill was built and how to use it end-to-end.

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

## Examples

### [Live Showcase: Bleep That Sh*t!](https://neonwatty.github.io/logo-designer-skill/)

A complete, real-world example showing the skill in action: 5 initial concepts, 37 iterations across 10 design phases, ending with a polished comic book-styled logo — all in ~10 minutes of conversation.

The skill was also used to design the logo for [BugDrop](https://github.com/neonwatty/bugdrop), a GitHub feedback widget.

## License

MIT
