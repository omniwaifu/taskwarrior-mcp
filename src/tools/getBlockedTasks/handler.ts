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
  console.log(`getBlockedTasks called with:`, args);

  try {
    // Build filter
    const filterArgs: string[] = ["status:pending"];
    if (args.project) {
      filterArgs.push(`project:${args.project}`);
    }

    const allTasks = await executeTaskWarriorCommandJson(filterArgs);

    // Filter for blocked tasks (have dependencies)
    let blockedTasks = allTasks.filter(task => {
      if (!task.depends || task.depends.length === 0) return false;
      return true;
    });

    // Optionally include waiting tasks
    if (args.include_waiting) {
      const now = new Date();
      const waitingTasks = allTasks.filter(task => {
        if (task.status === 'waiting') return true;
        if (task.wait) {
          const waitDate = new Date(task.wait);
          return waitDate > now;
        }
        return false;
      });
      blockedTasks = [...blockedTasks, ...waitingTasks];
    }

    // Build relationships showing what's blocking what
    const relationships: { [uuid: string]: { blocked_by?: string[] } } = {};
    for (const task of blockedTasks) {
      if (task.depends && task.depends.length > 0) {
        relationships[task.uuid] = {
          blocked_by: task.depends,
        };
      }
    }

    // Generate insights
    const insights = generateInsights(blockedTasks, {
      includeRecommendations: true,
    });

    if (blockedTasks.length === 0) {
      insights.summary = "No blocked tasks - everything is actionable";
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
        actionable: allTasks.length - blockedTasks.length,
      },
      insights,
      relationships: Object.keys(relationships).length > 0 ? relationships : undefined,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in getBlockedTasks handler:`, error);
    throw error;
  }
}
