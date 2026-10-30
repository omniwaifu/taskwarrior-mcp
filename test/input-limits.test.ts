import { describe, expect, test } from "bun:test";
import { z } from "zod";
import * as schemas from "../src/types/task.ts";

const uuid = "12345678-1234-4234-8234-123456789abc";
const limits = schemas.INPUT_ARRAY_LIMITS;
const cases: [string, z.ZodType, number, unknown, (items: unknown[]) => unknown][] = [
  ["pending tags", schemas.ListPendingTasksRequestSchema, limits.tags, "tag", items => ({ tags: items })],
  ["list tags", schemas.ListTasksRequestSchema, limits.tags, "tag", items => ({ tags: items })],
  ...(["tags", "depends", "annotations"] as const).map(key => [
    `add ${key}`, schemas.AddTaskRequestSchema,
    key === "depends" ? limits.dependencies : limits[key],
    key === "depends" ? uuid : "text",
    (items: unknown[]) => ({ description: "test", [key]: items }),
  ] as [string, z.ZodType, number, unknown, (items: unknown[]) => unknown]),
  ...(["addTags", "removeTags", "addDepends", "removeDepends"] as const).map(key => [
    `modify ${key}`, schemas.ModifyTaskRequestSchema,
    key.endsWith("Tags") ? limits.tags : limits.dependencies,
    key.endsWith("Tags") ? "tag" : uuid,
    (items: unknown[]) => ({ uuid, [key]: items }),
  ] as [string, z.ZodType, number, unknown, (items: unknown[]) => unknown]),
  ["batch UUIDs", schemas.BatchModifyTasksRequestSchema, limits.batchTasks, uuid,
    items => ({ uuids: items, modifications: {} })],
  ...(["addTags", "removeTags"] as const).map(key => [
    `batch ${key}`, schemas.BatchModifyTasksRequestSchema, limits.tags, "tag",
    (items: unknown[]) => ({ uuids: [uuid], modifications: { [key]: items } }),
  ] as [string, z.ZodType, number, unknown, (items: unknown[]) => unknown]),
  ["project tasks", schemas.CreateProjectTreeRequestSchema, limits.projectTasks,
    { description: "child" }, items => ({ project_name: "test", project_description: "root", tasks: items })],
  ["project tags", schemas.CreateProjectTreeRequestSchema, limits.tags, "tag",
    items => ({ project_name: "test", project_description: "root", tasks: [{ description: "child", tags: items }] })],
  ["project dependency indices", schemas.CreateProjectTreeRequestSchema, limits.projectDependencies, 0,
    items => ({ project_name: "test", project_description: "root", tasks: [{ description: "child", depends_on_indices: items }] })],
];

describe("experimental request array limits", () => {
  for (const [name, schema, limit, value, input] of cases) {
    test(`${name}: accepts the boundary and rejects before reading oversized elements`, async () => {
      expect(schema.safeParse(input(Array(limit).fill(value))).success).toBe(true);
      expect(schema.safeParse(input([])).success).toBe(true);
      const oversized = new Array(limit + 1);
      // A getter is a deterministic sentinel: rejection must happen before any
      // element validation, not merely after accumulating all element errors.
      Object.defineProperty(oversized, "0", { get() { throw new Error("element visited"); } });
      for (const result of [schema.safeParse(input(oversized)), await schema.safeParseAsync(input(oversized))]) {
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toHaveLength(1);
          expect(result.error.issues[0].code).toBe("too_big");
        }
      }
    });
  }

  test("uncapped Zod 4 still visits every invalid element", () => {
    const result = z.array(z.string()).safeParse(Array(1000).fill(42));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1000);
  });

  test("existing exported tasks are not filtered by request tag limits", () => {
    const result = schemas.TaskWarriorTaskSchema.parse({
      id: 1, uuid, description: "existing", status: "pending", entry: "20261029T000000Z",
      tags: Array(limits.tags + 1).fill("tag"), custom_uda: "preserved",
    });
    expect(result.tags).toHaveLength(limits.tags + 1);
    expect(result.custom_uda).toBe("preserved");
  });

  test("UUID-shaped legacy identifiers retain Zod 3 acceptance", () => {
    const legacy = "11111111-1111-1111-1111-111111111111";
    expect(schemas.MarkTaskDoneRequestSchema.safeParse({ uuid: legacy }).success).toBe(true);
    expect(schemas.MarkTaskDoneRequestSchema.safeParse({ uuid: "invalid" }).success).toBe(false);
  });

  test("optional fields and defaults retain their public meaning", () => {
    expect(schemas.AddTaskRequestSchema.parse({ description: "test" })).toEqual({ description: "test" });
    expect(schemas.GetNextActionsRequestSchema.parse({})).toEqual({ include_blocked: false });
    expect(schemas.GetRecurringTasksRequestSchema.parse({})).toEqual({ frequency: "all", include_completed: false });
    expect(schemas.GetWaitingForRequestSchema.parse({})).toEqual({ group_by: "blocker" });
  });
});
