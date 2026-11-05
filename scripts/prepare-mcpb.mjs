import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const bundleDir = join(rootDir, ".mcpb-build");
const serverDir = join(bundleDir, "server");
const bundleEntry = join(rootDir, "dist", "index.js");
const manifestPath = join(rootDir, "manifest.json");
const licensePath = join(rootDir, "LICENSE");

if (!existsSync(bundleEntry)) {
  throw new Error("dist/index.js is missing. Run `bun run build` before preparing the MCPB bundle.");
}

if (!existsSync(manifestPath)) {
  throw new Error("manifest.json is missing.");
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

// The bundled .js entry is ESM; Node 18 needs explicit package metadata.
writeFileSync(join(bundleDir, "package.json"), JSON.stringify({ type: "module" }, null, 2) + "\n");

copyFileSync(manifestPath, join(bundleDir, "manifest.json"));
copyFileSync(bundleEntry, join(serverDir, "index.js"));

if (existsSync(licensePath)) {
  copyFileSync(licensePath, join(bundleDir, "LICENSE"));
}

console.log(`Prepared MCPB bundle directory at ${bundleDir}`);
