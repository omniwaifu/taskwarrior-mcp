import type { AddTaskRequest, TaskWarriorTask } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { GTD_CONFIGURATION } from "../../utils/attributes.js";
import { tagAssignmentArg } from "../../utils/tags.js";

export async function handleAddTask(args: AddTaskRequest): Promise<TaskWarriorTask> {
  const commandArgs = ["rc.verbose=new-uuid", ...GTD_CONFIGURATION, "add"];
  for (const field of ["due", "priority", "project", "scheduled", "wait", "until", "context", "energy", "recur", "waiting_for", "follow_up"] as const) {
    if (args[field]) commandArgs.push(`${field}:${args[field]}`);
  }
  if (args.estimated_minutes != null) commandArgs.push(`estimated_minutes:${args.estimated_minutes}`);
  if (args.tags?.length) commandArgs.push(tagAssignmentArg(args.tags));
  if (args.depends?.length) commandArgs.push(`depends:${args.depends.join(",")}`);
  if (args.parent) commandArgs.push(`mcp_parent:${args.parent}`);
  commandArgs.push("--", args.description);
  const output = await executeTaskWarriorCommandRaw(commandArgs);
  const uuid = output.match(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i)?.[0];
  if (!uuid) throw new Error("Task creation may have succeeded, but Taskwarrior did not return a UUID. Inspect tasks before retrying.");
  try {
    for (const annotation of args.annotations ?? []) {
      await executeTaskWarriorCommandRaw([uuid, "annotate", "--", annotation]);
    }
    return await getTaskByUuid(uuid);
  } catch (error) {
    throw new Error(`Task ${uuid} was created, but follow-up work failed: ${error instanceof Error ? error.message : String(error)}. Do not recreate it.`);
  }
}
