import { createHash } from "node:crypto";

export interface PageInfo {
  total: number;
  returned: number;
  has_more: boolean;
  next_cursor?: string;
}

/** Stateless cursors detect changed results rather than silently skipping/duplicating tasks. */
export function paginate<T extends { uuid: string; modified?: string }>(
  items: T[], args: { limit?: number; cursor?: string }, query: Record<string, unknown>,
): { items: T[]; page: PageInfo } {
  const limit = args.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Page limit must be from 1 to 200.");
  const queryEntries = Object.entries(query).filter(([key, value]) => key !== "cursor" && key !== "limit" && value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  const fingerprint = createHash("sha256").update(JSON.stringify([queryEntries, items.map(task => Object.entries(task).filter(([key]) => key !== "urgency").sort(([a], [b]) => a.localeCompare(b)))])).digest("hex");
  let offset = 0;
  if (args.cursor) {
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(args.cursor, "base64url").toString("utf8")); }
    catch { throw new Error("Invalid cursor. Restart the query without a cursor."); }
    if (typeof decoded !== "object" || decoded === null || !("offset" in decoded) || !("fingerprint" in decoded)
      || typeof decoded.offset !== "number" || !Number.isInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > items.length) {
      throw new Error("Invalid cursor. Restart the query without a cursor.");
    }
    if (decoded.fingerprint !== fingerprint) throw new Error("Results or filters changed. Restart the query without a cursor.");
    offset = decoded.offset;
  }
  const pageItems = items.slice(offset, offset + limit);
  const next = offset + pageItems.length;
  return { items: pageItems, page: {
    total: items.length, returned: pageItems.length, has_more: next < items.length,
    ...(next < items.length ? { next_cursor: Buffer.from(JSON.stringify({ offset: next, fingerprint })).toString("base64url") } : {}),
  } };
}
