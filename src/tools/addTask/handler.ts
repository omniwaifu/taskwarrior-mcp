// import { z } from "zod";
import type {
  AddTaskRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  executeTaskWarriorCommandJson,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";
import { tagAssignmentArg } from "../../utils/tags.js";

/**
 * Add a new task to TaskWarrior
 */
export async function handleAddTask(
  args: AddTaskRequest,
): Promise<TaskWarriorTask> {
  console.error(`addTask called with:`, args);
  const knownTaskUuids = new Set(
    (await executeTaskWarriorCommandJson(["export"])).map((task) => task.uuid),
  );

  const commandArgs: string[] = ["add"];
  commandArgs.push(`description:${args.description}`);

  // Basic fields
  if (args.due) commandArgs.push(`due:${args.due}`);
  if (args.priority) commandArgs.push(`priority:${args.priority}`);
  if (args.project) commandArgs.push(`project:${args.project}`);
  if (args.tags && args.tags.length > 0) {
    commandArgs.push(tagAssignmentArg(args.tags));
  }

  // GTD fields
  if (args.scheduled) commandArgs.push(`scheduled:${args.scheduled}`);
  if (args.wait) commandArgs.push(`wait:${args.wait}`);
  if (args.until) commandArgs.push(`until:${args.until}`);
  if (args.context) commandArgs.push(`context:${args.context}`);
  if (args.energy) commandArgs.push(`energy:${args.energy}`);
  if (args.depends && args.depends.length > 0) {
    commandArgs.push(`depends:${args.depends.join(",")}`);
  }
  if (args.parent) commandArgs.push(`parent:${args.parent}`);

  // Recurring/Habit fields
  if (args.recur) commandArgs.push(`recur:${args.recur}`);

  try {
    const addOutput = executeTaskWarriorCommandRaw(commandArgs);
    console.error("TaskWarrior add output:", addOutput);

    let createdTaskUuid: string | undefined;
    const idMatch = addOutput.match(/Created task (\d+)/i); // Made case-insensitive for safety
    const newUuidMatch = addOutput.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);

    if (newUuidMatch && newUuidMatch[1]) {
      createdTaskUuid = newUuidMatch[1];
      console.error(`Extracted new task UUID directly from output: ${createdTaskUuid}`);
    } else if (idMatch && idMatch[1]) {
      const newTaskId = idMatch[1];
      console.error(`Extracted new task ID from output: ${newTaskId}. Fetching details...`);
      const newlyAddedTasks = await executeTaskWarriorCommandJson([
        newTaskId,
        "export",
      ]);
      if (newlyAddedTasks.length > 0 && newlyAddedTasks[0].uuid) {
        createdTaskUuid = newlyAddedTasks[0].uuid;
      } else {
        console.warn(`Could not get UUID for task ID ${newTaskId} after creation.`);
      }
    }

    if (!createdTaskUuid) {
      // Fall back to the newly introduced UUID, which also works when Taskwarrior output is silenced.
      console.warn(
        "Could not parse new task ID or UUID from 'add' output. Falling back to post-add task diff.",
      );
      const tasksAfterAdd = await executeTaskWarriorCommandJson(["export"]);
      const newlyAddedTasks = tasksAfterAdd.filter(
        (task) => !knownTaskUuids.has(task.uuid),
      );
      const matchingTasks = newlyAddedTasks.filter(
        (task) => task.description === args.description,
      );
      const candidateTasks = matchingTasks.length > 0 ? matchingTasks : newlyAddedTasks;

      if (candidateTasks.length > 0 && candidateTasks[0].uuid) {
        candidateTasks.sort((leftTask, rightTask) =>
          rightTask.entry.localeCompare(leftTask.entry),
        );
        createdTaskUuid = candidateTasks[0].uuid;
      } else {
        throw new Error("Failed to determine UUID of the newly created task. Task might have been added, but its UUID could not be retrieved.");
      }
    }

    // Add annotations if provided
    if (args.annotations && args.annotations.length > 0) {
      for (const annotation of args.annotations) {
        const annotateArgs = [
          createdTaskUuid,
          "annotate",
          annotation.replace(/\n/g, "\\n"),
        ];
        executeTaskWarriorCommandRaw(annotateArgs);
      }
    }

    // Get the full task details and return them
    return await getTaskByUuid(createdTaskUuid);
  } catch (error: unknown) {
    console.error(`Error in addTask handler:`, error);
    throw error; // Let the central handler handle the error formatting
  }
}
