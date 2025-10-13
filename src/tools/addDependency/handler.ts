import type { AddDependencyRequest, TaskWarriorTask } from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";

/**
 * Add a dependency: task_uuid depends on depends_on_uuid
 * Task A depends on Task B means B must be completed before A can be started
 */
export async function handleAddDependency(
  args: AddDependencyRequest,
): Promise<TaskWarriorTask> {
  console.log(`addDependency called with:`, args);

  try {
    // Use TaskWarrior modify command to add dependency
    const commandArgs = [
      args.task_uuid,
      "modify",
      `depends:${args.depends_on_uuid}`,
    ];

    const output = executeTaskWarriorCommandRaw(commandArgs);
    console.log("TaskWarrior modify output:", output);

    // Return the modified task
    return await getTaskByUuid(args.task_uuid);
  } catch (error: unknown) {
    console.error(`Error in addDependency handler:`, error);
    throw error;
  }
}
