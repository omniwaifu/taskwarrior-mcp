import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { executeTaskWarriorCommandRaw } from "./taskwarrior.js";

/** Inspect runtime/configuration without exporting or modifying task records. */
export async function inspectEnvironment() {
  const checks: { name: string; ok: boolean; message: string }[] = [];
  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 22, message: `Node ${process.versions.node}; Node 22 or newer is required.` });
  const taskBin = process.env.TASK_BIN?.trim() || "task";
  try {
    const version = await executeTaskWarriorCommandRaw(["--version"], { encoding: "utf8", timeout: 5000 });
    checks.push({ name: "taskwarrior", ok: true, message: `${taskBin}: ${version}` });
  } catch (error) {
    checks.push({ name: "taskwarrior", ok: false, message: `Cannot run ${taskBin}. Install Taskwarrior or set TASK_BIN to its executable. ${error instanceof Error ? error.message : String(error)}` });
  }
  if (process.env.TASKRC?.trim()) {
    try {
      await access(process.env.TASKRC, constants.R_OK);
      checks.push({ name: "taskrc", ok: true, message: "Configured TASKRC is readable." });
    } catch {
      checks.push({ name: "taskrc", ok: false, message: "TASKRC is not readable. Correct the configured path or unset TASKRC to use Taskwarrior's default." });
    }
  }
  if (checks.every(check => check.ok)) {
    try {
      const configuredData = await executeTaskWarriorCommandRaw(["rc.verbose=nothing", "_get", "rc.data.location"], { encoding: "utf8", timeout: 5000 });
      checks.push({ name: "configuration", ok: !!configuredData, message: configuredData
        ? "Taskwarrior can read its data-location configuration. This does not verify database integrity or write access."
        : "No data location configured. Run task in your terminal to finish setup, then retry." });
    } catch (error) {
      checks.push({ name: "configuration", ok: false, message: `Taskwarrior configuration could not be read. Run task in your terminal to finish setup. ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { status: checks.every(check => check.ok) ? "success" as const : "error" as const, checks };
}
