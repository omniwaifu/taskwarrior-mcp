#!/usr/bin/env node

import { inspectEnvironment } from "./utils/diagnostics.js";
import { runTool } from "./utils/toolResult.js";

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { handleQuickCapture } from "./tools/quickCapture/handler.js";
import { handleProcessInboxItem } from "./tools/processInboxItem/handler.js";

import { handleQueryTasks } from "./tools/queryTasks/handler.js";
import { handleGetTaskTree } from "./tools/getTaskTree/handler.js";

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
  QueryTasksRequestSchema,
  GetTaskTreeRequestSchema,
  ProcessInboxRequestSchema,
  QuickCaptureRequestSchema,
  ProcessInboxItemRequestSchema,
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
  version: "1.0.3",
}, { maxToolInputElements: 25_000 });

const readOnlyTools = new Set([
  "get_server_status", "query_tasks", "get_task_tree", "list_tasks", "get_task_details", "get_next_actions", "process_inbox", "get_waiting_for",
  "get_blocked_tasks", "get_project_status", "weekly_review", "get_someday_maybe", "get_recurring_tasks",
]);

const outputSchema = {
  status: z.enum(["success", "error"]),
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
};

function registerJsonTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  handler: (args: z.output<z.ZodObject<S>>) => Promise<unknown>,
  inputSchema: S,
) {
  const schema = z.object(inputSchema);
  server.registerTool<typeof outputSchema, typeof schema>(name, {
    description, inputSchema: schema, outputSchema,
    annotations: { readOnlyHint: readOnlyTools.has(name), destructiveHint: !readOnlyTools.has(name), openWorldHint: false },
  }, (args) => runTool(() => handler(args)));
}

registerJsonTool("get_server_status", "Check the Node runtime, Taskwarrior executable, and configuration readability without exporting task data or modifying task records. Returns actionable setup diagnostics; it is not a database-integrity check.", inspectEnvironment, {});

registerJsonTool("query_tasks", "Search tasks with stable sorting and cursor pagination. Supports legacy date/project/tag filters plus context, priority, waiting_for, parent, active, and blocked. Returns page.total and page.next_cursor; repeat identical filters for subsequent pages. Changed results invalidate the cursor. Missing sort values are last; UUID breaks ties. Priority defaults to configured highest-first order.", handleQueryTasks, QueryTasksRequestSchema.shape);
registerJsonTool("get_task_tree", "Read project hierarchy using mcp_parent, separate from recurrence parent. Specify project or root uuid. Returns task nodes with depth, child UUIDs, unresolved dependencies, and completion/actionability counts for returned nodes. depth and max_nodes bound traversal; truncated indicates more nodes, retrievable using a child UUID. Reports cycles and missing parents.", handleGetTaskTree, GetTaskTreeRequestSchema.shape);

registerJsonTool("quick_capture", "Capture an unprocessed thought or task in the inbox. Adds the inbox tag; clarify it before treating it as a next action.", handleQuickCapture, QuickCaptureRequestSchema.shape);
registerJsonTool("process_inbox_item", "Clarify an inbox item as next_action, project, waiting, someday, reference, or delete. Removes inbox and incompatible workflow tags. Waiting requires waiting_for; project requires a project name. Delete permanently marks the item deleted. An optional note is added after classification; errors report partial work.", handleProcessInboxItem, ProcessInboxItemRequestSchema.shape);

registerJsonTool(
  "mark_task_done",
  "Mark a task as done (completed) using its UUID.",
  (args) => markTaskDoneHandler(args),
  MarkTaskDoneRequestSchema.shape,
);

registerJsonTool(
  "add_task",
  "Add a new task with full GTD and habit support. Supports: description (required), due, priority, project, tags, scheduled, wait, until, context, energy, depends, parent (stored as mcp_parent for project hierarchy), annotations, estimated_minutes, waiting_for, follow_up, recur (for habits/recurring tasks). Use tags=['inbox'] for quick capture. For habits: add recur (daily/weekly/monthly) with due date (e.g., recur:'daily', due:'today').",
  (args) => handleAddTask(args),
  AddTaskRequestSchema.shape,
);

