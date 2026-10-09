import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadTask } from '../skills/logo-designer/lib/state/task-store.mjs';
import { verifyArtifact, sha256 } from '../skills/logo-designer/lib/artifacts/registry.mjs';
import { workspaceRoot } from '../skills/logo-designer/lib/state/files.mjs';
import { decodePng } from '../skills/logo-designer/lib/artifacts/png.mjs';
export async function grade(workspace, trace) {
  const root = await workspaceRoot(workspace); const state = await loadTask(root);
  assert.equal(state.phase, 'COMPLETE'); assert.equal(state.selectedArtifactId, 'green'); assert.equal(state.pending, null);
  for (const artifact of state.artifacts) await verifyArtifact(root, artifact);
  for (const file of state.exportManifest.files) {
    const bytes = await readFile(path.join(root, file.path)); const png = decodePng(bytes);
    assert.equal(sha256(bytes), file.sha256); assert.equal(bytes.length, file.bytes);
    assert.deepEqual([png.width, png.height], [file.width, file.height]);
  }
  assert.ok(trace.steps.some(x => x.result.context?.phase === 'WAITING_FOR_USER'));
  for (const [index, step] of trace.steps.entries()) {
    if (step.exitCode === 1) assert.equal(step.result.context.revision, trace.steps[index - 1].result.context.revision);
  }
  assert.equal((await readdir(path.join(root, '.logo-designer/exports'))).length, 1);
  const renders = trace.steps.filter(x => x.command.requestId === 'render');
  assert.equal(renders.length, 2); assert.deepEqual(renders[0].result.receipt, renders[1].result.receipt);
  return { passed: true, driver: trace.driver, model: trace.model, renderer: trace.renderer, steps: trace.steps.length,
    storedRevision: state.revision, artifacts: state.artifacts.length, verifiedPngs: state.exportManifest.files.length,
    checks: ['stored outcome', 'artifact hashes', 'PNG readback', 'persisted question', 'rejected events preserve revision', 'replay without duplicate bundle'],
    limitations: ['scripted actions do not evaluate model judgment', ...(trace.renderer === 'synthetic PNG fixture' ? ['synthetic PNG fixture does not evaluate visual rendering'] : ['visual quality needs separate inspection'])] };
}
