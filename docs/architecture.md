# Agent System Experiment

This branch separates the existing logo skill into agent guidance, deterministic
workflow code, artifact operations, and integration adapters. It implements the
first maintenance step toward the supplied extensible-agent-system plan. The opt-in managed workflow now persists design state and guards transitions. The
standalone workflow remains available; neither mode introduces an independent model loop.

## Ownership

All runtime resources remain inside `skills/logo-designer/`, so the complete skill
folder can be installed or copied without relying on the repository around it.

| Location inside the skill | Responsibility |
| --- | --- |
| `SKILL.md` | Capability discovery, workflow selection guidance, shared boundaries |
| `references/workflows/` | Agent instructions for design, refinement, export, canvas review, and repo integration |
| `references/svg-conventions.md` | Creative SVG constraints |
| `references/preview.md` and `assets/preview.html` | Preview assembly guidance and reusable HTML |
| `scripts/lineage-handoff.mjs` | Stable stdin CLI and backward-compatible module exports |
| `lib/workflows/lineage-handoff.mjs` | Receipt consumption, persistence ordering, exit codes, and result guidance |
| `lib/integrations/lineage-receipt.mjs` | External receipt versions, shapes, and identity validation; no filesystem effects |
| `lib/artifacts/clean-svg.mjs` | Strict validation of accepted Lineage SVGs |
| `lib/artifacts/iterations.mjs` | Collision-safe publication, synchronization, readback, and hashing |
| `scripts/export.sh` | Stable export command, output families, source copies, and size loop |
| `lib/integrations/svg-renderer.sh` | Converter detection and vendor-specific rendering arguments |

The dependency direction is CLI → workflow → integration validation and artifact
storage. The receipt validator calls SVG validation. Low-level modules do not call
the host agent or choose the next design phase. The iteration writer expects a
validated SVG; callers should enter through the handoff workflow.

## Managed Workflow

The explicit experimental mode enters through `scripts/task.mjs`. Its pure workflow
is `lib/workflows/design.mjs`; `contracts.mjs` supplies argument schemas used by both
validation and model context. `lib/state/task-store.mjs` owns revisioned snapshots,
locking, events, and replay receipts. `lib/harness/context.mjs` exposes relevant
state and allowed actions. `execute-action.mjs` validates proposals, records operation
intent, executes effects, and applies verified outcomes.

The artifact registry records immutable copies and hashes. Managed export verifies
PNG data and dimensions, saves a manifest, and supports recovery after publication.
A bounded built-in PNG decoder keeps copied skills self-contained without runtime
package installation. It supports static non-interlaced 8-bit PNGs; unsupported
variants fail explicitly. This is a deliberate alternative to adding a decoder
package to each installed skill.

See [the managed workflow reference](../skills/logo-designer/references/workflows/managed.md)
for commands, limits, and recovery. [Evaluation guidance](../evals/README.md) separates
scripted contract checks from live-model and visual evaluation.

## Standalone Mapping to the One-Pager

- **Profiles:** The plugin manifest and skill frontmatter provide discovery.
  There is no permission-scoped profile registry in this package.
- **Router and planner:** The host agent interprets the user's turn and reads the
  applicable workflow reference. This is guidance, not a validated action contract.
- **Workflows:** Design phases remain agent-driven. The Lineage handoff is a coded
  operation with enforced validation-before-write and readback-before-success.
- **Gateway:** The host controls tool access. Bundled commands validate their own
  inputs to the extent implemented; there is no shared authorization gateway.
- **State:** SVGs persist artifact evidence; Lineage receipts are emitted to stdout and are not automatically logged by that command. They do not persist the
  design brief, selected concept, paused question, or workflow revision.
- **Presentation:** Lineage continuation facts come from verified stored bytes.
  Preview assembly and interpretation remain agent-driven. Export still reports
  renderer completion without independently reading PNG dimensions.
- **Tests and evals:** Node tests cover deterministic behavior and relocated skill
  execution. A model-driven multi-turn evaluation harness remains future work.

## Compatibility and Limits

The existing command paths, handoff import surface, receipt shapes, exit codes,
renderer preference order, and output naming are preserved. The original preview
HTML was extracted unchanged. Mode-specific instructions are loaded as needed;
question and delegation examples now defer to available host tools and permissions.
Repo integration follows the requested delivery scope, including branch-only work.
The handoff CLI also resolves its entry path through symlinks so copied installations
run correctly under paths such as macOS `/var`.

Receipt replay still creates a fresh iteration, as before. Collision safety is not
idempotency. Lineage opt-in is an agent instruction; the local command cannot prove
user authorization. Export retains its existing renderer behavior, including the
`npx` fallback and differing aspect-ratio handling between backends.

## Validation and Remaining Experiments

Run `npm test`, `npm run validate:md`, and `npm run validate:skills` from the repo.
Tests use synthetic adapter receipts and a fake renderer, so they do not require a
live canvas, install converter packages, or establish visual PNG fidelity.

Run `npm run eval:managed` for a saved multi-process contract trace with a synthetic
PNG renderer. The managed runtime has tests for state, revisions, questions,
artifacts, recovery, cancellation, and decoded exports. A real-renderer smoke check also passed for simple geometry; repeated live-model
scenarios and broader visual checks remain pending before default adoption. Managed
Lineage integration, a provider-driven model loop, and permission-scoped profiles
remain future work.
