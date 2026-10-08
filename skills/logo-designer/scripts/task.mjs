#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execute } from '../lib/harness/execute-action.mjs';
import { context } from '../lib/harness/context.mjs';
import { loadTask } from '../lib/state/task-store.mjs';
import { LIMITS } from '../lib/workflows/design.mjs';
import { requireThat } from '../lib/workflows/contracts.mjs';
export async function main(argv, stream = process.stdin) {
  let workspace;
  try {
    requireThat(argv.length === 2 && argv[0] === '--logos', 'INVALID_INPUT', 'Usage: task.mjs --logos /absolute/path/to/logos < command.json');
    workspace = argv[1]; let input = ''; let bytes = 0;
    for await (const chunk of stream) { bytes += Buffer.byteLength(chunk); requireThat(bytes <= LIMITS.inputBytes, 'LIMIT_REACHED', 'Command exceeds 64 KiB.'); input += chunk; }
    const result = await execute(workspace, JSON.parse(input));
    return { exitCode: result.context?.pendingOperation ? 2 : 0, result };
  } catch (error) {
    let current;
    try { const state = workspace && await loadTask(workspace); if (state) current = context(state); } catch { /* unavailable state is not invented */ }
    return { exitCode: 1, result: { error: { code: error.code ?? 'INVALID_INPUT', message: error.message, details: error.details }, ...(current ? { context: current } : {}) } };
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) {
  const { result, exitCode } = await main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = exitCode;
}
