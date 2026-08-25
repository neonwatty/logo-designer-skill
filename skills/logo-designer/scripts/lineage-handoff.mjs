#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ADAPTER_RECEIPT_VERSION = 1;
export const ADAPTER_RECEIPT_KIND = "lineage.logo-designer.adapter-receipt";
export const HANDOFF_RECEIPT_VERSION = 1;
export const HANDOFF_RECEIPT_KIND = "logo-designer.lineage-handoff-receipt";
export const MAX_SVG_BYTES = 5 * 1024 * 1024;
export const MAX_STDIN_BYTES = MAX_SVG_BYTES * 2 + 128 * 1024;

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

const ACTIVE_SVG_ELEMENTS = new Set([
  "a", "animate", "animateMotion", "animateTransform", "discard", "foreignObject", "handler", "iframe",
  "link", "listener", "object", "script", "set", "style",
]);
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu;

function validateXmlCharacters(value) {
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined || point === 0 || (point < 0x20 && ![0x09, 0x0a, 0x0d].includes(point))
      || (point >= 0xd800 && point <= 0xdfff) || point > 0x10ffff
      || (point & 0xffff) === 0xfffe || (point & 0xffff) === 0xffff) {
      throw new Error("Accepted artifact contains an invalid XML character.");
    }
  }
}

function decodeXmlValue(value) {
  validateXmlCharacters(value);
  if (value.includes("<") || value.replace(XML_ENTITY, "").includes("&")) throw new Error("Accepted artifact contains invalid XML text.");
  return value.replace(XML_ENTITY, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const point = Number.parseInt(entity.slice(entity[2] === "x" ? 3 : 2, -1), entity[2] === "x" ? 16 : 10);
    const decoded = Number.isSafeInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : "\u0000";
    validateXmlCharacters(decoded);
    return decoded;
  });
}

