import type { AddDependencyRequest, TaskWarriorTask } from "../../types/task.js";
import {
  getTaskByUuid,
  setTaskDependencies,
} from "../../utils/taskwarrior.js";

/**
 * Add a dependency: task_uuid depends on depends_on_uuid
 * Task A depends on Task B means B must be completed before A can be started
 */
export async function handleAddDependency(
  args: AddDependencyRequest,
): Promise<TaskWarriorTask> {

  const task = await getTaskByUuid(args.task_uuid);
  const currentDepends = task.depends || [];

  if (currentDepends.includes(args.depends_on_uuid)) {
    return task;
  }

  await setTaskDependencies(args.task_uuid, [...currentDepends, args.depends_on_uuid]);

  // Return the modified task
  return await getTaskByUuid(args.task_uuid);

}
