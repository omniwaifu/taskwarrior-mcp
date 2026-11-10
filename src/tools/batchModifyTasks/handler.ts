import type { BatchModifyTasksRequest } from "../../types/task.js";
import { modifyTaskHandler } from "../modifyTask/handler.js";
import type { EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleBatchModifyTasks(args: BatchModifyTasksRequest): Promise<EnrichedResponse & { status: "success" | "error" }> {
  const results = [];
  for (const uuid of args.uuids) {
    const result = await modifyTaskHandler({ uuid, ...args.modifications });
    results.push({ uuid, success: result.status === "success", error: result.error?.message });
  }
  const succeeded = results.filter(result => result.success).length;
  return {
    status: succeeded === results.length ? "success" : "error",
    tasks: results,
    metadata: { total: results.length, actionable: succeeded },
    insights: {
      summary: `Batch modified ${succeeded}/${results.length} tasks`,
      warnings: results.filter(result => !result.success).map(result => `${result.uuid}: ${result.error}`),
    },
  };
}
