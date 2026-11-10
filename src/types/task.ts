import { z } from "zod";

// Zod 4 uuid() validates version/variant bits; guid() preserves the UUID-shaped
// identifiers accepted by Zod 3 and our existing Taskwarrior UUID validator.

// Base task schema that covers common TaskWarrior fields
export const TaskWarriorTaskSchema = z.object({
  id: z.number().int(),
  uuid: z.guid(),
  description: z.string(),
  status: z.enum(["pending", "completed", "deleted", "waiting", "recurring"]),
  entry: z.string(), // Accept any string format for dates from TaskWarrior
  modified: z.string().optional(),
  start: z.string().optional(),
  due: z.string().optional(),
  end: z.string().optional(), // Completion date
  priority: z.string().optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  annotations: z
    .array(
      z.object({
        entry: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  // GTD-specific fields
  depends: z.array(z.guid()).optional(), // Task dependencies (UUIDs)
  wait: z.string().optional(), // Wait until date (defer)
  scheduled: z.string().optional(), // Scheduled start date
  until: z.string().optional(), // Task expiration date
  parent: z.guid().optional(), // Parent task UUID
  context: z.string().optional(), // GTD context (@home, @work, etc.)
  energy: z.string().optional(), // Energy level required
  urgency: z.number().optional(), // Calculated urgency score
  estimated_minutes: z.number().optional(),
  waiting_for: z.string().optional(),
  follow_up: z.string().optional(),
  mcp_parent: z.string().optional(),
  complexity: z.union([z.number(), z.string()]).optional(), // Time estimate / complexity
  recur: z.string().optional(), // Recurrence pattern
  mask: z.string().optional(), // Recurrence mask
  imask: z.number().optional(), // Recurrence instance mask
}).passthrough(); // Allow additional fields from TaskWarrior without validation errors

export type TaskWarriorTask = z.infer<typeof TaskWarriorTaskSchema>;

// Request budgets. Keep exported Taskwarrior data uncapped so
// existing databases are not silently filtered by an input-policy decision.
export const INPUT_ARRAY_LIMITS = {
  tags: 64,
  dependencies: 128,
  annotations: 64,
  batchTasks: 100,
  projectTasks: 100,
  projectDependencies: 100,
} as const;

export const PlanningFields = {
  estimated_minutes: z.number().int().min(0).max(525600).nullable().optional(),
  waiting_for: z.string().max(512).optional(),
  follow_up: z.string().max(128).optional(),
};
export const PagingFields = {
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().max(1024).optional(),
};

// Request schemas for tool inputs

export const ListPendingTasksRequestSchema = z.object({
  project: z
    .string()
    .regex(/^[\p{L}\p{N}\p{M} ._-]+$/u)
    .optional(),
  tags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
});
export type ListPendingTasksRequest = z.infer<
  typeof ListPendingTasksRequestSchema
>;

export const ListTasksRequestSchema = z.object({
  status: z
    .enum(["pending", "completed", "deleted", "waiting", "recurring"])
    .optional(),
  project: z
    .string()
    .regex(/^[\p{L}\p{N}\p{M} ._-]+$/u)
    .optional(),
  tags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
  descriptionContains: z.string().optional(), // For description.contains filter
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  scheduledBefore: z.string().optional(),
  scheduledAfter: z.string().optional(),
  modifiedBefore: z.string().optional(),
  modifiedAfter: z.string().optional(),
  limit: z.number().int().positive().optional(),
  // Consider adding more filter options here as the tool evolves
});
export type ListTasksRequest = z.infer<typeof ListTasksRequestSchema>;

export const MarkTaskDoneRequestSchema = z.object({
  uuid: z.guid(),
});
export type MarkTaskDoneRequest = z.infer<typeof MarkTaskDoneRequestSchema>;

export const AddTaskRequestSchema = z.object({
  ...PlanningFields,
  description: z.string(),
  due: z.string().optional(),
  priority: z.string().regex(/^[\p{L}\p{N}_-]+$/u).optional(),
  project: z
    .string()
    .regex(/^[\p{L}\p{N}\p{M} ._-]+$/u)
    .optional(),
  tags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
  // GTD fields
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  until: z.string().optional(),
  context: z.string().optional(),
  energy: z.string().optional(),
  depends: z.array(z.guid()).max(INPUT_ARRAY_LIMITS.dependencies).optional(),
  parent: z.guid().optional(),
  annotations: z.array(z.string()).max(INPUT_ARRAY_LIMITS.annotations).optional(), // Array of annotation strings
  // Recurring/Habit fields
  recur: z.string().optional(), // Recurrence pattern (daily, weekly, monthly, etc.)
});
export type AddTaskRequest = z.infer<typeof AddTaskRequestSchema>;

// Schemas for new tools to be implemented will go here, e.g.:
export const GetTaskDetailsRequestSchema = z.object({
  uuid: z.guid(),
});
export type GetTaskDetailsRequest = z.infer<typeof GetTaskDetailsRequestSchema>;

export const ModifyTaskRequestSchema = z.object({
  ...PlanningFields,
  uuid: z.guid(),
  description: z.string().optional(),
  status: z
    .enum(["pending", "completed", "deleted", "waiting", "recurring"])
    .optional(),
  due: z.string().optional(),
  priority: z.string().regex(/^[\p{L}\p{N}_-]*$/u).optional(),
  project: z
    .string()
    .regex(/^[\p{L}\p{N}\p{M} ._-]*$/u) // Allow empty string for removal
    .optional(),
  addTags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
  removeTags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
  // GTD fields
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  until: z.string().optional(),
  context: z.string().optional(),
  energy: z.string().optional(),
  addDepends: z.array(z.guid()).max(INPUT_ARRAY_LIMITS.dependencies).optional(),
  removeDepends: z.array(z.guid()).max(INPUT_ARRAY_LIMITS.dependencies).optional(),
  parent: z.union([z.guid(), z.literal("")]).optional(),
  // Recurring/Habit fields
  recur: z.string().optional(), // Recurrence pattern (daily, weekly, monthly, etc.)
});
export type ModifyTaskRequest = z.infer<typeof ModifyTaskRequestSchema>;

export const StartTaskRequestSchema = z.object({
  uuid: z.guid(),
});
export type StartTaskRequest = z.infer<typeof StartTaskRequestSchema>;

export const StopTaskRequestSchema = z.object({
  uuid: z.guid(),
});
export type StopTaskRequest = z.infer<typeof StopTaskRequestSchema>;

export const DeleteTaskRequestSchema = z.object({
  uuid: z.guid(),
  skipConfirmation: z.boolean().optional(),
});
export type DeleteTaskRequest = z.infer<typeof DeleteTaskRequestSchema>;

export const AddAnnotationRequestSchema = z.object({
  uuid: z.guid(),
  annotation: z.string(),
});
export type AddAnnotationRequest = z.infer<typeof AddAnnotationRequestSchema>;

export const RemoveAnnotationRequestSchema = z.object({
  uuid: z.guid(),
  annotation: z.string(), // Exact text of the annotation to remove
});
export type RemoveAnnotationRequest = z.infer<
  typeof RemoveAnnotationRequestSchema
>;

// Response Schemas specific to tools
export const AddAnnotationResponseSchema = z.object({
  task: TaskWarriorTaskSchema,
});
export type AddAnnotationResponse = z.infer<typeof AddAnnotationResponseSchema>;

export const DeleteTaskResponseSchema = z.object({
  message: z.string(),
  deletedUuid: z.guid(),
});
export type DeleteTaskResponse = z.infer<typeof DeleteTaskResponseSchema>;

// General MCP Tool related types (might be useful if not already in SDK)
// export const MCPToolInputSchema = ToolSchema.shape.inputSchema; // Re-export or define if needed
// export type MCPToolInput = z.infer<typeof MCPToolInputSchema>;

// Phase 1: New GTD-oriented tool schemas

// Capture tools
export const QuickCaptureRequestSchema = z.object({
  description: z.string(),
});
export type QuickCaptureRequest = z.infer<typeof QuickCaptureRequestSchema>;

// Query tools
export const GetNextActionsRequestSchema = z.object({
  ...PagingFields,
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  max_minutes: z.number().int().nonnegative().optional(),
  include_unestimated: z.boolean().optional(),
  context: z.string().optional(), // Filter by @context
  energy_level: z.enum(["high", "medium", "low"]).optional(),
  time_available: z.enum(["5min", "15min", "30min", "1hour", "2hours+"]).optional(),
  include_blocked: z.boolean().optional().default(false),
});
export type GetNextActionsRequest = z.infer<typeof GetNextActionsRequestSchema>;

export const GetWaitingForRequestSchema = z.object({
  waiting_for: z.string().optional(),
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  follow_up_due: z.boolean().optional(),
  group_by: z.enum(["blocker", "date", "project"]).optional().default("blocker"),
});
export type GetWaitingForRequest = z.infer<typeof GetWaitingForRequestSchema>;

export const GetBlockedTasksRequestSchema = z.object({
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  include_waiting: z.boolean().optional().default(false),
});
export type GetBlockedTasksRequest = z.infer<typeof GetBlockedTasksRequestSchema>;

export const GetTaskTreeRequestSchema = z.object({
  max_nodes: z.number().int().min(1).max(500).optional(),
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  uuid: z.guid().optional(), // Root task UUID
  depth: z.number().int().min(0).max(100).optional(), // Max depth to traverse
});
export type GetTaskTreeRequest = z.infer<typeof GetTaskTreeRequestSchema>;

export const GetProjectStatusRequestSchema = z.object({
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u),
});
export type GetProjectStatusRequest = z.infer<typeof GetProjectStatusRequestSchema>;

// Organize tools
export const AddDependencyRequestSchema = z.object({
  task_uuid: z.guid(), // Task that depends on another
  depends_on_uuid: z.guid(), // Task that must be completed first
});
export type AddDependencyRequest = z.infer<typeof AddDependencyRequestSchema>;

export const RemoveDependencyRequestSchema = z.object({
  task_uuid: z.guid(),
  depends_on_uuid: z.guid(),
});
export type RemoveDependencyRequest = z.infer<typeof RemoveDependencyRequestSchema>;

export const SetContextRequestSchema = z.object({
  uuid: z.guid(),
  context: z.string(), // @home, @work, @phone, etc.
});
export type SetContextRequest = z.infer<typeof SetContextRequestSchema>;

export const CreateProjectTreeRequestSchema = z.object({
  project_name: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u),
  project_description: z.string(),
  tasks: z.array(z.object({
    ...PlanningFields,
    due: z.string().optional(),
    scheduled: z.string().optional(),
    energy: z.string().optional(),
    description: z.string(),
    depends_on_indices: z.array(z.number().int()).max(INPUT_ARRAY_LIMITS.projectDependencies).optional(), // Indices in tasks array
    priority: z.string().regex(/^[\p{L}\p{N}_-]+$/u).optional(),
    tags: z.array(z.string().regex(/^[\p{L}\p{N}\p{M}_-]+$/u)).max(INPUT_ARRAY_LIMITS.tags).optional(),
    context: z.string().optional(),
  })).max(INPUT_ARRAY_LIMITS.projectTasks),
});
export type CreateProjectTreeRequest = z.infer<typeof CreateProjectTreeRequestSchema>;

// Time management tools
export const ScheduleTaskRequestSchema = z.object({
  uuid: z.guid(),
  scheduled: z.string(), // Date when task should be started
});
export type ScheduleTaskRequest = z.infer<typeof ScheduleTaskRequestSchema>;

export const DeferTaskRequestSchema = z.object({
  uuid: z.guid(),
  wait: z.string(), // Date to wait until
  reason: z.string().optional(), // Why deferred (added as annotation)
});
export type DeferTaskRequest = z.infer<typeof DeferTaskRequestSchema>;

export const SetDeadlineRequestSchema = z.object({
  uuid: z.guid(),
  due: z.string(),
});
export type SetDeadlineRequest = z.infer<typeof SetDeadlineRequestSchema>;

// Clarify tools
export const ProcessInboxItemRequestSchema = z.object({
  ...PlanningFields,
  description: z.string().trim().min(1).optional(),
  uuid: z.guid(),
  action: z.enum(["next_action", "project", "waiting", "someday", "delete", "reference"]),
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  context: z.string().optional(),
  priority: z.string().regex(/^[\p{L}\p{N}_-]+$/u).optional(),
  due: z.string().optional(),
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  note: z.string().optional(), // Additional annotation
});
export type ProcessInboxItemRequest = z.infer<typeof ProcessInboxItemRequestSchema>;

export const ClarifyTaskRequestSchema = z.object({
  uuid: z.guid(),
  next_action: z.string(), // Clear, concrete next action
  context: z.string().optional(),
  energy: z.string().optional(),
});
export type ClarifyTaskRequest = z.infer<typeof ClarifyTaskRequestSchema>;

// Review tools
export const ProcessInboxRequestSchema = z.object({
  ...PagingFields,
});
export type ProcessInboxRequest = z.infer<typeof ProcessInboxRequestSchema>;

export const WeeklyReviewRequestSchema = z.object({
  // No parameters needed - comprehensive weekly review
});
export type WeeklyReviewRequest = z.infer<typeof WeeklyReviewRequestSchema>;

// Phase 3: Batch and advanced tools
export const BatchModifyTasksRequestSchema = z.object({
  uuids: z.array(z.guid()).max(INPUT_ARRAY_LIMITS.batchTasks),
  modifications: ModifyTaskRequestSchema.omit({ uuid: true }),
});
export type BatchModifyTasksRequest = z.infer<typeof BatchModifyTasksRequestSchema>;

export const GetSomedayMaybeRequestSchema = z.object({
  project: z.string().regex(/^[\p{L}\p{N}\p{M} ._-]+$/u).optional(),
  limit: z.number().int().positive().optional(),
});
export type GetSomedayMaybeRequest = z.infer<typeof GetSomedayMaybeRequestSchema>;

export const GetRecurringTasksRequestSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "all"]).optional().default("all"),
  include_completed: z.boolean().optional().default(false),
});
export type GetRecurringTasksRequest = z.infer<typeof GetRecurringTasksRequestSchema>;

// Generic error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.number().optional(),
  details: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Union of all possible successful (non-error, non-MCP wrapped) responses from tool handlers
export type ToolHandlerSuccessResponse =
  | TaskWarriorTask // For single task results
  | TaskWarriorTask[] // For list results or single task results returned as an array
  | DeleteTaskResponse
  | AddAnnotationResponse; // add_annotation returns the full AddAnnotationResponseSchema structure
// Add other specific success response types as needed, e.g., for modify, start, stop if they have unique structures.

// Ensure TaskWarriorTaskSchema is comprehensive for what handlers might return
// No changes needed to TaskWarriorTaskSchema itself for this step.

export const QueryTasksRequestSchema = ListTasksRequestSchema.extend({
  ...PagingFields,
  context: z.string().optional(),
  priority: z.string().optional(),
  waiting_for: z.string().optional(),
  parent: z.union([z.guid(), z.literal("")]).optional(),
  active: z.boolean().optional(),
  blocked: z.boolean().optional(),
  sort_by: z.enum(["urgency", "due", "entry", "modified", "description", "project", "priority"]).optional(),
  sort_order: z.enum(["asc", "desc"]).optional(),
});
export type QueryTasksRequest = z.infer<typeof QueryTasksRequestSchema>;
