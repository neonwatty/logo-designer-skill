// Scripted contract trace; deliberately makes no model-performance claim.
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { grade } from './grade.mjs';
const realRenderer = process.argv.includes('--real-renderer');
if (process.argv.slice(2).some(arg => arg !== '--real-renderer')) throw new Error('Usage: run.mjs [--real-renderer]');
const workspace = await mkdtemp(path.join(tmpdir(), 'logo-workflow-eval-'));
const bin = path.join(workspace, 'bin'); await mkdir(bin);
const executable = path.join(bin, 'resvg');
if (!realRenderer) await writeFile(executable, `#!${process.execPath}\nimport(${JSON.stringify(new URL('./fixture-renderer.mjs', import.meta.url).href)});\n`);
if (!realRenderer) await chmod(executable, 0o755);
const cli = fileURLToPath(new URL('../skills/logo-designer/scripts/task.mjs', import.meta.url));
const trace = { driver: 'scripted', model: null, renderer: realRenderer ? 'installed renderer' : 'synthetic PNG fixture', workspace, steps: [] };
let revision = 0;
function run(command, expectedCode = 0) {
  const started = performance.now();
  const processResult = spawnSync(process.execPath, [cli, '--logos', workspace], { input: JSON.stringify(command), encoding: 'utf8',
    env: { ...process.env, PATH: realRenderer ? process.env.PATH : `${bin}:${path.dirname(process.execPath)}` } });
  const result = JSON.parse(processResult.stdout);
  trace.steps.push({ command, result, exitCode: processResult.status, durationMs: performance.now() - started });
  assert.equal(processResult.status, expectedCode, JSON.stringify(result));
  if (result.context) revision = result.context.revision;
  return result;
}
const command = (kind, requestId, payload) => ({ version: 1, kind, taskId: 'demo', requestId, expectedRevision: revision, payload });
const named = (type, args = {}) => ({ type, arguments: args });
const source = color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="${color}"/></svg>`;
await writeFile(path.join(workspace, 'concept.svg'), source('blue'));
run(command('start', 'start', { brief: { format: 'icon', description: 'Circular blue project logo' }, sources: [{ id: 'concept', path: 'concept.svg', kind: 'logo' }] }));
run(command('userEvent', 'ambiguous', named('selectArtifact', { artifactId: 'unknown' })), 1);
run(command('action', 'question', named('askUser', { questionId: 'choice', prompt: 'Use the blue circle?', choices: ['concept'] })));
run({ version: 1, kind: 'context', taskId: 'demo' }); // new process resumes saved question
run(command('userEvent', 'answer', named('answerQuestion', { questionId: 'choice', answer: 'concept' })));
run(command('userEvent', 'select', named('selectArtifact', { artifactId: 'concept' })));
let result = run(command('userEvent', 'edit', named('requestRefinement', { instruction: 'Change blue to green' })));
await writeFile(path.join(workspace, 'candidate.svg'), source('green'));
run(command('action', 'submit', named('submitRefinement', { refinementId: 'edit', baseSha256: result.context.refinement.baseSha256, source: { id: 'green', path: 'candidate.svg', kind: 'logo' } })));
run(command('userEvent', 'select-green', named('selectArtifact', { artifactId: 'green' })));
run(command('userEvent', 'forged', named('exportVerified', {})), 1);
run(command('userEvent', 'export-request', named('requestExport', { artifactId: 'green', iconId: null, sizes: [16, 32, 64] })));
const render = command('action', 'render', named('renderExport'));
result = run(render); const replay = run(render);
assert.deepEqual(result.receipt, replay.receipt);
run(command('action', 'finish', named('finish')));
await writeFile(path.join(workspace, 'trace.json'), JSON.stringify(trace, null, 2));
const report = await grade(workspace, trace);
await writeFile(path.join(workspace, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ workspace, trace: path.join(workspace, 'trace.json'), report }, null, 2));
