import { actionSchemas, briefSchema, eventSchemas, id, namedPayload, requireThat, validate } from './contracts.mjs';
export const SCHEMA_VERSION = 1;
export const WORKFLOW_VERSION = 1;
export const LIMITS = { events: 512, artifacts: 32, stateBytes: 4 * 1024 * 1024, inputBytes: 64 * 1024 };
export const isComplete = state => ['COMPLETE', 'CANCELLED'].includes(state.phase);
export function start(taskId, brief) {
  validate(id, taskId); validate(briefSchema, brief);
  return { schemaVersion: SCHEMA_VERSION, workflowVersion: WORKFLOW_VERSION, taskId, revision: 0,
    phase: 'IMPORTING', brief, artifacts: [], offeredIds: [], selectedArtifactId: null,
    question: null, lastAnswer: null, refinement: null, exportRequest: null,
    pending: null, events: [], requests: [], exportManifest: null };
}
export function allowedUserEvents(state) {
  if (isComplete(state)) return [];
  if (state.pending || state.phase === 'IMPORTING') return ['cancel'];
  if (state.phase === 'WAITING_FOR_USER') return ['answerQuestion', 'cancel'];
  if (state.phase === 'AWAITING_SELECTION') return ['selectArtifact', 'cancel'];
  if (state.phase === 'READY') return ['selectArtifact', 'requestRefinement', 'requestExport', 'cancel'];
  return ['cancel'];
}
export function allowedActions(state) {
  if (state.pending) return []; // recovery is a separate command; no new action can race it
  if (isComplete(state)) return ['finish'];
  if (['IMPORTING', 'WAITING_FOR_USER'].includes(state.phase)) return [];
  return ['askUser', ...(state.phase === 'AWAITING_REFINEMENT' ? ['submitRefinement'] : []),
    ...(state.phase === 'EXPORT_READY' ? ['renderExport'] : [])];
}
export function validateUserEvent(state, event) {
  namedPayload(eventSchemas, event);
  requireThat(allowedUserEvents(state).includes(event.type), 'INVALID_TRANSITION', `Cannot ${event.type} in ${state.phase}.`);
  const a = event.arguments;
  if (event.type === 'selectArtifact') requireThat(state.offeredIds.includes(a.artifactId), 'SELECTION_REQUIRED', 'Choose an offered artifact.', { offeredIds: state.offeredIds });
  if (event.type === 'answerQuestion') {
    requireThat(a.questionId === state.question.id, 'STALE_QUESTION', 'Question is no longer current.');
    requireThat(state.question.choices.includes(a.answer), 'INVALID_ANSWER', 'Answer must be one of the offered responses.');
  }
  if (event.type === 'requestExport') {
    requireThat(a.artifactId === state.selectedArtifactId, 'SELECTION_REQUIRED', 'Export must use the selected artifact.');
    requireThat(new Set(a.sizes).size === a.sizes.length, 'INVALID_INPUT', 'Export sizes must be unique.');
    const icon = state.artifacts.find(item => item.id === a.iconId);
    requireThat(a.iconId === null || icon?.kind === 'icon', 'INVALID_INPUT', 'Icon must be registered as an icon.');
    requireThat(state.brief.format !== 'combination' || icon, 'ICON_REQUIRED', 'Combination exports require a registered square icon.');
  }
  return event;
}
export function validateAction(state, action) {
  namedPayload(actionSchemas, action);
  requireThat(allowedActions(state).includes(action.type), 'INVALID_TRANSITION', `Cannot ${action.type} in ${state.phase}.`);
  if (action.type === 'submitRefinement') {
    const a = action.arguments;
    requireThat(a.refinementId === state.refinement.id && a.baseSha256 === state.refinement.baseSha256,
      'STALE_REFINEMENT', 'Refinement must match the current request and base hash.');
    requireThat(a.source.kind === 'logo' && !state.artifacts.some(item => item.id === a.source.id), 'INVALID_INPUT', 'Use a new logo artifact ID.');
  }
  if (action.type === 'askUser') {
    requireThat(!state.events.some(item => item.type === 'askUser' && item.payload.questionId === action.arguments.questionId), 'STALE_QUESTION', 'Question IDs cannot be reused.');
  }
  return action;
}
// Internal events are invoked only by the executor after artifact/tool readback.
export function transition(state, event, requestId) {
  const next = structuredClone(state);
  const a = event.arguments;
  switch (event.type) {
    case 'importsRegistered':
      requireThat(state.phase === 'IMPORTING', 'INVALID_TRANSITION', 'Task is already initialized.');
      next.artifacts = a.artifacts; next.offeredIds = a.artifacts.filter(x => x.kind === 'logo').map(x => x.id);
      requireThat(next.offeredIds.length > 0, 'INVALID_INPUT', 'At least one logo is required.');
      next.phase = 'AWAITING_SELECTION'; break;
    case 'refinementRegistered':
      requireThat(state.phase === 'AWAITING_REFINEMENT' && a.artifact.parentArtifactId === state.refinement.baseArtifactId,
        'INVALID_TRANSITION', 'Refinement does not match its base.');
      next.artifacts.push(a.artifact); next.offeredIds.push(a.artifact.id);
      next.selectedArtifactId = null; next.refinement = null; next.phase = 'AWAITING_SELECTION'; break;
    case 'exportVerified':
      requireThat(state.phase === 'EXPORT_READY' && a.manifest.artifactId === state.selectedArtifactId && a.manifest.files.length > 0,
        'INVALID_TRANSITION', 'Export must match the selected artifact.');
      next.exportManifest = a.manifest; next.phase = 'COMPLETE'; break;
    case 'askUser':
      validateAction(state, event);
      next.question = { id: a.questionId, prompt: a.prompt, choices: a.choices, resumePhase: state.phase };
      next.phase = 'WAITING_FOR_USER'; break;
    default:
      validateUserEvent(state, event);
      if (event.type === 'selectArtifact') { next.selectedArtifactId = a.artifactId; next.phase = 'READY'; }
      if (event.type === 'requestRefinement') {
        const base = state.artifacts.find(x => x.id === state.selectedArtifactId);
        next.refinement = { id: requestId, instruction: a.instruction, baseArtifactId: base.id, baseSha256: base.sha256 };
        next.phase = 'AWAITING_REFINEMENT';
      }
      if (event.type === 'requestExport') { next.exportRequest = a; next.phase = 'EXPORT_READY'; }
      if (event.type === 'answerQuestion') { next.lastAnswer = { ...a }; next.phase = state.question.resumePhase; next.question = null; }
      if (event.type === 'cancel') { next.phase = 'CANCELLED'; next.question = null; }
  }
  requireThat(next.artifacts.length <= LIMITS.artifacts, 'LIMIT_REACHED', 'Artifact limit reached.');
  return next;
}
