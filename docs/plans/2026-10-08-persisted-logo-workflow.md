# Persisted Logo Workflow Experiment

Status: managed runtime and scripted contract evaluation implemented on the experiment branch. A real-renderer smoke check passed; repeated live-model evaluation remains pending before default adoption.

Continue on `codex/agent-system-experiment`, commit and push coherent milestones,
and do not open a PR. Preserve unrelated working-tree edits.

## Objective and Scope

Demonstrate the one-pager's state-ownership rule with one complete local workflow:
import existing concepts → select → refine → select the result → export → verify.
Code owns authoritative task state and validates transitions. The host model
interprets user requests, proposes typed events/actions, and creates candidate SVGs.

Keep JavaScript ESM, Node 20 compatibility, and the self-contained skill package.
Retain the existing export and Lineage commands as compatibility entry points.
Introduce the managed workflow as an explicit experimental mode first. Existing
standalone commands do not acquire state-machine guarantees automatically.

Defer a separate model provider client, profile registry, multiple simultaneous
tasks in one logo workspace, composite workflows, and managed Lineage submission.
Concept generation can remain model-driven; the experiment starts by registering
real concept files. Preview generation remains derived presentation, not task state.

The host still has filesystem tools. This design enforces contracts through the
managed command; it is not a sandbox preventing arbitrary edits by the host model.
Likewise, validating a model-extracted user event does not authenticate user intent.
The host remains responsible for connecting that event to an actual user request.

## Proposed Structure

All paths below are inside `skills/logo-designer/` unless stated otherwise.

```text
scripts/task.mjs                    # JSON stdin/stdout command boundary
lib/workflows/design.mjs            # Pure state/events/guards/transitions
lib/state/task-store.mjs            # Locking, revisions, atomic persistence
lib/harness/context.mjs             # Model-visible snapshot and allowed actions
lib/harness/execute-action.mjs      # Validate proposals and orchestrate operations
lib/artifacts/registry.mjs          # Stable IDs, immutable copies, hashes, lineage
lib/artifacts/export-manifest.mjs   # PNG readback and verified output records
references/workflows/managed.md    # Host instructions for the experimental mode

tests/                             # At repository root: contracts and recovery
evals/                             # At repository root: scenarios, runner, grading
```

Reuse the existing renderer adapter where its behavior matches the managed export
contract. Keep shared helpers narrow; do not add empty generic runtime layers.

## State and Storage Contract

Use an explicit absolute logos workspace and a versioned state file at
`logos/.logo-designer/task.json`. It contains the current snapshot, event records,
operation records, and replay receipts in one atomic document. This avoids treating
independently written snapshot and event-log files as a single transaction.

Store at least:

- `schemaVersion`, `workflowVersion`, `taskId`, and monotonic `revision`.
- `phase`, brief, registered artifact IDs, offered IDs, and selected artifact ID.
- Pending question with stable ID, permitted responses, and the phase to resume.
- Current refinement request with ID, requested change, and exact base artifact.
- Artifact records: relative path, SHA-256, bytes, kind, and parent artifact ID.
- Pending operation: operation ID, request digest, input hashes, expected outputs,
  status, and relevant failure/recovery data.
- Event records: sequence, request ID, event type, validated payload, resulting
  revision, and timestamp. Timestamps are diagnostic; revisions define ordering.
- Completed request receipts and a verified export manifest when present.

Keep managed immutable artifacts under `logos/.logo-designer/artifacts/`; candidates
remain writable staging inputs. Record paths relative to the explicit workspace.
Reject escaping paths and unsupported symlinks. Do not adopt whichever file happens
to have the highest iteration number. Import legacy files explicitly by path and
assign stable artifact IDs after reading and validating their bytes.

Use an exclusive per-workspace lock for short read/validate/commit transactions.
Check `expectedRevision` under that lock, write a temporary state file, sync it,
rename it atomically, and sync directory metadata where supported. Readers see a
complete old or new snapshot. A revision mismatch returns current context and
requires a new proposal; it never silently overwrites newer state.

