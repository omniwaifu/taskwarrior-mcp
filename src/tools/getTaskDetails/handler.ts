import type {
  GetTaskDetailsRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import { getTaskByUuid } from "../../utils/taskwarrior.js";

/**
 * Gets detailed information about a specific task by its UUID
 */
export const getTaskDetailsHandler = async (
  args: GetTaskDetailsRequest,
): Promise<TaskWarriorTask> => {
  const { uuid } = args;

  try {
    // getTaskByUuid throws if not found
    return await getTaskByUuid(uuid);
  } catch (error: unknown) {

    // Just re-throw the error for the central handler to process
    throw error;
  }
};
