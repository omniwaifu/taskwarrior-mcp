import type {
  ListTasksRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";

/**
 * List tasks based on various filter criteria
 */
export async function handleListTasks(
  args: ListTasksRequest,
): Promise<TaskWarriorTask[]> {
  const filters: string[] = [];

  if (args.project) {
    filters.push(`project:${args.project}`);
  }
  if (args.tags && args.tags.length > 0) {
    args.tags.forEach((tag) => filters.push(`+${tag}`));
  }
  if (args.status) {
    filters.push(`status:${args.status}`);
  }
  if (args.descriptionContains) {
    filters.push(`description.contains:${args.descriptionContains}`);
  }
  if (args.dueBefore) {
    filters.push(`due.before:${args.dueBefore}`);
  }
  if (args.dueAfter) {
    filters.push(`due.after:${args.dueAfter}`);
  }
  if (args.scheduledBefore) {
    filters.push(`scheduled.before:${args.scheduledBefore}`);
  }
  if (args.scheduledAfter) {
    filters.push(`scheduled.after:${args.scheduledAfter}`);
  }
  if (args.modifiedBefore) {
    filters.push(`modified.before:${args.modifiedBefore}`);
  }
  if (args.modifiedAfter) {
    filters.push(`modified.after:${args.modifiedAfter}`);
  }
  if (args.limit) {
    filters.push(`limit:${args.limit}`);
  }

  try {
    const tasksArray = await executeTaskWarriorCommandJson(filters);
    return tasksArray; // Simply return the array directly
  } catch (error: unknown) {
    console.error(`Error in listTasks handler:`, error);

    // If the error contains "No matches", return an empty array
    if (
      error instanceof Error &&
      (error.message.includes("No matches") ||
        error.message.includes("No tasks found"))
    ) {
      return [];
    }

    // Re-throw the error for the central handler to process
    throw error;
  }
}
