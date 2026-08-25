import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import test from "node:test";
import {
  ADAPTER_RECEIPT_KIND, ADAPTER_RECEIPT_VERSION, consumeAdapterReceipt, MAX_STDIN_BYTES,
  MAX_SVG_BYTES, parseAdapterReceipt, readBoundedStdin,
} from "../skills/logo-designer/scripts/lineage-handoff.mjs";

const cleanSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';

function receipt(status = "accepted", overrides = {}) {
  const transaction = {
    transactionId: "tx-123", sessionId: "session-123", sourcePath: "/art/logo.svg", baseRevision: 7,
    ...overrides.transaction,
  };
  let outcome;
  if (status === "accepted") outcome = {
    status, transactionId: transaction.transactionId,
    artifact: { sourcePath: transaction.sourcePath, revision: transaction.baseRevision + 1, svg: cleanSvg },
  };
  else if (status === "rejected") outcome = {
    status, transactionId: transaction.transactionId,
    error: { transactionId: transaction.transactionId, status: "rejected", error: { code: "invalid_payload", message: "Canvas rejected the transaction." } },
  };
  else if (["reverted", "stale", "disconnected"].includes(status)) outcome = { status, transactionId: transaction.transactionId };
  else outcome = { status, transactionId: transaction.transactionId, message: `${status} message` };
  return JSON.stringify({
    receiptVersion: ADAPTER_RECEIPT_VERSION,
    kind: ADAPTER_RECEIPT_KIND,
    transaction,
    outcome: { ...outcome, ...overrides.outcome },
  });
}

function preflight(status, diagnostic) {
  return JSON.stringify({ receiptVersion: ADAPTER_RECEIPT_VERSION, kind: ADAPTER_RECEIPT_KIND, outcome: { status, diagnostic } });
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "logo-lineage-handoff-"));
  const logos = path.join(root, "logos");
  await mkdir(logos);
  return { root, logos };
}

test("accepted receipts publish, reread, byte-compare, and hash one metadata-only iteration", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await consumeAdapterReceipt(receipt(), logos);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, {
    receiptVersion: 1,
    kind: "logo-designer.lineage-handoff-receipt",
    status: "accepted",
    transactionId: "tx-123",
    sourcePath: "/art/logo.svg",
    revision: 8,
    iterationPath: "iterations/iteration-1.svg",
    bytes: Buffer.byteLength(cleanSvg),
    sha256: createHash("sha256").update(cleanSvg).digest("hex"),
    action: "continue",
    guidance: "Continue refinement from the verified persisted iteration.",
  });
  assert.equal(await readFile(path.join(logos, result.output.iterationPath), "utf8"), cleanSvg);
  assert.equal(JSON.stringify(result.output).includes("<svg"), false);
  assert.deepEqual(await readdir(path.join(logos, "iterations")), ["iteration-1.svg"]);
});

test("existing iteration collisions are never overwritten or silently reused", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(logos, "iterations"));
  await writeFile(path.join(logos, "iterations", "iteration-1.svg"), "original");
  const result = await consumeAdapterReceipt(receipt(), logos);
  assert.equal(result.output.iterationPath, "iterations/iteration-2.svg");
  assert.equal(await readFile(path.join(logos, "iterations", "iteration-1.svg"), "utf8"), "original");
});

test("concurrent accepted handoffs atomically produce distinct complete iterations", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const [first, second, third] = await Promise.all([
    consumeAdapterReceipt(receipt(), logos), consumeAdapterReceipt(receipt(), logos), consumeAdapterReceipt(receipt(), logos),
  ]);
  const names = [first, second, third].map((item) => item.output.iterationPath).sort();
  assert.deepEqual(names, ["iterations/iteration-1.svg", "iterations/iteration-2.svg", "iterations/iteration-3.svg"]);
  for (const name of names) assert.equal(await readFile(path.join(logos, name), "utf8"), cleanSvg);
  assert.equal((await readdir(path.join(logos, "iterations"))).some((name) => name.endsWith(".tmp")), false);
});

