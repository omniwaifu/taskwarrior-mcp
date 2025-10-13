#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
import { handleAddDependency } from "./tools/addDependency/index.js";
import { handleRemoveDependency } from "./tools/removeDependency/index.js";
import { handleGetNextActions } from "./tools/getNextActions/index.js";
import { handleProcessInbox } from "./tools/processInbox/index.js";
import { handleGetWaitingFor } from "./tools/getWaitingFor/index.js";
import { handleGetBlockedTasks } from "./tools/getBlockedTasks/index.js";
import { handleGetProjectStatus } from "./tools/getProjectStatus/index.js";
import { handleWeeklyReview } from "./tools/weeklyReview/index.js";
import { handleCreateProjectTree } from "./tools/createProjectTree/index.js";
import { handleBatchModifyTasks } from "./tools/batchModifyTasks/index.js";
import { handleGetSomedayMaybe } from "./tools/getSomedayMaybe/index.js";
import { handleGetRecurringTasks } from "./tools/getRecurringTasks/index.js";

// Import schemas
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

const server = new McpServer({
  name: "taskwarrior-server",
  version: "1.0.0",
});

// Register all tools
server.registerTool(
  "mark_task_done",
  {
    description: "Mark a task as done (completed) using its UUID.",
    inputSchema: MarkTaskDoneRequestSchema.shape,
  },
  async (args) => {
    const result = await markTaskDoneHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "add_task",
  {
    description: "Add a new task with full GTD and habit support. Supports: description (required), due, priority, project, tags, scheduled, wait, until, context, energy, depends, parent, annotations, recur (for habits/recurring tasks). Use tags=['inbox'] for quick capture. For habits: add recur (daily/weekly/monthly) with due date (e.g., recur:'daily', due:'today').",
    inputSchema: AddTaskRequestSchema.shape,
  },
  async (args) => {
    const result = await handleAddTask(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "list_tasks",
  {
    description: "[Raw Query] Get a list of tasks as JSON objects based on flexible filters (status, project, tags, dates, limit, etc.). Returns raw task array without analysis. For actionable recommendations with insights and context groupings, use get_next_actions instead.",
    inputSchema: ListTasksRequestSchema.shape,
  },
  async (args) => {
    const result = await handleListTasks(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_task_details",
  {
    description: "[Raw Query] Get detailed information for a specific task by its UUID.",
    inputSchema: GetTaskDetailsRequestSchema.shape,
  },
  async (args) => {
    const result = await getTaskDetailsHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "modify_task",
  {
    description: "Modify any task attributes by UUID. Supports: description, status, due, priority, project, addTags, removeTags, scheduled, wait, until, context, energy, addDepends, removeDepends, parent, recur. Use this for scheduling (scheduled), deferring (wait), deadlines (due), contexts (context), and setting up recurring patterns (recur).",
    inputSchema: ModifyTaskRequestSchema.shape,
  },
  async (args) => {
    const result = await modifyTaskHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "start_task",
  {
    description: "Mark a task as started by its UUID. If already started, updates the start time.",
    inputSchema: StartTaskRequestSchema.shape,
  },
  async (args) => {
    const result = await startTaskHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "stop_task",
  {
    description: "Stop a task that is currently active (started) by its UUID.",
    inputSchema: StopTaskRequestSchema.shape,
  },
  async (args) => {
    const result = await stopTaskHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "delete_task",
  {
    description: "Delete a task by its UUID. Optionally skip confirmation.",
    inputSchema: DeleteTaskRequestSchema.shape,
  },
  async (args) => {
    const result = await deleteTaskHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "add_annotation",
  {
    description: "Add an annotation (note) to an existing task by its UUID.",
    inputSchema: AddAnnotationRequestSchema.shape,
  },
  async (args) => {
    const result = await addAnnotationHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "remove_annotation",
  {
    description: "Remove an existing annotation from a task by its UUID and exact annotation text.",
    inputSchema: RemoveAnnotationRequestSchema.shape,
  },
  async (args) => {
    const result = await removeAnnotationHandler(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "add_dependency",
  {
    description: "Add a dependency between two tasks. The task_uuid will depend on depends_on_uuid (depends_on_uuid must be completed first).",
    inputSchema: AddDependencyRequestSchema.shape,
  },
  async (args) => {
    const result = await handleAddDependency(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "remove_dependency",
  {
    description: "Remove a dependency between two tasks.",
    inputSchema: RemoveDependencyRequestSchema.shape,
  },
  async (args) => {
    const result = await handleRemoveDependency(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_next_actions",
  {
    description: "[GTD Decision] Get actionable next actions - answers 'What should I do NOW?'. Returns enriched analysis (not just filtered tasks) with actionability insights, AI recommendations, context groupings, and metadata. Supports filtering by context, energy level, time available. Don't use list_tasks for decision-making - this tool is designed for that.",
    inputSchema: GetNextActionsRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetNextActions(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "process_inbox",
  {
    description: "[GTD Review] Get all tasks tagged with +inbox for GTD clarify/process workflow. Returns enriched response (not just a filtered list) with clarification prompts, decision structure, and processing guidance. Don't use list_tasks(tags=['inbox']) for inbox processing - this tool provides the GTD workflow structure.",
    inputSchema: {},
  },
  async () => {
    const result = await handleProcessInbox();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_waiting_for",
  {
    description: "[GTD Review] Get tasks waiting on EXTERNAL factors (people, events, responses). Filters by status:waiting or wait date. Group by blocker (person/factor), date (wait date), or project. Essential for GTD weekly review. For tasks blocked by OTHER TASKS (internal dependencies), use get_blocked_tasks instead.",
    inputSchema: GetWaitingForRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetWaitingFor(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_blocked_tasks",
  {
    description: "[GTD Review] Get tasks blocked by OTHER TASKS in the system (unmet internal dependencies). Shows what's stuck and why with dependency chain analysis. Set include_waiting=true to also include tasks waiting on external factors. For ONLY external blockers (people/events), use get_waiting_for instead.",
    inputSchema: GetBlockedTasksRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetBlockedTasks(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_project_status",
  {
    description: "[GTD Decision] Get project health analysis (not just task list) for a specific project. Returns enriched metrics: next actions, blocked tasks, completion %, staleness warnings, and recommendations. Essential for project reviews. Use list_tasks(project=X) for raw project task list only.",
    inputSchema: GetProjectStatusRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetProjectStatus(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "weekly_review",
  {
    description: "[GTD Review] Generate comprehensive GTD weekly review - a curated aggregation in ONE call. Includes: inbox count, completed tasks, stalled projects, projects without next actions, waiting items, overdue tasks, habit completion stats, and broken streaks. Don't query categories manually - this tool aggregates everything for the weekly review ritual.",
    inputSchema: {},
  },
  async () => {
    const result = await handleWeeklyReview();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "create_project_tree",
  {
    description: "[Bulk Operation] Create a complete project with multiple tasks and dependencies in one operation. Automatically creates project root task and all subtasks with dependency chains.",
    inputSchema: CreateProjectTreeRequestSchema.shape,
  },
  async (args) => {
    const result = await handleCreateProjectTree(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "batch_modify_tasks",
  {
    description: "[Bulk Operation] Modify multiple tasks at once with the same set of modifications. Efficient for bulk operations like rescheduling, retagging, or changing priorities.",
    inputSchema: BatchModifyTasksRequestSchema.shape,
  },
  async (args) => {
    const result = await handleBatchModifyTasks(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_someday_maybe",
  {
    description: "[GTD Review] Get all tasks tagged with +someday for GTD someday/maybe list review. Shows aspirational tasks that aren't currently active.",
    inputSchema: GetSomedayMaybeRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetSomedayMaybe(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_recurring_tasks",
  {
    description: "[Habit Tracking] Get all recurring tasks/habits with completion statistics, streaks, and frequency grouping. Essential for habit tracking and routine management. Shows template tasks (status:recurring) with mask analysis for completion rates.",
    inputSchema: GetRecurringTasksRequestSchema.shape,
  },
  async (args) => {
    const result = await handleGetRecurringTasks(args as any);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP TaskWarrior Server running on stdio");
}

main().catch((err) => {
  console.error("Server crashed:", err);
  process.exit(1);
});
