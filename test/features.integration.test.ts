import { handleCreateProjectTree } from "../src/tools/createProjectTree/handler.ts";
import { handleQueryTasks } from "../src/tools/queryTasks/handler.ts";
import { handleGetTaskTree } from "../src/tools/getTaskTree/handler.ts";
import { handleProcessInbox } from "../src/tools/processInbox/handler.ts";
import { inspectEnvironment } from "../src/utils/diagnostics.ts";
import { executeTaskWarriorCommandRaw } from "../src/utils/taskwarrior.ts";
import { beforeEach, afterEach, describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { handleQuickCapture } from "../src/tools/quickCapture/handler.ts";
import { handleProcessInboxItem } from "../src/tools/processInboxItem/handler.ts";
import { handleAddTask } from "../src/tools/addTask/handler.ts";
import { modifyTask } from "../src/tools/modifyTask/handler.ts";
import { handleGetNextActions } from "../src/tools/getNextActions/handler.ts";
import { handleGetWaitingFor } from "../src/tools/getWaitingFor/handler.ts";
import { handleWeeklyReview } from "../src/tools/weeklyReview/handler.ts";
import { getTaskByUuid } from "../src/utils/taskwarrior.ts";
import { handleBatchModifyTasks } from "../src/tools/batchModifyTasks/handler.ts";
import { AddTaskRequestSchema, ModifyTaskRequestSchema, BatchModifyTasksRequestSchema } from "../src/types/task.ts";

const available = spawnSync("task", ["--version"], { stdio: "ignore" }).status === 0;
(available ? describe : describe.skip)("GTD feature workflows", () => {
  let directory: string;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tw-features-"));
    mkdirSync(join(directory, "data"));
    writeFileSync(join(directory, "taskrc"), `data.location=${directory}/data\nconfirmation=no\nverbose=nothing\njson.array=on\nhooks=off\n`);
    saved = { TASKRC: process.env.TASKRC, TASKDATA: process.env.TASKDATA, TASK_BIN: process.env.TASK_BIN };
    process.env.TASKRC = join(directory, "taskrc");
    process.env.TASKDATA = join(directory, "data");
    process.env.TASK_BIN = "task";
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });

  test("capture then clarify makes a concrete next action, retaining unrelated tags", async () => {
    const captured = await handleQuickCapture({ description: "Think about proposal" });
    expect(captured.tags).toEqual(["inbox"]);
    expect((await handleGetNextActions({})).tasks).toEqual([]);
    await modifyTask({ uuid: captured.uuid, addTags: ["client"] });
    const result = await handleProcessInboxItem({ uuid: captured.uuid, action: "next_action", description: "Draft proposal outline", estimated_minutes: 15, context: "@work", note: "Use last year's template" });
    expect(result.status).toBe("success");
    const updated = await getTaskByUuid(captured.uuid);
    expect(updated).toMatchObject({ description: "Draft proposal outline", tags: ["client"], estimated_minutes: 15 });
    expect(updated.annotations?.[0].description).toBe("Use last year's template");
    expect((await handleGetNextActions({ max_minutes: 15 })).tasks).toHaveLength(1);
    expect((await handleGetNextActions({ max_minutes: 5 })).tasks).toEqual([]);
  });

  test("estimates can be set, cleared, and unknown estimates require an explicit opt-in", async () => {
    const task = await handleAddTask({ description: "Estimated", estimated_minutes: 0 });
    expect(task.estimated_minutes).toBe(0);
    expect((await handleGetNextActions({ time_available: "5min" })).tasks).toHaveLength(1);
    await modifyTask({ uuid: task.uuid, estimated_minutes: null });
    expect((await getTaskByUuid(task.uuid)).estimated_minutes).toBeUndefined();
    expect((await handleGetNextActions({ time_available: "5min" })).tasks).toEqual([]);
    expect((await handleGetNextActions({ time_available: "5min", include_unestimated: true })).tasks).toHaveLength(1);
  });

  test("delegation remains waiting after the follow-up date, until explicitly resolved", async () => {
    const captured = await handleQuickCapture({ description: "Await approval" });
    await expect(handleProcessInboxItem({ uuid: captured.uuid, action: "waiting" })).rejects.toThrow("waiting_for");
    expect((await getTaskByUuid(captured.uuid)).tags).toContain("inbox");
    await handleProcessInboxItem({ uuid: captured.uuid, action: "waiting", waiting_for: "Alex", follow_up: "2000-01-01" });
    expect((await handleGetNextActions({})).tasks).toEqual([]);
    const waiting = await handleGetWaitingFor({ group_by: "blocker", follow_up_due: true });
    expect(waiting.groups?.Alex).toHaveLength(1);
    expect((await handleWeeklyReview()).groups?.follow_ups_due).toHaveLength(1);
    await handleProcessInboxItem({ uuid: captured.uuid, action: "next_action" });
    expect((await handleGetWaitingFor({})).tasks).toEqual([]);
    expect((await handleGetNextActions({})).tasks).toHaveLength(1);
  });

  test("someday, reference, and project decisions remove inbox without becoming next actions", async () => {
    for (const action of ["someday", "reference", "project"] as const) {
      const task = await handleQuickCapture({ description: action });
      await handleProcessInboxItem({ uuid: task.uuid, action, project: "Ideas" });
      expect((await getTaskByUuid(task.uuid)).tags).toContain(action === "project" ? "project_root" : action);
      expect((await getTaskByUuid(task.uuid)).tags).not.toContain("inbox");
    }
    expect((await handleGetNextActions({})).tasks).toEqual([]);
  });

  test("Unicode projects/tags round-trip and priority and project parent can be cleared", async () => {
    const parent = await handleAddTask({ description: "Parent" });
    const input = AddTaskRequestSchema.parse({ description: "休憩", project: "研究.計画", tags: ["café", "東京"], priority: "H", parent: parent.uuid });
    const task = await handleAddTask(input);
    expect(task).toMatchObject({ description: "休憩", project: "研究.計画", tags: ["café", "東京"], mcp_parent: parent.uuid });
    const updated = await modifyTask(ModifyTaskRequestSchema.parse({ uuid: task.uuid, priority: "", parent: "" }));
    expect(updated.priority).toBeUndefined();
    expect(updated.mcp_parent).toBeUndefined();
  });
  test("queries page deterministically and reject stale or mismatched cursors", async () => {
    for (const description of ["Gamma", "Alpha", "Beta"]) await handleAddTask({ description, project: "Paged" });
    const first = await handleQueryTasks({ project: "Paged", sort_by: "description", limit: 2 });
    expect(first.tasks.map(task => task.description)).toEqual(["Alpha", "Beta"]);
    expect(first.page).toMatchObject({ total: 3, returned: 2, has_more: true });
    const second = await handleQueryTasks({ project: "Paged", sort_by: "description", limit: 2, cursor: first.page.next_cursor });
    expect(second.tasks.map(task => task.description)).toEqual(["Gamma"]);
    expect(second.page.has_more).toBe(false);
    await expect(handleQueryTasks({ project: "Different", sort_by: "description", cursor: first.page.next_cursor })).rejects.toThrow();
    await handleAddTask({ description: "Delta", project: "Paged" });
    await expect(handleQueryTasks({ project: "Paged", sort_by: "description", cursor: first.page.next_cursor })).rejects.toThrow("changed");
    await expect(handleQueryTasks({ cursor: "not-a-cursor" })).rejects.toThrow("Invalid cursor");
  });

  test("query filters include active state, explicit delegation, Unicode, and dependency status", async () => {
    const blocker = await handleAddTask({ description: "Blocker" });
    const dependent = await handleAddTask({ description: "Dependent", project: "研究", tags: ["café"], context: "@work", depends: [blocker.uuid] });
    expect((await handleQueryTasks({ project: "研究", tags: ["café"], blocked: true, context: "@work" })).tasks[0].uuid).toBe(dependent.uuid);
    await executeTaskWarriorCommandRaw([blocker.uuid, "done"]);
    expect((await handleQueryTasks({ project: "研究", blocked: true })).tasks).toEqual([]);
    await executeTaskWarriorCommandRaw([dependent.uuid, "start"]);
    expect((await handleQueryTasks({ active: true })).tasks.map(task => task.uuid)).toEqual([dependent.uuid]);
  });

  test("inbox and next-action pagination preserve totals while limiting returned tasks", async () => {
    for (const description of ["One", "Two", "Three"]) await handleQuickCapture({ description });
    const inbox = await handleProcessInbox({ limit: 1 });
    expect(inbox.tasks).toHaveLength(1);
    expect(inbox.page).toMatchObject({ total: 3, returned: 1, has_more: true });
    expect((await handleProcessInbox({ limit: 1, cursor: inbox.page!.next_cursor })).tasks).not.toEqual(inbox.tasks);
    for (const description of ["Ready one", "Ready two"]) await handleAddTask({ description });
    const next = await handleGetNextActions({ limit: 1 });
    expect(next.tasks).toHaveLength(1);
    expect(next.metadata.actionable).toBe(2);
    expect(next.page?.total).toBe(2);
  });

  test("tree navigation follows project parents, exposes blockers, and reports truncation", async () => {
    const root = await handleAddTask({ description: "Root", project: "Tree", tags: ["project_root"] });
    const child = await handleAddTask({ description: "Child", project: "Tree", parent: root.uuid });
    const grandchild = await handleAddTask({ description: "Grandchild", project: "Tree", parent: child.uuid, depends: [child.uuid] });
    const tree = await handleGetTaskTree({ uuid: root.uuid });
    expect(tree.nodes.map(node => node.depth)).toEqual([0, 1, 2]);
    expect(tree.nodes[2]).toMatchObject({ task: { uuid: grandchild.uuid }, blocked_by: [child.uuid] });
    const shallow = await handleGetTaskTree({ uuid: root.uuid, depth: 1 });
    expect(shallow.nodes).toHaveLength(2);
    expect(shallow.metadata.truncated).toBe(true);
    expect((await handleGetTaskTree({ project: "Tree", max_nodes: 1 })).metadata.truncated).toBe(true);
    await expect(handleGetTaskTree({})).rejects.toThrow("Specify");
    expect((await handleGetTaskTree({ project: "Missing" })).nodes).toEqual([]);
  });

  test("tree reading reports preexisting cycles instead of recursing forever", async () => {
    const a = await handleAddTask({ description: "A", project: "Cycle" });
    const b = await handleAddTask({ description: "B", project: "Cycle", parent: a.uuid });
    await executeTaskWarriorCommandRaw(["rc.uda.mcp_parent.type=string", a.uuid, "modify", `mcp_parent:${b.uuid}`]);
    const tree = await handleGetTaskTree({ project: "Cycle" });
    expect(tree.nodes).toHaveLength(2);
    expect(tree.warnings.some(warning => warning.includes("cycle"))).toBe(true);
  });

  test("priority sorting follows configured order and batch edits share individual fields", async () => {
    const parent = await handleAddTask({ description: "Parent", priority: "L" });
    const high = await handleAddTask({ description: "High", priority: "H" });
    await handleAddTask({ description: "Medium", priority: "M" });
    expect((await handleQueryTasks({ sort_by: "priority" })).tasks.map(task => task.priority)).toEqual(["H", "M", "L"]);
    const update = BatchModifyTasksRequestSchema.parse({ uuids: [high.uuid], modifications: { parent: parent.uuid, addDepends: [parent.uuid], estimated_minutes: 10 } });
    expect((await handleBatchModifyTasks(update)).status).toBe("success");
    expect(await getTaskByUuid(high.uuid)).toMatchObject({ mcp_parent: parent.uuid, depends: [parent.uuid], estimated_minutes: 10 });
    expect((await handleBatchModifyTasks({ uuids: [high.uuid], modifications: { parent: "", removeDepends: [parent.uuid], estimated_minutes: null } })).status).toBe("success");
    const cleared = await getTaskByUuid(high.uuid);
    expect(cleared.mcp_parent).toBeUndefined();
    expect(cleared.depends ?? []).toEqual([]);
    expect(cleared.estimated_minutes).toBeUndefined();
  });

  test("project summaries respect scheduling, delegation, reference, and someday classification", async () => {
    const project = await handleCreateProjectTree({ project_name: "Launch", project_description: "Launch", tasks: [
      { description: "Future", scheduled: "2099-01-01" },
      { description: "Delegated", waiting_for: "Alex" },
      { description: "Ready", estimated_minutes: 5 },
      { description: "Blocked", depends_on_indices: [2] },
    ] });
    expect(project.metadata.actionable).toBe(1);
    await handleAddTask({ description: "Reference", project: "Library", tags: ["reference"] });
    await handleAddTask({ description: "Maybe", project: "Later", tags: ["someday"] });
    expect((await handleWeeklyReview()).groups?.projects_without_next_actions).toEqual([]);
  });

  test("server diagnostics identify a missing binary without modifying tasks", async () => {
    expect((await inspectEnvironment()).status).toBe("success");
    process.env.TASK_BIN = join(directory, "missing-task");
    const report = await inspectEnvironment();
    expect(report.status).toBe("error");
    expect(report.checks.find(check => check.name === "taskwarrior")?.message).toContain("TASK_BIN");
  });

});
