import { readFileSync, writeFileSync, lstatSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import Ajv from "ajv";
import { zipSync, unzipSync } from "fflate";

// This is a packager for this repository's four-file Node bundle, not a general MCPB CLI.
const files = ["LICENSE", "manifest.json", "package.json", "server/index.js"];
const maxBytes = 20 * 1024 * 1024;
const manifestMaxBytes = 256 * 1024;
const schema = JSON.parse(readFileSync(new URL("../schemas/mcpb-manifest-v0.3.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv({ allErrors: false, jsonPointers: true });
const validateSchema = ajv.compile(schema);

export function validateManifest(manifest) {
  if (!validateSchema(manifest)) throw new Error(`Invalid MCPB manifest: ${ajv.errorsText(validateSchema.errors)}`);
  // The upstream JSON schema does not encode its Zod refinement requiring a version.
  if (manifest.manifest_version !== "0.3") throw new Error("This packager requires manifest_version 0.3.");
  if (manifest.server.type !== "node" || manifest.server.entry_point !== "server/index.js"
    || manifest.server.mcp_config?.command !== "node"
    || JSON.stringify(manifest.server.mcp_config.args) !== JSON.stringify(["${__dirname}/server/index.js"])) {
    throw new Error("Expected this repository's Node server entry point and launch configuration.");
  }
  if (manifest.icon || manifest.icons || manifest.screenshots) throw new Error("Asset-bearing bundles require extending the explicit file allowlist and validation.");
  return manifest;
}

function validateContents(contents) {
  if (JSON.stringify(Object.keys(contents).sort()) !== JSON.stringify(files)) throw new Error("Bundle must contain exactly the four allowed files.");
  if (contents["manifest.json"].length > manifestMaxBytes || contents["package.json"].length > manifestMaxBytes) throw new Error("Bundle metadata exceeds its size limit.");
  const manifest = validateManifest(JSON.parse(Buffer.from(contents["manifest.json"]).toString("utf8")));
  const metadata = JSON.parse(Buffer.from(contents["package.json"]).toString("utf8"));
  if (metadata.type !== "module") throw new Error("Bundled package.json must declare type: module.");
  if (!contents["server/index.js"].length || !contents.LICENSE.length) throw new Error("Server and license must not be empty.");
  return manifest;
}

export function readBundleDirectory(directory) {
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink()) throw new Error("Bundle directory must not be a symlink.");
  const contents = Object.create(null);
  let total = 0;
  function visit(relative = "") {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${name}`);
      if (entry.isDirectory() && name === "server") { visit(name); continue; }
      if (!entry.isFile() || !files.includes(name)) throw new Error(`Unexpected bundle entry: ${name}`);
      const path = join(root, name);
      total += lstatSync(path).size;
      if (total > maxBytes) throw new Error("Bundle exceeds its size limit.");
      contents[name] = readFileSync(path);
    }
  }
  visit();
  const manifest = validateContents(contents);
  const project = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (manifest.version !== project.version || manifest.name !== project.name) throw new Error("Manifest and project name/version must match.");
  return { contents, manifest };
}

export function packBundle(directory, output) {
  const { contents, manifest } = readBundleDirectory(directory);
  const entries = Object.fromEntries(files.map(name => [name, [contents[name], {
    os: 3, attrs: (name === "server/index.js" ? 0o100755 : 0o100644) << 16,
  }]]));
  const archive = zipSync(entries, { level: 9, mtime: new Date(2000, 0, 1) });
  writeFileSync(output, archive);
  return { name: manifest.name, version: manifest.version, bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") };
}

export function inspectBundle(path) {
  if (lstatSync(path).size > maxBytes) throw new Error("Archive exceeds its size limit.");
  let total = 0;
  const seen = new Set();
  const contents = unzipSync(readFileSync(path), { filter: entry => {
    if (!files.includes(entry.name) || seen.has(entry.name)) throw new Error(`Unexpected or duplicate archive entry: ${entry.name}`);
    seen.add(entry.name);
    total += entry.originalSize;
    if (total > maxBytes) throw new Error("Unpacked bundle exceeds its size limit.");
    return true;
  } });
  const manifest = validateContents(contents);
  return { name: manifest.name, version: manifest.version, files: Object.keys(contents).sort(), unpacked_bytes: total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, input, output] = process.argv.slice(2);
    if (command === "validate" && input) {
      const { manifest } = readBundleDirectory(input);
      console.log(`Validated ${manifest.name}@${manifest.version} against MCPB manifest 0.3 and bundle layout.`);
    } else if (command === "pack" && input && output) console.log(JSON.stringify(packBundle(input, output), null, 2));
    else if (command === "info" && input) console.log(JSON.stringify(inspectBundle(input), null, 2));
    else throw new Error("Usage: node scripts/mcpb.mjs validate <directory> | pack <directory> <output> | info <bundle>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
