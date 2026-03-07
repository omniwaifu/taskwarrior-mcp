#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
  version: "1.0.1",
});

type ToolInputSchema = Record<string, unknown>;
type TextToolResult = Promise<{
  content: Array<{ type: "text"; text: string }>;
}>;

const registerToolWithArgs = server.tool.bind(server) as unknown as (
  name: string,
  description: string,
  inputSchema: ToolInputSchema,
  callback: (args: unknown) => TextToolResult,
) => void;

const registerToolWithoutArgs = server.tool.bind(server) as unknown as (
  name: string,
  description: string,
  callback: () => TextToolResult,
) => void;

function toTextResult(result: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}

function registerJsonTool(
  name: string,
  description: string,
  handler: (args?: unknown) => Promise<unknown>,
  inputSchema?: ToolInputSchema,
) {
  if (inputSchema && Object.keys(inputSchema).length > 0) {
    registerToolWithArgs(
      name,
      description,
      inputSchema,
      async (args: unknown) => toTextResult(await handler(args)),
    );
    return;
  }

  registerToolWithoutArgs(
    name,
    description,
    async () => toTextResult(await handler()),
  );
}

registerJsonTool(
  "mark_task_done",
  "Mark a task as done (completed) using its UUID.",
  (args) => markTaskDoneHandler(args as never),
  MarkTaskDoneRequestSchema.shape,
);

registerJsonTool(
  "add_task",
  "Add a new task with full GTD and habit support. Supports: description (required), due, priority, project, tags, scheduled, wait, until, context, energy, depends, parent, annotations, recur (for habits/recurring tasks). Use tags=['inbox'] for quick capture. For habits: add recur (daily/weekly/monthly) with due date (e.g., recur:'daily', due:'today').",
  (args) => handleAddTask(args as never),
  AddTaskRequestSchema.shape,
);

registerJsonTool(
  "list_tasks",
  "[Raw Query] Get a list of tasks as JSON objects based on flexible filters (status, project, tags, dates, limit, etc.). Returns raw task array without analysis. For actionable recommendations with insights and context groupings, use get_next_actions instead.",
  (args) => handleListTasks(args as never),
  ListTasksRequestSchema.shape,
);

registerJsonTool(
  "get_task_details",
  "[Raw Query] Get detailed information for a specific task by its UUID.",
  (args) => getTaskDetailsHandler(args as never),
  GetTaskDetailsRequestSchema.shape,
);

registerJsonTool(
  "modify_task",
  "Modify any task attributes by UUID. Supports: description, status, due, priority, project, addTags, removeTags, scheduled, wait, until, context, energy, addDepends, removeDepends, parent, recur. Use this for scheduling (scheduled), deferring (wait), deadlines (due), contexts (context), and setting up recurring patterns (recur).",
  (args) => modifyTaskHandler(args as never),
  ModifyTaskRequestSchema.shape,
);

registerJsonTool(
  "start_task",
  "Mark a task as started by its UUID. If already started, updates the start time.",
  (args) => startTaskHandler(args as never),
  StartTaskRequestSchema.shape,
);

registerJsonTool(
  "stop_task",
  "Stop a task that is currently active (started) by its UUID.",
  (args) => stopTaskHandler(args as never),
  StopTaskRequestSchema.shape,
);

registerJsonTool(
  "delete_task",
  "Delete a task by its UUID. Optionally skip confirmation.",
  (args) => deleteTaskHandler(args as never),
  DeleteTaskRequestSchema.shape,
);

registerJsonTool(
  "add_annotation",
  "Add an annotation (note) to an existing task by its UUID.",
  (args) => addAnnotationHandler(args as never),
  AddAnnotationRequestSchema.shape,
);

registerJsonTool(
  "remove_annotation",
  "Remove an existing annotation from a task by its UUID and exact annotation text.",
  (args) => removeAnnotationHandler(args as never),
  RemoveAnnotationRequestSchema.shape,
);

registerJsonTool(
  "add_dependency",
  "Add a dependency between two tasks. The task_uuid will depend on depends_on_uuid (depends_on_uuid must be completed first).",
  (args) => handleAddDependency(args as never),
  AddDependencyRequestSchema.shape,
);

