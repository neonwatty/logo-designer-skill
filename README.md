# Logo Designer Skill

[![Discord](https://img.shields.io/badge/Discord-Join%20Server-7289da?style=flat&logo=discord&logoColor=white)](https://discord.gg/7xsxU4ZG6A)

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

## Optional Lineage Canvas Review

The standalone workflow and `logos/preview.html` remain the default. Lineage integration
is never activated by discovery; it runs only when you explicitly request canvas review
and provide the Lineage checkout or adapter command.

For that opt-in workflow, pipe the Lineage adapter's versioned JSON receipt into the
skill's stdin-only `scripts/lineage-handoff.mjs` command with an explicit absolute
`--logos` directory. Invoke the adapter through `npm --silent run agent:submit` so npm's
own lifecycle banner cannot contaminate the JSON pipe. The handoff does not start or locate Lineage and accepts no token or
API origin. Only an accepted, identity-matched receipt is atomically persisted as the
next collision-safe `logos/iterations/iteration-N.svg`. Its metadata-only result reports
the relative iteration path, byte count, and SHA-256 hash after file data and supported
directory metadata are synchronized. Pre-transaction invalid/unavailable receipts use
typed envelopes without invented transaction or document identity. Continue refinement from that
verified persisted iteration and regenerate the normal preview. Terminal rejection,
revert, stale, unavailable, conflict, timeout, and invalid results create no iteration;
temporary editor disconnections remain in the same bounded wait so a reconnected canvas
cannot accept work after the skill has stopped listening. Conflict and timeout are never
automatically resubmitted. If an accepted receipt cannot be persisted locally, the handoff
returns exit 27 with the exact transaction identity and artifact hash; fix storage and rerun
the same adapter command with that transaction ID and artifact rather than creating a new
transaction. If the canvas
reports that its local server was replaced during provisional acceptance, inspect it
and use its explicit restore action before starting any new handoff; the locked canvas
must not be treated as accepted or reverted without authoritative evidence.

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
