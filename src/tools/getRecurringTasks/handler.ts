import { habitStats, groupHabitInstances } from "../../utils/habits.js";
import type {
  GetRecurringTasksRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

type RecurringTaskWithStats = TaskWarriorTask & {
  habit_stats: ReturnType<typeof habitStats>;
};

function normalizeFrequency(recur: string): string {
  if (recur.includes("day") || recur === "daily") {
    return "daily";
  }
  if (recur.includes("week") || recur === "weekly") {
    return "weekly";
  }
  if (recur.includes("month") || recur === "monthly") {
    return "monthly";
  }
  if (recur.includes("year") || recur === "yearly") {
    return "yearly";
  }
  return "other";
}

export async function handleGetRecurringTasks(
  args: GetRecurringTasksRequest,
): Promise<EnrichedResponse> {
  const allTasks = await executeTaskWarriorCommandJson([]);
  const templates = allTasks.filter(task => !task.parent && task.recur &&
    (task.status === "recurring" || (args.include_completed && task.status === "completed")));
  const instances = groupHabitInstances(allTasks);

  // Filter by frequency if specified
  let filteredTemplates = templates;
  if (args.frequency && args.frequency !== "all") {
    filteredTemplates = templates.filter((task) => {
      const { recur } = task;
      if (!recur) return false;

      return normalizeFrequency(recur) === args.frequency;
    });
  }

  // Analyze each recurring task
  const enrichedTasks: RecurringTaskWithStats[] = filteredTemplates.map(task => ({
    ...task, habit_stats: habitStats(task, instances.get(task.uuid) ?? []),
  }));

  // Group by frequency
  const byFrequency = Object.create(null) as Record<string, RecurringTaskWithStats[]>;
  enrichedTasks.forEach((task) => {
    const freqKey = normalizeFrequency(task.recur || "unknown");

    if (!byFrequency[freqKey]) byFrequency[freqKey] = [];
    byFrequency[freqKey].push(task);
  });

  // Generate insights
  const totalHabits = enrichedTasks.length;
  const evaluatedHabits = enrichedTasks.filter(task => task.habit_stats.evaluated_instances > 0);
  const avgCompletionRate = evaluatedHabits.length > 0
    ? Math.round(
      evaluatedHabits.reduce(
        (sum, task) => sum + task.habit_stats.completion_rate,
        0,
      ) / evaluatedHabits.length,
    )
    : 0;

  const brokenStreaks = enrichedTasks.filter((task) => {
    const stats = task.habit_stats;
    return stats.current_streak === 0 && stats.evaluated_instances > 0;
  });

  const strongHabits = enrichedTasks.filter((task) => {
    const stats = task.habit_stats;
    return stats.completion_rate >= 80 && stats.evaluated_instances >= 5;
  });

  const summary = `${totalHabits} recurring tasks/habits with ${avgCompletionRate}% avg completion rate`;

  const recommendations: string[] = [];
  if (brokenStreaks.length > 0) {
    recommendations.push(`⚠️ ${brokenStreaks.length} habits with broken streaks need attention`);
  }
  if (strongHabits.length > 0) {
    recommendations.push(`✓ ${strongHabits.length} strong habits (80%+ completion)`);
  }
  if (totalHabits === 0) {
    recommendations.push("No recurring tasks found. Add habits with recur:daily, recur:weekly, etc.");
  }

  const warnings: string[] = [];
  const strugglingHabits = enrichedTasks.filter((task) => {
    const stats = task.habit_stats;
    return stats.completion_rate < 50 && stats.evaluated_instances >= 5;
  });
  if (strugglingHabits.length > 0) {
    warnings.push(`${strugglingHabits.length} habits below 50% completion - consider adjusting or removing`);
  }

  const response: EnrichedResponse = {
    tasks: enrichedTasks,
    metadata: {
      total: totalHabits,
      actionable: enrichedTasks.filter((task) => task.habit_stats.pending_count > 0).length,
    },
    insights: {
      summary,
      recommendations,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    groups: byFrequency,
  };

  return response;
}
