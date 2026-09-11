# Logo Designer Skill

A Claude Code plugin for iterative logo design using SVG. Guides you through a structured interview, exploration, and refinement process to produce polished logos exported as PNGs.

> **Read the full walkthrough:** [Claude Code SVG Logo Design: A Reusable Skill for Generating Logos](https://neonwatty.com/posts/logo-designer-skill-claude-code/) — how the skill was built and how to use it end-to-end.

## Installation

Clone once, then launch Claude Code with the plugin loaded for that session:

```bash
git clone https://github.com/neonwatty/logo-designer-skill.git
claude --plugin-dir ./logo-designer-skill
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

### Bleep That Sh*t

The skill produced five initial concepts and 37 iterations for Bleep That Sh*t! The four images below show three of those initial concepts alongside the finished design.

| Concept 1 | Concept 2 | Concept 3 | Finished design |
| :---: | :---: | :---: | :---: |
| <img src="site/assets/examples/concept-1.svg" alt="Bleep speech bubble concept" width="180"> | <img src="site/assets/examples/concept-2.svg" alt="Bleep waveform concept" width="180"> | <img src="site/assets/examples/concept-3.svg" alt="Bleep muted speaker concept" width="180"> | <img src="site/assets/examples/finished.svg" alt="Finished Bleep logo" width="180"> |

[Visit Bleep That Sh*t!](https://bleepthat.sh)

The skill was also used to design the logo for [BugDrop](https://github.com/neonwatty/bugdrop), a GitHub feedback widget.

## Found a logo you like? Fine-tune it with your agent

Try out our shared visual canvas to adjust shape, size, color, and spacing together - without constantly regenerating the whole logo.

[**Fine-tune your logo in Lineage Logo →**](https://github.com/lineagehq/lineage-logo)

[![Audio Cut fine-tuning demo: adjust logo colors, size, shape, and positioning in Lineage Logo](site/assets/polishing/audio-readme.gif)](https://neonwatty.github.io/logo-designer-skill/#polish)

## License

MIT
