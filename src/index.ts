#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  // ToolSchema as MCPToolSchema, // No longer used
} from "@modelcontextprotocol/sdk/types.js";
// fs, path, os, diffLines, createTwoFilesPatch, minimatch might not be needed here anymore
// import fs from "fs/promises";
// import path from "path";
// import os from "os";
import { z } from "zod";
// import { diffLines, createTwoFilesPatch } from "diff"; // Likely not needed
// import { minimatch } from "minimatch"; // Likely not needed

// import { execSync } from "child_process"; // This will be moved to handlers

// Import handlers
import { handleAddTask } from "./tools/addTask/index.js";
import { markTaskDoneHandler } from "./tools/markTaskDone/index.js";
import { handleListTasks } from "./tools/listTasks/index.js";
import { getTaskDetailsHandler } from "./tools/getTaskDetails/index.js";
import { modifyTaskHandler } from "./tools/modifyTask/index.js";
import { startTaskHandler } from "./tools/startTask/index.js";
import { stopTaskHandler } from "./tools/stopTask/index.js";
import { deleteTaskHandler } from "./tools/deleteTask/index.js";
import { addAnnotationHandler } from "./tools/addAnnotation/index.js";
import { removeAnnotationHandler } from "./tools/removeAnnotation/index.js";

// GTD-oriented tool handlers
import { handleAddDependency } from "./tools/addDependency/index.js";
import { handleRemoveDependency } from "./tools/removeDependency/index.js";
import { handleGetNextActions } from "./tools/getNextActions/index.js";

// GTD Review & Clarify tools
import { handleProcessInbox } from "./tools/processInbox/index.js";
import { handleGetWaitingFor } from "./tools/getWaitingFor/index.js";
import { handleGetBlockedTasks } from "./tools/getBlockedTasks/index.js";
import { handleGetProjectStatus } from "./tools/getProjectStatus/index.js";
import { handleWeeklyReview } from "./tools/weeklyReview/index.js";

// Batch and advanced tools
import { handleCreateProjectTree } from "./tools/createProjectTree/index.js";
import { handleBatchModifyTasks } from "./tools/batchModifyTasks/index.js";
import { handleGetSomedayMaybe } from "./tools/getSomedayMaybe/index.js";

// Habits/Recurring tools
import { handleGetRecurringTasks } from "./tools/getRecurringTasks/index.js";

// Import common schemas and types
import {
  MarkTaskDoneRequestSchema,
  AddTaskRequestSchema,
  ListTasksRequestSchema,
  GetTaskDetailsRequestSchema,
  ModifyTaskRequestSchema,
  StartTaskRequestSchema,
  StopTaskRequestSchema,
  DeleteTaskRequestSchema,
  AddAnnotationRequestSchema,
  RemoveAnnotationRequestSchema,
  ErrorResponse,
  // GTD schemas
  AddDependencyRequestSchema,
  RemoveDependencyRequestSchema,
  GetNextActionsRequestSchema,
  GetWaitingForRequestSchema,
  GetBlockedTasksRequestSchema,
  GetProjectStatusRequestSchema,
  CreateProjectTreeRequestSchema,
  BatchModifyTasksRequestSchema,
  GetSomedayMaybeRequestSchema,
  GetRecurringTasksRequestSchema,
} from "./types/task.js";

// Import response formatter utilities
import { createMcpSuccessResponse, createMcpErrorResponse } from "./utils/mcpResponseFormat.js";

// Pre-generate JSON schemas for tool inputs
const markTaskDoneJsonSchema = {
  type: "object",
  properties: {
    uuid: {
      type: "string",
      format: "uuid", // JSON schema format for UUID
    },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const addTaskJsonSchema = {
  type: "object",
  properties: {
    description: { type: "string" },
    due: { type: "string" },
    priority: { type: "string", enum: ["H", "M", "L"] },
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
    tags: {
      type: "array",
      items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
    },
    scheduled: { type: "string" },
    wait: { type: "string" },
    until: { type: "string" },
    context: { type: "string" },
    energy: { type: "string" },
    depends: {
      type: "array",
      items: { type: "string", format: "uuid" },
    },
    parent: { type: "string", format: "uuid" },
    annotations: {
      type: "array",
      items: { type: "string" },
    },
    recur: { type: "string" },
  },
  required: ["description"],
  additionalProperties: false,
} as const;

const listTasksJsonSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["pending", "completed", "deleted", "waiting", "recurring"],
    },
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
    tags: {
      type: "array",
      items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
    },
    descriptionContains: { type: "string" },
    dueBefore: { type: "string", format: "date-time" },
    dueAfter: { type: "string", format: "date-time" },
    scheduledBefore: { type: "string", format: "date-time" },
    scheduledAfter: { type: "string", format: "date-time" },
    modifiedBefore: { type: "string", format: "date-time" },
    modifiedAfter: { type: "string", format: "date-time" },
    limit: { type: "integer" },
  },
  additionalProperties: false,
} as const;

const getTaskDetailsJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const modifyTaskJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
    description: { type: "string" },
    status: {
      type: "string",
      enum: ["pending", "completed", "deleted", "waiting", "recurring"],
    },
    due: { type: "string", format: "date-time" },
    priority: { type: "string", enum: ["H", "M", "L"] },
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]*$" },
    addTags: {
      type: "array",
      items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
    },
    removeTags: {
      type: "array",
      items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
    },
    scheduled: { type: "string" },
    wait: { type: "string" },
    until: { type: "string" },
    context: { type: "string" },
    energy: { type: "string" },
    addDepends: {
      type: "array",
      items: { type: "string", format: "uuid" },
    },
    removeDepends: {
      type: "array",
      items: { type: "string", format: "uuid" },
    },
    parent: { type: "string", format: "uuid" },
    recur: { type: "string" },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const startTaskJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const stopTaskJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const deleteTaskJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
    skipConfirmation: { type: "boolean" },
  },
  required: ["uuid"],
  additionalProperties: false,
} as const;

const addAnnotationJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
    annotation: { type: "string" },
  },
  required: ["uuid", "annotation"],
  additionalProperties: false,
} as const;

const removeAnnotationJsonSchema = {
  type: "object",
  properties: {
    uuid: { type: "string", format: "uuid" },
    annotation: { type: "string" },
  },
  required: ["uuid", "annotation"],
  additionalProperties: false,
} as const;

// GTD tool schemas
const addDependencyJsonSchema = {
  type: "object",
  properties: {
    task_uuid: { type: "string", format: "uuid" },
    depends_on_uuid: { type: "string", format: "uuid" },
  },
  required: ["task_uuid", "depends_on_uuid"],
  additionalProperties: false,
} as const;

const removeDependencyJsonSchema = {
  type: "object",
  properties: {
    task_uuid: { type: "string", format: "uuid" },
    depends_on_uuid: { type: "string", format: "uuid" },
  },
  required: ["task_uuid", "depends_on_uuid"],
  additionalProperties: false,
} as const;

const getNextActionsJsonSchema = {
  type: "object",
  properties: {
    context: { type: "string" },
    energy_level: { type: "string", enum: ["high", "medium", "low"] },
    time_available: { type: "string", enum: ["5min", "15min", "30min", "1hour", "2hours+"] },
    include_blocked: { type: "boolean" },
    limit: { type: "integer" },
  },
  additionalProperties: false,
} as const;

const getWaitingForJsonSchema = {
  type: "object",
  properties: {
    group_by: { type: "string", enum: ["blocker", "date", "project"] },
  },
  additionalProperties: false,
} as const;

const getBlockedTasksJsonSchema = {
  type: "object",
  properties: {
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
    include_waiting: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const getProjectStatusJsonSchema = {
  type: "object",
  properties: {
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
  },
  required: ["project"],
  additionalProperties: false,
} as const;

const createProjectTreeJsonSchema = {
  type: "object",
  properties: {
    project_name: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
    project_description: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          depends_on_indices: { type: "array", items: { type: "integer" } },
          priority: { type: "string", enum: ["H", "M", "L"] },
          tags: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" } },
          context: { type: "string" },
        },
        required: ["description"],
      },
    },
  },
  required: ["project_name", "project_description", "tasks"],
  additionalProperties: false,
} as const;

