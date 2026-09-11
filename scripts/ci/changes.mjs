import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classify(paths) {
  const result = { full: false, docs: false, site: false };
  for (const path of paths) {
    if (path.startsWith('site/')) result.site = true;
    else if (/^(README\.md|docs\/.*\.md|[A-Z_-]+\.md)$/.test(path)) result.docs = true;
    else result.full = true; // Unknown files, fixtures, dependencies and CI changes fail closed.
  }
  if (!paths.length) result.full = true;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: output } = process.env;
  if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))) throw new Error('Missing comparison commits');
  // Include both names of renames and all deletions. No API pagination or path-filter limits.
  const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], { maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  const result = classify(paths);
  console.log(result);
  for (const [key, value] of Object.entries(result)) appendFileSync(output, `${key}=${value}\n`);
}
