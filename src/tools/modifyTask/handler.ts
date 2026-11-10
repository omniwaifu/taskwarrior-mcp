import { GTD_CONFIGURATION } from "../../utils/attributes.js";
import type {
  ModifyTaskRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";
import { mergeTags, tagAssignmentArg } from "../../utils/tags.js";

import { operationResult } from "../../utils/operationResult.js";

export async function modifyTask(args: ModifyTaskRequest): Promise<TaskWarriorTask> {
  const { uuid, ...modifications } = args;
  const existingTask = await getTaskByUuid(uuid);
  const commandArgs: string[] = [...GTD_CONFIGURATION, uuid, "modify"];
  const baseArgumentCount = commandArgs.length;
  let nextDepends: string[] | undefined;

  // Iterate over the modifications and add them to the command arguments
  if (modifications.status) {
    commandArgs.push(`status:${modifications.status}`);
  }
  if (modifications.due !== undefined) {
    commandArgs.push(`due:${modifications.due}`);
  }
  if (modifications.priority !== undefined) {
    commandArgs.push(`priority:${modifications.priority}`);
  }
  if (modifications.project !== undefined) {
    commandArgs.push(`project:${modifications.project}`);
  }
  if (
    (modifications.addTags && modifications.addTags.length > 0) ||
    (modifications.removeTags && modifications.removeTags.length > 0)
  ) {
    commandArgs.push(
      tagAssignmentArg(
        mergeTags(existingTask.tags, modifications.addTags, modifications.removeTags),
      ),
    );
  }

  for (const field of ["estimated_minutes", "waiting_for", "follow_up"] as const) {
    if (modifications[field] !== undefined) commandArgs.push(`${field}:${modifications[field] ?? ""}`);
  }

  // GTD fields
  if (modifications.scheduled !== undefined) {
    commandArgs.push(`scheduled:${modifications.scheduled}`);
  }
  if (modifications.wait !== undefined) {
    commandArgs.push(`wait:${modifications.wait}`);
  }
  if (modifications.until !== undefined) {
    commandArgs.push(`until:${modifications.until}`);
  }
  if (modifications.context !== undefined) {
    commandArgs.push(`context:${modifications.context}`);
  }
  if (modifications.energy !== undefined) {
    commandArgs.push(`energy:${modifications.energy}`);
  }
  if (modifications.parent !== undefined) {
    commandArgs.push(`mcp_parent:${modifications.parent}`);
  }

  // Recurring/Habit fields
  if (modifications.recur !== undefined) {
    commandArgs.push(`recur:${modifications.recur}`);
  }

  // Handle dependencies
  if (
    (modifications.addDepends && modifications.addDepends.length > 0) ||
    (modifications.removeDepends && modifications.removeDepends.length > 0)
  ) {
    const currentDepends = existingTask.depends || [];
    const depsToRemove = new Set(modifications.removeDepends || []);
    nextDepends = currentDepends.filter((dep) => !depsToRemove.has(dep));

    for (const dependency of modifications.addDepends || []) {
      if (!depsToRemove.has(dependency) && !nextDepends.includes(dependency)) {
        nextDepends.push(dependency);
      }
    }
  }

  if (commandArgs.length === baseArgumentCount && nextDepends === undefined && modifications.description === undefined) return existingTask;
  if (nextDepends !== undefined) {
    commandArgs.push("depends:");
    if (nextDepends.length) commandArgs.push(`depends:${nextDepends.join(",")}`);
  }
  if (modifications.description !== undefined) commandArgs.push("--", modifications.description);
  await executeTaskWarriorCommandRaw(commandArgs);
  return getTaskByUuid(uuid);
}

export const modifyTaskHandler = (args: ModifyTaskRequest, toolName = "modifyTask") => operationResult(toolName, () => modifyTask(args));
