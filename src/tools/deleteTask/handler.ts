import type { DeleteTaskRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult, OperationError } from "../../utils/operationResult.js";

export const deleteTaskHandler = (args: DeleteTaskRequest, toolName = "deleteTask") => operationResult(toolName, async () => {
  const { uuid, skipConfirmation } = args;
  const existing = await getTaskByUuid(uuid);
  if (existing.status !== "deleted") {
    const command = [...(skipConfirmation ? ["rc.confirmation=off"] : []), uuid, "delete"];
    await executeTaskWarriorCommandRaw(command);
    // Deleted tasks remain exportable; disappearance is not the success criterion.
    const deleted = await getTaskByUuid(uuid);
    if (deleted.status !== "deleted") {
      throw new OperationError("TASK_NOT_DELETED", `Task '${uuid}' still has status '${deleted.status}'. If confirmation is required, authorize deletion with skipConfirmation:true.`);
    }
  }
  return { deletedUuid: uuid, message: "Task deleted successfully." };
});
