import type { GetTaskTreeRequest, TaskWarriorTask } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { isActionable, matchesProject, taskStatuses, unmetDependencies } from "../../utils/actionability.js";

export async function handleGetTaskTree(args: GetTaskTreeRequest) {
  if (!args.uuid && !args.project) throw new Error("Specify a root uuid or project to retrieve a task tree.");
  const database = await executeTaskWarriorCommandJson([]);
  const statuses = taskStatuses(database);
  const selected = database.filter(task => !args.project || matchesProject(task, args.project));
  const byUuid = new Map(selected.map(task => [task.uuid, task]));
  if (args.uuid && !byUuid.has(args.uuid)) throw new Error("Root task not found in the selected project/database.");
  const children = new Map<string, TaskWarriorTask[]>();
  for (const task of selected) {
    if (!task.mcp_parent) continue;
    const group = children.get(task.mcp_parent) ?? [];
    group.push(task);
    children.set(task.mcp_parent, group);
  }
  const sort = (a: TaskWarriorTask, b: TaskWarriorTask) => a.description.localeCompare(b.description) || a.uuid.localeCompare(b.uuid);
  for (const group of children.values()) group.sort(sort);
  const roots = args.uuid ? [byUuid.get(args.uuid)!] : selected.filter(task => !task.mcp_parent || !byUuid.has(task.mcp_parent)).sort(sort);
  const nodes: { task: TaskWarriorTask; depth: number; children: string[]; blocked_by: string[] }[] = [];
  const visited = new Set<string>();
  const warnings = new Set<string>();
  let truncated = false;
  const maxDepth = args.depth ?? 10;
  const maxNodes = args.max_nodes ?? 200;
  function traverse(root: TaskWarriorTask) {
    const stack = [{ task: root, depth: 0, ancestors: new Set<string>() }];
    while (stack.length) {
      const { task, depth, ancestors } = stack.pop()!;
      if (ancestors.has(task.uuid)) { warnings.add(`Hierarchy cycle at ${task.uuid}`); continue; }
      if (visited.has(task.uuid)) continue;
      if (nodes.length >= maxNodes) { truncated = true; break; }
      visited.add(task.uuid);
      const descendants = children.get(task.uuid) ?? [];
      nodes.push({ task, depth, children: descendants.map(child => child.uuid), blocked_by: unmetDependencies(task, statuses) });
      if (task.mcp_parent && !byUuid.has(task.mcp_parent)) warnings.add(`Parent ${task.mcp_parent} is missing or outside the selected project`);
      if (depth >= maxDepth) { if (descendants.length) truncated = true; continue; }
      const path = new Set([...ancestors, task.uuid]);
      for (const child of [...descendants].reverse()) stack.push({ task: child, depth: depth + 1, ancestors: path });
    }
  }
  roots.forEach(traverse);
  // Rootless components are cycles or descendants hidden by the requested depth.
  // Only inspect rootless components if a depth/node cutoff has not already stopped traversal.
  if (!args.uuid && !truncated) {
    for (const task of [...selected].sort(sort)) if (!visited.has(task.uuid)) traverse(task);
  }
  return {
    nodes, metadata: { returned: nodes.length, truncated, completed: nodes.filter(node => node.task.status === "completed").length,
      actionable: nodes.filter(node => isActionable(node.task, Date.now(), false, statuses)).length },
    warnings: [...warnings],
  };
}
