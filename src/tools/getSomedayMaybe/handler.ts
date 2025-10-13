import type { GetSomedayMaybeRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleGetSomedayMaybe(
  args: GetSomedayMaybeRequest,
): Promise<EnrichedResponse> {
  console.log(`getSomedayMaybe called with:`, args);

  try {
    const commandArgs: string[] = ["status:pending", "+someday"];

    if (args.project) {
      commandArgs.push(`project:${args.project}`);
    }

    const tasks = await executeTaskWarriorCommandJson(commandArgs);

    // Sort by modified date (most recent first) or project
    const sortedTasks = tasks.sort((a, b) => {
      if (a.project && b.project && a.project !== b.project) {
        return a.project.localeCompare(b.project);
      }
      if (a.modified && b.modified) {
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      }
      return 0;
    });

    const limitedTasks = args.limit ? sortedTasks.slice(0, args.limit) : sortedTasks;

    // Group by project
    const byProject: Record<string, unknown[]> = {};
    limitedTasks.forEach(task => {
      const proj = (task as { project?: string }).project || "no_project";
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(task);
    });

    // Find stale someday items (not modified in 90+ days)
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const staleTasks = limitedTasks.filter(task => {
      const modified = (task as { modified?: string }).modified;
      if (!modified) return true;
      return new Date(modified).getTime() < ninetyDaysAgo;
    });

    const projectCount = Object.keys(byProject).length;
    const summary = `${limitedTasks.length} someday/maybe items across ${projectCount} projects`;

    const recommendations: string[] = [];
    if (staleTasks.length > 0) {
      recommendations.push(`⚠️ ${staleTasks.length} items not reviewed in 90+ days`);
    }
    if (limitedTasks.length === 0) {
      recommendations.push("No someday/maybe items. Consider adding aspirational tasks.");
    } else {
      recommendations.push("Review these during weekly review");
      recommendations.push("Consider promoting actionable items to active projects");
    }

    const response: EnrichedResponse = {
      tasks: limitedTasks,
      metadata: {
        total: tasks.length,
        actionable: 0, // someday items are not actionable by definition
      },
      insights: {
        summary,
        recommendations,
        warnings: staleTasks.length > 5 ? [`${staleTasks.length} stale items need review`] : undefined,
      },
      groups: byProject,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in getSomedayMaybe handler:`, error);
    throw error;
  }
}
