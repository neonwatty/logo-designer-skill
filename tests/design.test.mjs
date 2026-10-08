import test from 'node:test';
import assert from 'node:assert/strict';
import { start, transition, allowedActions, validateAction, validateUserEvent } from '../skills/logo-designer/lib/workflows/design.mjs';
const event = (type, arguments_ = {}) => ({ type, arguments: arguments_ });
const artifact = { id: 'a', kind: 'logo', sha256: 'a'.repeat(64), parentArtifactId: null };
function initial() { return transition(start('task', { format: 'icon', description: 'A logo' }), event('importsRegistered', { artifacts: [artifact] })); }
test('selection, refinement, re-selection and verified completion are guarded', () => {
  let state = initial();
  assert.throws(() => validateUserEvent(state, event('selectArtifact', { artifactId: 'missing' })), { code: 'SELECTION_REQUIRED' });
  assert.throws(() => validateAction(state, event('renderExport')), { code: 'INVALID_TRANSITION' });
  state = transition(state, event('selectArtifact', { artifactId: 'a' }));
  state = transition(state, event('requestRefinement', { instruction: 'Thicker strokes' }), 'edit1');
  assert.equal(state.refinement.baseSha256, artifact.sha256);
  assert.throws(() => validateAction(state, event('submitRefinement', { refinementId: 'wrong', baseSha256: artifact.sha256, source: { id: 'b', path: 'b.svg', kind: 'logo' } })), { code: 'STALE_REFINEMENT' });
  state = transition(state, event('refinementRegistered', { artifact: { ...artifact, id: 'b', parentArtifactId: 'a' } }));
  assert.equal(state.selectedArtifactId, null);
  state = transition(state, event('selectArtifact', { artifactId: 'b' }));
  state = transition(state, event('requestExport', { artifactId: 'b', iconId: null, sizes: [32] }));
  assert.throws(() => validateUserEvent(state, event('exportVerified', { manifest: {} })), { code: 'FORBIDDEN_EVENT' });
  state = transition(state, event('exportVerified', { manifest: { artifactId: 'b', files: [{}] } }));
  assert.deepEqual(allowedActions(state), ['finish']);
  assert.throws(() => transition(state, event('cancel')), { code: 'INVALID_TRANSITION' });
});
test('questions persist their resume phase and reject stale or unoffered responses', () => {
  const base = initial();
  const waiting = transition(base, event('askUser', { questionId: 'q1', prompt: 'Which?', choices: ['a'] }));
  assert.equal(base.phase, 'AWAITING_SELECTION');
  assert.throws(() => transition(waiting, event('answerQuestion', { questionId: 'old', answer: 'a' })), { code: 'STALE_QUESTION' });
  assert.throws(() => transition(waiting, event('answerQuestion', { questionId: 'q1', answer: 'b' })), { code: 'INVALID_ANSWER' });
  const resumed = transition(waiting, event('answerQuestion', { questionId: 'q1', answer: 'a' }));
  assert.equal(resumed.phase, 'AWAITING_SELECTION'); assert.equal(resumed.selectedArtifactId, null);
});
test('pending operation permits cancellation but blocks new model actions', () => {
  const state = { ...initial(), pending: { id: 'op' } };
  assert.deepEqual(allowedActions(state), []);
  assert.throws(() => transition(state, event('selectArtifact', { artifactId: 'a' })), { code: 'INVALID_TRANSITION' });
  const cancelled = transition(state, event('cancel'));
  assert.equal(cancelled.phase, 'CANCELLED'); assert.equal(cancelled.pending.id, 'op');
});
test('schemas reject unknown fields and completion claims', () => {
  assert.throws(() => validateUserEvent(initial(), { type: 'selectArtifact', arguments: { artifactId: 'a', phase: 'COMPLETE' } }));
  assert.throws(() => validateAction(initial(), event('finish')));
  assert.throws(() => validateAction(initial(), { type: 'askUser', arguments: null }));
});
