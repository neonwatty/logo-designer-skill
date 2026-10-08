import { MAX_SVG_BYTES, validateStrictCleanSvg } from "../artifacts/clean-svg.mjs";

export const ADAPTER_RECEIPT_VERSION = 1;
export const ADAPTER_RECEIPT_KIND = "lineage.logo-designer.adapter-receipt";
export const MAX_STDIN_BYTES = MAX_SVG_BYTES * 2 + 128 * 1024;
const ADAPTER_STATUSES = new Set([
  "accepted", "reverted", "rejected", "stale", "disconnected", "unavailable", "conflict", "timeout",
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ERROR_CODES = new Set([
  "invalid_payload", "payload_too_large", "unsupported_version", "unknown_operation", "unknown_field",
  "invalid_reference", "stale_document", "missing_target", "ambiguous_target", "locked_target", "invalid_svg",
  "unsafe_svg", "id_conflict", "reference_damage", "invalid_paint", "no_op", "pending_transaction",
]);
const PREFLIGHT_DIAGNOSTICS = {
  invalid: new Set(["invalid_arguments", "invalid_artifact"]),
  unavailable: new Set(["canvas_unavailable"]),
};

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exact(value, fields, label) {
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw new Error(`${label} has unexpected fields.`);
}

function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function boundedText(value, maximum, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function parseRejectedResult(value, transactionId) {
  const result = record(value, "Rejected result");
  exact(result, ["transactionId", "status", "error"], "Rejected result");
  if (result.transactionId !== transactionId || result.status !== "rejected") throw new Error("Rejected result identity is invalid.");
  const error = record(result.error, "Rejected error");
  const allowed = ["code", "message", "operationId", "path"];
  if (!Object.keys(error).every((key) => allowed.includes(key)) || !("code" in error) || !("message" in error)) {
    throw new Error("Rejected error has unexpected fields.");
  }
  if (!ERROR_CODES.has(error.code)) throw new Error("Rejected error code is invalid.");
  boundedText(error.message, 4096, "Rejected error message");
  if (error.operationId !== undefined) identifier(error.operationId, "Rejected operation identity");
  if (error.path !== undefined) boundedText(error.path, 4096, "Rejected error path");
}

export function parseAdapterReceipt(input) {
  let parsed;
  try { parsed = JSON.parse(input); }
  catch { throw new Error("Adapter receipt is not valid JSON."); }
  const receipt = record(parsed, "Adapter receipt");
  if (receipt.receiptVersion !== ADAPTER_RECEIPT_VERSION || receipt.kind !== ADAPTER_RECEIPT_KIND) {
    throw new Error("Adapter receipt version or kind is unsupported.");
  }

  if (!("transaction" in receipt)) {
    exact(receipt, ["receiptVersion", "kind", "outcome"], "Preflight adapter receipt");
    const outcome = record(receipt.outcome, "Preflight outcome");
    exact(outcome, ["status", "diagnostic"], "Preflight outcome");
    if ((outcome.status !== "invalid" && outcome.status !== "unavailable")
      || typeof outcome.diagnostic !== "string"
      || !PREFLIGHT_DIAGNOSTICS[outcome.status].has(outcome.diagnostic)) {
      throw new Error("Preflight outcome is invalid.");
    }
    return receipt;
  }

  exact(receipt, ["receiptVersion", "kind", "transaction", "outcome"], "Adapter receipt");

  const transaction = record(receipt.transaction, "Receipt transaction");
  exact(transaction, ["transactionId", "sessionId", "sourcePath", "baseRevision"], "Receipt transaction");
  const transactionId = identifier(transaction.transactionId, "Transaction identity");
  identifier(transaction.sessionId, "Session identity");
  const sourcePath = boundedText(transaction.sourcePath, 4096, "Source path");
  if (!Number.isSafeInteger(transaction.baseRevision) || transaction.baseRevision < 0) throw new Error("Base revision is invalid.");

  const outcome = record(receipt.outcome, "Receipt outcome");
  if (typeof outcome.status !== "string" || !ADAPTER_STATUSES.has(outcome.status)) throw new Error("Receipt outcome status is unsupported.");
  if (outcome.transactionId !== transactionId) throw new Error("Receipt outcome transaction identity does not match.");

  if (outcome.status === "accepted") {
    exact(outcome, ["status", "transactionId", "artifact"], "Accepted outcome");
    const artifact = record(outcome.artifact, "Accepted artifact");
    exact(artifact, ["sourcePath", "revision", "svg"], "Accepted artifact");
    if (artifact.sourcePath !== sourcePath || artifact.revision !== transaction.baseRevision + 1) {
      throw new Error("Accepted artifact document identity does not match.");
    }
    validateStrictCleanSvg(artifact.svg);
  } else if (outcome.status === "rejected") {
    exact(outcome, ["status", "transactionId", "error"], "Rejected outcome");
    parseRejectedResult(outcome.error, transactionId);
  } else if (["reverted", "stale", "disconnected"].includes(outcome.status)) {
    exact(outcome, ["status", "transactionId"], `${outcome.status} outcome`);
  } else {
    exact(outcome, ["status", "transactionId", "message"], `${outcome.status} outcome`);
    boundedText(outcome.message, 4096, `${outcome.status} message`);
  }
  return receipt;
}
