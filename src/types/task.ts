import { z } from "zod";

// Base task schema that covers common TaskWarrior fields
export const TaskWarriorTaskSchema = z.object({
  id: z.number().int(),
  uuid: z.string().uuid(),
  description: z.string(),
  status: z.enum(["pending", "completed", "deleted", "waiting", "recurring"]),
  entry: z.string(), // Accept any string format for dates from TaskWarrior
  modified: z.string().optional(),
  start: z.string().optional(),
  due: z.string().optional(),
  end: z.string().optional(), // Completion date
  priority: z.enum(["H", "M", "L"]).optional(),
  project: z
    .string()
    .regex(/^[a-zA-Z0-9 ._-]+$/)
    .optional(),
  tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
  annotations: z
    .array(
      z.object({
        entry: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  // GTD-specific fields
  depends: z.array(z.string().uuid()).optional(), // Task dependencies (UUIDs)
  wait: z.string().optional(), // Wait until date (defer)
  scheduled: z.string().optional(), // Scheduled start date
  until: z.string().optional(), // Task expiration date
  parent: z.string().uuid().optional(), // Parent task UUID
  context: z.string().optional(), // GTD context (@home, @work, etc.)
  energy: z.string().optional(), // Energy level required
  urgency: z.number().optional(), // Calculated urgency score
  complexity: z.union([z.number(), z.string()]).optional(), // Time estimate / complexity
  recur: z.string().optional(), // Recurrence pattern
  mask: z.string().optional(), // Recurrence mask
  imask: z.number().optional(), // Recurrence instance mask
}).passthrough(); // Allow additional fields from TaskWarrior without validation errors

export type TaskWarriorTask = z.infer<typeof TaskWarriorTaskSchema>;

// Request schemas for tool inputs

export const ListPendingTasksRequestSchema = z.object({
  project: z
    .string()
    .regex(/^[a-zA-Z0-9 ._-]+$/)
    .optional(),
  tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
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
    .regex(/^[a-zA-Z0-9 ._-]+$/)
    .optional(),
  tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
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
  uuid: z.string().uuid(),
});
export type MarkTaskDoneRequest = z.infer<typeof MarkTaskDoneRequestSchema>;

export const AddTaskRequestSchema = z.object({
  description: z.string(),
  due: z.string().optional(),
  priority: z.enum(["H", "M", "L"]).optional(),
  project: z
    .string()
    .regex(/^[a-zA-Z0-9 ._-]+$/)
    .optional(),
  tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
  // GTD fields
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  until: z.string().optional(),
  context: z.string().optional(),
  energy: z.string().optional(),
  depends: z.array(z.string().uuid()).optional(),
  parent: z.string().uuid().optional(),
  annotations: z.array(z.string()).optional(), // Array of annotation strings
  // Recurring/Habit fields
  recur: z.string().optional(), // Recurrence pattern (daily, weekly, monthly, etc.)
});
export type AddTaskRequest = z.infer<typeof AddTaskRequestSchema>;

// Schemas for new tools to be implemented will go here, e.g.:
export const GetTaskDetailsRequestSchema = z.object({
  uuid: z.string().uuid(),
});
export type GetTaskDetailsRequest = z.infer<typeof GetTaskDetailsRequestSchema>;

export const ModifyTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
  description: z.string().optional(),
  status: z
    .enum(["pending", "completed", "deleted", "waiting", "recurring"])
    .optional(),
  due: z.string().optional(),
  priority: z.enum(["H", "M", "L"]).optional(),
  project: z
    .string()
    .regex(/^[a-zA-Z0-9 ._-]*$/) // Allow empty string for removal
    .optional(),
  addTags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
  removeTags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
  // GTD fields
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  until: z.string().optional(),
  context: z.string().optional(),
  energy: z.string().optional(),
  addDepends: z.array(z.string().uuid()).optional(),
  removeDepends: z.array(z.string().uuid()).optional(),
  parent: z.string().uuid().optional(),
  // Recurring/Habit fields
  recur: z.string().optional(), // Recurrence pattern (daily, weekly, monthly, etc.)
});
export type ModifyTaskRequest = z.infer<typeof ModifyTaskRequestSchema>;

export const StartTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
});
export type StartTaskRequest = z.infer<typeof StartTaskRequestSchema>;

export const StopTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
});
export type StopTaskRequest = z.infer<typeof StopTaskRequestSchema>;

export const DeleteTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
  skipConfirmation: z.boolean().optional(),
});
export type DeleteTaskRequest = z.infer<typeof DeleteTaskRequestSchema>;

export const AddAnnotationRequestSchema = z.object({
  uuid: z.string().uuid(),
  annotation: z.string(),
});
export type AddAnnotationRequest = z.infer<typeof AddAnnotationRequestSchema>;

export const RemoveAnnotationRequestSchema = z.object({
  uuid: z.string().uuid(),
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
  deletedUuid: z.string().uuid(),
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
  context: z.string().optional(), // Filter by @context
  energy_level: z.enum(["high", "medium", "low"]).optional(),
  time_available: z.enum(["5min", "15min", "30min", "1hour", "2hours+"]).optional(),
  include_blocked: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
});
export type GetNextActionsRequest = z.infer<typeof GetNextActionsRequestSchema>;

