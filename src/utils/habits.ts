import type { TaskWarriorTask } from "../types/task.js";
import { parseTaskwarriorDate } from "./dates.js";

/** Use instances and due dates: a recurrence mask includes future occurrences too. */
export function habitStats(template: TaskWarriorTask, instances: TaskWarriorTask[], now = Date.now()) {
  const eligible = instances.filter(task => task.status === "completed" || (task.due && parseTaskwarriorDate(task.due).getTime() <= now))
    .sort((a, b) => parseTaskwarriorDate(a.due ?? a.entry).getTime() - parseTaskwarriorDate(b.due ?? b.entry).getTime());
  let currentStreak = 0;
  let longestStreak = 0;
  for (const task of eligible) {
    currentStreak = task.status === "completed" ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }
  const completed = instances.filter(task => task.status === "completed").length;
  return {
    total_instances: instances.length,
    evaluated_instances: eligible.length,
    completed_count: completed,
    pending_count: instances.filter(task => task.status === "pending").length,
    deleted_count: instances.filter(task => task.status === "deleted").length,
    waiting_count: instances.filter(task => task.status === "waiting").length,
    completion_rate: eligible.length ? Math.round(completed / eligible.length * 100) : 0,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    frequency: template.recur ?? "unknown",
  };
}

export function groupHabitInstances(tasks: TaskWarriorTask[]): Map<string, TaskWarriorTask[]> {
  const groups = new Map<string, TaskWarriorTask[]>();
  for (const task of tasks) {
    if (!task.parent) continue;
    const group = groups.get(task.parent) ?? [];
    group.push(task);
    groups.set(task.parent, group);
  }
  return groups;
}
