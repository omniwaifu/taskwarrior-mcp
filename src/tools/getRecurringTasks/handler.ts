import type { GetRecurringTasksRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleGetRecurringTasks(
  args: GetRecurringTasksRequest,
): Promise<EnrichedResponse> {
  console.log(`getRecurringTasks called with:`, args);

  try {
    const filterArgs: string[] = ["status:recurring"];

    const templates = await executeTaskWarriorCommandJson(filterArgs);

    // Filter by frequency if specified
    let filteredTemplates = templates;
    if (args.frequency && args.frequency !== "all") {
      filteredTemplates = templates.filter(task => {
        const recur = (task as { recur?: string }).recur;
        if (!recur) return false;

        const freq = args.frequency!;
        if (freq === "daily") return recur.includes("day") || recur === "daily";
        if (freq === "weekly") return recur.includes("week") || recur === "weekly";
        if (freq === "monthly") return recur.includes("month") || recur === "monthly";
        if (freq === "yearly") return recur.includes("year") || recur === "yearly";
        return false;
      });
    }

    // Analyze each recurring task
    const enrichedTasks = filteredTemplates.map(task => {
      const mask = (task as { mask?: string }).mask || "";
      const recur = (task as { recur?: string }).recur || "unknown";

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
          completion_rate: completionRate,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          frequency: recur,
        },
      };
    });

    // Group by frequency
    const byFrequency: Record<string, unknown[]> = {};
    enrichedTasks.forEach(task => {
      const freq = (task as { recur?: string }).recur || "unknown";
      const freqKey = freq.includes("day") ? "daily" :
                      freq.includes("week") ? "weekly" :
                      freq.includes("month") ? "monthly" :
                      freq.includes("year") ? "yearly" : "other";

      if (!byFrequency[freqKey]) byFrequency[freqKey] = [];
      byFrequency[freqKey].push(task);
    });

    // Generate insights
    const totalHabits = enrichedTasks.length;
    const avgCompletionRate = totalHabits > 0
      ? Math.round(enrichedTasks.reduce((sum, t) => sum + ((t as any).habit_stats.completion_rate || 0), 0) / totalHabits)
      : 0;

    const brokenStreaks = enrichedTasks.filter(t => {
      const stats = (t as any).habit_stats;
      return stats.current_streak === 0 && stats.total_instances > 0;
    });

    const strongHabits = enrichedTasks.filter(t => {
      const stats = (t as any).habit_stats;
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
    const strugglingHabits = enrichedTasks.filter(t => {
      const stats = (t as any).habit_stats;
      return stats.completion_rate < 50 && stats.total_instances >= 5;
    });
    if (strugglingHabits.length > 0) {
      warnings.push(`${strugglingHabits.length} habits below 50% completion - consider adjusting or removing`);
    }

    const response: EnrichedResponse = {
      tasks: enrichedTasks,
      metadata: {
        total: totalHabits,
        actionable: enrichedTasks.filter(t => ((t as any).habit_stats.pending_count || 0) > 0).length,
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
