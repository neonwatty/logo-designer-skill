#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MAX_STDIN_BYTES, parseAdapterReceipt } from "../lib/integrations/lineage-receipt.mjs";
import { consumeAdapterReceipt, handoffFailure } from "../lib/workflows/lineage-handoff.mjs";

// Preserve the original import surface as well as the stdin-only command.
export { MAX_SVG_BYTES } from "../lib/artifacts/clean-svg.mjs";
export {
  ADAPTER_RECEIPT_VERSION, ADAPTER_RECEIPT_KIND, MAX_STDIN_BYTES, parseAdapterReceipt,
} from "../lib/integrations/lineage-receipt.mjs";
export {
  HANDOFF_RECEIPT_VERSION, HANDOFF_RECEIPT_KIND, consumeAdapterReceipt,
} from "../lib/workflows/lineage-handoff.mjs";

export async function readBoundedStdin(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_STDIN_BYTES) throw new Error("Adapter receipt exceeds the stdin size limit.");
    chunks.push(bytes);
  }
  if (size === 0) throw new Error("Adapter receipt is required on stdin.");
  return Buffer.concat(chunks).toString("utf8");
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--logos" || !argv[1]) throw new Error("Usage: lineage-handoff.mjs --logos /absolute/path/to/logos < adapter-receipt.json");
  return argv[1];
}

// Node resolves module URLs through symlinks (including macOS /var → /private/var).
const entryPath = process.argv[1] && await realpath(process.argv[1]).catch(() => undefined);
const isMain = entryPath === fileURLToPath(import.meta.url);
if (isMain) {
  let parsedReceipt;
  let result;
  try {
    const logosDirectory = parseArguments(process.argv.slice(2));
    const input = await readBoundedStdin();
    parsedReceipt = parseAdapterReceipt(input);
    result = await consumeAdapterReceipt(input, logosDirectory);
  } catch {
    result = handoffFailure(parsedReceipt);
  }
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
