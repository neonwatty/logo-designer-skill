---
name: logo-designer
description: |
  Design and iterate on logos using SVG. Use this skill when the user asks to
  "create a logo", "design a logo", "make me a logo", "iterate on this logo",
  "logo for my project", or discusses logo design, branding icons, or wordmarks.
license: MIT
---

# Logo Designer

Design and iterate on logos using SVG, with side-by-side previews and PNG exports.
The agent owns creative direction, feedback interpretation, and visual review.
Bundled commands handle rendering and validated Lineage artifact persistence.

## Choose the Workflow

Read only the references needed for the user's current request. Continue from the
selected artifact and existing conversation context; an edit or export request does
not require restarting the interview.

| Request | Guidance to read |
| --- | --- |
| Explicit managed/persisted workflow experiment | [Managed workflow](references/workflows/managed.md) |
| New logo or distinct concepts | [Design](references/workflows/design.md) |
| Modify an existing SVG or explore variations | [Refine](references/workflows/refine.md) |
| Export a selected logo | [Export](references/workflows/export.md) |
| Explicit Lineage canvas review with a supplied checkout or adapter command | [Canvas review](references/workflows/canvas-review.md) |
| Put the logo into a project repo | [Repo integration](references/workflows/repo-integration.md) |

Read [SVG conventions](references/svg-conventions.md) when creating or changing an
SVG. Read [preview assembly](references/preview.md) when producing or updating the
comparison page; its HTML template lives in [assets/preview.html](assets/preview.html).

## Shared Boundaries

- Standalone SVG files and `logos/preview.html` are the default. Do not discover,
  start, or connect to Lineage unless the user explicitly requests canvas review
  and supplies the checkout or adapter command.
- Keep concepts under `logos/concepts/`, refinements under `logos/iterations/`, and
  final exports under `logos/export/`. Preserve prior iterations for comparison.
- Ask only for missing information that affects the requested work. Follow supplied
  direction and authorization rather than repeating completed interview steps.
- Use the host's available question and subagent tools with its normal permissions.
  Workflow references describe the design task; they do not grant tool permissions.
- Continue a Lineage handoff only from the verified `iterationPath` in its successful
  local persistence receipt. Follow terminal recovery guidance for other outcomes;
  never automatically resubmit after timeout or conflict.

## Bundled Commands

Resolve these paths relative to this skill's directory, independent of the user's
working directory. Keep the entire skill folder together when installing or copying
it: commands import supporting code from `lib/`.

- `scripts/export.sh <input.svg> <output-dir> [icon.svg]` renders standard PNG sizes.
  The export reference describes full-logo and standalone-icon preparation.
- `scripts/lineage-handoff.mjs --logos /absolute/path/to/logos` consumes one versioned
  adapter receipt on stdin and emits one metadata-only result. The canvas review
  reference describes invocation and recovery.

- `scripts/task.mjs --logos /absolute/path/to/logos` runs the explicit experimental
  managed workflow. Read its reference before use; code owns saved state and guards
  transitions for this command.

The standalone workflow still uses host-managed conversation context. The opt-in
managed workflow persists state, questions, revisions, replay receipts, and verified
exports. The host model proposes typed events/actions; code validates them. This
package does not include an independent model loop or a sandbox around host tools.