Persist lock ownership. Do not steal a lock solely because it is old. An explicit
recovery command may clear a demonstrably dead same-host owner; ambiguous ownership
requires resolution before mutation. Keep rendering outside the short state lock.

The initial store is bounded: impose documented limits on state bytes, events,
artifacts, and input size. Reject a transition before effects if its records cannot
fit. Preserve history and replay receipts rather than silently pruning them.
Reject unsupported schema/workflow versions; migration is explicit future work.

## Workflow and Model Contracts

The pure workflow exposes `start`, `validateUserEvent`, `allowedActions`,
`transition`, and `isComplete`. It performs no I/O or model calls. The executor
supplies validated artifact facts and internal operation-result events.

| Phase | Trigger | Result |
| --- | --- | --- |
| `AWAITING_SELECTION` | Valid selection of an offered artifact | `READY` with exact selected ID |
| `READY` | User requests a refinement | `AWAITING_REFINEMENT` with frozen base and request |
| `AWAITING_REFINEMENT` | Matching candidate is validated and registered | `AWAITING_SELECTION` with result offered |
| `READY` | User requests export of the selected artifact | `EXPORT_READY` |
| `EXPORT_READY` | Executor verifies the complete export | `COMPLETE` with manifest |
| Any nonterminal phase | Clarification is required | `WAITING_FOR_USER` with saved question and resume phase |
| Any nonterminal phase | User cancels | `CANCELLED`, subject to pending-operation reconciliation |

Pending operations are recorded separately from the business phase. While an
operation is pending, expose only status/recovery/cancellation actions; reject a
competing refinement, selection, or export. A running cancellation is recorded as a
request and reconciled before completion; it must not be followed by a success
transition or a newly exposed export. Staged leftovers can be cleaned safely.

Selection must refer to an offered, registered, unchanged artifact. Refinement
submission must refer to the current request and base hash. Export must refer to
the selected artifact and its recorded hash. Missing or modified files produce a
recoverable error, not an implicit selection or successful export.

Unknown/ambiguous selections produce a clarification without selecting a default.
Responses to stale question IDs are rejected. Switching back to an earlier design
requires an explicit selection event. Completed/cancelled tasks reject further
design mutations; beginning another task must explicitly archive the old task.

The command accepts versioned envelopes with `requestId`, `taskId`,
`expectedRevision`, operation kind, and schema-validated payload. Command families:

- `start`: import supplied concepts and persist the initial task.
- `context`: return the current model-visible snapshot, without mutation.
- `userEvent`: validate a proposed selection, feedback, export, clarification
  response, or cancellation against the current state.
- `action`: execute one currently allowed action such as submitting a candidate,
  persisting a clarification question, or rendering an export.
- `recover`: reconcile one interrupted operation using its stored intent.

The model cannot submit internal events such as `exportVerified`, replace a state
object, choose the next revision, or mark the task complete. The executor produces
those events only after readback. `finish` is a read-only presentation action and
is available only for a terminal task.

## Context Passed to the Model

On every turn the host reads `context`, then the relevant workflow instructions.
Context contains the task ID and revision, brief, current phase, selected/offered
artifact metadata, pending question/request, recent verified result, and allowed
actions with argument schemas. Supply relevant SVG content through explicit file
reads when needed; omit the entire history, unrelated artifacts, and lock internals.

The host uses the latest user message and that snapshot to propose a user event.
After applying it, code returns refreshed context. The model then proposes at most
one action using that revision. The executor rechecks the action against current
state, performs it, records its result, and returns another snapshot.

There is no assumption that a model message changes state. A saved question survives
process restart, and answering it must go through its typed user event. A context
budget truncates optional history, never guards, pending questions, or allowed
action schemas. Requests carrying another task ID are rejected.

## Side Effects, Retries, and Recovery

