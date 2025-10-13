import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { generateInsights, type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

/**
 * Process inbox - Get all tasks tagged with +inbox for clarification
 * Returns enriched response with inbox tasks that need processing
 */
export async function handleProcessInbox(): Promise<EnrichedResponse> {
  console.log(`processInbox called`);

  try {
    // Get all tasks with +inbox tag
    const inboxTasks = await executeTaskWarriorCommandJson([
      "status:pending",
      "+inbox",
    ]);

    // Generate insights
    const insights = generateInsights(inboxTasks, {
      includeRecommendations: true,
      includeWarnings: false,
    });

    if (inboxTasks.length === 0) {
      insights.summary = "Inbox is empty - great job!";
      insights.recommendations = ["Your inbox is clear. Focus on next actions."];
    } else {
      insights.summary = `${inboxTasks.length} items in inbox need processing`;
      insights.recommendations = insights.recommendations || [];
      insights.recommendations.unshift(
        `Process these inbox items: clarify, organize, or defer`
      );
    }

    const response: EnrichedResponse = {
      tasks: inboxTasks,
      metadata: {
        total: inboxTasks.length,
        actionable: inboxTasks.length,
      },
      insights,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in processInbox handler:`, error);
    throw error;
  }
}
