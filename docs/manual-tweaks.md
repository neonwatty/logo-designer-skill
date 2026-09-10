# Keep the logo. Fine-tune the details.

No need to regenerate your entire logo for small changes. Fine-tune shape, size, color, and spacing - by hand or with your agent.

[Lineage](https://github.com/lineagehq/lineage-logo) opens the SVG files the skill already creates. You can move and resize elements, adjust colors, check small-size legibility, and save a new iteration.

## Open your logo

Requirements: Node.js 22 or newer on macOS or Linux, and an existing `logos/` workspace with SVGs in `concepts/` or `iterations/`. The skill creates this structure. For an SVG from elsewhere, place it in `logos/concepts/` first; files directly in `logos/` do not appear in the workspace list.

```bash
npx lineage-logo@0.1.0-beta.4 launch --workspace /absolute/path/to/logos
```

Replace `/absolute/path/to/logos` with the full path to the folder created by the skill. The command uses a pinned public beta and downloads it through npm if needed; no Lineage checkout is required. npm may ask to install the package on first use.

Keep the terminal running while you edit. The launcher opens your browser and prints an address using `lineage-logo.localhost`. If the browser does not open, use that printed address. Choose your concept or iteration from the editor's workspace list.

If the address opens another local app, stop the launcher with Ctrl+C and choose a different port:

```bash
npx lineage-logo@0.1.0-beta.4 launch --workspace /absolute/path/to/logos --port 43821
```

Use the new address printed by the launcher. This works around a beta issue when another app occupies the default port over IPv6.

## Make manual tweaks

1. Select the part of the logo you want to adjust.
2. Move or resize it, or use the inspector to change its appearance. Undo is available while you experiment.
3. For small-size checks, set **Target** to `#icon` if the automatic choice shows only part of your mark.
4. Choose the **Save …** button above the canvas. The editor creates a new numbered SVG in `logos/iterations/` and preserves the original file.
5. Copy the filename from the confirmation immediately after saving, for example `iterations/concept-1-iteration-1.svg`. The Save button now names the *next* iteration, not the file just saved. The saved file also appears under **Iterations** in the workspace list.

## Continue with your agent

Give the agent the saved file explicitly, for example:

> I made manual tweaks and saved them to `logos/iterations/concept-1-iteration-1.svg`. Read that file and use it as the starting point for our next changes. Preserve my adjustments. Regenerate the preview from this iteration.

Replace the example filename with the one you actually saved. You can also ask the agent to export that iteration if you are finished.

Saving makes the SVG available to your agent on disk. Tell the agent when you are ready to continue; this manual workflow does not automatically notify it or resume generation.

## Review agent changes in the published beta

With the editor open, ask your agent:

> Use the published Lineage Logo CLI to propose a small change to the current logo. Read the current context first, preserve my existing edits, and wait for my review in the editor. Continue only from the saved artifact reported by the successful submission.

The agent can use these commands without a Lineage checkout:

```bash
npx lineage-logo@0.1.0-beta.4 context --workspace /absolute/path/to/logos --json
npx lineage-logo@0.1.0-beta.4 schema --json
```

Use the returned session ID, base revision, and target layer ID to prepare a proposal matching that schema. Do not guess layer IDs or reuse stale context. Then validate and submit the proposal:

```bash
npx lineage-logo@0.1.0-beta.4 validate --proposal /absolute/path/to/proposal.json --json
npx lineage-logo@0.1.0-beta.4 submit --workspace /absolute/path/to/logos --proposal /absolute/path/to/proposal.json --json
```

The submission waits while you compare the proposed changes in the editor. **Accept and save** creates a saved continuation; **Revert** leaves the logo unchanged. After success, the agent reads the exact `artifact.path` reported in the receipt, relative to the workspace. An agent continuation may have an `-agent-` filename rather than a numbered manual iteration. Do not continue from a guessed filename or treat a failed submission as an accepted edit.

This is the CLI integration used by an agent, not a plugin installation command. The older checkout-based adapter has a different receipt format; do not pipe the published CLI receipt into its handoff script. See [legacy adapter instructions](../skills/logo-designer/SKILL.md#optional-lineage-review-explicit-opt-in-only) only when using that older adapter.

## Export the result

Choose **Save version / export**, select the artwork, format, and size, then choose **Download export**. The beta supports editable SVG and PNG at 16, 32, 64, and 512 pixels. Find the export in your browser downloads. For additional sizes, ask the agent to render the exact accepted SVG with your installed SVG renderer.