const batchModifyTasksJsonSchema = {
  type: "object",
  properties: {
    uuids: { type: "array", items: { type: "string", format: "uuid" } },
    modifications: {
      type: "object",
      properties: {
        description: { type: "string" },
        status: { type: "string", enum: ["pending", "completed", "deleted", "waiting", "recurring"] },
        due: { type: "string" },
        priority: { type: "string", enum: ["H", "M", "L"] },
        project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]*$" },
        addTags: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" } },
        removeTags: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" } },
        scheduled: { type: "string" },
        wait: { type: "string" },
        until: { type: "string" },
        context: { type: "string" },
        energy: { type: "string" },
      },
    },
  },
  required: ["uuids", "modifications"],
  additionalProperties: false,
} as const;

const getSomedayMaybeJsonSchema = {
  type: "object",
  properties: {
    project: { type: "string", pattern: "^[a-zA-Z0-9 ._-]+$" },
    limit: { type: "integer" },
  },
  additionalProperties: false,
} as const;

const getRecurringTasksJsonSchema = {
  type: "object",
  properties: {
    frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly", "all"] },
    include_completed: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

// Define a local schema that we expect for tool calls via this server
const LocalCallToolRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0").optional(), // Standard JSON-RPC field, often present
    method: z.literal("tools/call"), // Crucial: MCP method for tool calls
    id: z.union([z.string(), z.number(), z.null()]).optional(), // Standard JSON-RPC field, often present
    params: z.object({
      name: z.string(), // Name of the tool to call
      arguments: z.record(z.string(), z.unknown()).optional(), // Tool arguments
      _meta: z
        .object({
          // Optional metadata
          progressToken: z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
    }),
  })
  .passthrough(); // Allow other fields that might be part of the SDK's schema

export type InferredLocalCallToolRequest = z.infer<
  typeof LocalCallToolRequestSchema
>;

// Server setup
const server = new Server(
  {
    name: "taskwarrior-server",
    version: "1.0.0", // Consider updating version or managing it via package.json
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool handlers
// const ToolInputSchema = MCPToolSchema.shape.inputSchema; // Unused, and potentially misused
// type ToolInput = z.infer<typeof ToolInputSchema>; // Unused type

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mark_task_done",
        description: "Mark a task as done (completed) using its UUID.",
        inputSchema: markTaskDoneJsonSchema,
      },
      {
        name: "add_task",
        description:
          "Add a new task with full GTD and habit support. Supports: description (required), due, priority, project, tags, scheduled, wait, until, context, energy, depends, parent, annotations, recur (for habits/recurring tasks). Use tags=['inbox'] for quick capture. For habits: add recur (daily/weekly/monthly) with due date (e.g., recur:'daily', due:'today').",
        inputSchema: addTaskJsonSchema,
      },
      {
        name: "list_tasks",
        description:
          "Get a list of tasks as JSON objects based on flexible filters (status, project, tags, dates, limit, etc.).",
        inputSchema: listTasksJsonSchema,
      },
      {
        name: "get_task_details",
        description:
          "Get detailed information for a specific task by its UUID.",
        inputSchema: getTaskDetailsJsonSchema,
      },
      {
        name: "modify_task",
        description:
          "Modify any task attributes by UUID. Supports: description, status, due, priority, project, addTags, removeTags, scheduled, wait, until, context, energy, addDepends, removeDepends, parent, recur. Use this for scheduling (scheduled), deferring (wait), deadlines (due), contexts (context), and setting up recurring patterns (recur).",
        inputSchema: modifyTaskJsonSchema,
      },
      {
        name: "start_task",
        description:
          "Mark a task as started by its UUID. If already started, updates the start time.",
        inputSchema: startTaskJsonSchema,
      },
      {
        name: "stop_task",
        description:
          "Stop a task that is currently active (started) by its UUID.",
        inputSchema: stopTaskJsonSchema,
      },
      {
        name: "delete_task",
        description: "Delete a task by its UUID. Optionally skip confirmation.",
        inputSchema: deleteTaskJsonSchema,
      },
      {
        name: "add_annotation",
        description:
          "Add an annotation (note) to an existing task by its UUID.",
        inputSchema: addAnnotationJsonSchema,
      },
      {
        name: "remove_annotation",
        description:
          "Remove an existing annotation from a task by its UUID and exact annotation text.",
        inputSchema: removeAnnotationJsonSchema,
      },
      {
        name: "add_dependency",
        description:
          "Add a dependency between two tasks. The task_uuid will depend on depends_on_uuid (depends_on_uuid must be completed first).",
        inputSchema: addDependencyJsonSchema,
      },
      {
        name: "remove_dependency",
        description:
          "Remove a dependency between two tasks.",
        inputSchema: removeDependencyJsonSchema,
      },
      {
        name: "get_next_actions",
        description:
          "Get actionable next actions - answers 'What can I do NOW?'. Returns enriched response with tasks, metadata, insights, and context groupings. Supports filtering by context, energy level, time available.",
        inputSchema: getNextActionsJsonSchema,
      },
      {
        name: "process_inbox",
        description:
          "Get all tasks tagged with +inbox that need clarification and processing. Returns enriched response to guide GTD clarify step.",
        inputSchema: {},
      },
      {
        name: "get_waiting_for",
        description:
          "Get tasks you're waiting on (status:waiting or wait date set). Group by blocker, date, or project. Essential for GTD weekly review.",
        inputSchema: getWaitingForJsonSchema,
      },
      {
        name: "get_blocked_tasks",
        description:
          "Get tasks blocked by unmet dependencies. Shows what's stuck and why. Includes dependency chain analysis.",
        inputSchema: getBlockedTasksJsonSchema,
      },
      {
        name: "get_project_status",
        description:
          "Get health check for a specific project: next actions, blocked tasks, completion %, staleness. Essential for project reviews.",
        inputSchema: getProjectStatusJsonSchema,
      },
      {
        name: "weekly_review",
        description:
          "Generate comprehensive GTD weekly review data: inbox count, completed tasks, stalled projects, projects without next actions, waiting items, overdue tasks, habit completion statistics, and broken streaks.",
        inputSchema: {},
      },
      {
        name: "create_project_tree",
        description:
          "Create a complete project with multiple tasks and dependencies in one operation. Automatically creates project root task and all subtasks with dependency chains.",
        inputSchema: createProjectTreeJsonSchema,
      },
      {
        name: "batch_modify_tasks",
        description:
          "Modify multiple tasks at once with the same set of modifications. Efficient for bulk operations like rescheduling, retagging, or changing priorities.",
        inputSchema: batchModifyTasksJsonSchema,
      },
      {
        name: "get_someday_maybe",
        description:
          "Get all tasks tagged with +someday for GTD someday/maybe list review. Shows aspirational tasks that aren't currently active.",
        inputSchema: getSomedayMaybeJsonSchema,
      },
      {
        name: "get_recurring_tasks",
        description:
          "Get all recurring tasks/habits with completion statistics, streaks, and frequency grouping. Essential for habit tracking and routine management. Shows template tasks (status:recurring) with mask analysis for completion rates.",
        inputSchema: getRecurringTasksJsonSchema,
      },
    ],
  };
});