test("a symlinked iterations directory is rejected without touching its target", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(logos, "iterations"));
  await assert.rejects(consumeAdapterReceipt(receipt(), logos), /not a symlink/);
  assert.deepEqual(await readdir(outside), []);
});

test("non-accepted terminal receipts use fixed exits and guidance and create nothing", async (t) => {
  const expected = { reverted: 20, rejected: 21, stale: 22, disconnected: 23, unavailable: 24, conflict: 25, timeout: 26 };
  for (const [status, exitCode] of Object.entries(expected)) {
    const { root, logos } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = await consumeAdapterReceipt(receipt(status), logos);
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.output.status, status);
    assert.match(result.output.guidance, status === "timeout" || status === "conflict" ? /do not resubmit automatically/ : /before|Stop/);
    assert.deepEqual(await readdir(logos), []);
  }
});

test("pre-transaction invalid and unavailable envelopes remain consumable without fabricated identity or writes", async (t) => {
  for (const [status, diagnostic, exitCode] of [
    ["invalid", "invalid_arguments", 64],
    ["invalid", "invalid_artifact", 64],
    ["unavailable", "canvas_unavailable", 24],
  ]) {
    const { root, logos } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = await consumeAdapterReceipt(preflight(status, diagnostic), logos);
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.output.status, status);
    assert.equal("transactionId" in result.output, false);
    assert.equal("sourcePath" in result.output, false);
    assert.equal("revision" in result.output, false);
    assert.deepEqual(await readdir(logos), []);
  }
});

test("protocol-maximum source paths and SVGs fit the encoded receipt bound", async () => {
  const prefix = '<svg xmlns="http://www.w3.org/2000/svg"><text>';
  const suffix = "</text></svg>";
  const svg = prefix + '"'.repeat(MAX_SVG_BYTES - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)) + suffix;
  assert.equal(Buffer.byteLength(svg), MAX_SVG_BYTES);
  const sourcePath = "p".repeat(4096);
  const encoded = receipt("accepted", {
    transaction: { sourcePath },
    outcome: { artifact: { sourcePath, revision: 8, svg } },
  });
  assert.ok(Buffer.byteLength(encoded) > MAX_SVG_BYTES);
  assert.ok(Buffer.byteLength(encoded) <= MAX_STDIN_BYTES);
  const parsed = parseAdapterReceipt(encoded);
  assert.equal(parsed.transaction.sourcePath.length, 4096);
  assert.equal(Buffer.byteLength(parsed.outcome.artifact.svg), MAX_SVG_BYTES);
  assert.equal(await readBoundedStdin(Readable.from([encoded])), encoded);
  await assert.rejects(readBoundedStdin(Readable.from([Buffer.alloc(MAX_STDIN_BYTES + 1)])), /stdin size limit/);
});

test("strict receipt identities and shapes fail before filesystem access", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const invalid = [
    "not json",
    receipt("accepted", { outcome: { transactionId: "other" } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/other.svg", revision: 8, svg: cleanSvg } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 9, svg: cleanSvg } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: "<svg" } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>' } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: "<svg></svg><svg></svg>" } } }),
    receipt("accepted", { outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: '<svg><path data-lineage-key="leak"/></svg>' } } }),
    JSON.stringify({ receiptVersion: 2, kind: ADAPTER_RECEIPT_KIND, transaction: {}, outcome: {} }),
    receipt("reverted", { outcome: { extra: true } }),
  ];
  for (const input of invalid) assert.throws(() => parseAdapterReceipt(input));
  assert.deepEqual(await readdir(logos), []);
});

