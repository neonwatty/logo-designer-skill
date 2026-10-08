import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { actionSchemas, array, briefSchema, eventSchemas, id, namedPayload, object, requireThat, sourceSchema, text, validate } from '../workflows/contracts.mjs';
import { allowedActions, isComplete, LIMITS, start, transition, validateAction, validateUserEvent } from '../workflows/design.mjs';
import { checkRequest, digest, loadTask, unlockDeadOwner, withStore } from '../state/task-store.mjs';
import { atomicWrite, ensureDirectory, readBounded, safePath, workspaceRoot } from '../state/files.mjs';
import { inspectSource, publishArtifact, verifyArtifact } from '../artifacts/registry.mjs';
import { context } from './context.mjs';
const named = object({ type: text, arguments: {} });
export function validateCommand(command) {
  if (['context', 'unlock'].includes(command?.kind)) {
    validate(object({ version: { const: 1 }, kind: { enum: ['context', 'unlock'] }, taskId: id }), command);
    return command;
  }
  validate(object({ version: { const: 1 }, kind: { enum: ['start', 'userEvent', 'action', 'recover', 'archive'] }, taskId: id,
    requestId: id, expectedRevision: { type: 'integer', minimum: 0 }, payload: {} }), command);
  if (command.kind === 'start') validate(object({ brief: briefSchema, sources: array(sourceSchema) }), command.payload);
  if (command.kind === 'userEvent') { validate(named, command.payload); namedPayload(eventSchemas, command.payload); }
  if (command.kind === 'action') { validate(named, command.payload); namedPayload(actionSchemas, command.payload); }
  if (command.kind === 'recover') validate(object({ operationId: id }), command.payload);
  if (command.kind === 'archive') validate(object({}), command.payload);
  return command;
}
const owner = () => ({ pid: process.pid, hostname: hostname(), token: randomUUID() });
function dead(worker) {
  if (!worker) return true;
  if (worker.hostname !== hostname()) return false;
  try { process.kill(worker.pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
function receipt(state, command, status, extra = {}) {
  return { version: 1, taskId: state.taskId, requestId: command.requestId, revision: state.revision + 1, status, ...extra };
}
function remember(state, command, result) {
  const prior = state.requests.find(item => item.id === command.requestId);
  if (prior) prior.receipt = result;
  else state.requests.push({ id: command.requestId, digest: digest(command), receipt: result });
}
const entry = (command, type = command.kind, payload = command.payload) => ({ requestId: command.requestId, type, payload });
async function verifySelection(root, state, event) {
  const a = event.arguments;
  const ids = event.type === 'selectArtifact' ? [a.artifactId]
    : ['requestRefinement', 'requestExport'].includes(event.type) ? [state.selectedArtifactId, a.iconId].filter(Boolean) : [];
  for (const artifactId of ids) await verifyArtifact(root, state.artifacts.find(x => x.id === artifactId));
}
async function reserve(store, state, command, kind, inputs = []) {
  const operationId = digest({ taskId: state.taskId, requestId: command.requestId });
  state.pending = { id: operationId, requestId: command.requestId, attemptRequestId: command.requestId, kind, inputs,
    status: 'running', worker: owner(), failure: null, exportRequest: kind === 'export' ? state.exportRequest : null };
  const result = receipt(state, command, 'pending', { operationId });
  remember(state, command, result);
  await store.save(state, entry(command, 'operationReserved', { operationId, kind, inputs: inputs.map(x => x.record) }));
  return { run: structuredClone(state.pending) };
}
export async function execute(workspace, raw, hooks = {}) {
  const command = validateCommand(raw);
  if (command.kind === 'context' || command.kind === 'unlock') {
    const state = await loadTask(workspace);
    requireThat(!state || state.taskId === command.taskId, 'WRONG_TASK', 'Task ID does not match.');
    if (command.kind === 'unlock') return { receipt: await unlockDeadOwner(workspace) };
    requireThat(state, 'NO_TASK', 'No task exists in this workspace.');
    return { context: context(state) };
  }
  const prepared = await withStore(workspace, async store => {
    let state = store.state;
    if (state) {
      const prior = checkRequest(state, command);
      if (prior) return { receipt: prior.receipt, context: context(state) };
    } else {
      requireThat(command.kind === 'start' && command.expectedRevision === 0, 'NO_TASK', 'Start a task at revision zero first.');
      state = start(command.taskId, command.payload.brief);
      // A task ID cannot be reused after explicit archival.
      let archived = false;
      try { await safePath(store.root, `.logo-designer/archives/${command.taskId}.json`); archived = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      requireThat(!archived, 'TASK_EXISTS', 'Archived task ID cannot be reused.');
    }
    if (command.kind === 'start') {
      requireThat(!store.state, 'TASK_EXISTS', 'Archive the terminal task before starting another.');
      const sources = command.payload.sources;
      requireThat(new Set(sources.map(x => x.id)).size === sources.length && sources.some(x => x.kind === 'logo'), 'INVALID_INPUT', 'Use distinct IDs and at least one logo.');
      const inputs = [];
      for (const source of sources) {
        const inspected = await inspectSource(store.root, source);
        if (state.brief.format === 'icon' && source.kind === 'logo') requireThat(inspected.record.width === inspected.record.height, 'INVALID_SVG', 'Icon logos require square viewBoxes.');
        inputs.push({ record: inspected.record, sourcePath: inspected.sourcePath });
      }
      return reserve(store, state, command, 'import', inputs);
    }
    if (command.kind === 'recover') {
      requireThat(state.pending?.id === command.payload.operationId, 'NO_OPERATION', 'Operation is no longer pending.');
      requireThat(dead(state.pending.worker), 'OPERATION_RUNNING', 'The operation owner may still be running.');
      state.pending.worker = owner(); state.pending.attemptRequestId = command.requestId;
      state.pending.status = 'running'; state.pending.failure = null;
      remember(state, command, receipt(state, command, 'pending', { operationId: state.pending.id }));
      await store.save(state, entry(command, 'recoveryStarted'));
      return { run: structuredClone(state.pending) };
    }
    if (command.kind === 'archive') {
      requireThat(isComplete(state) && !state.pending, 'INVALID_TRANSITION', 'Only a reconciled terminal task can be archived.');
      await ensureDirectory(store.root, '.logo-designer/archives');
      const result = receipt(state, command, 'archived'); remember(state, command, result);
      await store.save(state, entry(command));
      await atomicWrite(await safePath(store.root, `.logo-designer/archives/${state.taskId}.json`, true), JSON.stringify(state));
      await unlink(await safePath(store.root, '.logo-designer/task.json'));
      return { receipt: result };
    }
    if (command.kind === 'userEvent') {
      validateUserEvent(state, command.payload);
      await verifySelection(store.root, state, command.payload);
      state = transition(state, command.payload, command.requestId);
    } else {
      validateAction(state, command.payload);
      const { type, arguments: a } = command.payload;
      if (type === 'finish') return { receipt: { version: 1, taskId: state.taskId, revision: state.revision, status: state.phase.toLowerCase() }, context: context(state) };
      if (type === 'submitRefinement') {
        requireThat(state.artifacts.length < LIMITS.artifacts, 'LIMIT_REACHED', 'Artifact limit reached.');
        await verifyArtifact(store.root, state.artifacts.find(x => x.id === state.refinement.baseArtifactId));
        const inspected = await inspectSource(store.root, a.source, state.refinement.baseArtifactId);
        if (state.brief.format === 'icon') requireThat(inspected.record.width === inspected.record.height, 'INVALID_SVG', 'Icon logos require square viewBoxes.');
        return reserve(store, state, command, 'refine', [{ record: inspected.record, sourcePath: inspected.sourcePath }]);
      }
      if (type === 'renderExport') {
        for (const artifactId of [state.exportRequest.artifactId, state.exportRequest.iconId].filter(Boolean)) await verifyArtifact(store.root, state.artifacts.find(x => x.id === artifactId));
        return reserve(store, state, command, 'export', state.artifacts.filter(x => [state.exportRequest.artifactId, state.exportRequest.iconId].includes(x.id)).map(record => ({ record })));
      }
      state = transition(state, command.payload, command.requestId);
    }
    const result = receipt(state, command, state.phase === 'CANCELLED' ? 'cancelled' : 'applied');
    remember(state, command, result);
    await store.save(state, entry(command, command.payload.type, command.payload.arguments));
    return { receipt: result, context: context(state) };
  });
  if (!prepared.run) return prepared;
  await hooks.afterReservation?.(prepared.run);
  return runOperation(workspace, prepared.run, hooks);
}
async function runOperation(workspace, operation, hooks) {
  const root = await workspaceRoot(workspace);
  let event;
  try {
    const fresh = await loadTask(workspace);
    if (fresh.phase !== 'CANCELLED') {
      if (operation.kind === 'export') {
        const { performExport } = await import('../artifacts/export-manifest.mjs');
        const manifest = await performExport(root, operation, hooks);
        event = { type: 'exportVerified', arguments: { manifest } };
      } else {
        const artifacts = [];
        for (const input of operation.inputs) {
          try { await verifyArtifact(root, input.record); }
          catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const inspected = await inspectSource(root, { id: input.record.id, kind: input.record.kind, path: input.sourcePath }, input.record.parentArtifactId);
            requireThat(inspected.record.sha256 === input.record.sha256, 'ARTIFACT_CHANGED', 'Candidate changed after reservation.');
            await publishArtifact(root, inspected);
          }
          artifacts.push(input.record);
        }
        event = operation.kind === 'import' ? { type: 'importsRegistered', arguments: { artifacts } }
          : { type: 'refinementRegistered', arguments: { artifact: artifacts[0] } };
      }
    }
    await hooks.afterPublication?.(operation);
    return await withStore(workspace, async store => {
      let state = store.state;
      requireThat(state.pending?.worker?.token === operation.worker.token, 'OPERATION_CHANGED', 'Operation ownership changed.');
      if (state.phase !== 'CANCELLED') state = transition(state, event, operation.requestId);
      const status = state.phase === 'CANCELLED' ? 'cancelled' : 'succeeded';
      for (const requestId of new Set([operation.requestId, operation.attemptRequestId])) {
        const request = state.requests.find(x => x.id === requestId);
        request.receipt = { version: 1, taskId: state.taskId, requestId, revision: state.revision + 1, status, operationId: operation.id };
      }
      state.pending = null;
      await store.save(state, { requestId: operation.attemptRequestId, type: status === 'cancelled' ? 'operationCancelled' : event.type, payload: status === 'cancelled' ? {} : event.arguments });
      await hooks.afterCommit?.();
      return { receipt: state.requests.find(x => x.id === operation.attemptRequestId).receipt, context: context(state) };
    });
  } catch (error) {
    // A committed outcome must remain queryable even if response delivery fails.
    return withStore(workspace, async store => {
      const state = store.state;
      if (!state.pending) return { receipt: state.requests.find(x => x.id === operation.attemptRequestId)?.receipt, context: context(state) };
      requireThat(state.pending.worker?.token === operation.worker.token, 'OPERATION_CHANGED', 'Operation ownership changed.');
      state.pending.status = 'failed'; state.pending.worker = null;
      state.pending.failure = { code: error.code ?? 'OPERATION_FAILED', message: error.message.slice(0, 512) };
      await store.save(state, { requestId: operation.attemptRequestId, type: 'operationFailed', payload: state.pending.failure });
      return { receipt: { version: 1, taskId: state.taskId, requestId: operation.attemptRequestId, revision: state.revision, status: 'pending', operationId: operation.id }, context: context(state) };
    });
  }
}
