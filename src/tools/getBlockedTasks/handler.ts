import { taskStatuses, unmetDependencies, matchesProject, isWaiting, isActionable } from "../../utils/actionability.js";
import type { GetBlockedTasksRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { generateInsights, type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

/**
 * Get blocked tasks - What's stuck and why?
 * Returns tasks with unmet dependencies + dependency chain analysis
 */
export async function handleGetBlockedTasks(
  args: GetBlockedTasksRequest,
): Promise<EnrichedResponse> {
  const database = await executeTaskWarriorCommandJson([]);
  const statuses = taskStatuses(database);
  const allTasks = database.filter(task => (task.status === "pending" || (args.include_waiting && task.status === "waiting"))
    && (args.include_waiting || !isWaiting(task)) && (!args.project || matchesProject(task, args.project)));
  const blockedTasks = allTasks.filter(task => unmetDependencies(task, statuses).length || (args.include_waiting && isWaiting(task)));

  // Build relationships showing what's blocking what
  const relationships: { [uuid: string]: { blocked_by?: string[] } } = {};
  for (const task of blockedTasks) {
    if (unmetDependencies(task, statuses).length > 0) {
      relationships[task.uuid] = {
        blocked_by: unmetDependencies(task, statuses),
      };
    }
  }

  // Generate insights
  const insights = generateInsights(blockedTasks, {
    statuses,
    includeRecommendations: true,
  });

  if (blockedTasks.length === 0) {
    insights.summary = "No blocked tasks found";
  } else {
    insights.summary = `${blockedTasks.length} tasks are blocked`;
    insights.recommendations = insights.recommendations || [];
    insights.recommendations.unshift(
      `Unblock tasks by completing dependencies`
    );
  }

  const response: EnrichedResponse = {
    tasks: blockedTasks,
    metadata: {
      total: allTasks.length,
      blocked: blockedTasks.length,
      actionable: allTasks.filter(task => isActionable(task, Date.now(), false, statuses)).length,
    },
    insights,
    relationships: Object.keys(relationships).length > 0 ? relationships : undefined,
  };

  return response;
}
