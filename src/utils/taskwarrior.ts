import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { TaskWarriorTaskSchema, type TaskWarriorTask } from "../types/task.js";
import { GTD_CONFIGURATION } from "./attributes.js";
import { isValidUuid } from "./uuid.js";

const NO_MATCH = /^(?:No matches|No tasks specified|No tasks found|No tasks|No pending tasks)\.?$/i;

/** Run without a shell; bound duration and output, and leave the event loop responsive. */
export async function executeTaskWarriorCommandRaw(
  commandArgs: string[],
  options?: ExecFileOptionsWithStringEncoding,
): Promise<string> {
  const configuredTimeout = Number(process.env.TASK_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(configuredTimeout) || configuredTimeout < 1 || configuredTimeout > 300_000) {
    throw new Error("TASK_TIMEOUT_MS must be an integer between 1 and 300000.");
  }
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.TASK_BIN?.trim() || "task", commandArgs, {
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
      timeout: configuredTimeout, killSignal: "SIGKILL",
      ...options, env: { ...process.env, ...options?.env },
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout.trim());
      // Do not include argv, task contents, or stack traces in routine diagnostics.
      // Details go only to the requesting client, never to the server's logs.
      const message = error.code === "ENOENT" ? "Taskwarrior executable not found. Install Taskwarrior or set TASK_BIN; run --doctor for setup diagnostics." : error.killed ? "Taskwarrior command timed out or exceeded its output limit."
        : stderr.trim() || stdout.trim() || `Taskwarrior command failed (${String(error.code)}).`;
      reject(new Error(message));
    });
    // Taskwarrior runs noninteractively; prompts must see EOF rather than hang.
    child.stdin?.end();
  });
}

/** Export parsing is all-or-nothing: incomplete results must never look like a complete list. */
export function parseTaskwarriorExport(output: string): TaskWarriorTask[] {
  if (NO_MATCH.test(output.trim())) return [];
  let values: unknown;
  try {
    values = JSON.parse(output);
  } catch {
    throw new Error("Taskwarrior returned non-JSON output for export command.");
  }
  if (!Array.isArray(values)) throw new Error("Taskwarrior export must be a JSON array.");
  return values.map((value: unknown, index: number) => {
    const result = TaskWarriorTaskSchema.safeParse(value);
    if (!result.success) {
      const fields = result.error.issues.map(issue => issue.path.join(".")).join(", ");
      throw new Error(`Invalid Taskwarrior export at index ${index} (fields: ${fields}). No partial results returned.`);
    }
    return result.data;
  });
}

export async function executeTaskWarriorCommandJson(args: string[]): Promise<TaskWarriorTask[]> {
  const commandArgs = [...GTD_CONFIGURATION, "rc.json.array=on", "rc.verbose=nothing", ...args];
  if (!args.some(arg => arg.toLowerCase() === "export")) commandArgs.push("export");
  try {
    return parseTaskwarriorExport(await executeTaskWarriorCommandRaw(commandArgs));
  } catch (error) {
    // Only exact, known empty-query messages are benign, and only for reads.
    if (error instanceof Error && NO_MATCH.test(error.message.trim())) return [];
    throw error;
  }
}

export async function getTaskByUuid(uuid: string): Promise<TaskWarriorTask> {
  if (!isValidUuid(uuid)) throw new Error("Invalid UUID format provided.");
  const tasks = await executeTaskWarriorCommandJson([uuid]);
  if (tasks.length === 0) throw new Error(`Task with UUID '${uuid}' not found.`);
  if (tasks.length !== 1) throw new Error(`Expected exactly one task for UUID '${uuid}'.`);
  return tasks[0];
}

export async function setTaskDependencies(uuid: string, dependencies: string[]): Promise<void> {
  const commandArgs = [uuid, "modify", "depends:"];
  if (dependencies.length > 0) commandArgs.push(`depends:${dependencies.join(",")}`);
  await executeTaskWarriorCommandRaw(commandArgs);
}
