import { createHash } from "node:crypto";
import { parseAdapterReceipt } from "../integrations/lineage-receipt.mjs";
import { persistAcceptedSvg } from "../artifacts/iterations.mjs";

export const HANDOFF_RECEIPT_VERSION = 1;
export const HANDOFF_RECEIPT_KIND = "logo-designer.lineage-handoff-receipt";

const STATUS = {
  accepted: { exitCode: 0, action: "continue", guidance: "Continue refinement from the verified persisted iteration." },
  reverted: { exitCode: 20, action: "stop", guidance: "The proposal was reverted. Stop and revise explicitly before submitting again." },
  rejected: { exitCode: 21, action: "stop", guidance: "The proposal was rejected. Fix the reported issue before a new explicit submission." },
  stale: { exitCode: 22, action: "retry", guidance: "The canvas revision is stale. Re-read the current canvas before a new explicit submission." },
  disconnected: { exitCode: 23, action: "retry", guidance: "The canvas disconnected. Reconnect it before a new explicit submission." },
  unavailable: { exitCode: 24, action: "retry", guidance: "Lineage is unavailable. Start or reconnect it before a new explicit submission." },
  conflict: { exitCode: 25, action: "stop", guidance: "The transaction conflicted. Inspect the existing transaction; do not resubmit automatically." },
  timeout: { exitCode: 26, action: "stop", guidance: "Review timed out. Check Lineage for a terminal decision; do not resubmit automatically." },
};

function baseReceipt(receipt, status) {
  return {
    receiptVersion: HANDOFF_RECEIPT_VERSION,
    kind: HANDOFF_RECEIPT_KIND,
    status,
    transactionId: receipt.transaction.transactionId,
    sourcePath: receipt.transaction.sourcePath,
    revision: status === "accepted" ? receipt.outcome.artifact.revision : receipt.transaction.baseRevision,
  };
}

export async function consumeAdapterReceipt(input, logosDirectory) {
  const receipt = parseAdapterReceipt(input);
  const status = receipt.outcome.status;
  const terminal = STATUS[status];
  if (!("transaction" in receipt)) {
    return {
      exitCode: status === "invalid" ? 64 : terminal.exitCode,
      output: {
        receiptVersion: HANDOFF_RECEIPT_VERSION,
        kind: HANDOFF_RECEIPT_KIND,
        status,
        action: status === "invalid" ? "stop" : terminal.action,
        guidance: status === "invalid"
          ? "The Lineage adapter invocation is invalid. Stop without creating an iteration."
          : terminal.guidance,
      },
    };
  }
  if (status !== "accepted") {
    return { exitCode: terminal.exitCode, output: { ...baseReceipt(receipt, status), action: terminal.action, guidance: terminal.guidance } };
  }
  const persisted = await persistAcceptedSvg(receipt.outcome.artifact.svg, logosDirectory);
  return {
    exitCode: 0,
    output: { ...baseReceipt(receipt, status), ...persisted, action: terminal.action, guidance: terminal.guidance },
  };
}

// parsedReceipt is populated only after protocol validation succeeds.
export function handoffFailure(parsedReceipt) {
  if (parsedReceipt?.transaction && parsedReceipt.outcome?.status === "accepted") {
    const artifact = parsedReceipt.outcome.artifact;
    return {
      exitCode: 27,
      output: {
        ...baseReceipt(parsedReceipt, "accepted"),
        status: "persistence_failed",
        bytes: Buffer.byteLength(artifact.svg),
        sha256: createHash("sha256").update(artifact.svg).digest("hex"),
        action: "retry-persistence",
        guidance: `Canvas acceptance is authoritative, but local persistence failed. Fix storage, then rerun the same adapter command with --transaction-id ${parsedReceipt.transaction.transactionId} and the same artifact; do not create a new transaction.`,
      },
    };
  }
  return {
    exitCode: 64,
    output: {
      receiptVersion: HANDOFF_RECEIPT_VERSION,
      kind: HANDOFF_RECEIPT_KIND,
      status: "invalid",
      action: "stop",
      guidance: "The Lineage adapter receipt is invalid. Stop without creating an iteration.",
    },
  };
}
