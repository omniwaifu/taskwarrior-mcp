import type {
  StartTaskRequest,
} from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../../utils/taskwarrior.js";

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

export const startTaskHandler = async (
  args: StartTaskRequest,
  toolName: string = "startTask", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  const { uuid } = args;

  try {
    const taskToStart = await getTaskByUuid(uuid); // Throws if not found

    // Taskwarrior's `start` command is idempotent on an already started task,
    // but it might update the start time if run again. We'll proceed.
    if (taskToStart.start) {
      console.log(
        `[${toolName}] Task '${uuid}' is already started (start date: ${taskToStart.start}). Proceeding to ensure it's active or re-start if behavior dictates.`,
      );
    }

    executeTaskWarriorCommandRaw([uuid, "start"]);

    const updatedTask = await getTaskByUuid(uuid); // Refetch to get current state

    if (!updatedTask.start) {
      // This indicates an issue if the task was meant to be started.
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "START_TIME_MISSING",
          message: `Task with UUID '${uuid}' was attempted to be started, but it does not have a start time after the command.`,
        details:
            "The 'start' command might have failed silently, or Taskwarrior's state is inconsistent.",
        },
        result: {
          content: [
            {
              type: "text",
              text: `Task '${uuid}' failed to show a start time after 'start' command.`,
            },
          ],
        },
      };
    }

    // Success - task is now started (or was already started)
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
