import { habitStats, groupHabitInstances } from "../../utils/habits.js";
import { isActionable, isWaiting, taskStatuses } from "../../utils/actionability.js";
import { parseTaskwarriorDate } from "../../utils/dates.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleWeeklyReview(): Promise<EnrichedResponse> {
  // Taskwarrior's pending filter excludes deferred tasks, even when export says pending.
  const allTasks = await executeTaskWarriorCommandJson([]);
  const statuses = taskStatuses(allTasks);
  const allPending = allTasks.filter(task => task.status === "pending" || task.status === "waiting");
  const inboxTasks = allPending.filter(t => t.tags && t.tags.includes('inbox'));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const completedThisWeek = allTasks.filter(task => task.status === "completed" && task.end && parseTaskwarriorDate(task.end) >= sevenDaysAgo);

  const now = new Date();
  const waitingTasks = allPending.filter(task => isWaiting(task, now.getTime()));
  const followUpsDue = waitingTasks.filter(task => task.follow_up && parseTaskwarriorDate(task.follow_up) <= now);

  const overdueTasks = allPending.filter(task => {
    if (!task.due) return false;
    const dueDate = parseTaskwarriorDate(task.due);
    return dueDate < now && task.status === 'pending';
  });

  const projects = new Set<string>();
  for (const task of allPending) {
    if (task.project && !task.tags?.some(tag => ["inbox", "someday", "reference"].includes(tag))) projects.add(task.project);
  }

  const projectsWithoutNextActions: string[] = [];
  for (const project of projects) {
    const projectTasks = allPending.filter(t => t.project === project || t.project?.startsWith(`${project}.`));
    const nextActions = projectTasks.filter(task => isActionable(task, now.getTime(), false, statuses));
    if (nextActions.length === 0) {
      projectsWithoutNextActions.push(project);
    }
  }

  const stalledProjects: string[] = [];
  for (const project of projects) {
    const projectTasks = allTasks.filter(task => task.project === project || task.project?.startsWith(`${project}.`));

    let lastActivity: Date | null = null;
    for (const task of projectTasks) {
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
  const recurringTasks = allTasks.filter(task => task.status === "recurring");

  const habitsWithBrokenStreaks: string[] = [];
  const strongHabits: string[] = [];
  let totalHabitCompletionRate = 0;
  let evaluatedHabits = 0;

  const instances = groupHabitInstances(allTasks);
  for (const habit of recurringTasks) {
    const stats = habitStats(habit, instances.get(habit.uuid) ?? [], now.getTime());
    totalHabitCompletionRate += stats.completion_rate;
    if (stats.evaluated_instances) evaluatedHabits++;
    if (stats.evaluated_instances && !stats.current_streak) habitsWithBrokenStreaks.push(habit.description);
    if (stats.evaluated_instances >= 5 && stats.completion_rate >= 80) strongHabits.push(habit.description);
  }

  const avgHabitCompletion = evaluatedHabits > 0
    ? Math.round(totalHabitCompletionRate / evaluatedHabits)
    : 0;

  const summary = `Weekly Review: ${completedThisWeek.length} completed, ${inboxTasks.length} inbox, ${overdueTasks.length} overdue, ${projects.size} active projects, ${recurringTasks.length} habits (${avgHabitCompletion}% avg)`;

  const recommendations: string[] = [];
  if (followUpsDue.length) recommendations.push(`Follow up on ${followUpsDue.length} delegated tasks`);
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
  if (evaluatedHabits > 0 && avgHabitCompletion < 50) {
    recommendations.push(`⚠️ Overall habit completion low (${avgHabitCompletion}%) - review recurring tasks`);
  }

  const groups = {
    inbox: inboxTasks,
    completed_this_week: completedThisWeek,
    overdue: overdueTasks,
    waiting: waitingTasks,
    follow_ups_due: followUpsDue,
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
      actionable: allPending.filter(task => isActionable(task, now.getTime(), false, statuses)).length,
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
}
