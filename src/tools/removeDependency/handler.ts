import type { RemoveDependencyRequest, TaskWarriorTask } from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";

/**
 * Remove a dependency between two tasks
 */
export async function handleRemoveDependency(
  args: RemoveDependencyRequest,
): Promise<TaskWarriorTask> {
  console.log(`removeDependency called with:`, args);

  try {
    // Get current task to check dependencies
    const task = await getTaskByUuid(args.task_uuid);

    if (!task.depends || !task.depends.includes(args.depends_on_uuid)) {
      throw new Error(`Task ${args.task_uuid} does not depend on ${args.depends_on_uuid}`);
    }

    // Remove the specific dependency
    // We need to set depends to all current dependencies except the one being removed
    const newDepends = task.depends.filter(uuid => uuid !== args.depends_on_uuid);

    let commandArgs: string[];
    if (newDepends.length === 0) {
      // Remove all dependencies
      commandArgs = [args.task_uuid, "modify", "depends:"];
    } else {
      // Set to remaining dependencies
      commandArgs = [args.task_uuid, "modify", `depends:${newDepends.join(",")}`];
    }

    const output = executeTaskWarriorCommandRaw(commandArgs);
    console.log("TaskWarrior modify output:", output);

    return await getTaskByUuid(args.task_uuid);
  } catch (error: unknown) {
    console.error(`Error in removeDependency handler:`, error);
    throw error;
  }
}
