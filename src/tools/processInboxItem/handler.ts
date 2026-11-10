import type { ProcessInboxItemRequest, ModifyTaskRequest } from "../../types/task.js";
import { getTaskByUuid } from "../../utils/taskwarrior.js";
import { modifyTask } from "../modifyTask/handler.js";
import { deleteTaskHandler } from "../deleteTask/handler.js";
import { addAnnotationHandler } from "../addAnnotation/handler.js";

export async function handleProcessInboxItem(args: ProcessInboxItemRequest) {
  const existing = await getTaskByUuid(args.uuid);
  if (args.action === "delete") return deleteTaskHandler({ uuid: args.uuid, skipConfirmation: true });
  if (existing.status !== "pending" && existing.status !== "waiting") throw new Error("Only pending or waiting tasks can be clarified.");
  if (args.action === "waiting" && !args.waiting_for?.trim()) throw new Error("waiting_for is required when delegating an inbox item.");
  if (args.action === "project" && !(args.project || existing.project)) throw new Error("A project name is required when turning an inbox item into a project.");
  const modifications: ModifyTaskRequest = {
    uuid: args.uuid,
    description: args.description,
    project: args.project ?? (args.action === "project" ? existing.project : undefined),
    context: args.context, priority: args.priority, due: args.due, scheduled: args.scheduled,
    estimated_minutes: args.estimated_minutes,
    wait: args.wait ?? "",
    waiting_for: args.action === "waiting" ? args.waiting_for!.trim() : "",
    follow_up: args.action === "waiting" ? args.follow_up ?? "" : "",
    removeTags: ["inbox", "someday", "reference", "project_root"],
    addTags: [],
  };
  const tag = args.action === "someday" ? "someday" : args.action === "reference" ? "reference" : args.action === "project" ? "project_root" : undefined;
  if (tag) {
    modifications.removeTags = modifications.removeTags!.filter(value => value !== tag);
    modifications.addTags = [tag];
  }
  const task = await modifyTask(modifications);
  if (args.note && !task.annotations?.some(note => note.description === args.note)) {
    const annotated = await addAnnotationHandler({ uuid: task.uuid, annotation: args.note });
    if (annotated.status === "error") {
      return { status: "error" as const, action: args.action, task, completed_steps: ["classified"], error: { code: "ANNOTATION_FAILED", message: annotated.error!.message } };
    }
  }
  return { status: "success" as const, action: args.action, task: args.note ? await getTaskByUuid(task.uuid) : task };
}
