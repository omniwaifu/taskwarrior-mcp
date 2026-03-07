import type {
  ModifyTaskRequest,
} from "../../types/task.js";
import {
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
  setTaskDependencies,
} from "../../utils/taskwarrior.js";

// --- Standard MCP Interfaces (should ideally be imported) ---
interface JsonContentItem {
  type: "json";
  data: unknown;
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
    details?: unknown;
  };
}
// --- End MCP Interfaces ---

export const modifyTaskHandler = async (
  args: ModifyTaskRequest,
  toolName: string = "modifyTask", // MCP Router usually provides this
): Promise<McpToolResponse> => {
  // Validation is now done by src/index.ts
  // const validationResult = ModifyTaskRequestSchema.safeParse(body);
  // if (!validationResult.success) { ... }

  const { uuid, ...modifications } = args;

  try {
    const existingTask = await getTaskByUuid(uuid);
    if (!existingTask) {
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task with UUID '${uuid}' not found. Cannot modify.`,
        },
        result: {
          content: [
            {
              type: "text",
              text: `Error in ${toolName} for UUID '${uuid}': Task not found. Cannot modify.`,
            },
          ],
        },
      };
    }

    const commandArgs: string[] = [uuid, "modify"];
    let nextDepends: string[] | undefined;

    // Iterate over the modifications and add them to the command arguments
    if (modifications.description) {
      commandArgs.push(`description:${modifications.description}`);
    }
    if (modifications.status) {
      commandArgs.push(`status:${modifications.status}`);
    }
    if (modifications.due) {
      commandArgs.push(`due:${modifications.due}`);
    }
    if (modifications.priority) {
      commandArgs.push(`priority:${modifications.priority}`);
    }
    if (modifications.project !== undefined) {
      commandArgs.push(`project:${modifications.project}`);
    }
    if (modifications.addTags && modifications.addTags.length > 0) {
      modifications.addTags.forEach((tag) => commandArgs.push(`+${tag}`));
    }
    if (modifications.removeTags && modifications.removeTags.length > 0) {
      modifications.removeTags.forEach((tag) => commandArgs.push(`-${tag}`));
    }

    // GTD fields
    if (modifications.scheduled) {
      commandArgs.push(`scheduled:${modifications.scheduled}`);
    }
    if (modifications.wait) {
      commandArgs.push(`wait:${modifications.wait}`);
    }
    if (modifications.until) {
      commandArgs.push(`until:${modifications.until}`);
    }
    if (modifications.context) {
      commandArgs.push(`context:${modifications.context}`);
    }
    if (modifications.energy) {
      commandArgs.push(`energy:${modifications.energy}`);
    }
    if (modifications.parent) {
      commandArgs.push(`parent:${modifications.parent}`);
    }

    // Recurring/Habit fields
    if (modifications.recur) {
      commandArgs.push(`recur:${modifications.recur}`);
    }

    // Handle dependencies
    if (
      (modifications.addDepends && modifications.addDepends.length > 0) ||
      (modifications.removeDepends && modifications.removeDepends.length > 0)
    ) {
      const currentDepends = existingTask.depends || [];
      const depsToRemove = new Set(modifications.removeDepends || []);
      nextDepends = currentDepends.filter((dep) => !depsToRemove.has(dep));

      for (const dependency of modifications.addDepends || []) {
        if (!depsToRemove.has(dependency) && !nextDepends.includes(dependency)) {
          nextDepends.push(dependency);
        }
      }
    }

    if (commandArgs.length === 2 && nextDepends === undefined) {
      console.warn(
        `[${toolName}] called for UUID ${uuid} but no actual modifications were provided in the request. Returning existing task.`,
      );
      return {
        tool_name: toolName,
        status: "success",
        result: {
          content: [
            {
              type: "json",
              data: existingTask,
            },
          ],
        },
      };
    }

    if (commandArgs.length > 2) {
      executeTaskWarriorCommandRaw(commandArgs);
    }

    if (nextDepends !== undefined) {
      setTaskDependencies(uuid, nextDepends);
    }

    const updatedTask = await getTaskByUuid(uuid);
    if (!updatedTask) {
      return {
        tool_name: toolName,
        status: "error",
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task with UUID '${uuid}' was modified, but could not be retrieved afterwards.`,
          details: "The task modification command seemed to succeed but the task vanished.",
        },
        result: {
          content: [
            {
              type: "text",
              text: `Error in ${toolName} for UUID '${uuid}': The task modification command seemed to succeed but the task vanished.`,
            },
          ],
        },
      };
    }

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
      result: {
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