registerJsonTool(
  "list_tasks",
  "[Raw Query] Get a list of tasks as JSON objects based on flexible filters (status, project, tags, dates, limit, etc.). Returns raw task array without analysis. For actionable recommendations with insights and context groupings, use get_next_actions instead.",
  (args) => handleListTasks(args),
  ListTasksRequestSchema.shape,
);

registerJsonTool(
  "get_task_details",
  "[Raw Query] Get detailed information for a specific task by its UUID.",
  (args) => getTaskDetailsHandler(args),
  GetTaskDetailsRequestSchema.shape,
);

registerJsonTool(
  "modify_task",
  "Modify any task attributes by UUID. Supports: description, status, due, priority, project, addTags, removeTags, scheduled, wait, until, context, energy, addDepends, removeDepends, parent, recur, estimated_minutes, waiting_for, follow_up. Empty strings clear optional text/date fields, priority and parent; null clears estimated_minutes. Use this for scheduling (scheduled), deferring (wait), deadlines (due), contexts (context), and setting up recurring patterns (recur).",
  (args) => modifyTaskHandler(args),
  ModifyTaskRequestSchema.shape,
);

registerJsonTool(
  "start_task",
  "Mark a task as started by its UUID. Already-started tasks retain their original start time.",
  (args) => startTaskHandler(args),
  StartTaskRequestSchema.shape,
);

registerJsonTool(
  "stop_task",
  "Stop a task that is currently active (started) by its UUID.",
  (args) => stopTaskHandler(args),
  StopTaskRequestSchema.shape,
);

registerJsonTool(
  "delete_task",
  "Delete a task by its UUID. Optionally skip confirmation.",
  (args) => deleteTaskHandler(args),
  DeleteTaskRequestSchema.shape,
);

registerJsonTool(
  "add_annotation",
  "Add an annotation (note) to an existing task by its UUID.",
  (args) => addAnnotationHandler(args),
  AddAnnotationRequestSchema.shape,
);

registerJsonTool(
  "remove_annotation",
  "Remove an existing annotation from a task by its UUID and exact annotation text.",
  (args) => removeAnnotationHandler(args),
  RemoveAnnotationRequestSchema.shape,
);

registerJsonTool(
  "add_dependency",
  "Add a dependency between two tasks. The task_uuid will depend on depends_on_uuid (depends_on_uuid must be completed first).",
  (args) => handleAddDependency(args),
  AddDependencyRequestSchema.shape,
);

registerJsonTool(
  "remove_dependency",
  "Remove a dependency between two tasks.",
  (args) => handleRemoveDependency(args),
  RemoveDependencyRequestSchema.shape,
);

registerJsonTool(
  "get_next_actions",
  "[GTD Decision] Get actionable next actions - answers 'What should I do NOW?'. Returns enriched analysis (not just filtered tasks) with actionability insights, AI recommendations, context groupings, and metadata. Supports context, project, energy, time_available or max_minutes, limit (default 50, max 200), and cursor. Excludes inbox, reference, someday, project roots, delegation, future dates and unresolved dependencies by default. Time filters exclude unknown estimates unless include_unestimated is true. Don't use list_tasks for decision-making - this tool is designed for that.",
  (args) => handleGetNextActions(args),
  GetNextActionsRequestSchema.shape,
);

registerJsonTool(
  "process_inbox",
  "[GTD Review] Page through tasks tagged with +inbox (limit defaults to 50, maximum 200; use page.next_cursor with unchanged filters) for GTD clarify/process workflow. Returns enriched response (not just a filtered list) with clarification prompts, decision structure, and processing guidance. Don't use list_tasks(tags=['inbox']) for inbox processing - this tool provides the GTD workflow structure.",
  (args) => handleProcessInbox(args),
  ProcessInboxRequestSchema.shape,
);