function validateSvgAttributes(tagName, attributes, inheritedXlink) {
  let xlinkDeclared = inheritedXlink;
  const decoded = new Map();
  for (const [name, raw] of attributes) decoded.set(name, decodeXmlValue(raw));
  if (decoded.has("xmlns") && decoded.get("xmlns") !== "http://www.w3.org/2000/svg") throw new Error("Accepted artifact declares an unsupported default namespace.");
  if (decoded.has("xmlns:xlink")) {
    if (decoded.get("xmlns:xlink") !== "http://www.w3.org/1999/xlink") throw new Error("Accepted artifact declares an unsupported link namespace.");
    xlinkDeclared = true;
  }
  for (const [name, value] of decoded) {
    const lower = name.toLowerCase();
    if (/^data-(?:lineage|agent|review|transport)-/iu.test(name) || lower.startsWith("on") || lower === "style") {
      throw new Error("Accepted artifact contains editor, protocol, or active metadata.");
    }
    if (name.includes(":")) {
      if (name === "xmlns:xlink") continue;
      if (name === "xlink:href" && xlinkDeclared) { /* supported link namespace */ }
      else if (name === "xml:lang" || name === "xml:space") { /* supported XML namespace */ }
      else throw new Error("Accepted artifact contains an unsupported attribute namespace.");
    } else if (name === "xmlns") continue;
    if ((lower === "href" || lower === "src" || lower === "xlink:href") && !value.startsWith("#")) {
      throw new Error("Accepted artifact contains an external reference.");
    }
    if (value.includes("\\") || value.includes("/*")) throw new Error("Accepted artifact contains an escaped URL-bearing construct.");
    for (const match of value.matchAll(/url\(\s*([^)]*)\)/giu)) {
      if (!match[1].trim().replace(/^['"]|['"]$/gu, "").startsWith("#")) throw new Error("Accepted artifact contains an external URL.");
    }
    if (/(?:^|[\s('"=])(?:https?|file|data|javascript):|^\/\//iu.test(value)) throw new Error("Accepted artifact contains a URL-bearing construct.");
  }
  if ((tagName === "metadata" && decoded.get("id") === "lineage-logo-edit")
    || /(?:^|\s)svg_select(?:_|\s|$)/u.test(decoded.get("class") ?? "")) {
    throw new Error("Accepted artifact contains editor metadata.");
  }
  return xlinkDeclared;
}

function validateStrictCleanSvg(svg) {
  if (typeof svg !== "string" || svg.length === 0 || Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error("Accepted artifact SVG is empty or too large.");
  validateXmlCharacters(svg);
  let cursor = svg.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (svg.startsWith("<?xml", cursor)) {
    const declaration = /^<\?xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*\?>/u.exec(svg.slice(cursor));
    if (!declaration) throw new Error("Accepted artifact XML declaration is invalid.");
    const encoding = /\sencoding=(['"])([^'"]+)\1/u.exec(declaration[0])?.[2];
    if (encoding && encoding.toLowerCase() !== "utf-8") throw new Error("Accepted artifact XML encoding must be UTF-8.");
    cursor += declaration[0].length;
  }
  const stack = [];
  let rootSeen = false;
  let rootClosed = false;
  while (cursor < svg.length) {
    if (svg.startsWith("<!--", cursor)) {
      const end = svg.indexOf("-->", cursor + 4);
      if (end < 0 || svg.slice(cursor + 4, end).includes("--")) throw new Error("Accepted artifact comment is malformed.");
      cursor = end + 3;
      continue;
    }
    if (svg[cursor] !== "<") {
      const end = svg.indexOf("<", cursor);
      const text = svg.slice(cursor, end < 0 ? svg.length : end);
      if ((stack.length === 0 && text.trim()) || text.includes("]]>") ) throw new Error("Accepted artifact must contain exactly one standalone SVG root.");
      decodeXmlValue(text);
      cursor = end < 0 ? svg.length : end;
      continue;
    }
    if (svg.startsWith("<?", cursor) || svg.startsWith("<!", cursor)) throw new Error("Accepted artifact declarations and processing instructions are not allowed.");
    if (svg.startsWith("</", cursor)) {
      const closing = /^<\/([A-Za-z_][A-Za-z0-9_.-]*)\s*>/u.exec(svg.slice(cursor));
      if (!closing || stack.at(-1)?.name !== closing[1]) throw new Error("Accepted artifact closing tag is malformed.");
      stack.pop();
      cursor += closing[0].length;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    let quote = "";
    let end = cursor + 1;
    for (; end < svg.length; end += 1) {
      const character = svg[end];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= svg.length || quote) throw new Error("Accepted artifact opening tag is malformed.");
    let inside = svg.slice(cursor + 1, end);
    const selfClosing = /\/\s*$/u.test(inside);
    if (selfClosing) inside = inside.replace(/\/\s*$/u, "");
    const tag = /^([A-Za-z_][A-Za-z0-9_.-]*)/u.exec(inside);
    if (!tag || rootClosed) throw new Error("Accepted artifact must contain exactly one standalone SVG root.");
    const tagName = tag[1];
    if ((!rootSeen && tagName !== "svg") || ACTIVE_SVG_ELEMENTS.has(tagName) || tagName.startsWith("animate")) {
      throw new Error("Accepted artifact contains an invalid root or active element.");
    }
    const attributes = new Map();
    let rest = inside.slice(tag[0].length);
    while (rest.length > 0) {
      const attribute = /^\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])([\s\S]*?)\2/u.exec(rest);
      if (!attribute || attributes.has(attribute[1])) throw new Error("Accepted artifact attribute syntax is malformed.");
      attributes.set(attribute[1], attribute[3]);
      rest = rest.slice(attribute[0].length);
    }
    if (!rootSeen && attributes.get("xmlns") !== "http://www.w3.org/2000/svg") {
      throw new Error("Accepted artifact root must declare the SVG namespace.");
    }
    const xlinkDeclared = validateSvgAttributes(tagName, attributes, stack.at(-1)?.xlinkDeclared ?? false);
    rootSeen = true;
    if (!selfClosing) stack.push({ name: tagName, xlinkDeclared });
    else if (stack.length === 0) rootClosed = true;
    cursor = end + 1;
  }
  if (!rootSeen || !rootClosed || stack.length !== 0) throw new Error("Accepted artifact is incomplete or has no standalone SVG root.");
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
  if (typeof outcome.status !== "string" || !Object.hasOwn(STATUS, outcome.status)) throw new Error("Receipt outcome status is unsupported.");
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

async function requireDirectory(directory, label) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory, not a symlink.`);
  return await realpath(directory);
}

async function prepareIterations(logosDirectory) {
  if (!path.isAbsolute(logosDirectory)) throw new Error("--logos must be an absolute directory path.");
  const logosReal = await requireDirectory(logosDirectory, "Logos directory");
  const iterations = path.join(logosDirectory, "iterations");
  let created = false;
  try { await mkdir(iterations, { mode: 0o755 }); created = true; }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  const iterationsReal = await requireDirectory(iterations, "Iterations directory");
  if (path.dirname(iterationsReal) !== logosReal) throw new Error("Iterations directory escapes the explicit logos directory.");
  if (created) await syncDirectoryMetadata(logosReal);
  return iterationsReal;
}

async function startingIteration(iterationsDirectory) {
  let maximum = 0;
  for (const name of await readdir(iterationsDirectory)) {
    const match = /^iteration-(\d+)\.svg$/u.exec(name);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  if (!Number.isSafeInteger(maximum) || maximum >= Number.MAX_SAFE_INTEGER) throw new Error("Iteration sequence is exhausted.");
  return maximum + 1;
}

async function removeOwnedFinal(filename, device, inode) {
  try {
    const info = await lstat(filename);
    if (info.isFile() && !info.isSymbolicLink() && info.dev === device && info.ino === inode) await unlink(filename);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function syncDirectoryMetadata(directory) {
  let handle;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EBADF"].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function persistAcceptedSvg(svg, logosDirectory) {
  const iterations = await prepareIterations(logosDirectory);
  const bytes = Buffer.from(svg, "utf8");
  const temporary = path.join(iterations, `.lineage-handoff-${process.pid}-${randomUUID()}.tmp`);
  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  const file = await open(temporary, flags, 0o600);
  let finalPath;
  let tempInfo;
  try {
    await file.writeFile(bytes);
    await file.sync();
    tempInfo = await file.stat();
    await file.close();

    let iteration = await startingIteration(iterations);
    for (;;) {
      finalPath = path.join(iterations, `iteration-${iteration}.svg`);
      try { await link(temporary, finalPath); break; }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        iteration += 1;
        if (!Number.isSafeInteger(iteration)) throw new Error("Iteration sequence is exhausted.");
      }
    }

    const readFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const publishedFile = await open(finalPath, readFlags);
    let published;
    try {
      const publishedInfo = await publishedFile.stat();
      if (!publishedInfo.isFile() || publishedInfo.dev !== tempInfo.dev || publishedInfo.ino !== tempInfo.ino) {
        throw new Error("Published iteration identity changed before verification.");
      }
      published = await publishedFile.readFile();
    } finally { await publishedFile.close(); }
    if (!published.equals(bytes)) throw new Error("Published iteration bytes do not match the accepted artifact.");
    const sha256 = createHash("sha256").update(published).digest("hex");
    await unlink(temporary);
    await syncDirectoryMetadata(iterations);
    return {
      iterationPath: path.posix.join("iterations", path.basename(finalPath)),
      bytes: published.byteLength,
      sha256,
    };
  } catch (error) {
    try { await file.close(); } catch { /* already closed */ }
    if (finalPath && tempInfo) await removeOwnedFinal(finalPath, tempInfo.dev, tempInfo.ino);
    try { await unlink(temporary); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    throw error;
  }
}

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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let parsedReceipt;
  try {
    const logosDirectory = parseArguments(process.argv.slice(2));
    const input = await readBoundedStdin();
    parsedReceipt = parseAdapterReceipt(input);
    const result = await consumeAdapterReceipt(input, logosDirectory);
    process.stdout.write(`${JSON.stringify(result.output)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    if (parsedReceipt?.transaction && parsedReceipt.outcome?.status === "accepted") {
      const artifact = parsedReceipt.outcome.artifact;
      process.stdout.write(`${JSON.stringify({
        ...baseReceipt(parsedReceipt, "accepted"),
        status: "persistence_failed",
        bytes: Buffer.byteLength(artifact.svg),
        sha256: createHash("sha256").update(artifact.svg).digest("hex"),
        action: "retry-persistence",
        guidance: `Canvas acceptance is authoritative, but local persistence failed. Fix storage, then rerun the same adapter command with --transaction-id ${parsedReceipt.transaction.transactionId} and the same artifact; do not create a new transaction.`,
      })}\n`);
      process.exitCode = 27;
    } else {
      process.stdout.write(`${JSON.stringify({
        receiptVersion: HANDOFF_RECEIPT_VERSION,
        kind: HANDOFF_RECEIPT_KIND,
        status: "invalid",
        action: "stop",
        guidance: "The Lineage adapter receipt is invalid. Stop without creating an iteration.",
      })}\n`);
      process.exitCode = 64;
    }
  }
}