server.setRequestHandler(
  LocalCallToolRequestSchema as any, // Cast to any as a workaround for _cached issue
  async (request: InferredLocalCallToolRequest) => {
    // Use the inferred type from local schema
    try {
      const { name, arguments: args } = request.params;
      let result: unknown;

      switch (name) {
        case "mark_task_done": {
          const parsedArgs = MarkTaskDoneRequestSchema.parse(args);
          result = await markTaskDoneHandler(parsedArgs);
          break;
        }
        case "add_task": {
          const parsedArgs = AddTaskRequestSchema.parse(args);
          result = await handleAddTask(parsedArgs);
          break;
        }
        case "list_tasks": {
          const parsedArgs = ListTasksRequestSchema.parse(args);
          result = await handleListTasks(parsedArgs);
          break;
        }
        case "get_task_details": {
          const parsedArgs = GetTaskDetailsRequestSchema.parse(args);
          result = await getTaskDetailsHandler(parsedArgs);
          break;
        }
        case "modify_task": {
          const parsedArgs = ModifyTaskRequestSchema.parse(args);
          result = await modifyTaskHandler(parsedArgs);
          break;
        }
        case "start_task": {
          const parsedArgs = StartTaskRequestSchema.parse(args);
          result = await startTaskHandler(parsedArgs);
          break;
        }
        case "stop_task": {
          const parsedArgs = StopTaskRequestSchema.parse(args);
          result = await stopTaskHandler(parsedArgs);
          break;
        }
        case "delete_task": {
          const parsedArgs = DeleteTaskRequestSchema.parse(args);
          result = await deleteTaskHandler(parsedArgs);
          break;
        }
        case "add_annotation": {
          const parsedArgs = AddAnnotationRequestSchema.parse(args);
          result = await addAnnotationHandler(parsedArgs);
          break;
        }
        case "remove_annotation": {
          const parsedArgs = RemoveAnnotationRequestSchema.parse(args);
          result = await removeAnnotationHandler(parsedArgs);
          break;
        }
        case "add_dependency": {
          const parsedArgs = AddDependencyRequestSchema.parse(args);
          result = await handleAddDependency(parsedArgs);
          break;
        }
        case "remove_dependency": {
          const parsedArgs = RemoveDependencyRequestSchema.parse(args);
          result = await handleRemoveDependency(parsedArgs);
          break;
        }
        case "get_next_actions": {
          const parsedArgs = GetNextActionsRequestSchema.parse(args);
          result = await handleGetNextActions(parsedArgs);
          break;
        }
        case "process_inbox": {
          result = await handleProcessInbox();
          break;
        }
        case "get_waiting_for": {
          const parsedArgs = GetWaitingForRequestSchema.parse(args);
          result = await handleGetWaitingFor(parsedArgs);
          break;
        }
        case "get_blocked_tasks": {
          const parsedArgs = GetBlockedTasksRequestSchema.parse(args);
          result = await handleGetBlockedTasks(parsedArgs);
          break;
        }
        case "get_project_status": {
          const parsedArgs = GetProjectStatusRequestSchema.parse(args);
          result = await handleGetProjectStatus(parsedArgs);
          break;
        }
        case "weekly_review": {
          result = await handleWeeklyReview();
          break;
        }
        case "create_project_tree": {
          const parsedArgs = CreateProjectTreeRequestSchema.parse(args);
          result = await handleCreateProjectTree(parsedArgs);
          break;
        }
        case "batch_modify_tasks": {
          const parsedArgs = BatchModifyTasksRequestSchema.parse(args);
          result = await handleBatchModifyTasks(parsedArgs);
          break;
        }
        case "get_someday_maybe": {
          const parsedArgs = GetSomedayMaybeRequestSchema.parse(args);
          result = await handleGetSomedayMaybe(parsedArgs);
          break;
        }
        case "get_recurring_tasks": {
          const parsedArgs = GetRecurringTasksRequestSchema.parse(args);
          result = await handleGetRecurringTasks(parsedArgs);
          break;
        }
        default:
          return createMcpErrorResponse(`Tool "${name}" not found.`);
      }

      // Handle results coming from our handlers
      if (result && typeof result === "object") {
        // Handle our custom McpToolResponse format (for backward compatibility)
        if ("status" in result && "tool_name" in result) {
          const mcpResult = result as any;
          
          if (mcpResult.status === "error" && mcpResult.error) {
            return createMcpErrorResponse(mcpResult.error.message || "Unknown error");
          } 
          
          if (mcpResult.result?.content?.[0]?.type === "json" && mcpResult.result.content[0].data) {
            // Extract the data from our custom format
            return createMcpSuccessResponse(mcpResult.result.content[0].data);
          }
        }
        
        // Handle native error objects
        if ("error" in result) {
          const errorResult = result as ErrorResponse;
          return createMcpErrorResponse(errorResult.error);
        }
      }
      
      // Default case - return whatever we got
      return createMcpSuccessResponse(result);
    } catch (error: unknown) {
      console.error("Error processing CallToolRequest:", error);
      let errorMessage = "An unexpected error occurred.";
      
      if (error instanceof z.ZodError) {
        errorMessage = `Invalid arguments: ${error.issues.map((i) => i.path.join(".") + ": " + i.message).join(", ")}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }
      
      return createMcpErrorResponse(errorMessage);
    }
  },
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP TaskWarrior Server running on stdio"); // Keep this commented for cleaner output unless debugging
}

runServer().catch((err) => {
  console.error("Server crashed:", err);
  process.exit(1);
});
