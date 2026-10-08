import { link, open, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { LIMITS, SCHEMA_VERSION, WORKFLOW_VERSION } from '../workflows/design.mjs';
import { requireThat, validate, id } from '../workflows/contracts.mjs';
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
      next.revision = (current?.revision ?? 0) + 1;
      next.events.push({ sequence: next.events.length + 1, revision: next.revision, at: new Date().toISOString(), ...entry });
      validateStored(next);
      await atomicWrite(await safePath(root, '.logo-designer/task.json', true), JSON.stringify(next, null, 2) + '\n');
      current = structuredClone(next);
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
  requireThat(state.events.length < LIMITS.events - 4 && Buffer.byteLength(JSON.stringify(state)) < LIMITS.stateBytes - 256 * 1024,
    'LIMIT_REACHED', 'Insufficient capacity for another operation and its recovery records.');
  return null;
}
