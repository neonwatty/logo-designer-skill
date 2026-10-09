import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execute } from '../skills/logo-designer/lib/harness/execute-action.mjs';
import { loadTask } from '../skills/logo-designer/lib/state/task-store.mjs';
const cli = fileURLToPath(new URL('../skills/logo-designer/scripts/task.mjs', import.meta.url));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="red"/></svg>';
async function fixture(t) { const root = await mkdtemp(path.join(tmpdir(), 'logo-managed-')); t.after(() => rm(root, { recursive: true, force: true })); await writeFile(path.join(root, 'a.svg'), svg); return root; }
const command = (kind, requestId, revision, payload) => ({ version: 1, kind, taskId: 'task', requestId, expectedRevision: revision, payload });
const named = (type, args = {}) => ({ type, arguments: args });
const startCommand = () => command('start', 'start1', 0, { brief: { format: 'icon', description: 'test' }, sources: [{ id: 'a', kind: 'logo', path: 'a.svg' }] });
function run(root, request, script = cli) {
  const result = spawnSync(process.execPath, [script, '--logos', root], { input: JSON.stringify(request), encoding: 'utf8', cwd: root });
  assert.equal(result.stderr, ''); return { code: result.status, ...JSON.parse(result.stdout) };
}
test('managed command resumes saved questions in fresh processes, refines, and replays without extra writes', async t => {
  const root = await fixture(t); let result = run(root, startCommand()); assert.equal(result.code, 0);
  assert.equal(result.context.phase, 'AWAITING_SELECTION');
  result = run(root, command('action', 'question', result.context.revision, named('askUser', { questionId: 'q1', prompt: 'Choose', choices: ['a'] })));
  const resumed = run(root, { version: 1, kind: 'context', taskId: 'task' }); assert.equal(resumed.context.question.id, 'q1');
  result = run(root, command('userEvent', 'answer', resumed.context.revision, named('answerQuestion', { questionId: 'q1', answer: 'a' })));
  result = run(root, command('userEvent', 'select', result.context.revision, named('selectArtifact', { artifactId: 'a' })));
  const stale = run(root, command('userEvent', 'stale', 1, named('cancel'))); assert.equal(stale.error.code, 'REVISION_CONFLICT');
  result = run(root, command('userEvent', 'edit', result.context.revision, named('requestRefinement', { instruction: 'Use blue' })));
  await writeFile(path.join(root, 'b.svg'), svg.replace('red', 'blue'));
  const submit = command('action', 'submit', result.context.revision, named('submitRefinement', { refinementId: 'edit', baseSha256: result.context.refinement.baseSha256, source: { id: 'b', kind: 'logo', path: 'b.svg' } }));
  result = run(root, submit); assert.equal(result.context.phase, 'AWAITING_SELECTION');
  assert.equal(result.context.offeredArtifacts[1].parentArtifactId, 'a');
  assert.deepEqual(run(root, submit).receipt, result.receipt);
  assert.equal((await readdir(path.join(root, '.logo-designer/artifacts'))).length, 2);
  const forged = run(root, command('userEvent', 'forged', result.context.revision, named('exportVerified', {})));
  assert.equal(forged.error.code, 'FORBIDDEN_EVENT');
});
test('interrupted reservation resumes after worker exit without duplicate imports', async t => {
  const root = await fixture(t);
  const executor = new URL('../skills/logo-designer/lib/harness/execute-action.mjs', import.meta.url).href;
  const script = `import {execute} from ${JSON.stringify(executor)}; await execute(process.argv[1], JSON.parse(process.argv[2]), {afterReservation(){process.exit(77)}});`;
  const killed = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, JSON.stringify(startCommand())]);
  assert.equal(killed.status, 77);
  const state = await loadTask(root); assert.ok(state.pending);
  const recovered = run(root, command('recover', 'recover1', state.revision, { operationId: state.pending.id }));
  assert.equal(recovered.context.phase, 'AWAITING_SELECTION');
  assert.equal((await readdir(path.join(root, '.logo-designer/artifacts'))).length, 1);
  assert.equal(run(root, startCommand()).receipt.status, 'succeeded');
});
test('cancellation while an operation is pending prevents its success transition', async t => {
  const root = await fixture(t);
  const result = await execute(root, startCommand(), { async afterPublication() {
    const state = await loadTask(root);
    await execute(root, command('userEvent', 'cancel', state.revision, named('cancel')));
  } });
  assert.equal(result.receipt.status, 'cancelled'); assert.equal(result.context.phase, 'CANCELLED');
  assert.equal((await loadTask(root)).pending, null);
});
test('published artifact is adopted on recovery; failure after commit preserves the recorded receipt', async t => {
  const root = await fixture(t);
  const failed = await execute(root, startCommand(), { afterPublication() { throw new Error('simulated interruption'); } });
  const state = await loadTask(root); assert.equal(state.pending.status, 'failed');
  const result = await execute(root, command('recover', 'recover', state.revision, { operationId: state.pending.id }), { afterCommit() { throw new Error('response lost'); } });
  assert.equal(result.receipt.status, 'succeeded');
  assert.equal((await readdir(path.join(root, '.logo-designer/artifacts'))).length, 1);
  assert.equal(failed.context.phase, 'IMPORTING');
});
test('managed skill runs when relocated, and changed registered bytes block selection', async t => {
  const root = await fixture(t); const installed = path.join(root, 'copied skill');
  await cp(new URL('../skills/logo-designer/', import.meta.url), installed, { recursive: true });
  const result = run(root, startCommand(), path.join(installed, 'scripts/task.mjs')); assert.equal(result.code, 0);
  await writeFile(path.join(root, result.context.offeredArtifacts[0].path), 'changed');
  const rejected = run(root, command('userEvent', 'select', result.context.revision, named('selectArtifact', { artifactId: 'a' })));
  assert.equal(rejected.error.code, 'ARTIFACT_CHANGED');
  assert.equal((await loadTask(root)).revision, result.context.revision);
});
test('explicit archival is replayable and a new task cannot reuse the archived identity', async t => {
  const root = await fixture(t); let result = await execute(root, startCommand());
  result = await execute(root, command('userEvent', 'cancel', result.context.revision, named('cancel')));
  const archive = command('archive', 'archive1', result.context.revision, {});
  const saved = await execute(root, archive); assert.equal(await loadTask(root), null);
  assert.deepEqual((await execute(root, archive)).receipt, saved.receipt);
  await assert.rejects(execute(root, startCommand()), { code: 'TASK_EXISTS' });
  const next = { ...startCommand(), taskId: 'next' };
  const initialized = await execute(root, next); assert.equal(initialized.context.taskId, 'next');
  assert.deepEqual((await execute(root, archive)).receipt, saved.receipt);
});
test('failed operations can be cancelled and reconciled without executing again', async t => {
  const root = await fixture(t);
  await execute(root, startCommand(), { afterPublication() { throw new Error('failed'); } });
  let state = await loadTask(root);
  const cancelled = await execute(root, command('userEvent', 'cancel', state.revision, named('cancel')));
  const result = await execute(root, command('recover', 'cleanup', cancelled.context.revision, { operationId: state.pending.id }));
  assert.equal(result.context.phase, 'CANCELLED'); assert.equal(result.context.pendingOperation, null);
  assert.equal(result.receipt.status, 'cancelled');
});
test('archive replay reconciles interruption between saved intent and archive publication', async t => {
  const root = await fixture(t); let result = await execute(root, startCommand());
  result = await execute(root, command('userEvent', 'cancel', result.context.revision, named('cancel')));
  const request = command('archive', 'archive', result.context.revision, {});
  const original = await execute(root, request);
  const archiveFile = path.join(root, '.logo-designer/archives/task.json');
  await writeFile(path.join(root, '.logo-designer/task.json'), await readFile(archiveFile));
  await rm(archiveFile);
  assert.deepEqual((await execute(root, request)).receipt, original.receipt);
  assert.equal(await loadTask(root), null); assert.ok(await readFile(archiveFile));
});
test('capacity limits retain room to cancel, reconcile, finish and archive a failed operation', async t => {
  const root = await fixture(t);
  await execute(root, startCommand(), { afterPublication() { throw new Error('failed'); } });
  const state = await loadTask(root);
  while (state.events.length < 509) state.events.push({ sequence: state.events.length + 1, revision: state.events.length + 1, type: 'historical' });
  state.revision = 509;
  await writeFile(path.join(root, '.logo-designer/task.json'), JSON.stringify(state));
  let result = await execute(root, command('userEvent', 'cancel', 509, named('cancel')));
  result = await execute(root, command('recover', 'cleanup', result.context.revision, { operationId: state.pending.id }));
  await execute(root, command('action', 'finish', result.context.revision, named('finish')));
  const archived = await execute(root, command('archive', 'archive', result.context.revision, {}));
  assert.equal(archived.receipt.revision, 512); assert.equal(await loadTask(root), null);
});
