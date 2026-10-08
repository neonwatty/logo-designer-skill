import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { start } from '../skills/logo-designer/lib/workflows/design.mjs';
import { loadTask, withStore, checkRequest, digest, unlockDeadOwner } from '../skills/logo-designer/lib/state/task-store.mjs';
import { inspectSource, publishArtifact, verifyArtifact } from '../skills/logo-designer/lib/artifacts/registry.mjs';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
async function fixture(t) { const root = await mkdtemp(path.join(tmpdir(), 'logo-store-')); t.after(() => rm(root, { recursive: true, force: true })); return root; }
test('atomic snapshot retains events and survives reload; competing lock cannot overwrite it', async t => {
  const root = await fixture(t);
  await withStore(root, async store => {
    await store.save(start('task', { format: 'icon', description: 'test' }), { type: 'start', requestId: 'r1', payload: {} });
    await assert.rejects(withStore(root, () => {}), { code: 'LOCKED' });
    await assert.rejects(unlockDeadOwner(root), { code: 'LOCKED' });
  });
  const state = await loadTask(root); assert.equal(state.revision, 1); assert.equal(state.events[0].sequence, 1);
  const before = await readFile(path.join(root, '.logo-designer/task.json'));
  await assert.rejects(withStore(root, async store => { store.state.schemaVersion = 99; await store.save(store.state, {}); }), { code: 'UNSUPPORTED_VERSION' });
  assert.deepEqual(await readFile(path.join(root, '.logo-designer/task.json')), before);
});
test('known requests replay before revision checking; changed requests and stale revisions fail', () => {
  const command = { taskId: 'task', requestId: 'r', expectedRevision: 1, payload: {} };
  const state = { taskId: 'task', revision: 5, requests: [{ id: 'r', digest: digest(command), receipt: { revision: 2 } }] };
  assert.equal(checkRequest(state, command).receipt.revision, 2);
  assert.throws(() => checkRequest(state, { ...command, payload: { different: true } }), { code: 'REQUEST_CONFLICT' });
  assert.throws(() => checkRequest(state, { ...command, requestId: 'new' }), { code: 'REVISION_CONFLICT' });
});
test('registry preserves immutable bytes, rejects tampering and escaping/symlinked sources', async t => {
  const root = await fixture(t); await writeFile(path.join(root, 'input.svg'), svg);
  const inspected = await inspectSource(root, { id: 'logo', path: 'input.svg', kind: 'logo' });
  const record = await publishArtifact(root, inspected); await publishArtifact(root, inspected);
  await writeFile(path.join(root, 'input.svg'), svg.replace('rect', 'circle'));
  assert.equal((await verifyArtifact(root, record)).toString(), svg);
  await writeFile(path.join(root, record.path), 'corrupt');
  await assert.rejects(verifyArtifact(root, record), { code: 'ARTIFACT_CHANGED' });
  await assert.rejects(inspectSource(root, { id: 'logo', path: '../input.svg', kind: 'logo' }), { code: 'INVALID_PATH' });
  await symlink(path.join(root, 'input.svg'), path.join(root, 'linked.svg'));
  await assert.rejects(inspectSource(root, { id: 'logo', path: 'linked.svg', kind: 'logo' }), { code: 'INVALID_PATH' });
});
test('a killed writer leaves a recoverable lock and a complete committed snapshot', async t => {
  const { spawn } = await import('node:child_process');
  const root = await fixture(t);
  const moduleUrl = new URL('../skills/logo-designer/lib/state/task-store.mjs', import.meta.url).href;
  const workflowUrl = new URL('../skills/logo-designer/lib/workflows/design.mjs', import.meta.url).href;
  const script = `import {withStore} from ${JSON.stringify(moduleUrl)}; import {start} from ${JSON.stringify(workflowUrl)};
    await withStore(process.argv[1], async store => { await store.save(start('task', {format:'icon',description:'test'}), {type:'start'});
    process.stdout.write('locked\\n'); await new Promise(resolve => setTimeout(resolve, 60000)); });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, root], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`Early exit ${code}`))); });
  await assert.rejects(withStore(root, () => {}), { code: 'LOCKED' });
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited;
  assert.equal((await loadTask(root)).revision, 1);
  assert.equal((await unlockDeadOwner(root)).status, 'unlocked');
  await withStore(root, async store => { assert.equal(store.state.events.length, 1); });
});