registerJsonTool(
  "remove_dependency",
  "Remove a dependency between two tasks.",
  (args) => handleRemoveDependency(args as never),
  RemoveDependencyRequestSchema.shape,
);

registerJsonTool(
  "get_next_actions",
  "[GTD Decision] Get actionable next actions - answers 'What should I do NOW?'. Returns enriched analysis (not just filtered tasks) with actionability insights, AI recommendations, context groupings, and metadata. Supports filtering by context, energy level, time available. Don't use list_tasks for decision-making - this tool is designed for that.",
  (args) => handleGetNextActions(args as never),
  GetNextActionsRequestSchema.shape,
);

registerJsonTool(
  "process_inbox",
  "[GTD Review] Get all tasks tagged with +inbox for GTD clarify/process workflow. Returns enriched response (not just a filtered list) with clarification prompts, decision structure, and processing guidance. Don't use list_tasks(tags=['inbox']) for inbox processing - this tool provides the GTD workflow structure.",
  () => handleProcessInbox(),
);

registerJsonTool(
  "get_waiting_for",
  "[GTD Review] Get tasks waiting on EXTERNAL factors (people, events, responses). Filters by status:waiting or wait date. Group by blocker (person/factor), date (wait date), or project. Essential for GTD weekly review. For tasks blocked by OTHER TASKS (internal dependencies), use get_blocked_tasks instead.",
  (args) => handleGetWaitingFor(args as never),
  GetWaitingForRequestSchema.shape,
);

registerJsonTool(
  "get_blocked_tasks",
  "[GTD Review] Get tasks blocked by OTHER TASKS in the system (unmet internal dependencies). Shows what's stuck and why with dependency chain analysis. Set include_waiting=true to also include tasks waiting on external factors. For ONLY external blockers (people/events), use get_waiting_for instead.",
  (args) => handleGetBlockedTasks(args as never),
  GetBlockedTasksRequestSchema.shape,
);

registerJsonTool(
  "get_project_status",
  "[GTD Decision] Get project health analysis (not just task list) for a specific project. Returns enriched metrics: next actions, blocked tasks, completion %, staleness warnings, and recommendations. Essential for project reviews. Use list_tasks(project=X) for raw project task list only.",
  (args) => handleGetProjectStatus(args as never),
  GetProjectStatusRequestSchema.shape,
);

registerJsonTool(
  "weekly_review",
  "[GTD Review] Generate comprehensive GTD weekly review - a curated aggregation in ONE call. Includes: inbox count, completed tasks, stalled projects, projects without next actions, waiting items, overdue tasks, habit completion stats, and broken streaks. Don't query categories manually - this tool aggregates everything for the weekly review ritual.",
  () => handleWeeklyReview(),
);

registerJsonTool(
  "create_project_tree",
  "[Bulk Operation] Create a complete project with multiple tasks and dependencies in one operation. Automatically creates project root task and all subtasks with dependency chains.",
  (args) => handleCreateProjectTree(args as never),
  CreateProjectTreeRequestSchema.shape,
);

registerJsonTool(
  "batch_modify_tasks",
  "[Bulk Operation] Modify multiple tasks at once with the same set of modifications. Efficient for bulk operations like rescheduling, retagging, or changing priorities.",
  (args) => handleBatchModifyTasks(args as never),
  BatchModifyTasksRequestSchema.shape,
);

registerJsonTool(
  "get_someday_maybe",
  "[GTD Review] Get all tasks tagged with +someday for GTD someday/maybe list review. Shows aspirational tasks that aren't currently active.",
  (args) => handleGetSomedayMaybe(args as never),
  GetSomedayMaybeRequestSchema.shape,
);

registerJsonTool(
  "get_recurring_tasks",
  "[Habit Tracking] Get all recurring tasks/habits with completion statistics, streaks, and frequency grouping. Essential for habit tracking and routine management. Shows template tasks (status:recurring) with mask analysis for completion rates.",
  (args) => handleGetRecurringTasks(args as never),
  GetRecurringTasksRequestSchema.shape,
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
