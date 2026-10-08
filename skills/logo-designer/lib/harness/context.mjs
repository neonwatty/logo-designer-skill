import { actionSchemas, eventSchemas } from '../workflows/contracts.mjs';
import { allowedActions, allowedUserEvents } from '../workflows/design.mjs';
export function context(state) {
  return { version: 1, taskId: state.taskId, revision: state.revision, phase: state.phase, brief: state.brief,
    offeredArtifacts: state.artifacts.filter(x => state.offeredIds.includes(x.id)),
    icons: state.artifacts.filter(x => x.kind === 'icon'), selectedArtifactId: state.selectedArtifactId,
    question: state.question, lastAnswer: state.lastAnswer, refinement: state.refinement, exportRequest: state.exportRequest,
    pendingOperation: state.pending && { id: state.pending.id, kind: state.pending.kind, status: state.pending.status, failure: state.pending.failure },
    allowedActions: allowedActions(state).map(type => ({ type, argumentsSchema: actionSchemas[type] })),
    allowedUserEvents: allowedUserEvents(state).map(type => ({ type, argumentsSchema: eventSchemas[type] })),
    canRecover: Boolean(state.pending), exportManifest: state.exportManifest,
    recentEvents: state.events.slice(-3).map(({ revision, type }) => ({ revision, type })) };
}
