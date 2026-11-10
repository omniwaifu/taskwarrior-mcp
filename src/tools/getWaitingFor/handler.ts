import { isWaiting, matchesProject, taskStatuses } from "../../utils/actionability.js";
import { parseTaskwarriorDate } from "../../utils/dates.js";
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
  // Taskwarrior's pending filter excludes deferred tasks, even when export says pending.
  const database = await executeTaskWarriorCommandJson([]);
  const statuses = taskStatuses(database);
  const allTasks = database.filter(task => task.status === "pending" || task.status === "waiting");

  const now = new Date();
  const waitingTasks = allTasks.filter(task => isWaiting(task, now.getTime())
    && (!args.project || matchesProject(task, args.project))
    && (!args.waiting_for || task.waiting_for === args.waiting_for)
    && (!args.follow_up_due || (!!task.follow_up && parseTaskwarriorDate(task.follow_up) <= now)));

  // Group tasks
  const groups = Object.create(null) as { [key: string]: unknown[] };
  const groupBy = args.group_by || "blocker";

  for (const task of waitingTasks) {
    let groupKey: string;

    if (groupBy === "project") {
      groupKey = task.project || "(no project)";
    } else if (groupBy === "date") {
      groupKey = task.follow_up || task.wait || "(no follow-up date)";
    } else {
      // Group by blocker (from annotations or description)
      groupKey = task.waiting_for || "(deferred)";
      if (!task.waiting_for && task.annotations && task.annotations.length > 0) {
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
    statuses,
    includeRecommendations: true,
  });

  if (waitingTasks.length === 0) {
    insights.summary = "No waiting tasks found";
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
}
