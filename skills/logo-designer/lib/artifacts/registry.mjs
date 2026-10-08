import { createHash, randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { MAX_SVG_BYTES, validateStrictCleanSvg } from './clean-svg.mjs';
import { requireThat } from '../workflows/contracts.mjs';
import { ensureDirectory, readBounded, safePath, syncDirectory } from '../state/files.mjs';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function svgDimensions(bytes) {
  const svg = bytes.toString('utf8'); validateStrictCleanSvg(svg);
  const tag = svg.replace(/<!--[\s\S]*?-->/gu, '').match(/<svg\s[^>]*>/u)?.[0];
  const value = tag?.match(/\bviewBox\s*=\s*(['"])(.*?)\1/u)?.[2];
  const numbers = value?.trim().split(/[\s,]+/u).map(Number);
  requireThat(numbers?.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0, 'INVALID_SVG', 'Managed SVGs require a finite positive viewBox.');
  return { width: numbers[2], height: numbers[3] };
}
export async function inspectSource(root, source, parentArtifactId = null) {
  const bytes = await readBounded(await safePath(root, source.path), MAX_SVG_BYTES);
  const dimensions = svgDimensions(bytes);
  requireThat(source.kind !== 'icon' || dimensions.width === dimensions.height, 'INVALID_SVG', 'Icon must have a square viewBox.');
  return { bytes, record: { id: source.id, kind: source.kind, parentArtifactId, sha256: sha256(bytes), bytes: bytes.length,
    ...dimensions, path: `.logo-designer/artifacts/${sha256(bytes)}.svg` }, sourcePath: source.path };
}
export async function verifyArtifact(root, artifact) {
  const bytes = await readBounded(await safePath(root, artifact.path), MAX_SVG_BYTES);
  requireThat(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, 'ARTIFACT_CHANGED', 'Registered artifact bytes changed.', { artifactId: artifact.id });
  return bytes;
}
export async function publishArtifact(root, inspected) {
  await ensureDirectory(root, '.logo-designer/artifacts');
  const filename = await safePath(root, inspected.record.path, true);
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(inspected.bytes); await handle.sync(); await handle.close();
    await link(temporary, filename).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await verifyArtifact(root, inspected.record); await syncDirectory(path.dirname(filename));
    return inspected.record;
  } finally { await handle.close().catch(() => {}); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