export const GetWaitingForRequestSchema = z.object({
  group_by: z.enum(["blocker", "date", "project"]).optional().default("blocker"),
});
export type GetWaitingForRequest = z.infer<typeof GetWaitingForRequestSchema>;

export const GetBlockedTasksRequestSchema = z.object({
  project: z.string().regex(/^[a-zA-Z0-9 ._-]+$/).optional(),
  include_waiting: z.boolean().optional().default(false),
});
export type GetBlockedTasksRequest = z.infer<typeof GetBlockedTasksRequestSchema>;

export const GetTaskTreeRequestSchema = z.object({
  project: z.string().regex(/^[a-zA-Z0-9 ._-]+$/).optional(),
  uuid: z.string().uuid().optional(), // Root task UUID
  depth: z.number().int().positive().optional(), // Max depth to traverse
});
export type GetTaskTreeRequest = z.infer<typeof GetTaskTreeRequestSchema>;

export const GetProjectStatusRequestSchema = z.object({
  project: z.string().regex(/^[a-zA-Z0-9 ._-]+$/),
});
export type GetProjectStatusRequest = z.infer<typeof GetProjectStatusRequestSchema>;

// Organize tools
export const AddDependencyRequestSchema = z.object({
  task_uuid: z.string().uuid(), // Task that depends on another
  depends_on_uuid: z.string().uuid(), // Task that must be completed first
});
export type AddDependencyRequest = z.infer<typeof AddDependencyRequestSchema>;

export const RemoveDependencyRequestSchema = z.object({
  task_uuid: z.string().uuid(),
  depends_on_uuid: z.string().uuid(),
});
export type RemoveDependencyRequest = z.infer<typeof RemoveDependencyRequestSchema>;

export const SetContextRequestSchema = z.object({
  uuid: z.string().uuid(),
  context: z.string(), // @home, @work, @phone, etc.
});
export type SetContextRequest = z.infer<typeof SetContextRequestSchema>;

export const CreateProjectTreeRequestSchema = z.object({
  project_name: z.string().regex(/^[a-zA-Z0-9 ._-]+$/),
  project_description: z.string(),
  tasks: z.array(z.object({
    description: z.string(),
    depends_on_indices: z.array(z.number().int()).optional(), // Indices in tasks array
    priority: z.enum(["H", "M", "L"]).optional(),
    tags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
    context: z.string().optional(),
  })),
});
export type CreateProjectTreeRequest = z.infer<typeof CreateProjectTreeRequestSchema>;

// Time management tools
export const ScheduleTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
  scheduled: z.string(), // Date when task should be started
});
export type ScheduleTaskRequest = z.infer<typeof ScheduleTaskRequestSchema>;

export const DeferTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
  wait: z.string(), // Date to wait until
  reason: z.string().optional(), // Why deferred (added as annotation)
});
export type DeferTaskRequest = z.infer<typeof DeferTaskRequestSchema>;

export const SetDeadlineRequestSchema = z.object({
  uuid: z.string().uuid(),
  due: z.string(),
});
export type SetDeadlineRequest = z.infer<typeof SetDeadlineRequestSchema>;

// Clarify tools
export const ProcessInboxItemRequestSchema = z.object({
  uuid: z.string().uuid(),
  action: z.enum(["next_action", "project", "waiting", "someday", "delete", "reference"]),
  project: z.string().regex(/^[a-zA-Z0-9 ._-]+$/).optional(),
  context: z.string().optional(),
  priority: z.enum(["H", "M", "L"]).optional(),
  due: z.string().optional(),
  scheduled: z.string().optional(),
  wait: z.string().optional(),
  note: z.string().optional(), // Additional annotation
});
export type ProcessInboxItemRequest = z.infer<typeof ProcessInboxItemRequestSchema>;

export const ClarifyTaskRequestSchema = z.object({
  uuid: z.string().uuid(),
  next_action: z.string(), // Clear, concrete next action
  context: z.string().optional(),
  energy: z.string().optional(),
});
export type ClarifyTaskRequest = z.infer<typeof ClarifyTaskRequestSchema>;

// Review tools
export const ProcessInboxRequestSchema = z.object({
  limit: z.number().int().positive().optional(),
});
export type ProcessInboxRequest = z.infer<typeof ProcessInboxRequestSchema>;

export const WeeklyReviewRequestSchema = z.object({
  // No parameters needed - comprehensive weekly review
});
export type WeeklyReviewRequest = z.infer<typeof WeeklyReviewRequestSchema>;

// Phase 3: Batch and advanced tools
export const BatchModifyTasksRequestSchema = z.object({
  uuids: z.array(z.string().uuid()),
  modifications: z.object({
    description: z.string().optional(),
    status: z.enum(["pending", "completed", "deleted", "waiting", "recurring"]).optional(),
    due: z.string().optional(),
    priority: z.enum(["H", "M", "L"]).optional(),
    project: z.string().regex(/^[a-zA-Z0-9 ._-]*$/).optional(),
    addTags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
    removeTags: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).optional(),
    scheduled: z.string().optional(),
    wait: z.string().optional(),
    until: z.string().optional(),
    context: z.string().optional(),
    energy: z.string().optional(),
  }),
});
export type BatchModifyTasksRequest = z.infer<typeof BatchModifyTasksRequestSchema>;

export const GetSomedayMaybeRequestSchema = z.object({
  project: z.string().regex(/^[a-zA-Z0-9 ._-]+$/).optional(),
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
