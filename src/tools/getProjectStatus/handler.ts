import { isActionable, taskStatuses, unmetDependencies, matchesProject } from "../../utils/actionability.js";
import { parseTaskwarriorDate } from "../../utils/dates.js";
import type { GetProjectStatusRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleGetProjectStatus(
  args: GetProjectStatusRequest,
): Promise<EnrichedResponse> {
  const database = await executeTaskWarriorCommandJson([]);
  const statuses = taskStatuses(database);
  const allProjectTasks = database.filter(task => matchesProject(task, args.project));

  const pendingTasks = allProjectTasks.filter(t => t.status === 'pending');
  const completedTasks = allProjectTasks.filter(t => t.status === 'completed');

  const now = new Date();
  const nextActions = pendingTasks.filter(task => isActionable(task, now.getTime(), false, statuses));

  const blockedTasks = pendingTasks.filter(task => {
    return unmetDependencies(task, statuses).length > 0;
  });

  let lastActivity: Date | null = null;
  for (const task of allProjectTasks) {
    if (task.modified) {
      const modDate = parseTaskwarriorDate(task.modified);
      if (!lastActivity || modDate > lastActivity) {
        lastActivity = modDate;
      }
    }
    if (task.end) {
      const endDate = parseTaskwarriorDate(task.end);
      if (!lastActivity || endDate > lastActivity) {
        lastActivity = endDate;
      }
    }
  }

  const daysSinceActivity = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const relevantTasks = allProjectTasks.filter(task => task.status !== "deleted" && task.status !== "recurring" && !task.tags?.includes("project_root"));
  const completionPct = relevantTasks.length > 0
    ? Math.round((relevantTasks.filter(task => task.status === "completed").length / relevantTasks.length) * 100)
    : 0;

  const summary = `Project ${args.project}: ${completionPct}% complete, ${nextActions.length} next actions, ${blockedTasks.length} blocked`;

  const recommendations: string[] = [];
  if (nextActions.length === 0 && pendingTasks.length > 0) {
    recommendations.push("⚠️ No next actions! All tasks are blocked or waiting.");
  }
  if (daysSinceActivity > 7) {
    recommendations.push(`⚠️ Stale project: ${daysSinceActivity} days since last activity`);
  }
  if (nextActions.length > 0) {
    recommendations.push(`Start with: "${nextActions[0].description}"`);
  }

  const warnings: string[] = [];
  if (completionPct === 0 && allProjectTasks.length > 5) {
    warnings.push("Large project with no completed tasks yet");
  }

  const response: EnrichedResponse = {
    tasks: nextActions,
    metadata: {
      total: allProjectTasks.length,
      actionable: nextActions.length,
      blocked: blockedTasks.length,
      completed: completedTasks.length,
    },
    insights: {
      summary,
      recommendations,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };

  return response;
}
