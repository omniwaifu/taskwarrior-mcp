import type {
  StopTaskRequest,
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

export const stopTaskHandler = async (
  args: StopTaskRequest,
  toolName: string = "stopTask", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  const { uuid } = args;

  try {
    const taskToStop = await getTaskByUuid(uuid); // Throws if not found

    if (!taskToStop.start) {
      console.log(
        `[${toolName}] Task '${uuid}' is not started. Stop command may be a no-op. Returning current task state.`,
      );
      // Still return success as the desired state (not started) is met or command is no-op
      return {
        tool_name: toolName,
        status: "success",
        result: {
          content: [
            {
              type: "json",
              data: taskToStop,
            },
          ],
        },
      };
    }

    executeTaskWarriorCommandRaw([uuid, "stop"]);

    const updatedTask = await getTaskByUuid(uuid); // Refetch to get current state

    if (updatedTask.start) {
      // This is unusual if stop command worked as expected to clear the start time.
      // Log it, but still return the task as the command was issued.
      console.warn(
        `[${toolName}] Task '${uuid}' still has a start time (${updatedTask.start}) after 'stop' command. Current status: ${updatedTask.status}. TaskWarrior might treat 'stop' differently based on configuration or version (e.g., only clearing active status, not start time for completed/deleted tasks).`,
      );
    }

    // Success - task stop command was issued
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
