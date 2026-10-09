# Managed Logo Workflow (Experimental)

Use this mode only when the user explicitly requests the managed/persisted workflow
or is experimenting with this agent-system branch. Default design requests continue
using the standalone workflows. The managed command owns task state; the host model
still interprets requests and creates candidate SVGs.

## Start from Real Concepts

Gather the brief and generate concepts using [design](design.md) and
[SVG conventions](../svg-conventions.md). Put input SVGs inside the user's logos
workspace. Managed input paths are relative to that workspace and cannot traverse
symlinks or escape it. Use standalone SVGs with a positive `viewBox`; active content,
external references, and inline style attributes are rejected. Icon viewBoxes must
be square. For combination marks, include a separate square icon as an import.

Run the bundled command with an explicit absolute workspace. Every invocation reads
one JSON document from stdin and emits one JSON result on stdout:

```bash
node <path-to-skill>/scripts/task.mjs --logos /absolute/path/to/logos <<'JSON'
{
  "version": 1,
  "kind": "start",
  "taskId": "my-logo",
  "requestId": "start-1",
  "expectedRevision": 0,
  "payload": {
    "brief": { "format": "icon", "description": "Minimal blue project logo" },
    "sources": [{ "id": "concept-1", "path": "concepts/concept-1.svg", "kind": "logo" }]
  }
}
JSON
```

Formats are `icon`, `wordmark`, and `combination`. Import IDs must be unique. Sources
have kind `logo` or `icon`. No concepts are discovered or selected implicitly.

## Each User Turn

1. Read context with `{"version":1,"kind":"context","taskId":"my-logo"}`.
2. Use the latest user message to propose an allowed `userEvent`; validate its
   arguments against the schemas returned in context. A model-extracted event must
   reflect the user's actual request. The command checks contracts, not user identity.
3. Read the returned revision and allowed actions. Propose at most one action at
   that revision. Use the next returned context before another action.
4. Present only recorded outcomes. Use the read-only `finish` action for terminal
   presentation; successful exports are checked again before it returns.

Mutating command envelopes carry `version`, `kind`, `taskId`, a unique `requestId`,
`expectedRevision`, and `payload`. A named event/action payload has `type` and
`arguments`. Preserve the entire envelope when retrying: the same request ID with
changed arguments or revision is a conflict. An exact completed replay returns its
saved receipt; returned context may describe a later revision.

For example, after reading revision 2, selecting an offered artifact is:

```json
{
  "version": 1,
  "kind": "userEvent",
  "taskId": "my-logo",
  "requestId": "select-1",
  "expectedRevision": 2,
  "payload": { "type": "selectArtifact", "arguments": { "artifactId": "concept-1" } }
}
```

The revision above is illustrative. Always use the observed revision.

## Event and Action Boundaries

| Kind | Type | Arguments and effect |
| --- | --- | --- |
| `userEvent` | `selectArtifact` | `artifactId` from offered artifacts; verifies its stored bytes |
| `userEvent` | `requestRefinement` | `instruction`; freezes the selected base and its hash |
| `action` | `submitRefinement` | `refinementId`, `baseSha256`, and `source` with a new ID, candidate path, and kind `logo` |
| `userEvent` | `requestExport` | Selected `artifactId`, `iconId` or null, and unique `sizes` |
| `action` | `renderExport` | Empty arguments; executes the saved export request |
| `action` | `askUser` | Fresh `questionId`, `prompt`, and `choices`; saves a pause |
| `userEvent` | `answerQuestion` | Current `questionId` and an offered `answer`; resumes the saved phase |
| `userEvent` | `cancel` | Empty arguments; prevents subsequent success transitions |
| `action` | `finish` | Empty arguments; read-only, terminal tasks only |

Use clarification for ambiguity; never silently choose an artifact. A saved answer
resumes the prior phase but does not itself select an artifact. Apply a matching
selection event when the answer establishes that choice. If the user supplies a
response outside the saved choices, do not invent an allowed answer; explain the
current choices or cancel and start a new task if the workflow no longer fits.

Write refinements to separate candidate files, never overwrite registered artifacts.
The command registers the candidate and offers it alongside earlier logos. It does
not automatically select the newest file. Create previews from offered artifact
paths using [preview assembly](../preview.md); preview HTML is derived presentation.

## Export and Recovery

Managed export uses installed `resvg`, `rsvg-convert`, or Inkscape, in that order.
It does not use the legacy script's automatic `npx` fallback. Each renderer call is
bounded to 30 seconds. Sizes range from 1 to 2048, with at most 12 per request;
computed heights above 4096 are rejected. Complete logo aspect ratio is preserved.
Combination-mark exports require an imported square icon and produce both families.

Code checks PNG CRCs, decompresses and reconstructs scanlines, verifies dimensions,
and saves byte counts and SHA-256 hashes. The bundled bounded decoder supports
static, non-interlaced 8-bit grayscale, RGB, palette, grayscale-alpha, and RGBA PNGs;
unsupported output is an error, not a verified export. This is file validity and
identity verification, not an assessment of design quality or font fidelity.

Exit 0 means the command succeeded. Exit 1 reports rejected input or a command
error, with current context when available. Exit 2 reports a pending operation;
inspect `pendingOperation.status` and `failure`. Do not describe it as complete.

- On `REVISION_CONFLICT`, reload context and formulate a new request ID and proposal.
- On an exact pending replay, inspect the current operation rather than resubmitting
  the side effect. `recover` takes `{"operationId":"<observed ID>"}` as its payload
  and requires a new request ID plus the current revision.
- Recovery refuses to compete with a possibly live owner. After a failure, fix the
  cause, then recover once and inspect the result. A published bundle is verified
  and adopted; it is never silently overwritten. Corrupt published outputs require
  cancelling/reconciling the task and starting a fresh task, or explicit diagnosis.
- A cancellation with a pending operation still needs reconciliation. Wait for its
  owner to finish, or recover after the owner exits. No success transition follows.
- For a dead store-lock owner, `{"version":1,"kind":"unlock","taskId":"my-logo"}`
  permits explicit same-host dead-process recovery. Live/ambiguous owners are not
  displaced. An interrupted lock-recovery guard itself requires manual diagnosis.

## Durable Records and Task Lifecycle

The workspace contains:

```text
logos/.logo-designer/
  task.json                  # State, revision, events, requests, operation intent
  artifacts/<sha256>.svg      # Immutable registered copies
  exports/<operation-id>/    # Verified PNG bundle and manifest.json
  archives/<task-id>.json    # Explicitly archived terminal task
```

Do not edit `task.json` or infer state from conversation memory. The store retains
up to 512 events, 32 artifacts, a 4 MiB state file, and 64 KiB commands. It rejects
unsupported state/workflow versions and reserves event capacity for cancellation
and recovery. Stored hashes describe verified bytes; later external edits are
reported when the artifact is used or an export is checked by `finish`.

One task is active per workspace. To archive a reconciled terminal task, send a
normal mutating envelope with kind `archive` and empty payload. Start again at
revision zero with a new task ID. Artifact files remain available after archival.
Alternatively use a separate workspace. Archived task IDs cannot be reused.

These contracts apply to the managed command. The host still has file tools; this
mode does not sandbox the model or make legacy export/Lineage commands state-aware.
Managed Lineage submission and automatic migration of old state are deferred.
