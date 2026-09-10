# Logo polishing release QA

## Verified

- Published `lineage-logo@0.1.0-beta.4` installed in an isolated temporary project.
- Doctor verified the runtime, package, workspace and authenticated editor.
- A manual one-unit badge move saved a new SVG iteration.
- A schema-based CLI proposal changed only the status-dot fill. Browser review
  accepted and saved a continuation. File assertions confirmed the manual
  transform survived, the requested fill changed, and the original was unchanged.
- PNG export at 512px reported a prepared browser download. Downloaded bytes
  have not been independently inspected.
- Landing-page SVG, MP4, caption and stylesheet paths resolve locally.
- Both demos are condensed editor captures, not continuous recordings. Audio Cut
  explicitly captions the agent polish at its end.
- Skill tests: 12 handoff tests and 2 export tests passed. Plugin manifest,
  skill structure and README/skill Markdown validation passed.

## Remaining release checks

- Fresh Claude-session skill activation could not run: Claude returned HTTP 401
  because its OAuth access token expired. This is not evidence of activation
  success or failure. Re-authenticate locally and repeat the test.
- The published CLI integration is verified; a separately packaged Lineage plugin
  installation has not been verified by this QA.
- Lineage repository Pages is not enabled. Configure GitHub Pages to use Actions
  before deploying its new workflow. The skill repository already has Pages.
- Verify both public pages and their media after merge/deployment.

BugDrop is outside this release change.