Use `requestId` plus a canonical request digest for replay handling. Check a known
request before rejecting its old expected revision: an exact replay returns its
recorded result without new effects. Reusing an ID with different arguments fails.
A duplicate pending request returns its operation status and recovery path.

Reserve an operation in durable state before writing managed outputs. Derive its
private staging/output locations from its operation ID. Execute outside the lock,
then reacquire the lock, verify the same reservation and cancellation state, and
commit the verified outcome. Final receipts are saved with that state commit before
they are returned. Keep authoritative artifacts immutable.

For a crash after output publication but before the state commit, recover from the
recorded intent and read back the known output. Adopt it only when identity and
verification requirements match. If the renderer stopped before producing verifiable
outputs, rerender into private staging; never blindly overwrite a published bundle.
An interruption around state rename is reconciled by rereading the request record.
Do not claim generic exactly-once behavior for external systems.

Managed exports use unique output bundles and a persisted manifest of input hashes,
relative output paths, byte counts, dimensions, and hashes. Decode PNGs to verify
them; a converter exit code or PNG signature alone is insufficient. Choose a
portable decoder dependency during this milestone and test it with actual fixtures.
Use explicit installed renderer availability; do not make recovery install tools.

Define full-logo dimensions as requested width with preserved aspect ratio, and
standalone favicon/icon outputs as square. Require a registered square icon for
combination-mark favicon output. Keep this consistent across supported managed
renderers and leave legacy command behavior unchanged. A failed/partial export
cannot transition to `COMPLETE`; completion facts come from the stored manifest.

## Implementation Milestones

1. **Pure workflow and contracts.** Implement state/event/action schemas and guards.
   Test selection, ambiguity, feedback, clarification, cancellation, and forbidden
   transitions without filesystem or model dependencies.
2. **Store and artifact registry.** Add atomic revisioned commits, immutable imports,
   event/receipt recording, locking, and replay identity. Test concurrent processes,
   tampered artifacts, version rejection, and interrupted commits.
3. **Managed command and context.** Add the JSON command and one-action executor.
   Support import → selection → refinement registration → selection. Test a fresh
   process resuming a saved question and rejection of stale model proposals.
4. **Verified export and recovery.** Add operation reservations, isolated bundles,
   PNG verification, and manifest-driven completion. Inject failures before/after
   reservation, rendering, publication, state commit, and response delivery.
5. **Skill integration and evaluation.** Add the explicit experimental workflow
   reference and usage example. Keep old commands passing their tests. Exercise
   realistic host-model scenarios through the same managed command boundary.

Each milestone includes its tests and a branch push. Avoid one large unreviewable
commit. Do not promote experimental mode to the default until the complete trace
and restart/recovery cases are demonstrated.

## Evaluation and Completion Evidence

Deterministic tests must cover a complete stored outcome, invalid actions with no
effects, exact replay without duplicate outputs, conflicting request IDs, stale
revisions, concurrent mutation, stale question responses, cancellation during an
operation, modified/missing inputs, corrupt PNGs, and incomplete export bundles.
Retain the existing relocation tests and add one for the managed command.

Model scenarios cover ambiguous concept selection, changing a selected concept,
returning to an older iteration, multi-turn refinement, restart after a question,
missing renderer, export failure/recovery, and attempts to claim completion early.
Store scenario artifacts and command traces in isolated temporary workspaces.
Grade authoritative final state first, then arguments, forbidden effects, recovery,
and whether the final reply matches verified outputs. Accept different harmless
read sequences. Repeat live-model scenarios and report the model and run count;
scripted action fixtures are contract tests, not evidence of model behavior.

The evidence demo must show a fresh process loading a saved selection, a model
proposal validated against allowed actions, a verified export, and replay of the
same request returning the same receipt without creating another output bundle.
Report live-model evaluation availability separately from deterministic test
results. The working command, state file, event records, manifest, and trace should
make each transition inspectable without relying on conversation memory.
