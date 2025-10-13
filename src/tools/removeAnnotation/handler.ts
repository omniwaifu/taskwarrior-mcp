import type {
  RemoveAnnotationRequest,
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

export const removeAnnotationHandler = async (
  args: RemoveAnnotationRequest,
  toolName: string = "removeAnnotation", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  const { uuid, annotation } = args; // Changed from annotation_description to annotation for consistency if Request uses 'annotation'

  try {
    const taskToModify = await getTaskByUuid(uuid); // Throws if not found

    // Find the annotation to remove. Taskwarrior denotate needs the exact description.
    const existingAnnotation = taskToModify.annotations?.find(
      (a) => a.description === annotation, // Assuming input is the full annotation string
    );

    if (!existingAnnotation) {
      return {
        tool_name: toolName,
        status: "error", // Or consider this a success with a message if no-op is acceptable
        error: {
          code: "ANNOTATION_NOT_FOUND",
          message: `Annotation with description "${annotation}" not found on task '${uuid}'.`,
          details: "No changes made as the specified annotation does not exist on the task.",
        },
        result: { content: [{ type: "text", text: `Annotation "${annotation}" not found on task '${uuid}'.` }]}
      };
    }

    // Taskwarrior's `denotate` command can take the exact description or a pattern.
    // Using the exact description is safer if available.
    // Ensure proper shell escaping for the annotation string.
    const escapedAnnotation = annotation.replace(/'/g, "'\\''");
    executeTaskWarriorCommandRaw([uuid, "denotate", `'${escapedAnnotation}'`]);

    const updatedTask = await getTaskByUuid(uuid); // Refetch to get the modified task
    
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
    console.error(`Error in ${toolName} handler for UUID '${uuid}', annotation '${annotation}':`, error);
    let message = `Failed to execute ${toolName}.`;
    let details: string | undefined;
    let errorCode = "TOOL_EXECUTION_ERROR";

    if (error instanceof Error) {
      message = error.message;
      if (message.toLowerCase().includes("not found")) {
        // This would be from the initial getTaskByUuid if the task itself doesn't exist
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
            text: `Error in ${toolName} for UUID '${uuid}', annotation '${annotation}': ${message}`,
          },
        ],
      },
    };
  }
};
