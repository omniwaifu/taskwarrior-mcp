import type { GetNextActionsRequest } from "../../types/task.js";
import { executeTaskWarriorCommandJson } from "../../utils/taskwarrior.js";
import { generateInsights, type EnrichedResponse } from "../../utils/mcpResponseFormat.js";

/**
 * Get next actions - What can I do NOW?
 * This is the core LLM-optimized query tool for GTD workflow
 *
 * Filters for actionable tasks:
 * - Status: pending
 * - Not waiting (no wait date or wait date has passed)
 * - Not blocked (no unmet dependencies) unless include_blocked=true
 * - Optional: context, energy_level, time_available filters
 */
export async function handleGetNextActions(
  args: GetNextActionsRequest,
): Promise<EnrichedResponse> {
  console.log(`getNextActions called with:`, args);

  try {
    // Build TaskWarrior filter
    const filterArgs: string[] = ["status:pending"];

    // Filter by context if specified
    if (args.context) {
      filterArgs.push(`context:${args.context}`);
    }

    // Filter by energy level if specified
    if (args.energy_level) {
      // Map to TaskWarrior energy values
      const energyMap = {
        high: "H",
        medium: "M",
        low: "L"
      };
      filterArgs.push(`energy:${energyMap[args.energy_level]}`);
    }

    // Get all matching tasks
    const allTasks = await executeTaskWarriorCommandJson(filterArgs);

    // Filter out waiting tasks (wait date in future)
    const now = new Date();
    let actionableTasks = allTasks.filter(task => {
      // Skip if waiting
      if (task.wait) {
        const waitDate = new Date(task.wait);
        if (waitDate > now) {
          return false;
        }
      }
      return true;
    });

    // Filter out blocked tasks unless include_blocked is true
    if (!args.include_blocked) {
      actionableTasks = actionableTasks.filter(task => {
        // Skip if has unmet dependencies
        if (task.depends && task.depends.length > 0) {
          return false;
        }
        return true;
      });
    }

    // Apply time_available filter (heuristic based on urgency and complexity)
    if (args.time_available) {
      const timeMinutes = {
        "5min": 5,
        "15min": 15,
        "30min": 30,
        "1hour": 60,
        "2hours+": 999
      }[args.time_available];

      actionableTasks = actionableTasks.filter(task => {
        // Use complexity if available
        if (task.complexity) {
          const complexity = typeof task.complexity === 'number'
            ? task.complexity
            : parseInt(task.complexity as string);
          if (!isNaN(complexity)) {
            return complexity <= timeMinutes;
          }
        }
        // Fallback: use urgency (higher urgency = can be done quickly)
        if (task.urgency && task.urgency > 10) {
          return timeMinutes >= 30; // High urgency tasks might need more time
        }
        return true; // Include if no complexity/urgency data
      });
    }

    // Sort by urgency (descending)
    actionableTasks.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));

    // Apply limit if specified
    if (args.limit) {
      actionableTasks = actionableTasks.slice(0, args.limit);
    }

    // Calculate metadata
    const blocked = allTasks.filter(t => t.depends && t.depends.length > 0).length;
    const waiting = allTasks.filter(t => {
      if (t.wait) {
        const waitDate = new Date(t.wait);
        return waitDate > now;
      }
      return false;
    }).length;

    // Generate insights
    const insights = generateInsights(actionableTasks, {
      includeRecommendations: true,
      includeWarnings: true,
    });

    // Add specific recommendations
    if (actionableTasks.length === 0) {
      insights.summary = "No actionable tasks found";
      insights.recommendations = insights.recommendations || [];
      if (blocked > 0) {
        insights.recommendations.push(`${blocked} tasks are blocked by dependencies`);
      }
      if (waiting > 0) {
        insights.recommendations.push(`${waiting} tasks are waiting`);
      }
    } else {
      // Recommend starting with highest urgency
      const topTask = actionableTasks[0];
      if (topTask.urgency && topTask.urgency > 10) {
        insights.recommendations = insights.recommendations || [];
        insights.recommendations.unshift(
          `Start with "${topTask.description}" (urgency: ${topTask.urgency.toFixed(1)})`
        );
      }
    }

    // Build context grouping
    const contexts: { [key: string]: { count: number; high_priority: number } } = {};
    for (const task of actionableTasks) {
      if (task.context) {
        if (!contexts[task.context]) {
          contexts[task.context] = { count: 0, high_priority: 0 };
        }
        contexts[task.context].count++;
        if (task.priority === 'H') {
          contexts[task.context].high_priority++;
        }
      }
    }

    const response: EnrichedResponse = {
      tasks: actionableTasks,
      metadata: {
        total: allTasks.length,
        actionable: actionableTasks.length,
        blocked,
        waiting,
      },
      insights,
      contexts: Object.keys(contexts).length > 0 ? contexts : undefined,
    };

    return response;
  } catch (error: unknown) {
    console.error(`Error in getNextActions handler:`, error);
    throw error;
  }
}
