import type { StartTaskRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult, OperationError } from "../../utils/operationResult.js";

export const startTaskHandler = (args: StartTaskRequest, toolName = "startTask") => operationResult(toolName, async () => {
  const existing = await getTaskByUuid(args.uuid);
  if (existing.start) return existing;
  await executeTaskWarriorCommandRaw([args.uuid, "start"]);
  const updated = await getTaskByUuid(args.uuid);
  if (!updated.start) throw new OperationError("START_TIME_MISSING", "Task did not acquire a start time.");
  return updated;
});
