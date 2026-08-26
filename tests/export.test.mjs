import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportScript = path.join(root, "skills/logo-designer/scripts/export.sh");
const sizes = [16, 32, 48, 192, 512, 1024, 2048];
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "logo-export-"));
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  const fakeResvg = path.join(bin, "resvg");
  await writeFile(fakeResvg, '#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s\\n" "$1" >> "${EXPORT_TEST_LOG:?}"\nprintf "rendered from %s\\n" "$1" > "$2"\n');
  await chmod(fakeResvg, 0o755);
  return { directory, bin, log: path.join(directory, "render.log") };
}

function runExport(args, fixture) {
  return spawnSync("bash", [exportScript, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`, EXPORT_TEST_LOG: fixture.log },
  });
}

test("supports exporting when logo.svg is already in the output directory", async () => {
  const work = await fixture();
  const output = path.join(work.directory, "export");
  await mkdir(output);
  const logo = path.join(output, "logo.svg");
  await writeFile(logo, svg);

  const result = runExport([logo, output], work);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(logo, "utf8"), svg);
  assert.deepEqual((await readdir(output)).sort(), ["logo.svg", ...sizes.map((size) => `logo-${size}.png`)].sort());
});

test("exports separate full-logo and icon families", async () => {
  const work = await fixture();
  const output = path.join(work.directory, "export");
  await mkdir(output);
  const logo = path.join(work.directory, "combination.svg");
  const icon = path.join(output, "icon.svg");
  await writeFile(logo, svg.replace("<rect width", '<g id="wordmark"><rect width').replace("/></svg>", "/></g></svg>"));
  await writeFile(icon, svg.replace("<rect width", '<g id="icon"><rect width').replace("/></svg>", "/></g></svg>"));

  const result = runExport([logo, output, icon], work);
  assert.equal(result.status, 0, result.stderr);
  const expected = ["logo.svg", "icon.svg", ...sizes.flatMap((size) => [`logo-${size}.png`, `icon-${size}.png`])];
  assert.deepEqual((await readdir(output)).sort(), expected.sort());
  const sources = (await readFile(work.log, "utf8")).trim().split("\n");
  assert.deepEqual(sources.slice(0, sizes.length), Array(sizes.length).fill(logo));
  assert.deepEqual(sources.slice(sizes.length), Array(sizes.length).fill(icon));
});
