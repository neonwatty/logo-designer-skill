# Lineage Canvas Review (Explicit Opt-in Only)

Standalone SVG files and `logos/preview.html` are always the default. Do not look for,
start, or connect to Lineage merely because it may be installed or a runtime descriptor
exists. Use Lineage only after the user explicitly asks for canvas review and provides
the Lineage checkout or adapter command.

For an explicit review, keep the handoff one-way and public-boundary-only. Run the
Lineage adapter with an explicit artifact, selector, and target, then pipe its single
versioned JSON receipt to the bundled stdin-only handoff:

```bash
npm --prefix /absolute/path/to/lineage-logo --silent run agent:submit -- \
  --mode replace \
  --artifact /absolute/path/to/logos/iterations/iteration-2.svg \
  --selector '#logo' \
  --target-name logo | \
node <path-to-skill>/scripts/lineage-handoff.mjs \
  --logos /absolute/path/to/logos
```

The handoff never starts or locates Lineage and accepts no token, API origin, artifact
argument, or connection context. It consumes only the adapter receipt on stdin. On an
accepted receipt, it atomically creates the next collision-safe
`logos/iterations/iteration-N.svg`, rereads the published bytes, verifies them, and
prints a metadata-only receipt containing `iterationPath`, `bytes`, and `sha256`.
File data and supported directory metadata are synchronized before that continuation
receipt is emitted. Pre-transaction invalid or unavailable adapter receipts contain no
fabricated transaction, source-path, or revision identity and remain terminally
consumable by the same handoff.
Continue refinement only from that exact `iterationPath`, then regenerate
`logos/preview.html` using [preview assembly](../preview.md) so the verified iteration remains visible in the normal workflow.

For reverted, rejected, stale, unavailable, conflict, timeout, or invalid receipts,
follow the printed terminal guidance and do not create or reserve an iteration. The
producer waits through temporary editor disconnections so a reconnected canvas cannot
accept the same proposal after this handoff has stopped listening. If an authoritative
accepted receipt cannot be persisted, exit 27 preserves its transaction identity, byte
count, and hash. Fix the local storage problem and rerun the same adapter command with
that transaction ID and the same artifact; do not create a new transaction. Never
automatically resubmit after timeout or conflict. A new submission
must be an explicit user-directed action after checking the current canvas state.
If Lineage reports that its local server was replaced during a provisional acceptance,
do not infer a terminal result and do not continue from browser memory. Inspect the
locked canvas and use its explicit **Restore previous document** recovery action; only
after that exact transaction is resolved may the user explicitly start another handoff.
