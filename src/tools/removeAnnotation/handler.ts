import type { RemoveAnnotationRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult, OperationError } from "../../utils/operationResult.js";

export const removeAnnotationHandler = (args: RemoveAnnotationRequest, toolName = "removeAnnotation") => operationResult(toolName, async () => {
  const existing = await getTaskByUuid(args.uuid);
  if (!existing.annotations?.some(annotation => annotation.description === args.annotation)) {
    throw new OperationError("ANNOTATION_NOT_FOUND", "No annotation with that exact text exists on the task.");
  }
  await executeTaskWarriorCommandRaw([args.uuid, "denotate", "--", args.annotation]);
  return getTaskByUuid(args.uuid);
});