registerJsonTool(
  "get_waiting_for",
  "[GTD Review] Get tasks waiting on EXTERNAL factors (people, events, responses). Includes waiting_for delegation and native waiting/deferred tasks. Group by blocker (person/factor), date (follow_up or wait), or project. Filter by waiting_for, project, or follow_up_due. Follow-up dates do not release delegation. Essential for GTD weekly review. For tasks blocked by OTHER TASKS (internal dependencies), use get_blocked_tasks instead.",
  (args) => handleGetWaitingFor(args),
  GetWaitingForRequestSchema.shape,
);

registerJsonTool(
  "get_blocked_tasks",
  "[GTD Review] Get tasks blocked by OTHER TASKS in the system (unmet internal dependencies). Shows what's stuck and why with dependency chain analysis. Set include_waiting=true to also include tasks waiting on external factors. For ONLY external blockers (people/events), use get_waiting_for instead.",
  (args) => handleGetBlockedTasks(args),
  GetBlockedTasksRequestSchema.shape,
);

registerJsonTool(
  "get_project_status",
  "[GTD Decision] Get project health analysis (not just task list) for a specific project. Returns enriched metrics: next actions, blocked tasks, completion %, staleness warnings, and recommendations. Essential for project reviews. Use list_tasks(project=X) for raw project task list only.",
  (args) => handleGetProjectStatus(args),
  GetProjectStatusRequestSchema.shape,
);

registerJsonTool(
  "weekly_review",
  "[GTD Review] Generate comprehensive GTD weekly review - a curated aggregation in ONE call. Includes: inbox count, completed tasks, stalled projects, projects without next actions, waiting items, overdue tasks, habit completion stats, and broken streaks. Don't query categories manually - this tool aggregates everything for the weekly review ritual.",
  () => handleWeeklyReview(),
  {},
);

registerJsonTool(
  "create_project_tree",
  "[Bulk Operation] Create a complete project with multiple tasks and dependencies in one operation. Automatically creates project root task and all subtasks with dependency chains.",
  (args) => handleCreateProjectTree(args),
  CreateProjectTreeRequestSchema.shape,
);

registerJsonTool(
  "batch_modify_tasks",
  "[Bulk Operation] Modify multiple tasks at once with the same set of modifications. Efficient for bulk operations like rescheduling, retagging, or changing priorities.",
  (args) => handleBatchModifyTasks(args),
  BatchModifyTasksRequestSchema.shape,
);

registerJsonTool(
  "get_someday_maybe",
  "[GTD Review] Get all tasks tagged with +someday for GTD someday/maybe list review. Shows aspirational tasks that aren't currently active.",
  (args) => handleGetSomedayMaybe(args),
  GetSomedayMaybeRequestSchema.shape,
);

registerJsonTool(
  "get_recurring_tasks",
  "[Habit Tracking] Get all recurring tasks/habits with completion statistics, streaks, and frequency grouping. Essential for habit tracking and routine management. Uses instance history and due dates for completion rates; future unfinished instances do not break streaks. Set include_completed to include completed templates.",
  (args) => handleGetRecurringTasks(args),
  GetRecurringTasksRequestSchema.shape,
);

async function main() {
  if (process.argv.includes("--doctor")) {
    const report = await inspectEnvironment();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === "success" ? 0 : 1;
    return;
  }
  if (process.argv.includes("--help")) {
    console.log("Taskwarrior MCP server (stdio)\nUsage: taskwarrior-mcp [--doctor | --help]\nConfigure TASK_BIN and optional TASKRC/TASKDATA; run --doctor to diagnose setup.");
    return;
  }
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 1024 * 1024 });
  await server.connect(transport);
  console.error("MCP TaskWarrior Server running on stdio");
}

main().catch((err) => {
  console.error("Server crashed:", err);
  process.exit(1);
});
