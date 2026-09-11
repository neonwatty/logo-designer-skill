# Change-based CI

README and other root documentation changes run Markdown lint and local link/image
validation. They skip the Claude CLI installation, plugin validation, export and
handoff tests, and skill structure checks.

Site-only changes run local content validation. Pages validates before deploying
on main; PR validation cannot cancel a deployment. Documentation plus site changes
combine these checks.

Skill files (including SKILL.md), plugin manifests, scripts, tests, dependencies,
workflow configuration, and unknown paths run the full suite. Empty comparisons
also select the full suite. Git diff includes deletions and both sides of renames.

Local link checks cover file references in Markdown, HTML and CSS. They do not check
remote URLs, fragment anchors or browser rendering. The former advisory remote
link check is replaced in CI by this deterministic local check; the existing
`npm run validate:links` command remains available for manual remote checks.

The aggregate `CI passed` job rejects failed, cancelled, missing and unexpectedly
skipped selected checks. Existing required `Plugin Validation` and `Markdown
Validation` names are preserved. After this workflow is merged, add `CI passed`
as a required check in branch protection while preserving existing protections.

Routing tests run with `node --test scripts/ci/changes.test.mjs`. Local reference
checks run with `python3 scripts/ci/content.py` and their regression test runs with
`python3 scripts/ci/content.test.py`.
