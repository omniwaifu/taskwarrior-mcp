import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, unzipSync } from "fflate";
import { validateManifest, readBundleDirectory, packBundle, inspectBundle } from "../scripts/mcpb.mjs";

let root: string;
let directory: string;
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tw-packaging-"));
  directory = join(root, "bundle");
  mkdirSync(join(directory, "server"), { recursive: true });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  writeFileSync(join(directory, "LICENSE"), "fixture license");
  writeFileSync(join(directory, "server/index.js"), 'console.log("fixture");');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("MCPB packaging preserves contents and is reproducible", () => {
  const output = join(root, "test.mcpb");
  const first = packBundle(directory, output);
  const bytes = readFileSync(output);
  expect(packBundle(directory, output)).toEqual(first);
  expect(readFileSync(output)).toEqual(bytes);
  expect(inspectBundle(output)).toMatchObject({ name: manifest.name, version: manifest.version,
    files: ["LICENSE", "manifest.json", "package.json", "server/index.js"] });
  const entries = unzipSync(bytes);
  expect(Buffer.from(entries["server/index.js"]).toString()).toBe('console.log("fixture");');
  expect(JSON.parse(Buffer.from(entries["manifest.json"]).toString())).toEqual(manifest);
});

test("manifest validation retains schema constraints and the upstream version refinement", () => {
  expect(validateManifest(manifest)).toEqual(manifest);
  for (const value of [
    { ...manifest, author: {} }, { ...manifest, manifest_version: undefined },
    { ...manifest, homepage: "invalid URL" }, { ...manifest, unexpected: true },
    { ...manifest, user_config: { invalid: { type: "unknown" } } },
    { ...manifest, server: { ...manifest.server, entry_point: "../escape.js" } },
  ]) expect(() => validateManifest(value)).toThrow();
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...manifest, version: "0.0.0" }));
  expect(() => readBundleDirectory(directory)).toThrow("must match");
});

test("packaging rejects extra files, symlinks, missing files, and non-ESM metadata", () => {
  writeFileSync(join(directory, "secret.txt"), "do not package");
  expect(() => readBundleDirectory(directory)).toThrow("Unexpected");
  rmSync(join(directory, "secret.txt"));
  rmSync(join(directory, "server/index.js"));
  expect(() => readBundleDirectory(directory)).toThrow("four allowed");
  symlinkSync(join(directory, "LICENSE"), join(directory, "server/index.js"));
  expect(() => readBundleDirectory(directory)).toThrow("Symlinks");
  rmSync(join(directory, "server/index.js"));
  writeFileSync(join(directory, "server/index.js"), "fixture");
  writeFileSync(join(directory, "package.json"), "{}");
  expect(() => readBundleDirectory(directory)).toThrow("module");
});

test("archive inspection rejects traversal and oversized compressed payloads without extraction", () => {
  const path = join(root, "bad.mcpb");
  writeFileSync(path, zipSync({ "../escape": Buffer.from("bad") }));
  expect(() => inspectBundle(path)).toThrow("Unexpected");
  writeFileSync(path, zipSync({ "server/index.js": new Uint8Array(21 * 1024 * 1024) }));
  expect(() => inspectBundle(path)).toThrow("size limit");
});
