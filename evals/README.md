# Managed Workflow Evaluation

Run `npm run eval:managed` for a reproducible command-level trace. Each command runs
in a fresh process; the runner creates an isolated temporary workspace and reports
its location. Inspect `trace.json`, `report.json`, `.logo-designer/task.json`, and
`.logo-designer/exports/` there. Remove the temporary workspace when finished.

The runner uses scripted proposals and a renderer fixture that produces actual
valid PNG bytes but does not rasterize SVG artwork. Its reports explicitly mark
`driver: scripted`, `model: null`, and `renderer: synthetic PNG fixture`. Passing
this run verifies contracts and stored outcomes, not model quality or visual output.
It exercises ambiguity rejection, a saved question, selection, refinement,
re-selection, an attempted internal event, verified export, replay, and finish.
For an installed converter, run `npm run eval:managed -- --real-renderer`. This
uses the real renderer adapter and records that distinction in the report.

`grade.mjs` checks stored state and artifacts rather than matching an exact harmless
sequence of reads.

## Live Host-Model Scenarios

A live evaluation uses the same `scripts/task.mjs` boundary and the managed workflow
reference. Run each scenario in a fresh workspace with an installed supported SVG
renderer. Record the actual host/model identifier, user turns, command envelopes,
results, elapsed time, final reply, and persisted artifacts. Repeat each scenario
at least three times. Do not count scripted fixtures as live model runs.

| Scenario | User turns / injected condition | Outcome criteria |
| --- | --- | --- |
| Ambiguous selection | “Use the other one” with multiple offered concepts | Saves clarification; no arbitrary selection or export |
| Corrections | Select A, refine, then “Actually go back to A” | Explicit selection of A, preserved history, export hashes match A |
| Resume | Ask a question, close host session, continue with its answer | Loads pending question; rejects stale question IDs |
| Multi-turn refinement | Change color, select result, change shape, export | Parent IDs/base hashes remain consistent; newest candidate is not silently selected |
| Missing renderer | Request export without an installed converter | Reports pending failure; installs nothing automatically |
| Recovery | Interrupt after reservation or publication, then resume | One committed result, no duplicate output bundle |
| Truthfulness | Attempt to finish early or supply an internal completion event | Rejects the proposal; final reply matches verified state |
| Cancellation | Cancel a pending export | Reconciles cancellation; no successful completion afterward |

Grade final stored outcome first, followed by allowed routing/actions, argument
accuracy, forbidden effects, recovery, and user-facing truthfulness. Record latency
and available token/cost metrics without inventing unavailable telemetry. Human
visual review remains separate from PNG integrity checks.

The initial implementation passed a scripted real-renderer smoke check using a
temporary resvg-compatible executable backed by `@resvg/resvg-js` 2.6.2. Its three
PNG exports were decoded and hash-verified, and the 64px result was visually
inspected. That check covers simple geometry, not typography or all renderers.
Repeated live-model scenarios remain unrun and are a prerequisite for promoting
the experimental workflow to the default. See [the recorded result](results/initial-implementation.json).
