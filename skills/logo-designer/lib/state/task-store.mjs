import { link, open, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { LIMITS, SCHEMA_VERSION, WORKFLOW_VERSION } from '../workflows/design.mjs';
import { requireThat, validate, id, object, hash } from '../workflows/contracts.mjs';
import { atomicWrite, ensureDirectory, readBounded, safePath, syncDirectory, workspaceRoot } from './files.mjs';
export function digest(value) {
  const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
    ? Object.fromEntries(Object.keys(x).sort().map(key => [key, canonical(x[key])])) : x;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function validateStored(state) {
  requireThat(state?.schemaVersion === SCHEMA_VERSION && state.workflowVersion === WORKFLOW_VERSION, 'UNSUPPORTED_VERSION', 'Unsupported state/workflow version.');
  validate(id, state.taskId);
  requireThat(Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.events)
    && Array.isArray(state.requests) && Array.isArray(state.artifacts), 'INVALID_STATE', 'Malformed task state.');
  const artifactSchema = object({ id, kind: { enum: ['logo', 'icon'] }, parentArtifactId: { type: ['string', 'null'], pattern: id.pattern },
    sha256: hash, bytes: { type: 'integer', minimum: 1, maximum: 5 * 1024 * 1024 }, width: { type: 'number', minimum: Number.MIN_VALUE },
    height: { type: 'number', minimum: Number.MIN_VALUE }, path: { type: 'string', pattern: '^\\.logo-designer/artifacts/[a-f0-9]{64}\\.svg$' } });
  state.artifacts.forEach(artifact => validate(artifactSchema, artifact, 'stored artifact'));
  requireThat(['IMPORTING', 'AWAITING_SELECTION', 'READY', 'AWAITING_REFINEMENT', 'EXPORT_READY', 'WAITING_FOR_USER', 'COMPLETE', 'CANCELLED'].includes(state.phase)
    && state.events.length === state.revision && state.events.every((event, i) => event.sequence === i + 1 && event.revision === i + 1)
    && new Set(state.artifacts.map(x => x.id)).size === state.artifacts.length
    && Array.isArray(state.offeredIds) && state.offeredIds.every(artifactId => state.artifacts.some(x => x.id === artifactId && x.kind === 'logo'))
    && (state.selectedArtifactId === null || state.offeredIds.includes(state.selectedArtifactId))
    && (state.phase !== 'COMPLETE' || state.exportManifest?.files?.length > 0)
    && (state.phase !== 'WAITING_FOR_USER' || state.question?.id)
    && (state.phase !== 'AWAITING_REFINEMENT' || state.refinement?.baseArtifactId), 'INVALID_STATE', 'Inconsistent stored workflow state.');
  requireThat(state.events.length <= LIMITS.events && state.artifacts.length <= LIMITS.artifacts
    && Buffer.byteLength(JSON.stringify(state)) <= LIMITS.stateBytes, 'LIMIT_REACHED', 'Task store capacity reached.');
  return state;
}
async function readState(root) {
  try { return validateStored(JSON.parse((await readBounded(await safePath(root, '.logo-designer/task.json'), LIMITS.stateBytes)).toString())); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function loadTask(workspace) { return readState(await workspaceRoot(workspace)); }
async function ownerFile(filename) { return JSON.parse((await readBounded(filename, 4096)).toString()); }
async function exists(filename) {
  try { await readBounded(filename, 4096); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function withStore(workspace, callback) {
  const root = await workspaceRoot(workspace);
  const directory = await ensureDirectory(root, '.logo-designer');
  const filename = path.join(directory, 'lock.json');
  const guard = path.join(directory, 'unlock.json');
  requireThat(!await exists(guard), 'LOCKED', 'Lock recovery is in progress.');
  const owner = { pid: process.pid, hostname: hostname(), token: randomUUID() };
  const candidate = path.join(directory, `${owner.token}.lock-tmp`);
  await atomicWrite(candidate, JSON.stringify(owner));
  let acquired = false;
  try {
    try { await link(candidate, filename); acquired = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; requireThat(false, 'LOCKED', 'Another process owns the task lock.', await ownerFile(filename)); }
    requireThat(!await exists(guard), 'LOCKED', 'Lock recovery is in progress.');
    let current = await readState(root);
    return await callback({ root, state: current, async save(next, entry) {
      const candidate = structuredClone(next);
      candidate.revision = (current?.revision ?? 0) + 1;
      candidate.events.push({ ...entry, sequence: candidate.events.length + 1, revision: candidate.revision, at: new Date().toISOString() });
      validateStored(candidate);
      const encoded = JSON.stringify(candidate, null, 2) + '\n';
      requireThat(Buffer.byteLength(encoded) <= LIMITS.stateBytes, 'LIMIT_REACHED', 'Encoded task file exceeds its limit.');
      await atomicWrite(await safePath(root, '.logo-designer/task.json', true), encoded);
      Object.assign(next, candidate);
      current = structuredClone(candidate);
      return next;
    } });
  } finally {
    if (acquired) {
      const recorded = await ownerFile(filename);
      requireThat(recorded.token === owner.token, 'LOCK_CHANGED', 'Task lock ownership changed.');
      await unlink(filename); await syncDirectory(directory);
    }
    await unlink(candidate).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
// Explicit administrative recovery; never steal a lock based on elapsed time.
export async function unlockDeadOwner(workspace) {
  const root = await workspaceRoot(workspace);
  const directory = await ensureDirectory(root, '.logo-designer');
  const guard = path.join(directory, 'unlock.json');
  const handle = await open(guard, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, hostname: hostname() })); await handle.sync();
    const filename = await safePath(root, '.logo-designer/lock.json');
    const owner = await ownerFile(filename);
    requireThat(owner.hostname === hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0, 'LOCKED', 'Cannot establish same-host ownership.');
    let dead = false;
    try { process.kill(owner.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
    requireThat(dead, 'LOCKED', 'Owner may still be alive; refusing to unlock.');
    await unlink(filename); await syncDirectory(directory);
    return { status: 'unlocked', owner };
  } finally { await handle.close(); await unlink(guard); }
}
export function checkRequest(state, command) {
  requireThat(state?.taskId === command.taskId, 'WRONG_TASK', 'Task ID does not match the workspace.');
  const prior = state.requests.find(item => item.id === command.requestId);
  if (prior) {
    requireThat(prior.digest === digest(command), 'REQUEST_CONFLICT', 'Request ID was already used with different arguments.');
    return prior;
  }
  requireThat(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload context before proposing another action.', { revision: state.revision });
  const cancelling = command.kind === 'userEvent' && command.payload.type === 'cancel';
  const finishing = command.kind === 'action' && command.payload.type === 'finish';
  const headroom = finishing ? 0 : command.kind === 'archive' ? 1
    : command.kind === 'recover' ? (state.phase === 'CANCELLED' ? 2 : 5) : cancelling ? 3 : 5;
  const byteHeadroom = finishing ? 0 : headroom <= 3 ? 64 * 1024 : 256 * 1024;
  requireThat(state.events.length + headroom <= LIMITS.events && Buffer.byteLength(JSON.stringify(state, null, 2)) <= LIMITS.stateBytes - byteHeadroom,
    'LIMIT_REACHED', 'Insufficient capacity for another operation and its recovery records.');
  return null;
}
