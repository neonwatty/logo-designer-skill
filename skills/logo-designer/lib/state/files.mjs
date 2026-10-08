import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireThat } from '../workflows/contracts.mjs';
export async function workspaceRoot(directory) {
  requireThat(path.isAbsolute(directory), 'INVALID_PATH', 'Workspace must be absolute.');
  const info = await lstat(directory);
  requireThat(info.isDirectory() && !info.isSymbolicLink(), 'INVALID_PATH', 'Workspace must be a real directory.');
  return realpath(directory);
}
export async function safePath(root, relative, allowMissing = false) {
  requireThat(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative)
    && !relative.includes('\\') && relative.split('/').every(x => x && x !== '.' && x !== '..'), 'INVALID_PATH', 'Use a contained relative path.');
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const info = await lstat(current);
      requireThat(!info.isSymbolicLink() && (i === parts.length - 1 || info.isDirectory()), 'INVALID_PATH', 'Symlinks and non-directory parents are unsupported.');
    } catch (error) { if (!(allowMissing && i === parts.length - 1 && error.code === 'ENOENT')) throw error; }
  }
  return current;
}
export async function ensureDirectory(root, relative) {
  let current = '';
  for (const part of relative.split('/')) {
    current = current ? `${current}/${part}` : part;
    const target = await safePath(root, current, true);
    await mkdir(target, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    requireThat((await lstat(target)).isDirectory(), 'INVALID_PATH', 'Expected directory.');
  }
  return path.join(root, relative);
}
export async function readBounded(filename, maximum) {
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    requireThat(info.isFile() && info.size <= maximum, 'LIMIT_REACHED', 'Input is not a bounded regular file.');
    const data = await handle.readFile();
    requireThat(data.length <= maximum, 'LIMIT_REACHED', 'Input grew beyond its limit.');
    return data;
  } finally { await handle.close(); }
}
export async function syncDirectory(directory) {
  const handle = await open(directory, constants.O_RDONLY);
  try { await handle.sync(); } catch (error) { if (!['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EBADF'].includes(error.code)) throw error; }
  finally { await handle.close(); }
}
export async function atomicWrite(filename, bytes) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    await rename(temp, filename); await syncDirectory(path.dirname(filename));
  } finally {
    await handle.close().catch(() => {});
    await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
