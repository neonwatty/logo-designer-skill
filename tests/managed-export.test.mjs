import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execute } from '../skills/logo-designer/lib/harness/execute-action.mjs';
import { loadTask } from '../skills/logo-designer/lib/state/task-store.mjs';
import { decodePng } from '../skills/logo-designer/lib/artifacts/png.mjs';
import { png } from './helpers/png.mjs';
const command = (kind, requestId, revision, payload) => ({ version: 1, kind, taskId: 'task', requestId, expectedRevision: revision, payload });
const named = (type, args = {}) => ({ type, arguments: args });
async function ready(t, format = 'wordmark') {
  const root = await mkdtemp(path.join(tmpdir(), 'logo-export-managed-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect width="64" height="32"/></svg>');
  const sources = [{ id: 'a', kind: 'logo', path: 'a.svg' }];
  if (format === 'combination') {
    await writeFile(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/></svg>');
    sources.push({ id: 'icon', kind: 'icon', path: 'icon.svg' });
  }
  let result = await execute(root, command('start', 'start', 0, { brief: { format, description: 'test' }, sources }));
  result = await execute(root, command('userEvent', 'select', result.context.revision, named('selectArtifact', { artifactId: 'a' })));
  result = await execute(root, command('userEvent', 'export', result.context.revision, named('requestExport', { artifactId: 'a', iconId: format === 'combination' ? 'icon' : null, sizes: [16, 32] })));
  return { root, request: command('action', 'render', result.context.revision, named('renderExport')) };
}
const render = async (_source, output, width, height) => { await writeFile(output, png(width, height).bytes); return 'test-renderer'; };
test('PNG decoding reconstructs all five filters and rejects bad checksums, filters and truncated files', () => {
  for (let filter = 0; filter <= 4; filter++) { const fixture = png(7, 5, filter); assert.deepEqual(decodePng(fixture.bytes).pixels, fixture.pixels); }
  const bytes = png(3, 2).bytes; const corrupt = Buffer.from(bytes); corrupt[40] ^= 1;
  assert.throws(() => decodePng(corrupt), { code: 'INVALID_PNG' });
  assert.throws(() => decodePng(bytes.subarray(0, -12)), { code: 'INVALID_PNG' });
  assert.throws(() => decodePng(png(3, 2, 5).bytes), { code: 'INVALID_PNG' });
});
test('completion requires decoded outputs with correct dimensions; exact replay never rerenders', async t => {
  const { root, request } = await ready(t); let calls = 0;
  const result = await execute(root, request, { render: async (...args) => { calls++; return render(...args); } });
  assert.equal(result.context.phase, 'COMPLETE'); assert.equal(calls, 2);
  assert.deepEqual(result.context.exportManifest.files.map(x => [x.width, x.height]), [[16, 8], [32, 16]]);
  const replay = await execute(root, request, { render: () => { throw new Error('must not run'); } });
  assert.deepEqual(replay.receipt, result.receipt);
  const state = await loadTask(root); assert.deepEqual(state.exportManifest, result.context.exportManifest);
  assert.equal((await readdir(path.join(root, '.logo-designer/exports'))).length, 1);
});
test('corrupt and incorrectly sized outputs remain recoverable and cannot complete', async t => {
  for (const badRender of [async (_s, output) => writeFile(output, 'not png'), async (_s, output) => writeFile(output, png(1, 1).bytes)]) {
    const { root, request } = await ready(t);
    const failed = await execute(root, request, { render: badRender }); assert.equal(failed.context.phase, 'EXPORT_READY');
    assert.equal(failed.context.pendingOperation.status, 'failed');
    const state = await loadTask(root);
    const result = await execute(root, command('recover', 'retry', state.revision, { operationId: state.pending.id }), { render });
    assert.equal(result.context.phase, 'COMPLETE');
  }
});
test('crash after bundle publication recovers by readback without rerendering', async t => {
  const { root, request } = await ready(t);
  await execute(root, request, { render, afterExportPublication() { throw new Error('interrupted'); } });
  const state = await loadTask(root); assert.equal(state.pending.status, 'failed');
  const result = await execute(root, command('recover', 'retry', state.revision, { operationId: state.pending.id }), { render: () => { throw new Error('must adopt existing outputs'); } });
  assert.equal(result.context.phase, 'COMPLETE');
});
test('partial published bundles are not overwritten during recovery', async t => {
  const { root, request } = await ready(t);
  await execute(root, request, { render, afterExportPublication() { throw new Error('interrupted'); } });
  const state = await loadTask(root);
  const directory = path.join(root, '.logo-designer/exports', state.pending.id);
  await rm(path.join(directory, 'logo-16.png'));
  const result = await execute(root, command('recover', 'retry', state.revision, { operationId: state.pending.id }), { render });
  assert.equal(result.context.phase, 'EXPORT_READY'); assert.equal(result.context.pendingOperation.failure.code, 'INVALID_EXPORT');
});

test('combination exports preserve full-logo aspect ratio and a separate square icon family', async t => {
  const { root, request } = await ready(t, 'combination');
  const result = await execute(root, request, { render });
  assert.deepEqual(result.context.exportManifest.files.map(x => [x.width, x.height]), [[16, 8], [32, 16], [16, 16], [32, 32]]);
});
test('missing installed renderer is a persisted recoverable failure and performs no download', async t => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { root, request } = await ready(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../skills/logo-designer/scripts/task.mjs', import.meta.url)), '--logos', root],
    { input: JSON.stringify(request), encoding: 'utf8', env: { ...process.env, PATH: path.join(root, 'no-tools') } });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).context.pendingOperation.failure.code, 'NO_RENDERER');
});
test('finish rechecks recorded output bytes before presenting completion', async t => {
  const { root, request } = await ready(t);
  const result = await execute(root, request, { render });
  await writeFile(path.join(root, result.context.exportManifest.files[0].path), png(1, 1).bytes);
  await assert.rejects(execute(root, command('action', 'finish', result.context.revision, named('finish'))), { code: 'ARTIFACT_CHANGED' });
});
