import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

const taskwarriorModule = new URL("../src/utils/taskwarrior.ts", import.meta.url).href;

describe("TaskWarrior command diagnostics", () => {
  test.each(["stderr", "stdout"] as const)(
    "keeps stdout clean when a failed command reports no matches on %s",
    (stream) => {
      // Use a child process to capture fd 1, including Bun's console.debug output.
      // A second Bun process stands in for task, so this regression runs without
      // Taskwarrior installed and cannot touch the user's task data.
      const command = `process.${stream}.write("No matches."); process.exit(1);`;
      const script = [
        `import { executeTaskWarriorCommandRaw } from ${JSON.stringify(taskwarriorModule)};`,
        `const result = executeTaskWarriorCommandRaw(["-e", ${JSON.stringify(command)}]);`,
        `if (result !== "No matches.") throw new Error("Unexpected result: " + result);`,
      ].join("\n");

      const child = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8",
        env: { ...process.env, TASK_BIN: process.execPath },
      });

      expect(child.status).toBe(0);
      expect(child.stdout).toBe("");
      expect(child.stderr).toContain("'No matches' detected");
    },
  );
});
