import type { QuickCaptureRequest } from "../../types/task.js";
import { handleAddTask } from "../addTask/handler.js";

export function handleQuickCapture(args: QuickCaptureRequest) {
  if (!args.description.trim()) throw new Error("A captured item needs a description.");
  return handleAddTask({ description: args.description, tags: ["inbox"] });
}
