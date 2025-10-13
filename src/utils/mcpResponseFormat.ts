/**
 * MCP Response Format Utilities
 * Standardizes response formatting for MCP tools
 */

/**
 * Creates a properly formatted MCP success response
 * @param data The data to send in the response (will be converted to text)
 * @returns A properly formatted MCP success response
 */
export function createMcpSuccessResponse(data: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data)
      }
    ]
  };
}

/**
 * Creates a properly formatted MCP error response
 * @param errorMessage The error message
 * @returns A properly formatted MCP error response
 */
export function createMcpErrorResponse(errorMessage: string) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: errorMessage })
      }
    ]
  };
}

/**
 * Enriched response structure for LLM-optimized queries
 */
export interface EnrichedResponse {
  tasks: unknown[];
  metadata: {
    total: number;
    actionable?: number;
    blocked?: number;
    waiting?: number;
    completed?: number;
  };
  insights?: {
    summary?: string;
    recommendations?: string[];
    warnings?: string[];
  };
  relationships?: {
    [uuid: string]: {
      blocks?: string[]; // UUIDs this task blocks
      blocked_by?: string[]; // UUIDs blocking this task
      children?: string[]; // Child task UUIDs
      parent?: string; // Parent task UUID
    };
  };
  contexts?: {
    [context: string]: {
      count: number;
      high_priority: number;
    };
  };
  groups?: {
    [key: string]: unknown[];
  };
}

/**
 * Creates an enriched MCP response with metadata and insights
 * @param data The enriched data to send
 * @returns A properly formatted MCP response with enriched content
 */
export function createEnrichedResponse(data: EnrichedResponse) {
  return createMcpSuccessResponse(data);
}

/**
 * Helper to generate insights for task lists
 * @param tasks Task array
 * @param options Options for insight generation
 * @returns Insights object
 */
export function generateInsights(
  tasks: Array<{
    status?: string;
    wait?: string;
    depends?: string[];
    priority?: string;
    due?: string;
    context?: string;
  }>,
  options?: {
    includeRecommendations?: boolean;
    includeWarnings?: boolean;
  }
): { summary: string; recommendations?: string[]; warnings?: string[] } {
  const actionable = tasks.filter(
    t => t.status === 'pending' && !t.wait && (!t.depends || t.depends.length === 0)
  ).length;
  const blocked = tasks.filter(t => t.depends && t.depends.length > 0).length;
  const waiting = tasks.filter(t => t.wait || t.status === 'waiting').length;

  const summary = `Found ${tasks.length} tasks: ${actionable} actionable, ${blocked} blocked, ${waiting} waiting`;

  const insights: { summary: string; recommendations?: string[]; warnings?: string[] } = { summary };

  if (options?.includeRecommendations) {
    insights.recommendations = [];
    const highPriority = tasks.filter(t => t.priority === 'H' && t.status === 'pending');
    if (highPriority.length > 0) {
      insights.recommendations.push(`${highPriority.length} high priority tasks need attention`);
    }
    const overdue = tasks.filter(t => t.due && new Date(t.due) < new Date() && t.status === 'pending');
    if (overdue.length > 0) {
      insights.recommendations.push(`${overdue.length} tasks are overdue`);
    }
  }

  if (options?.includeWarnings) {
    insights.warnings = [];
    const noContext = tasks.filter(t => !t.context && t.status === 'pending');
    if (noContext.length > 0) {
      insights.warnings.push(`${noContext.length} tasks have no context set`);
    }
  }

  return insights;
} 