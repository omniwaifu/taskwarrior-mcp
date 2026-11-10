import type { StopTaskRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult, OperationError } from "../../utils/operationResult.js";

export const stopTaskHandler = (args: StopTaskRequest, toolName = "stopTask") => operationResult(toolName, async () => {
  const existing = await getTaskByUuid(args.uuid);
  if (!existing.start) return existing;
  await executeTaskWarriorCommandRaw([args.uuid, "stop"]);
  const updated = await getTaskByUuid(args.uuid);
  if (updated.start) throw new OperationError("TASK_NOT_STOPPED", "Task still has a start time after stop.");
  return updated;
});
