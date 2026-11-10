import { expect, test } from "bun:test";
import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";

test("patched glob matcher preserves source selection, ignored output, and type-aware lint", async () => {
  // lintText supplies virtual contents; CI single-run inference reads the on-disk
  // TypeScript program instead. Use the editor-style program for this fixture.
  const eslint = new ESLint({ overrideConfig: { languageOptions: { parserOptions: {
    disallowAutomaticSingleRunInference: true,
  } } } });
  expect(await eslint.isPathIgnored("dist/index.js")).toBe(true);
  expect(await eslint.isPathIgnored(".mcpb-build/server/index.js")).toBe(true);
  expect(await eslint.isPathIgnored("src/index.ts")).toBe(false);
  expect(await eslint.isPathIgnored("test/features.integration.test.ts")).toBe(false);
  const results = await eslint.lintText('Promise.resolve(1);\n', { filePath: "src/index.ts" });
  expect(results.flatMap(result => result.messages).some(message => message.ruleId === "@typescript-eslint/no-floating-promises")).toBe(true);
  const selected = await eslint.lintFiles(["src/**/{handler,index}.ts"]);
  expect(selected.some(result => result.filePath.endsWith("/src/index.ts"))).toBe(true);
  expect(selected.some(result => result.filePath.endsWith("/src/tools/addTask/handler.ts"))).toBe(true);
  expect(selected.every(result => result.errorCount === 0)).toBe(true);
});

test("patched minimatch bounds adversarial globstar parent expansion", () => {
  const result = spawnSync("node", ["--input-type=module", "-e", `
    import { Minimatch } from "minimatch";
    const matcher = new Minimatch("**/../a/b/".repeat(12) + "target", { optimizationLevel: 2, braceExpandMax: 64 });
    if (matcher.globParts.length > 64) throw new Error("unbounded expansion");
    console.log("bounded");
  `], { encoding: "utf8", timeout: 3000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("bounded");
});
