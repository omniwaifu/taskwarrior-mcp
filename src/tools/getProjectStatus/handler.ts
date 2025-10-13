import type { GetProjectStatusRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleGetProjectStatus(
  args: GetProjectStatusRequest,
): Promise<EnrichedResponse> {
  console.log(`getProjectStatus called with:`, args);

  try {
    const allProjectTasks = await executeTaskWarriorCommandJson([
      `project:${args.project}`,
    ]);

    const pendingTasks = allProjectTasks.filter(t => t.status === 'pending');
    const completedTasks = allProjectTasks.filter(t => t.status === 'completed');

    const now = new Date();
    const nextActions = pendingTasks.filter(task => {
      if (task.depends && task.depends.length > 0) return false;
      if (task.wait) {
        const waitDate = new Date(task.wait);
        if (waitDate > now) return false;
      }
      return true;
    });

    const blockedTasks = pendingTasks.filter(task => {
      return task.depends && task.depends.length > 0;
    });

    let lastActivity: Date | null = null;
    for (const task of allProjectTasks) {
      if (task.modified) {
        const modDate = new Date(task.modified);
        if (!lastActivity || modDate > lastActivity) {
          lastActivity = modDate;
        }
      }
      if (task.end) {
        const endDate = new Date(task.end);
        if (!lastActivity || endDate > lastActivity) {
          lastActivity = endDate;
        }
      }
    }

    const daysSinceActivity = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const completionPct = allProjectTasks.length > 0
      ? Math.round((completedTasks.length / allProjectTasks.length) * 100)
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
  } catch (error: unknown) {
    console.error(`Error in getProjectStatus handler:`, error);
    throw error;
  }
}
