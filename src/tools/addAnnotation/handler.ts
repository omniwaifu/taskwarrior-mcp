import type {
  AddAnnotationRequest,
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

export const addAnnotationHandler = async (
  args: AddAnnotationRequest,
  toolName: string = "addAnnotation", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  // Validation is now done by src/index.ts
  // const validationResult = AddAnnotationRequestSchema.safeParse(body);
  // if (!validationResult.success) { ... }

  const { uuid, annotation } = args;

  try {
    await getTaskByUuid(uuid); // Ensure task exists

    await executeTaskWarriorCommandRaw([
      uuid,
      "annotate",
      `'${annotation.replace(/'/g, "'\\''").replace(/\n/g, "\\n")}'`, // Shell escape & newline escape
    ]);

    const updatedTask = await getTaskByUuid(uuid);
    if (!updatedTask) {
      // This case should ideally be an error state communicated properly
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "TASK_NOT_FOUND_POST_ANNOTATION",
          message: "Failed to fetch task after adding annotation.",
        details:
            "Annotation might have been added, but task data could not be retrieved post-operation.",
        },
        result: {
          content: [
            {
              type: "text",
              text: "Failed to fetch task after adding annotation. Annotation might have been added, but task data could not be retrieved.",
            },
          ],
        },
      };
    }

    // Success case
    return {
      tool_name: toolName,
      status: "success",
      result: {
        content: [
          {
            type: "json",
            data: { task: updatedTask }, // The original AddAnnotationResponse structure
          },
        ],
      },
    };
  } catch (error: unknown) {
    console.error(`Error in ${toolName} handler:`, error);
    let message = `Failed to execute ${toolName}.`;
    let details: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      details = error.stack;
    } else if (typeof error === "string") {
      message = error;
    }

    return {
      tool_name: toolName,
      status: "error",
      error: {
        code: "TOOL_EXECUTION_ERROR",
        message: message,
        details: details,
      },
      result: {
        content: [
          {
            type: "text",
            text: `Error in ${toolName}: ${message}`,
          },
        ],
      },
    };
  }
};
