import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './changes.mjs';
import { passed } from './gate.mjs';

test('README selects docs only', () => assert.deepEqual(classify(['README.md']), { full: false, docs: true, site: false }));
test('site selects site only', () => assert.deepEqual(classify(['site/assets/demo.gif']), { full: false, docs: false, site: true }));
test('mixed docs and site combine', () => assert.deepEqual(classify(['README.md', 'site/index.html']), { full: false, docs: true, site: true }));
test('skills, scripts, config, dependencies and unknown paths retain full checks', () => {
  for (const path of ['skills/logo/SKILL.md', 'scripts/export.mjs', 'tests/export.test.mjs', '.claude-plugin/plugin.json', '.github/workflows/validate.yml', 'package-lock.json', 'new-file']) {
    assert.equal(classify(['README.md', path]).full, true);
  }
  assert.equal(classify([]).full, true);
});
const jobs = (full, docs) => ({
  changes: { result: 'success', outputs: { full: String(full), docs: String(docs) } },
  ...Object.fromEntries(['content', 'validate-plugin', 'validate-markdown', 'test-scripts'].map(name => [name, { result: name === 'content' || full || (name === 'validate-markdown' && docs) ? 'success' : 'skipped' }])),
});
test('aggregate accepts successful selected checks', () => {
  for (const pair of [[true, false], [false, true], [false, false]]) assert.equal(passed(jobs(...pair)), true);
});
test('aggregate rejects failure, cancellation and unexpected skips', () => {
  for (const name of Object.keys(jobs(true, true))) for (const result of ['failure', 'cancelled', 'skipped']) {
    const state = jobs(true, true);
    state[name].result = result;
    assert.equal(passed(state), false);
  }
});
