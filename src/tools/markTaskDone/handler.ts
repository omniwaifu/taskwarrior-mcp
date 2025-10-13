import type {
  MarkTaskDoneRequest,
} from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";
// isValidUuid and getIdentifierType might be useful if we need to distinguish,
// but getTaskByIdOrUuid should handle both directly for fetching.
// import { isValidUuid, getIdentifierType } from "../../utils/uuid.js";

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

export const markTaskDoneHandler = async (
  args: MarkTaskDoneRequest,
  toolName: string = "markTaskDone", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  const { uuid } = args;

  try {
    const taskToMark = await getTaskByUuid(uuid); // Throws if not found

    if (taskToMark.status === "completed") {
      console.log(`Task '${uuid}' is already completed.`);
      // Return success with the already completed task
      return {
        tool_name: toolName,
        status: "success",
        result: {
          content: [
            {
              type: "json",
              data: taskToMark,
            },
          ],
        },
      };
    }

    executeTaskWarriorCommandRaw([uuid, "done"]);

    const updatedTask = await getTaskByUuid(uuid); // Refetch to confirm status

    if (updatedTask.status !== "completed") {
      console.warn(
        `Task '${uuid}' status is '${updatedTask.status}' after marking done. Expected 'completed'.`,
      );
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "STATUS_NOT_COMPLETED",
          message: `Task with UUID '${uuid}' was attempted to be marked done, but its status is '${updatedTask.status}' instead of 'completed'.`,
        details:
            "This might indicate an issue with Taskwarrior hooks, a race condition, or the 'done' command not behaving as expected.",
        },
        result: {
          content: [
            {
              type: "text",
              text: `Task '${uuid}' status is '${updatedTask.status}' after marking done. Expected 'completed'.`,
            },
          ],
        },
      };
    }

    // Success - task is now marked done
    return {
      tool_name: toolName,
      status: "success",
      result: {
        content: [
          {
            type: "json",
            data: updatedTask,
          },
        ],
      },
    };
  } catch (error: unknown) {
    console.error(`Error in ${toolName} handler for UUID '${uuid}':`, error);
    let message = `Failed to execute ${toolName}.`;
    let details: string | undefined;
    let errorCode = "TOOL_EXECUTION_ERROR";

    if (error instanceof Error) {
      message = error.message;
      // Check if the error from getTaskByUuid was "not found"
      if (message.toLowerCase().includes("not found")) {
        errorCode = "TASK_NOT_FOUND";
      }
      details = error.stack;
    } else if (typeof error === "string") {
      message = error;
    }

    return {
      tool_name: toolName,
      status: "error",
      error: {
        code: errorCode,
        message: message,
        details: details,
      },
      result: { // Optionally, provide a text error in content as well
        content: [
          {
            type: "text",
            text: `Error in ${toolName} for UUID '${uuid}': ${message}`,
          },
        ],
      },
    };
  }
};
