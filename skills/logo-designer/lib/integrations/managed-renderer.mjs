import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkflowError } from '../workflows/contracts.mjs';
const exec = promisify(execFile);
// Installed executables only: recovery never downloads a converter.
export async function renderPng(source, output, width) {
  const candidates = [
    ['resvg', [source, output, '--width', String(width)]],
    ['rsvg-convert', ['-w', String(width), '-o', output, source]],
    ['inkscape', [source, '--export-type=png', `--export-filename=${output}`, `--export-width=${width}`]],
  ];
  for (const [tool, args] of candidates) {
    try { await exec(tool, args, { timeout: 30000, maxBuffer: 64 * 1024, killSignal: 'SIGKILL' }); return tool; }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new WorkflowError('RENDER_FAILED', `${tool} failed or timed out; inspect the pending operation before recovery.`);
    }
  }
  throw new WorkflowError('NO_RENDERER', 'Install resvg, rsvg-convert, or Inkscape, then recover the pending operation.');
}
