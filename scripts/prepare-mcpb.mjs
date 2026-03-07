import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

copyFileSync(manifestPath, join(bundleDir, "manifest.json"));
copyFileSync(bundleEntry, join(serverDir, "index.js"));

if (existsSync(licensePath)) {
  copyFileSync(licensePath, join(bundleDir, "LICENSE"));
}

console.log(`Prepared MCPB bundle directory at ${bundleDir}`);
