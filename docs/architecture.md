# Agent System Experiment

This branch separates the existing logo skill into agent guidance, deterministic
workflow code, artifact operations, and integration adapters. It implements the
first maintenance step toward the supplied extensible-agent-system plan. It does
not introduce an independent model loop or a persistent design state machine.

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

## Mapping to the One-Pager

- **Profiles:** The plugin manifest and skill frontmatter provide discovery.
  There is no permission-scoped profile registry in this package.
- **Router and planner:** The host agent interprets the user's turn and reads the
  applicable workflow reference. This is guidance, not a validated action contract.
- **Workflows:** Design phases remain agent-driven. The Lineage handoff is a coded
  operation with enforced validation-before-write and readback-before-success.
- **Gateway:** The host controls tool access. Bundled commands validate their own
  inputs to the extent implemented; there is no shared authorization gateway.
- **State:** SVGs and receipts persist artifact evidence. They do not persist the
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

## Validation and Next Experiment

Run `npm test`, `npm run validate:md`, and `npm run validate:skills` from the repo.
Tests use synthetic adapter receipts and a fake renderer, so they do not require a
live canvas, install converter packages, or establish visual PNG fidelity.

A subsequent experiment can introduce explicit design state, typed user events,
allowed actions, guarded transitions, verified export manifests, and replay keys.
Those are behavior changes and should have dedicated tests. Multi-turn evals should
then cover resume, corrections, concept switching, ambiguous selection, and failed
canvas review through the actual runtime. Add runtime layers when their contracts
are implemented rather than creating empty profile, harness, or task-store modules.
