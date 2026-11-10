import type { MarkTaskDoneRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult, OperationError } from "../../utils/operationResult.js";

export const markTaskDoneHandler = (args: MarkTaskDoneRequest, toolName = "markTaskDone") => operationResult(toolName, async () => {
  const existing = await getTaskByUuid(args.uuid);
  if (existing.status === "completed") return existing;
  await executeTaskWarriorCommandRaw([args.uuid, "done"]);
  const updated = await getTaskByUuid(args.uuid);
  if (updated.status !== "completed") throw new OperationError("STATUS_NOT_COMPLETED", `Task status is '${updated.status}' after completion attempt.`);
  return updated;
});
