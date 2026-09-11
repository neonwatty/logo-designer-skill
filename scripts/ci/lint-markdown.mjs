import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const { BASE_SHA: base, HEAD_SHA: head, FULL: full } = process.env;
if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))) throw new Error('Missing comparison commits');
const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head]).toString().split('\0');
// Preserve existing full lint coverage; add changed docs without linting unrelated historical plans.
const files = [...new Set([
  ...(full === 'true' ? ['README.md', 'skills/**/*.md'] : []),
  ...changed.filter(path => path.endsWith('.md') && existsSync(path)),
])];
if (files.length) {
  const result = spawnSync('npx', ['--no-install', 'markdownlint-cli2', ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
console.log('No surviving Markdown files to lint');
