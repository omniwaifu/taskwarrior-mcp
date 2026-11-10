import { parseTaskwarriorDate } from "./dates.js";

interface ActionableTask {
  status?: string;
  wait?: string;
  scheduled?: string;
  depends?: string[];
  tags?: string[];
}
export function isWaiting(task: ActionableTask, now = Date.now()): boolean {
  return task.status === "waiting" || (!!task.wait && parseTaskwarriorDate(task.wait).getTime() > now);
}
export function isActionable(task: ActionableTask, now = Date.now(), includeBlocked = false, statuses?: TaskStatuses): boolean {
  return task.status === "pending" && !isWaiting(task, now)
    && (!task.scheduled || parseTaskwarriorDate(task.scheduled).getTime() <= now)
    && !task.tags?.some(tag => tag === "someday" || tag === "project_root")
    && (includeBlocked || !unmetDependencies(task, statuses).length);
}

export type TaskStatuses = ReadonlyMap<string, string>;
export function taskStatuses(tasks: { uuid: string; status: string }[]): TaskStatuses {
  return new Map(tasks.map(task => [task.uuid, task.status]));
}
export function unmetDependencies(task: ActionableTask, statuses?: TaskStatuses): string[] {
  return (task.depends ?? []).filter(uuid => {
    const status = statuses?.get(uuid);
    return status !== "completed" && status !== "deleted";
  });
}
export function matchesProject(task: { project?: string }, project: string): boolean {
  return task.project === project || !!task.project?.startsWith(`${project}.`);
}
