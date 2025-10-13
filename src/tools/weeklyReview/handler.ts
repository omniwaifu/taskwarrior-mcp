import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleWeeklyReview(): Promise<EnrichedResponse> {
  console.log(`weeklyReview called`);

  try {
    const allPending = await executeTaskWarriorCommandJson(["status:pending"]);
    const inboxTasks = allPending.filter(t => t.tags && t.tags.includes('inbox'));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const completedThisWeek = await executeTaskWarriorCommandJson([
      "status:completed",
      `end.after:${sevenDaysAgoStr}`,
    ]);

    const now = new Date();
    const waitingTasks = allPending.filter(task => {
      if (task.status === 'waiting') return true;
      if (task.wait) {
        const waitDate = new Date(task.wait);
        return waitDate > now;
      }
      return false;
    });

    const overdueTasks = allPending.filter(task => {
      if (!task.due) return false;
      const dueDate = new Date(task.due);
      return dueDate < now && task.status === 'pending';
    });

    const projects = new Set<string>();
    for (const task of allPending) {
      if (task.project) projects.add(task.project);
    }

    const projectsWithoutNextActions: string[] = [];
    for (const project of projects) {
      const projectTasks = allPending.filter(t => t.project === project);
      const nextActions = projectTasks.filter(task => {
        if (task.depends && task.depends.length > 0) return false;
        if (task.wait) {
          const waitDate = new Date(task.wait);
          if (waitDate > now) return false;
        }
        return true;
      });
      if (nextActions.length === 0) {
        projectsWithoutNextActions.push(project);
      }
    }

    const stalledProjects: string[] = [];
    for (const project of projects) {
      const projectTasks = await executeTaskWarriorCommandJson([
        `project:${project}`,
      ]);

      let lastActivity: Date | null = null;
      for (const task of projectTasks) {
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

      if (lastActivity) {
        const daysSinceActivity = Math.floor(
          (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceActivity >= 7) {
          stalledProjects.push(project);
        }
      }
    }

    // Habit/Recurring task analysis
    const recurringTasks = await executeTaskWarriorCommandJson(["status:recurring"]);

    const habitsWithBrokenStreaks: string[] = [];
    const strongHabits: string[] = [];
    let totalHabitCompletionRate = 0;

    for (const habit of recurringTasks) {
      const mask = habit.mask || "";
      const description = habit.description || "Unknown habit";

      if (mask.length > 0) {
        const completed = (mask.match(/\+/g) || []).length;
        const completionRate = Math.round((completed / mask.length) * 100);
        totalHabitCompletionRate += completionRate;

        // Check for broken streaks (last character is not +)
        if (mask.length > 0 && mask[mask.length - 1] !== '+') {
          habitsWithBrokenStreaks.push(description);
        }

        // Strong habits: 80%+ completion with at least 5 instances
        if (completionRate >= 80 && mask.length >= 5) {
          strongHabits.push(description);
        }
      }
    }

    const avgHabitCompletion = recurringTasks.length > 0
      ? Math.round(totalHabitCompletionRate / recurringTasks.length)
      : 0;

    const summary = `Weekly Review: ${completedThisWeek.length} completed, ${inboxTasks.length} inbox, ${overdueTasks.length} overdue, ${projects.size} active projects, ${recurringTasks.length} habits (${avgHabitCompletion}% avg)`;

    const recommendations: string[] = [];
    if (inboxTasks.length > 0) {
      recommendations.push(`📥 Process ${inboxTasks.length} inbox items`);
    }
    if (overdueTasks.length > 0) {
      recommendations.push(`⚠️ Review ${overdueTasks.length} overdue tasks`);
    }
    if (projectsWithoutNextActions.length > 0) {
      recommendations.push(
        `📋 Define next actions for: ${projectsWithoutNextActions.join(", ")}`
      );
    }
    if (stalledProjects.length > 0) {
      recommendations.push(
        `⏸️ Review stalled projects: ${stalledProjects.join(", ")}`
      );
    }
    if (completedThisWeek.length > 0) {
      recommendations.push(`✅ Celebrate ${completedThisWeek.length} completed tasks!`);
    }
    if (habitsWithBrokenStreaks.length > 0) {
      recommendations.push(`🔄 ${habitsWithBrokenStreaks.length} habits need attention: ${habitsWithBrokenStreaks.slice(0, 3).join(", ")}${habitsWithBrokenStreaks.length > 3 ? ", ..." : ""}`);
    }
    if (strongHabits.length > 0) {
      recommendations.push(`💪 ${strongHabits.length} strong habits maintained`);
    }
    if (recurringTasks.length > 0 && avgHabitCompletion < 50) {
      recommendations.push(`⚠️ Overall habit completion low (${avgHabitCompletion}%) - review recurring tasks`);
    }

    const groups = {
      inbox: inboxTasks,
      completed_this_week: completedThisWeek,
      overdue: overdueTasks,
      waiting: waitingTasks,
      projects_without_next_actions: projectsWithoutNextActions,
      stalled_projects: stalledProjects,
      habits: recurringTasks,
      habits_with_broken_streaks: habitsWithBrokenStreaks,
      strong_habits: strongHabits,
    };

    const response: EnrichedResponse = {
      tasks: [],
      metadata: {
        total: allPending.length,
        actionable: allPending.length - waitingTasks.length,
        waiting: waitingTasks.length,
        completed: completedThisWeek.length,
      },
      insights: {
        summary,
        recommendations,
      },
      groups,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in weeklyReview handler:`, error);
    throw error;
  }
}
