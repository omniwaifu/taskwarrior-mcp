import type {
  DeleteTaskRequest,
  DeleteTaskResponse,
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

export const deleteTaskHandler = async (
  args: DeleteTaskRequest,
  toolName: string = "deleteTask", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  const { uuid, skipConfirmation } = args;

  try {
    await getTaskByUuid(uuid); // Check if task exists before attempting deletion

    const commandArgs: string[] = [];
    if (skipConfirmation) {
      commandArgs.push("rc.confirmation=off"); // Prepend to affect the 'task' command itself
    }
    commandArgs.push(uuid, "delete");

    const deleteOutput = executeTaskWarriorCommandRaw(commandArgs);
    console.log(`TaskWarrior delete output for UUID '${uuid}':`, deleteOutput);

    // Verify deletion by trying to fetch the task again
    try {
      await getTaskByUuid(uuid);
      // If getTaskByUuid succeeds, the task was NOT deleted
      console.error(
        `Task with UUID '${uuid}' was not deleted despite command indicating success. Output: ${deleteOutput}`,
      );
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "TASK_NOT_DELETED",
          message: `Task with UUID '${uuid}' was attempted to be deleted, but it still exists. TaskWarrior output: ${deleteOutput}`,
        },
        result: { content: [{type: 'text', text: `Task '${uuid}' still exists after deletion attempt. Output: ${deleteOutput}` }]}
      };
    } catch (fetchError: unknown) {
      // If getTaskByUuid throws an error, we check if it's a 'not found' error
      let fetchErrorMessage = "Unknown error during fetch confirmation after delete.";
      if (fetchError instanceof Error) {
        fetchErrorMessage = fetchError.message;
      }

      if (fetchErrorMessage.toLowerCase().includes("not found")) {
        // This is the expected success case: task is gone
        const successData: DeleteTaskResponse = {
          message: `Task '${uuid}' deleted successfully. TaskWarrior output: ${deleteOutput}`,
          deletedUuid: uuid,
        };
        return {
          tool_name: toolName,
          status: "success",
          result: {
            content: [
              {
                type: "json",
                data: successData,
              },
            ],
          },
        };
      } else {
        // An unexpected error occurred while trying to confirm deletion
        console.error(
          `Unexpected error while confirming deletion of task '${uuid}':`,
          fetchError,
        );
        return {
          tool_name: toolName,
          status: "error",
          error: {
            code: "DELETE_CONFIRMATION_ERROR",
            message: `Task '${uuid}' deletion status uncertain. Confirmation check failed: ${fetchErrorMessage}`,
            details: deleteOutput, // Include original delete output
          },
          result: { content: [{type: 'text', text: `Task '${uuid}' deletion status uncertain. Confirmation check failed: ${fetchErrorMessage}` }]}
        };
      }
    }
  } catch (error: unknown) {
    let message = "Failed to delete task.";
    let details: string | undefined;
    let errorCode = "TOOL_EXECUTION_ERROR";

    if (error instanceof Error) {
      message = error.message;
      // Check if the initial error was due to task not found (before even trying to delete)
      if (message.toLowerCase().includes("not found")) {
        errorCode = "TASK_NOT_FOUND";
      }
      // Check for confirmation error specifically for the delete command itself
      else if (
        !skipConfirmation &&
        message.toLowerCase().includes("confirmation")
      ) {
        errorCode = "DELETION_CONFIRMATION_REQUIRED";
        details = error.message; // Original error message
        message = `Deletion requires confirmation. Use skipConfirmation:true or ensure your Taskwarrior configuration allows deletion without confirmation.`;
      } else {
        details = error.stack; // General error stack
      }
    } else if (typeof error === "string") {
      message = error;
    }
    console.error(`Error in ${toolName} handler for UUID '${uuid}':`, error);
    return {
      tool_name: toolName,
      status: "error",
      error: {
        code: errorCode,
        message: message,
      details: details,
      },
      result: { content: [{type: 'text', text: `Error in ${toolName}: ${message}` }]}
    };
  }
};
