/** Legacy mutation payload, kept stable inside the standard MCP text result. */
export interface OperationResult {
  tool_name: string;
  status: "success" | "error";
  result: { content: ({ type: "json"; data: unknown } | { type: "text"; text: string })[] };
  error?: { code: string; message: string };
}

export class OperationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export async function operationResult(toolName: string, operation: () => Promise<unknown>): Promise<OperationResult> {
  try {
    const data = await operation();
    return { tool_name: toolName, status: "success", result: { content: [{ type: "json", data }] } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof OperationError ? error.code
      : /Task with UUID .* not found\./.test(message) ? "TASK_NOT_FOUND" : "TOOL_EXECUTION_ERROR";
    return { tool_name: toolName, status: "error", error: { code, message }, result: { content: [{ type: "text", text: message }] } };
  }
}
