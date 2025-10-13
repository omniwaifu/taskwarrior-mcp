import type { GetWaitingForRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { generateInsights, type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

/**
 * Get waiting for - What am I waiting on?
 * Returns tasks with status:waiting OR wait date set, grouped by blocker/date/project
 */
export async function handleGetWaitingFor(
  args: GetWaitingForRequest,
): Promise<EnrichedResponse> {
  console.log(`getWaitingFor called with:`, args);

  try {
    // Get tasks with wait date or waiting status
    const allTasks = await executeTaskWarriorCommandJson(["status:pending"]);

    const now = new Date();
    const waitingTasks = allTasks.filter(task => {
      // Include if status is waiting
      if (task.status === 'waiting') return true;

      // Include if wait date is set and in the future
      if (task.wait) {
        const waitDate = new Date(task.wait);
        return waitDate > now;
      }

      return false;
    });

    // Group tasks
    const groups: { [key: string]: unknown[] } = {};
    const groupBy = args.group_by || "blocker";

    for (const task of waitingTasks) {
      let groupKey: string;

      if (groupBy === "project") {
        groupKey = task.project || "(no project)";
      } else if (groupBy === "date") {
        groupKey = task.wait || "(no wait date)";
      } else {
        // Group by blocker (from annotations or description)
        groupKey = "(waiting)";
        if (task.annotations && task.annotations.length > 0) {
          const lastAnnotation = task.annotations[task.annotations.length - 1];
          if (lastAnnotation.description) {
            groupKey = lastAnnotation.description.substring(0, 50);
          }
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    }

    // Generate insights
    const insights = generateInsights(waitingTasks, {
      includeRecommendations: true,
    });

    if (waitingTasks.length === 0) {
      insights.summary = "Nothing waiting - all tasks are actionable";
    } else {
      insights.summary = `${waitingTasks.length} tasks waiting`;
      insights.recommendations = insights.recommendations || [];
      insights.recommendations.unshift(
        `Review waiting items and follow up if needed`
      );
    }

    const response: EnrichedResponse = {
      tasks: waitingTasks,
      metadata: {
        total: waitingTasks.length,
        waiting: waitingTasks.length,
      },
      insights,
      groups,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in getWaitingFor handler:`, error);
    throw error;
  }
}
