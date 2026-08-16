import type {
  GetRecurringTasksRequest,
  TaskWarriorTask,
} from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

interface HabitStats {
  total_instances: number;
  completed_count: number;
  pending_count: number;
  deleted_count: number;
  waiting_count: number;
  completion_rate: number;
  current_streak: number;
  longest_streak: number;
  frequency: string;
}

type RecurringTaskWithStats = TaskWarriorTask & {
  habit_stats: HabitStats;
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
  console.error(`getRecurringTasks called with:`, args);

  try {
    const filterArgs: string[] = ["status:recurring"];

    const templates = await executeTaskWarriorCommandJson(filterArgs);

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
    const enrichedTasks: RecurringTaskWithStats[] = filteredTemplates.map((task) => {
      const mask = task.mask || "";
      const recur = task.recur || "unknown";

      // Parse mask: - = pending, + = completed, X = deleted, W = waiting
      const total = mask.length;
      const completed = (mask.match(/\+/g) || []).length;
      const pending = (mask.match(/-/g) || []).length;
      const deleted = (mask.match(/X/g) || []).length;
      const waiting = (mask.match(/W/g) || []).length;

      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Calculate current streak (consecutive + from the right)
      let currentStreak = 0;
      for (let i = mask.length - 1; i >= 0; i--) {
        if (mask[i] === '+') {
          currentStreak++;
        } else if (mask[i] === '-') {
          break; // Streak broken by pending (not yet done)
        } else {
          break; // Streak broken by deleted/waiting
        }
      }

      // Calculate longest streak
      let longestStreak = 0;
      let streak = 0;
      for (const char of mask) {
        if (char === '+') {
          streak++;
          longestStreak = Math.max(longestStreak, streak);
        } else {
          streak = 0;
        }
      }

      return {
        ...task,
        habit_stats: {
          total_instances: total,
          completed_count: completed,
          pending_count: pending,
          deleted_count: deleted,
          waiting_count: waiting,
          completion_rate: completionRate,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          frequency: recur,
        },
      };
    });

    // Group by frequency
    const byFrequency: Record<string, RecurringTaskWithStats[]> = {};
    enrichedTasks.forEach((task) => {
      const freqKey = normalizeFrequency(task.recur || "unknown");

      if (!byFrequency[freqKey]) byFrequency[freqKey] = [];
      byFrequency[freqKey].push(task);
    });

    // Generate insights
    const totalHabits = enrichedTasks.length;
    const avgCompletionRate = totalHabits > 0
      ? Math.round(
        enrichedTasks.reduce(
          (sum, task) => sum + task.habit_stats.completion_rate,
          0,
        ) / totalHabits,
      )
      : 0;

    const brokenStreaks = enrichedTasks.filter((task) => {
      const stats = task.habit_stats;
      return stats.current_streak === 0 && stats.total_instances > 0;
    });

    const strongHabits = enrichedTasks.filter((task) => {
      const stats = task.habit_stats;
      return stats.completion_rate >= 80 && stats.total_instances >= 5;
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
      return stats.completion_rate < 50 && stats.total_instances >= 5;
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
  } catch (error: unknown) {
    console.error(`Error in getRecurringTasks handler:`, error);
    throw error;
  }
}