test("strictly rejects malformed, active, external, foreign, and editor-bearing SVG", () => {
  const ns = (body, attributes = "") => `<svg xmlns="http://www.w3.org/2000/svg"${attributes}>${body}</svg>`;
  const rejected = [
    `<?xml nope?>${ns("")}`, `<?xml version="1.1"?>${ns("")}`, ns('<use xlink:href="#mark" />'),
    '<svg xmlns="http://www.w3.org/2000/svg"', `${ns("")}${ns("")}`, ns("<path>"), `<!DOCTYPE svg>${ns("")}`,
    `<!DOCTYPE svg [<!ENTITY mark "x">]>${ns("<text>&mark;</text>")}`, ns("<?target body?>"),
    ns('<path d="&unknown;" />'), ns('<path d="<" />'), ns("<text>]]></text>"),
    ns('<path d="&#0;" />'), ns('<path d="&#xD800;" />'), ns('<path d="&#xFFFE;" />'),
    ns('<path d="&#x110000;" />'), ns("<text>\u0001</text>"), ns("<text>\ud800</text>"),
    ns("", ' data-lineage-key="leak"'), ns('<metadata id="lineage-logo-edit">state</metadata>'),
    ns('<g class="svg_select_shape"></g>'), ns("<script />"), ns("<foreignObject />"),
    ns('<style>@import url("https://example.com/a.css");</style>'), ns('<path style="fill:red" />'),
    ns('<animate attributeName="opacity" values="0;1" />'), ns('<path onclick="alert(1)" />'),
    ns('<image href="https://example.com/a.png" />'), ns('<image href="data:image/png;base64,AA==" />'),
    ns('<path fill="url(https://example.com/a.svg#p)" />'), ns('<path fill="u\\72l(\\68ttps://example.com/a.svg#p)" />'),
    `<?xml version="1.0" encoding="UTF-16"?>${ns("")}`, '<svg><path /></svg>',
    ns("<h:iframe />", ' xmlns:h="http://www.w3.org/1999/xhtml"'),
  ];
  for (const svg of rejected) {
    assert.throws(() => parseAdapterReceipt(receipt("accepted", {
      outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg } },
    })), svg.slice(0, 60));
  }
  const valid = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="mark" d="M0 0h1"/></defs><!-- safe --><use xlink:href="#mark" fill="url(#paint)"/></svg>';
  assert.doesNotThrow(() => parseAdapterReceipt(receipt("accepted", {
    outcome: { artifact: { sourcePath: "/art/logo.svg", revision: 8, svg: valid } },
  })));
});

function runCli(logos, input) {
  const script = new URL("../skills/logo-designer/scripts/lineage-handoff.mjs", import.meta.url);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname, "--logos", logos], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("CLI consumes stdin only and emits exactly one metadata receipt line", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCli(logos, receipt());
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  assert.equal(JSON.parse(result.stdout).iterationPath, "iterations/iteration-1.svg");
});

test("CLI malformed input has a fixed invalid exit and reserves no iteration", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCli(logos, "not-json");
  assert.equal(result.code, 64);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    receiptVersion: 1,
    kind: "logo-designer.lineage-handoff-receipt",
    status: "invalid",
    action: "stop",
    guidance: "The Lineage adapter receipt is invalid. Stop without creating an iteration.",
  });
  assert.deepEqual(await readdir(logos), []);
});

test("CLI preserves authoritative acceptance identity when local persistence fails", async (t) => {
  const { root, logos } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(logos, "iterations"));
  const result = await runCli(logos, receipt());
  assert.equal(result.code, 27);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    receiptVersion: 1,
    kind: "logo-designer.lineage-handoff-receipt",
    status: "persistence_failed",
    transactionId: "tx-123",
    sourcePath: "/art/logo.svg",
    revision: 8,
    bytes: Buffer.byteLength(cleanSvg),
    sha256: createHash("sha256").update(cleanSvg).digest("hex"),
    action: "retry-persistence",
    guidance: "Canvas acceptance is authoritative, but local persistence failed. Fix storage, then rerun the same adapter command with --transaction-id tx-123 and the same artifact; do not create a new transaction.",
  });
  assert.deepEqual(await readdir(outside), []);
});
