import type { BatchModifyTasksRequest } from "../../types/task.js";
import { executeTaskWarriorCommandRaw } from "../../utils/taskwarrior.js";
import { type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

export async function handleBatchModifyTasks(
  args: BatchModifyTasksRequest,
): Promise<EnrichedResponse> {
  console.log(`batchModifyTasks called with:`, args);

  try {
    const results: { uuid: string; success: boolean; error?: string }[] = [];
    const modifications = args.modifications;

    for (const uuid of args.uuids) {
      try {
        const commandArgs: string[] = [uuid, "modify"];

        if (modifications.description) {
          commandArgs.push(`description:"${modifications.description}"`);
        }
        if (modifications.status) {
          commandArgs.push(`status:${modifications.status}`);
        }
        if (modifications.due) {
          commandArgs.push(`due:${modifications.due}`);
        }
        if (modifications.priority) {
          commandArgs.push(`priority:${modifications.priority}`);
        }
        if (modifications.project !== undefined) {
          if (modifications.project === "") {
            commandArgs.push("project:");
          } else {
            commandArgs.push(`project:${modifications.project}`);
          }
        }
        if (modifications.scheduled) {
          commandArgs.push(`scheduled:${modifications.scheduled}`);
        }
        if (modifications.wait) {
          commandArgs.push(`wait:${modifications.wait}`);
        }
        if (modifications.until) {
          commandArgs.push(`until:${modifications.until}`);
        }
        if (modifications.context) {
          commandArgs.push(`context:${modifications.context}`);
        }
        if (modifications.energy) {
          commandArgs.push(`energy:${modifications.energy}`);
        }

        if (modifications.addTags && modifications.addTags.length > 0) {
          modifications.addTags.forEach(tag => commandArgs.push(`+${tag}`));
        }
        if (modifications.removeTags && modifications.removeTags.length > 0) {
          modifications.removeTags.forEach(tag => commandArgs.push(`-${tag}`));
        }

        await executeTaskWarriorCommandRaw(commandArgs);
        results.push({ uuid, success: true });
      } catch (error: unknown) {
        results.push({
          uuid,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    const warnings: string[] = [];
    if (failureCount > 0) {
      warnings.push(`${failureCount} task(s) failed to modify`);
      results.filter(r => !r.success).forEach(r => {
        warnings.push(`${r.uuid}: ${r.error}`);
      });
    }

    const summary = `Batch modified ${successCount}/${args.uuids.length} tasks`;

    const response: EnrichedResponse = {
      tasks: results,
      metadata: {
        total: args.uuids.length,
        actionable: successCount,
      },
      insights: {
        summary,
        recommendations: [
          `Successfully modified ${successCount} tasks`,
          failureCount > 0 ? `${failureCount} tasks failed - check warnings` : undefined,
        ].filter(Boolean) as string[],
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in batchModifyTasks handler:`, error);
    throw error;
  }
}
