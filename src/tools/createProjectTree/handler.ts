import type { CreateProjectTreeRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleCreateProjectTree(
  args: CreateProjectTreeRequest,
): Promise<EnrichedResponse> {
  console.log(`createProjectTree called with:`, args);

  try {
    // Create the project task (parent)
    const projectTaskCommand = [
      "add",
      args.project_description,
      `project:${args.project_name}`,
      "tags:project_root",
    ];

    const projectResult = await executeTaskWarriorCommandRaw(projectTaskCommand);
    const projectUuidMatch = projectResult.match(/Created task (\d+)/);
    if (!projectUuidMatch) {
      throw new Error("Failed to create project root task");
    }

    // Get the UUID of the created project task
    const projectTaskId = projectUuidMatch[1];
    const uuidResult = await executeTaskWarriorCommandRaw([projectTaskId, "uuids"]);
    const projectUuid = uuidResult.trim();

    const createdTasks: { uuid: string; description: string; index: number }[] = [];

    // Create all tasks first
    for (let i = 0; i < args.tasks.length; i++) {
      const task = args.tasks[i];
      const commandArgs = [
        "add",
        task.description,
        `project:${args.project_name}`,
        `parent:${projectUuid}`,
      ];

      if (task.priority) commandArgs.push(`priority:${task.priority}`);
      if (task.context) commandArgs.push(`context:${task.context}`);
      if (task.tags) {
        task.tags.forEach(tag => commandArgs.push(`+${tag}`));
      }

      const result = await executeTaskWarriorCommandRaw(commandArgs);
      const taskIdMatch = result.match(/Created task (\d+)/);

      if (taskIdMatch) {
        const taskId = taskIdMatch[1];
        const taskUuidResult = await executeTaskWarriorCommandRaw([taskId, "uuids"]);
        const taskUuid = taskUuidResult.trim();

        createdTasks.push({
          uuid: taskUuid,
          description: task.description,
          index: i,
        });
      }
    }

    // Now add dependencies
    for (let i = 0; i < args.tasks.length; i++) {
      const task = args.tasks[i];
      if (task.depends_on_indices && task.depends_on_indices.length > 0) {
        const taskUuid = createdTasks[i].uuid;
        const dependsUuids = task.depends_on_indices.map(idx => createdTasks[idx].uuid);

        await executeTaskWarriorCommandRaw([
          taskUuid,
          "modify",
          `depends:${dependsUuids.join(",")}`,
        ]);
      }
    }

    const summary = `Created project "${args.project_name}" with ${createdTasks.length} tasks and dependency chains`;

    const response: EnrichedResponse = {
      tasks: createdTasks,
      metadata: {
        total: createdTasks.length + 1, // +1 for project root
        actionable: createdTasks.filter((_, i) =>
          !args.tasks[i].depends_on_indices || args.tasks[i].depends_on_indices!.length === 0
        ).length,
      },
      insights: {
        summary,
        recommendations: [
          `Project root UUID: ${projectUuid}`,
          `Created ${createdTasks.length} tasks with dependencies`,
        ],
      },
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in createProjectTree handler:`, error);
    throw error;
  }
}
