function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Keep legacy text payloads while offering one typed envelope to structured clients. */
export function toTextResult(result: unknown) {
  const object = record(result);
  const isError = object?.status === "error";
  let data: unknown = result ?? null;
  const legacyResult = record(object?.result);
  if (typeof object?.tool_name === "string" && Array.isArray(legacyResult?.content)) {
    const json = legacyResult.content.map(record).find(item => item?.type === "json");
    data = json?.data ?? null;
  }
  const error = record(object?.error);
  const status: "success" | "error" = isError ? "error" : "success";
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: {
      status, data,
      ...(isError ? { error: {
        code: typeof error?.code === "string" ? error.code : "TOOL_EXECUTION_ERROR",
        message: typeof error?.message === "string" ? error.message : "Operation failed; inspect data for partial results and warnings.",
      } } : {}),
    },
  };
}

function failure(error: unknown) {
  return toTextResult({ status: "error", error: { code: "TOOL_EXECUTION_ERROR", message: error instanceof Error ? error.message : String(error) } });
}

// Serialize read-modify-write operations. Rejections never poison the queue.
let previous: Promise<unknown> = Promise.resolve();
let pending = 0;
export function runTool(handler: () => Promise<unknown>) {
  if (pending >= 100) return Promise.resolve(failure(new Error("Server busy: at most 100 tool requests may be queued.")));
  pending++;
  const result = previous.then(handler).then(toTextResult, failure).finally(() => { pending--; });
  previous = result.catch(() => undefined);
  return result;
}
