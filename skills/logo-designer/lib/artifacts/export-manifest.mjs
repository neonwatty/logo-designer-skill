import { randomUUID } from 'node:crypto';
import { rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { requireThat } from '../workflows/contracts.mjs';
import { atomicWrite, ensureDirectory, readBounded, safePath, syncDirectory } from '../state/files.mjs';
import { sha256, verifyArtifact } from './registry.mjs';
import { decodePng } from './png.mjs';
import { renderPng } from '../integrations/managed-renderer.mjs';
function expectedFiles(operation) {
  const outputs = [];
  for (const { record } of operation.inputs) {
    const family = record.id === operation.exportRequest.artifactId ? 'logo' : 'icon';
    for (const width of operation.exportRequest.sizes) {
      const height = Math.max(1, Math.round(width * record.height / record.width));
      requireThat(height <= 4096, 'INVALID_DIMENSIONS', 'Export height exceeds 4096 pixels.');
      outputs.push({ filename: `${family}-${width}.png`, width, height, artifact: record });
    }
  }
  return outputs;
}
async function verifyBundle(root, relative, operation, expected, renderer = undefined) {
  const directory = await safePath(root, relative);
  const names = (await readdir(directory)).sort();
  requireThat(JSON.stringify(names) === JSON.stringify([...expected.map(x => x.filename), 'manifest.json'].sort()), 'INVALID_EXPORT', 'Export bundle has missing or unexpected files.');
  const stored = JSON.parse((await readBounded(await safePath(root, `${relative}/manifest.json`), 64 * 1024)).toString());
  requireThat(stored.operationId === operation.id && stored.artifactId === operation.exportRequest.artifactId
    && JSON.stringify(stored.inputHashes) === JSON.stringify(operation.inputs.map(x => ({ id: x.record.id, sha256: x.record.sha256 }))), 'INVALID_EXPORT', 'Export manifest input identity changed.');
  const files = [];
  for (const output of expected) {
    const bytes = await readBounded(await safePath(root, `${relative}/${output.filename}`), 64 * 1024 * 1024);
    const decoded = decodePng(bytes);
    requireThat(decoded.width === output.width && decoded.height === output.height, 'INVALID_DIMENSIONS', 'PNG dimensions do not match the requested aspect ratio.');
    files.push({ path: `.logo-designer/exports/${operation.id}/${output.filename}`, bytes: bytes.length, width: decoded.width, height: decoded.height, sha256: sha256(bytes) });
  }
  requireThat(JSON.stringify(stored.files) === JSON.stringify(files), 'INVALID_EXPORT', 'Export files do not match their manifest.');
  return { version: 1, operationId: operation.id, artifactId: operation.exportRequest.artifactId, inputHashes: stored.inputHashes, renderer: renderer ?? stored.renderer, files };
}
export async function performExport(root, operation, hooks = {}) {
  for (const { record } of operation.inputs) await verifyArtifact(root, record);
  const expected = expectedFiles(operation);
  await ensureDirectory(root, '.logo-designer/exports');
  const finalRelative = `.logo-designer/exports/${operation.id}`;
  try {
    await safePath(root, finalRelative);
    return await verifyBundle(root, finalRelative, operation, expected);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stagingRelative = `.logo-designer/exports/.${operation.id}-${randomUUID()}.staging`;
  const staging = await ensureDirectory(root, stagingRelative);
  try {
    const files = []; const renderers = new Set();
    for (const output of expected) {
      const inputPath = await safePath(root, output.artifact.path);
      const outputPath = path.join(staging, output.filename);
      const renderer = await (hooks.render ?? renderPng)(inputPath, outputPath, output.width, output.height);
      renderers.add(renderer);
      const bytes = await readBounded(outputPath, 64 * 1024 * 1024);
      const decoded = decodePng(bytes);
      requireThat(decoded.width === output.width && decoded.height === output.height, 'INVALID_DIMENSIONS', 'Renderer did not preserve the expected dimensions.');
      // Sync the rendered file before publishing the bundle.
      await atomicWrite(outputPath, bytes);
      files.push({ path: `${finalRelative}/${output.filename}`, bytes: bytes.length, width: decoded.width, height: decoded.height, sha256: sha256(bytes) });
    }
    for (const { record } of operation.inputs) await verifyArtifact(root, record);
    const manifest = { version: 1, operationId: operation.id, artifactId: operation.exportRequest.artifactId,
      inputHashes: operation.inputs.map(x => ({ id: x.record.id, sha256: x.record.sha256 })), renderer: [...renderers].join(','), files };
    await atomicWrite(path.join(staging, 'manifest.json'), JSON.stringify(manifest));
    await verifyBundle(root, stagingRelative, operation, expected);
    // The operation has one recorded live owner; never replace an existing bundle.
    let exists = false;
    try { await safePath(root, finalRelative); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    requireThat(!exists, 'OUTPUT_CONFLICT', 'Export bundle already exists.');
    await rename(staging, path.join(root, finalRelative));
    await syncDirectory(path.join(root, '.logo-designer/exports'));
    await hooks.afterExportPublication?.();
    return verifyBundle(root, finalRelative, operation, expected);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
