/** Preserve existing payloads while consistently marking application-level failures. */
export function toTextResult(result: unknown) {
  const isError = typeof result === "object" && result !== null && "status" in result && result.status === "error";
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}

// Serialize requests so async read-modify-write operations cannot interleave within this server.
let previous: Promise<unknown> = Promise.resolve();
let pending = 0;
export function runTool(handler: () => Promise<unknown>) {
  if (pending >= 100) return Promise.reject(new Error("Server busy: at most 100 tool requests may be queued."));
  pending++;
  const result = previous.then(handler).then(toTextResult).finally(() => { pending--; });
  previous = result.catch(() => undefined);
  return result;
}
