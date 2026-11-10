import type { AddAnnotationRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw, getTaskByUuid } from "../../utils/taskwarrior.js";
import { operationResult } from "../../utils/operationResult.js";

export const addAnnotationHandler = (args: AddAnnotationRequest, toolName = "addAnnotation") => operationResult(toolName, async () => {
  await getTaskByUuid(args.uuid);
  await executeTaskWarriorCommandRaw([args.uuid, "annotate", "--", args.annotation]);
  return { task: await getTaskByUuid(args.uuid) };
});
