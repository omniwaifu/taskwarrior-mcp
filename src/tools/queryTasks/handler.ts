import type { QueryTasksRequest, TaskWarriorTask } from "../../types/task.js";
import { handleListTasks } from "../listTasks/handler.js";
import { executeTaskWarriorCommandJson, executeTaskWarriorCommandRaw } from "../../utils/taskwarrior.js";
import { taskStatuses, unmetDependencies } from "../../utils/actionability.js";
import { parseTaskwarriorDate } from "../../utils/dates.js";
import { paginate } from "../../utils/pagination.js";

export async function handleQueryTasks(args: QueryTasksRequest) {
  let tasks = await handleListTasks({ ...args, limit: undefined });
  const statuses = args.blocked === undefined ? undefined : taskStatuses(await executeTaskWarriorCommandJson([]));
  tasks = tasks.filter(task => (!args.context || task.context === args.context)
    && (args.priority === undefined || (task.priority ?? "") === args.priority)
    && (!args.waiting_for || task.waiting_for === args.waiting_for)
    && (args.parent === undefined || (task.mcp_parent ?? "") === args.parent)
    && (args.active === undefined || !!task.start === args.active)
    && (args.blocked === undefined || (unmetDependencies(task, statuses).length > 0) === args.blocked));
  const sortBy = args.sort_by ?? "urgency";
  const order = args.sort_order ?? (sortBy === "urgency" || sortBy === "priority" ? "desc" : "asc");
  const priorityValues = sortBy === "priority"
    ? (await executeTaskWarriorCommandRaw(["rc.verbose=nothing", "_get", "rc.uda.priority.values"])).split(",").map(value => value.trim()).filter(Boolean)
    : [];
  const value = (task: TaskWarriorTask): string | number | undefined => {
    const field = task[sortBy];
    if (field === undefined || field === "") return undefined;
    if (sortBy === "priority") {
      const index = priorityValues.indexOf(String(field));
      return index < 0 ? 0 : priorityValues.length - index;
    }
    if (sortBy === "due" || sortBy === "entry" || sortBy === "modified") {
      const date = parseTaskwarriorDate(String(field)).getTime();
      return Number.isFinite(date) ? date : undefined;
    }
    return field;
  };
  tasks.sort((a, b) => {
    const left = value(a), right = value(b);
    if (left === undefined && right !== undefined) return 1;
    if (right === undefined && left !== undefined) return -1;
    const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""));
    return comparison ? comparison * (order === "asc" ? 1 : -1) : a.uuid.localeCompare(b.uuid);
  });
  const result = paginate(tasks, args, { ...args, tool: "query_tasks", sort_by: sortBy, sort_order: order });
  return { tasks: result.items, page: result.page, metadata: { total: tasks.length, returned: result.items.length } };
}
