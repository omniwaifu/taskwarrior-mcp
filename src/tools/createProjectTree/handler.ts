import type { CreateProjectTreeRequest } from "../../types/task.js";
import { setTaskDependencies } from "../../utils/taskwarrior.js";
import { handleAddTask } from "../addTask/handler.js";
import type { EnrichedResponse } from "../../utils/mcpResponseFormat.js";

function validateGraph(tasks: CreateProjectTreeRequest["tasks"]): void {
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function visit(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= tasks.length) throw new Error(`Invalid dependency index ${index}.`);
    if (visiting.has(index)) throw new Error(`Dependency cycle involving task index ${index}.`);
    if (visited.has(index)) return;
    visiting.add(index);
    for (const dependency of tasks[index].depends_on_indices ?? []) visit(dependency);
    visiting.delete(index);
    visited.add(index);
  }
  tasks.forEach((_, index) => visit(index));
}

export async function handleCreateProjectTree(args: CreateProjectTreeRequest): Promise<EnrichedResponse & { status: "success" | "error"; project_uuid?: string }> {
  validateGraph(args.tasks);
  let projectUuid: string | undefined;
  const created: { uuid: string; description: string; index: number }[] = [];
  try {
    const root = await handleAddTask({ description: args.project_description, project: args.project_name, tags: ["project_root"] });
    projectUuid = root.uuid;
    for (const [index, task] of args.tasks.entries()) {
      const added = await handleAddTask({ ...task, project: args.project_name, parent: root.uuid });
      created.push({ uuid: added.uuid, description: added.description, index });
    }
    for (const [index, task] of args.tasks.entries()) {
      if (task.depends_on_indices?.length) {
        await setTaskDependencies(created[index].uuid, task.depends_on_indices.map(i => created[i].uuid));
      }
    }
    return {
      status: "success", project_uuid: projectUuid, tasks: created,
      metadata: { total: created.length + 1, actionable: args.tasks.filter(task => !task.depends_on_indices?.length).length },
      insights: { summary: `Created project "${args.project_name}" with ${created.length} tasks` },
    };
  } catch (error) {
    return {
      status: "error", project_uuid: projectUuid, tasks: created,
      metadata: { total: created.length + (projectUuid ? 1 : 0) },
      insights: { summary: "Project creation did not finish. Existing tasks have been retained.", warnings: [error instanceof Error ? error.message : String(error), "Inspect the returned UUIDs before retrying to avoid duplicates."] },
    };
  }
}
