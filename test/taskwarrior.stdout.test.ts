import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

const taskwarriorModule = new URL("../src/utils/taskwarrior.ts", import.meta.url).href;

describe("Taskwarrior diagnostics", () => {
  test.each(["stderr", "stdout"] as const)("does not log user data from failed commands on %s", stream => {
    const command = `process.${stream}.write("private task description"); process.exit(1);`;
    const script = `import { executeTaskWarriorCommandRaw } from ${JSON.stringify(taskwarriorModule)};
      try { await executeTaskWarriorCommandRaw(["-e", ${JSON.stringify(command)}]); process.exit(2); }
      catch (error) { if (!error.message.includes("private task description")) process.exit(3); }`;
    const child = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, TASK_BIN: process.execPath } });
    expect({ status: child.status, stdout: child.stdout, stderr: child.stderr }).toEqual({ status: 0, stdout: "", stderr: "" });
  });
});
