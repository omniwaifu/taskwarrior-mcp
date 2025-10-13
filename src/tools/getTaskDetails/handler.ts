import type {
  GetTaskDetailsRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import { getTaskByUuid } from "../../utils/taskwarrior.js";

// --- Standard MCP Interfaces (should ideally be imported) ---
interface JsonContentItem {
  type: "json";
  data: any;
}

interface TextContentItem {
  type: "text";
  text: string;
}

interface McpToolResponse {
  tool_name: string;
  status: "success" | "error";
  result?: {
    content: Array<JsonContentItem | TextContentItem>;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
// --- End MCP Interfaces ---

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
    console.error(`Error in getTaskDetails handler for UUID '${uuid}':`, error);
    // Just re-throw the error for the central handler to process
    throw error;
  }
};
