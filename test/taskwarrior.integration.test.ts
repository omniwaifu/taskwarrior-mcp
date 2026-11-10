import { startTaskHandler } from "../src/tools/startTask/handler.ts";
import { stopTaskHandler } from "../src/tools/stopTask/handler.ts";
import { markTaskDoneHandler } from "../src/tools/markTaskDone/handler.ts";
import { handleGetRecurringTasks } from "../src/tools/getRecurringTasks/handler.ts";
import { deleteTaskHandler } from "../src/tools/deleteTask/handler.ts";
import { handleCreateProjectTree } from "../src/tools/createProjectTree/handler.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addAnnotationHandler } from "../src/tools/addAnnotation/handler.ts";
import { handleAddDependency } from "../src/tools/addDependency/handler.ts";
import { handleAddTask } from "../src/tools/addTask/handler.ts";
import { handleBatchModifyTasks } from "../src/tools/batchModifyTasks/handler.ts";
import { handleGetBlockedTasks } from "../src/tools/getBlockedTasks/handler.ts";
import { handleGetNextActions } from "../src/tools/getNextActions/handler.ts";
import { handleGetProjectStatus } from "../src/tools/getProjectStatus/handler.ts";
import { handleGetSomedayMaybe } from "../src/tools/getSomedayMaybe/handler.ts";
import { handleGetWaitingFor } from "../src/tools/getWaitingFor/handler.ts";
import { handleWeeklyReview } from "../src/tools/weeklyReview/handler.ts";
import { handleListTasks } from "../src/tools/listTasks/handler.ts";
import { modifyTaskHandler } from "../src/tools/modifyTask/handler.ts";
import { removeAnnotationHandler } from "../src/tools/removeAnnotation/handler.ts";
import { handleRemoveDependency } from "../src/tools/removeDependency/handler.ts";
import {
  executeTaskWarriorCommandJson,
  executeTaskWarriorCommandRaw,
  getTaskByUuid,
} from "../src/utils/taskwarrior.ts";

interface TaskwarriorSandbox {
  tempDir: string;
  taskrc: string;
  previousTaskrc?: string;
  previousTaskBin?: string;
  previousTaskdata?: string;
}

const hasTaskwarrior =
  spawnSync("task", ["--version"], { stdio: "ignore" }).status === 0;

const integrationDescribe = hasTaskwarrior ? describe : describe.skip;

// Specifiers for the stdout-purity child process below, which receives its source as text.
const addTaskHandlerPath = new URL("../src/tools/addTask/handler.ts", import.meta.url).href;
const modifyTaskHandlerPath = new URL(
  "../src/tools/modifyTask/handler.ts",
  import.meta.url,
).href;

function createSandbox(): TaskwarriorSandbox {
  const tempDir = mkdtempSync(join(tmpdir(), "taskwarrior-mcp-"));
  const dataDir = join(tempDir, "data");
  const taskrc = join(tempDir, "taskrc");

  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    taskrc,
    [
      `data.location=${dataDir}`,
      "confirmation=no",
      "verbose=nothing",
      "json.array=on",
      "hooks=off",
      "",
    ].join("\n"),
  );

  return {
    tempDir,
    taskrc,
    previousTaskrc: process.env.TASKRC,
    previousTaskBin: process.env.TASK_BIN,
    previousTaskdata: process.env.TASKDATA,
  };
}

function restoreSandbox(sandbox: TaskwarriorSandbox): void {
  if (sandbox.previousTaskdata === undefined) delete process.env.TASKDATA;
  else process.env.TASKDATA = sandbox.previousTaskdata;
  if (sandbox.previousTaskrc === undefined) {
    delete process.env.TASKRC;
  } else {
    process.env.TASKRC = sandbox.previousTaskrc;
  }

  if (sandbox.previousTaskBin === undefined) {
    delete process.env.TASK_BIN;
  } else {
    process.env.TASK_BIN = sandbox.previousTaskBin;
  }

  rmSync(sandbox.tempDir, { recursive: true, force: true });
}

integrationDescribe("TaskWarrior integration", () => {
  let sandbox: TaskwarriorSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
    process.env.TASKRC = sandbox.taskrc;
    process.env.TASKDATA = join(sandbox.tempDir, "data");
    delete process.env.TASK_BIN;
  });

  afterEach(() => {
    restoreSandbox(sandbox);
  });

  test("adds tasks without splitting spaced project names", async () => {
    const createdTask = await handleAddTask({
      description: "Task one",
      project: "My Project",
    });

    expect(createdTask.description).toBe("Task one");
    expect(createdTask.project).toBe("My Project");

    const listedTasks = await handleListTasks({ project: "My Project" });
    expect(listedTasks.map((task) => task.uuid)).toContain(createdTask.uuid);
  });

  test("returns distinct tasks when the same description is added twice", async () => {
    const firstTask = await handleAddTask({ description: "Repeated task" });
    const secondTask = await handleAddTask({ description: "Repeated task" });

    expect(firstTask.uuid).not.toBe(secondTask.uuid);
  });

  test("modifies tasks with spaced project names and apostrophes intact", async () => {
    const createdTask = await handleAddTask({
      description: "Initial task",
    });

    const result = await modifyTaskHandler({
      uuid: createdTask.uuid,
      description: "O'Brien's revised task",
      project: "Deep Work Board",
    });

    expect(result.status).toBe("success");

    const updatedTask = await getTaskByUuid(createdTask.uuid);
    expect(updatedTask.description).toBe("O'Brien's revised task");
    expect(updatedTask.project).toBe("Deep Work Board");
  });

  test("adds and removes annotations containing apostrophes", async () => {
    const createdTask = await handleAddTask({
      description: "Annotate me",
    });
    const annotation = "Bob's note";

    const addResult = await addAnnotationHandler({
      uuid: createdTask.uuid,
      annotation,
    });

    expect(addResult.status).toBe("success");

    let updatedTask = await getTaskByUuid(createdTask.uuid);
    expect(
      updatedTask.annotations?.some(
        (existingAnnotation) => existingAnnotation.description === annotation,
      ),
    ).toBe(true);

    const removeResult = await removeAnnotationHandler({
      uuid: createdTask.uuid,
      annotation,
    });

    expect(removeResult.status).toBe("success");

    updatedTask = await getTaskByUuid(createdTask.uuid);
    expect(
      updatedTask.annotations?.some(
        (existingAnnotation) => existingAnnotation.description === annotation,
      ) ?? false,
    ).toBe(false);
  });

  test("adds dependencies without overwriting existing ones", async () => {
    const blockedTask = await handleAddTask({ description: "Blocked task" });
    const blockerA = await handleAddTask({ description: "Blocker A" });
    const blockerB = await handleAddTask({ description: "Blocker B" });

    await handleAddDependency({
      task_uuid: blockedTask.uuid,
      depends_on_uuid: blockerA.uuid,
    });

    const updatedTask = await handleAddDependency({
      task_uuid: blockedTask.uuid,
      depends_on_uuid: blockerB.uuid,
    });

    expect((updatedTask.depends || []).sort()).toEqual(
      [blockerA.uuid, blockerB.uuid].sort(),
    );
  });

  test("reconciles addDepends and removeDepends in one modify operation", async () => {
    const blockerA = await handleAddTask({ description: "Blocker A" });
    const blockerB = await handleAddTask({ description: "Blocker B" });
    const blockerC = await handleAddTask({ description: "Blocker C" });
    const blockedTask = await handleAddTask({
      description: "Blocked task",
      depends: [blockerA.uuid, blockerB.uuid],
    });

    const result = await modifyTaskHandler({
      uuid: blockedTask.uuid,
      addDepends: [blockerC.uuid],
      removeDepends: [blockerA.uuid],
    });

    expect(result.status).toBe("success");

    const updatedTask = await getTaskByUuid(blockedTask.uuid);
    expect((updatedTask.depends || []).sort()).toEqual(
      [blockerB.uuid, blockerC.uuid].sort(),
    );
  });

  test("preserves existing dependencies when adding a self-dependency fails", async () => {
    const blocker = await handleAddTask({ description: "Existing blocker" });
    const blocked = await handleAddTask({
      description: "Blocked task",
      depends: [blocker.uuid],
    });

    await expect(handleAddDependency({
      task_uuid: blocked.uuid,
      depends_on_uuid: blocked.uuid,
    })).rejects.toThrow();

    const unchanged = await getTaskByUuid(blocked.uuid);
    expect(unchanged.depends).toEqual([blocker.uuid]);
  });

  test("removes only the requested dependency", async () => {
    const blockerA = await handleAddTask({ description: "Blocker A" });
    const blockerB = await handleAddTask({ description: "Blocker B" });
    const blockedTask = await handleAddTask({
      description: "Blocked task",
      depends: [blockerA.uuid, blockerB.uuid],
    });

    const updatedTask = await handleRemoveDependency({
      task_uuid: blockedTask.uuid,
      depends_on_uuid: blockerA.uuid,
    });

    expect(updatedTask.depends).toEqual([blockerB.uuid]);
  });

  test("removes the final dependency", async () => {
    const blocker = await handleAddTask({ description: "Final blocker" });
    const blocked = await handleAddTask({
      description: "Blocked task",
      depends: [blocker.uuid],
    });

    const updated = await handleRemoveDependency({
      task_uuid: blocked.uuid,
      depends_on_uuid: blocker.uuid,
    });

    expect(updated.depends || []).toEqual([]);
  });

  test("keeps the description intact when adding a hyphenated tag", async () => {
    const createdTask = await handleAddTask({
      description: "Write the quarterly report",
      tags: ["high-priority", "home"],
    });

    expect(createdTask.description).toBe("Write the quarterly report");
    expect((createdTask.tags || []).sort()).toEqual(["high-priority", "home"]);
  });

  test("modifies tags without overwriting the description or existing tags", async () => {
    const createdTask = await handleAddTask({
      description: "Review the release notes",
      tags: ["inbox", "work"],
    });

    const result = await modifyTaskHandler({
      uuid: createdTask.uuid,
      addTags: ["needs-review"],
      removeTags: ["inbox"],
    });

    expect(result.status).toBe("success");

    const updatedTask = await getTaskByUuid(createdTask.uuid);
    expect(updatedTask.description).toBe("Review the release notes");
    expect((updatedTask.tags || []).sort()).toEqual(["needs-review", "work"]);
  });

  test("filters tasks by a hyphenated tag", async () => {
    const taggedTask = await handleAddTask({
      description: "Tagged task",
      tags: ["high-priority"],
    });
    await handleAddTask({ description: "Untagged task" });

    const listedTasks = await handleListTasks({ tags: ["high-priority"] });
    expect(listedTasks.map((task) => task.uuid)).toEqual([taggedTask.uuid]);
  });

  test("batch tag changes preserve descriptions and untouched tags", async () => {
    const firstTask = await handleAddTask({
      description: "First batch task",
      tags: ["inbox", "work"],
    });
    const secondTask = await handleAddTask({
      description: "Second batch task",
      tags: ["inbox"],
    });

    await handleBatchModifyTasks({
      uuids: [firstTask.uuid, secondTask.uuid],
      modifications: { addTags: ["needs-review"], removeTags: ["inbox"] },
    });

    const updatedFirst = await getTaskByUuid(firstTask.uuid);
    const updatedSecond = await getTaskByUuid(secondTask.uuid);

    expect(updatedFirst.description).toBe("First batch task");
    expect((updatedFirst.tags || []).sort()).toEqual(["needs-review", "work"]);
    expect(updatedSecond.description).toBe("Second batch task");
    expect(updatedSecond.tags).toEqual(["needs-review"]);
  });

  test("weekly review and task insights recognize compact overdue dates", async () => {
    const overdue = await handleAddTask({ description: "Overdue task", due: "2000-01-01" });
    await handleAddTask({ description: "Future task", due: "2099-01-01" });

    expect(overdue.due).toMatch(/^20000101T\d{6}Z$/);
    const review = await handleWeeklyReview();
    expect(review.groups?.overdue).toEqual([overdue]);
    expect(review.insights?.summary).toContain("1 overdue");

    const next = await handleGetNextActions({});
    expect(next.insights?.recommendations).toContain("1 tasks are overdue");
  });

  test("waiting reports include deferred tasks and exclude expired waits", async () => {
    const waiting = await handleAddTask({
      description: "Deferred task", project: "Deferred", wait: "2099-01-01",
    });
    await handleAddTask({ description: "Expired wait", wait: "2000-01-01" });
    await handleAddTask({ description: "Ready task" });

    const response = await handleGetWaitingFor({ group_by: "project" });
    expect(response.tasks).toEqual([waiting]);
    expect(response.groups?.Deferred).toEqual([waiting]);
    expect(response.metadata.waiting).toBe(1);

    const review = await handleWeeklyReview();
    expect(review.groups?.waiting).toEqual([waiting]);
    expect(review.groups?.projects_without_next_actions).toContain("Deferred");
    expect(review.metadata).toMatchObject({ total: 3, waiting: 1, actionable: 2 });
  });

  test("next actions and project status exclude future waits and count them", async () => {
    await handleAddTask({ description: "Deferred", project: "Deferred", wait: "2099-01-01" });
    const ready = await handleAddTask({ description: "Ready", wait: "2000-01-01" });

    const next = await handleGetNextActions({});
    expect(next.tasks).toEqual([ready]);
    expect(next.metadata).toMatchObject({ total: 2, actionable: 1, waiting: 1 });

    const project = await handleGetProjectStatus({ project: "Deferred" });
    expect(project.tasks).toEqual([]);
    expect(project.metadata.actionable).toBe(0);
  });

  test("blocked reports optionally include waiting tasks within the project filter", async () => {
    const waiting = await handleAddTask({
      description: "Deferred", project: "Selected", wait: "2099-01-01",
    });
    await handleAddTask({ description: "Other deferred", project: "Other", wait: "2099-01-01" });
    const withoutWaiting = await handleGetBlockedTasks({ project: "Selected" });
    expect(withoutWaiting.tasks).toEqual([]);
    expect(withoutWaiting.metadata).toMatchObject({ total: 0, blocked: 0, actionable: 0 });
    const blocked = await handleGetBlockedTasks({ project: "Selected", include_waiting: true });
    expect(blocked.tasks).toEqual([waiting]);
    expect(blocked.metadata).toMatchObject({ total: 1, blocked: 1, actionable: 0 });
  });

  test("counts a task that is both blocked and waiting only once", async () => {
    const blocker = await handleAddTask({ description: "Blocker" });
    const waiting = await handleAddTask({
      description: "Blocked and deferred", wait: "2099-01-01", depends: [blocker.uuid],
    });
    const blocked = await handleGetBlockedTasks({ include_waiting: true });
    expect(blocked.tasks).toEqual([waiting]);
    expect(blocked.metadata).toMatchObject({ total: 2, blocked: 1, actionable: 1 });
  });

  test("activity reports use compact modified and completion dates", async () => {
    const fixture = join(sandbox.tempDir, "activity.json");
    const oldDate = "20000101T000000Z";
    const recentDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const tasks = [
      { description: "Old project", project: "Stale", status: "pending", modified: oldDate },
      { description: "Old pending", project: "Fresh", status: "pending", modified: oldDate },
      { description: "Recently completed", project: "Fresh", status: "completed", modified: oldDate, end: recentDate },
      { description: "Old someday", tags: ["someday"], status: "pending", modified: oldDate },
      { description: "Recent someday", tags: ["someday"], status: "pending", modified: recentDate },
    ].map(task => ({ uuid: randomUUID(), entry: oldDate, ...task }));
    writeFileSync(fixture, JSON.stringify(tasks));
    await executeTaskWarriorCommandRaw(["import", fixture]);

    const review = await handleWeeklyReview();
    expect(review.groups?.stalled_projects).toEqual(["Stale"]);
    const staleProject = await handleGetProjectStatus({ project: "Stale" });
    expect(staleProject.insights?.recommendations?.some(item => item.includes("Stale project"))).toBe(true);
    const freshProject = await handleGetProjectStatus({ project: "Fresh" });
    expect(freshProject.insights?.recommendations?.some(item => item.includes("Stale project"))).toBe(false);

    const someday = await handleGetSomedayMaybe({});
    expect(someday.tasks.map(task => task.description)).toEqual(["Recent someday", "Old someday"]);
    expect(someday.insights?.recommendations).toContain("⚠️ 1 items not reviewed in 90+ days");
  });

  test("keeps stdout free of diagnostics so the stdio transport stays parseable", () => {
    // Runs in a child process because Bun's console.log writes straight to fd 1 and would
    // bypass an in-process process.stdout.write patch.
    const script = [
      `const { handleAddTask } = await import(${JSON.stringify(addTaskHandlerPath)});`,
      `const { modifyTaskHandler } = await import(${JSON.stringify(modifyTaskHandlerPath)});`,
      `const task = await handleAddTask({ description: "Quiet task" });`,
      `await modifyTaskHandler({ uuid: task.uuid, addTags: ["quiet-tag"] });`,
    ].join("\n");

    const child = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      env: { ...process.env, TASKRC: sandbox.taskrc },
    });

    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
  });

  test("surfaces taskwarrior infrastructure errors instead of returning an empty list", async () => {
    await expect(
      executeTaskWarriorCommandJson([
        "rc.data.location=/proc/does-not-exist/task-data",
        "export",
      ]),
    ).rejects.toThrow();
  });
  test("GTD attributes preserve the description on a fresh configuration", async () => {
    const task = await handleAddTask({ description: "Keep this description", context: "@home", energy: "H" });
    expect(task).toMatchObject({ description: "Keep this description", context: "@home", energy: "H" });
    expect((await handleGetNextActions({ context: "@home", energy_level: "high" })).tasks).toEqual([task]);
    const modified = await modifyTaskHandler({ uuid: task.uuid, context: "@work", energy: "L" });
    expect(modified.status).toBe("success");
    expect(await getTaskByUuid(task.uuid)).toMatchObject({ description: task.description, context: "@work", energy: "L" });
  });

  test("deletion confirms deleted status and does not mistake retained history for failure", async () => {
    const task = await handleAddTask({ description: "Disposable" });
    const deleted = await deleteTaskHandler({ uuid: task.uuid, skipConfirmation: true });
    expect(deleted.status).toBe("success");
    expect((await getTaskByUuid(task.uuid)).status).toBe("deleted");
  });

  test("project trees work in quiet mode and use a separate hierarchy attribute", async () => {
    const tree = await handleCreateProjectTree({ project_name: "Tree", project_description: "Root", tasks: [
      { description: "First", context: "@home" }, { description: "Second", depends_on_indices: [0] },
    ] });
    expect(tree.status).toBe("success");
    expect(tree.tasks).toHaveLength(2);
    const tasks = await handleListTasks({ project: "Tree" });
    const first = tasks.find(task => task.description === "First")!;
    const second = tasks.find(task => task.description === "Second")!;
    expect(first.mcp_parent).toBe(tree.project_uuid);
    expect(first.parent).toBeUndefined();
    expect(second.depends).toEqual([first.uuid]);
    expect((await handleGetNextActions({})).tasks).toEqual([first]);
  });

  test("project graph errors are rejected before any writes", async () => {
    for (const dependencies of [[[0]], [[1], [0]], [[3]]] as number[][][]) {
      await expect(handleCreateProjectTree({ project_name: "Invalid", project_description: "Root", tasks: dependencies.map((depends_on_indices, i) => ({ description: String(i), depends_on_indices })) })).rejects.toThrow();
      expect(await handleListTasks({})).toEqual([]);
    }
  });

  test("export preserves Unicode and custom priority values", async () => {
    await executeTaskWarriorCommandRaw(["add", "description:Unicode", "project:研究", "tags:café"]);
    expect((await handleListTasks({}))[0]).toMatchObject({ project: "研究", tags: ["café"] });
  });

  test("clears dates and GTD attributes explicitly, including batch changes", async () => {
    const task = await handleAddTask({ description: "Clear me", due: "2099-01-01", scheduled: "2099-01-01", context: "@home", energy: "H" });
    expect((await modifyTaskHandler({ uuid: task.uuid, due: "", scheduled: "", context: "", energy: "" })).status).toBe("success");
    const cleared = await getTaskByUuid(task.uuid);
    for (const field of ["due", "scheduled", "context", "energy"]) expect(cleared[field]).toBeUndefined();
    await handleBatchModifyTasks({ uuids: [task.uuid], modifications: { due: "2099-01-01" } });
    await handleBatchModifyTasks({ uuids: [task.uuid], modifications: { due: "" } });
    expect((await getTaskByUuid(task.uuid)).due).toBeUndefined();
  });

  test("failed dependency changes do not partially apply other modifications", async () => {
    const task = await handleAddTask({ description: "Original" });
    expect((await modifyTaskHandler({ uuid: task.uuid, description: "Changed", addDepends: [task.uuid] })).status).toBe("error");
    expect((await getTaskByUuid(task.uuid)).description).toBe("Original");
  });

  test("reports consistently exclude scheduled, someday, root, and blocked tasks", async () => {
    const ready = await handleAddTask({ description: "Ready", project: "Actions" });
    await handleAddTask({ description: "Later", project: "Actions", scheduled: "2099-01-01" });
    await handleAddTask({ description: "Someday", project: "Actions", tags: ["someday"] });
    await handleAddTask({ description: "Root", project: "Actions", tags: ["project_root"] });
    await handleAddTask({ description: "Blocked", project: "Actions", depends: [ready.uuid] });
    expect((await handleGetNextActions({})).tasks.map(task => (task as { uuid: string }).uuid)).toEqual([ready.uuid]);
    expect((await handleGetProjectStatus({ project: "Actions" })).tasks.map(task => (task as { uuid: string }).uuid)).toEqual([ready.uuid]);
    expect((await handleWeeklyReview()).metadata.actionable).toBe(1);
  });

  test("grouping supports names inherited by ordinary objects", async () => {
    const someday = await handleAddTask({ description: "Someday", project: "constructor", tags: ["someday"] });
    const waiting = await handleAddTask({ description: "Waiting", project: "__proto__", wait: "2099-01-01" });
    expect((await handleGetSomedayMaybe({})).groups?.constructor).toEqual([someday]);
    expect((await handleGetWaitingFor({ group_by: "project" })).groups?.__proto__).toEqual([waiting]);
  });

  test("nonexistent tasks fail batch operations instead of reporting success", async () => {
    const result = await handleBatchModifyTasks({ uuids: [randomUUID()], modifications: { project: "Missing" } });
    expect(result.status).toBe("error");
    expect(result.metadata.actionable).toBe(0);
  });

  test("completed dependencies stop blocking reports even when their UUIDs remain stored", async () => {
    const blocker = await handleAddTask({ description: "Blocker" });
    const dependent = await handleAddTask({ description: "Dependent", project: "DependencyStatus", depends: [blocker.uuid] });
    await executeTaskWarriorCommandRaw([blocker.uuid, "done"]);
    expect((await getTaskByUuid(dependent.uuid)).depends).toContain(blocker.uuid);
    expect((await handleGetNextActions({})).tasks.map(task => (task as { uuid: string }).uuid)).toContain(dependent.uuid);
    expect((await handleGetBlockedTasks({})).tasks).toEqual([]);
    expect((await handleGetProjectStatus({ project: "DependencyStatus" })).metadata.actionable).toBe(1);
    expect((await handleWeeklyReview()).metadata.actionable).toBe(1);
  });

  test("new recurring tasks report the template even when export generates instances", async () => {
    const habit = await handleAddTask({ description: "Daily habit", due: "tomorrow", recur: "daily" });
    expect(habit.status).toBe("recurring");
    const report = await handleGetRecurringTasks({ frequency: "all", include_completed: false });
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]).toMatchObject({ uuid: habit.uuid, habit_stats: { evaluated_instances: 0, current_streak: 0 } });
    expect(report.insights?.recommendations?.some(line => line.includes("broken streaks"))).not.toBe(true);
    expect((await handleWeeklyReview()).groups?.habits_with_broken_streaks).toEqual([]);
  });

  test("include_completed includes historical templates rather than completed child instances", async () => {
    const templateUuid = randomUUID();
    const instanceUuid = randomUUID();
    const fixture = join(sandbox.tempDir, "history.json");
    writeFileSync(fixture, JSON.stringify([
      { uuid: templateUuid, description: "Completed habit", status: "completed", entry: "20200101T000000Z", end: "20200103T000000Z", due: "20200101T000000Z", recur: "daily" },
      { uuid: instanceUuid, description: "Completed occurrence", status: "completed", entry: "20200101T000000Z", end: "20200101T010000Z", due: "20200101T000000Z", parent: templateUuid },
    ]));
    await executeTaskWarriorCommandRaw(["import", fixture]);
    expect((await handleGetRecurringTasks({ frequency: "all", include_completed: false })).tasks).toEqual([]);
    const included = await handleGetRecurringTasks({ frequency: "all", include_completed: true });
    expect(included.tasks).toHaveLength(1);
    expect(included.tasks[0]).toMatchObject({ uuid: templateUuid, habit_stats: { completed_count: 1, completion_rate: 100 } });
  });

  test("project failures return the root UUID and previously completed work", async () => {
    // Respect user-specified UDA value constraints, even with command-local type definitions.
    const original = await Bun.file(sandbox.taskrc).text();
    writeFileSync(sandbox.taskrc, original + "uda.context.values=@home\n");
    const result = await handleCreateProjectTree({ project_name: "Partial", project_description: "Root", tasks: [{ description: "First" }, { description: "Rejected", context: "@unsupported" }] });
    expect(result.status).toBe("error");
    expect(result.project_uuid).toBeDefined();
    expect(result.tasks).toHaveLength(1);
    expect((await handleListTasks({ project: "Partial" })).map(task => task.description).sort()).toEqual(["First", "Root"]);
  });

  test("starting, stopping, and completing are idempotent and verify the resulting state", async () => {
    const task = await handleAddTask({ description: "Lifecycle" });
    expect((await startTaskHandler({ uuid: task.uuid })).status).toBe("success");
    const start = (await getTaskByUuid(task.uuid)).start;
    expect(start).toBeDefined();
    expect((await startTaskHandler({ uuid: task.uuid })).status).toBe("success");
    expect((await getTaskByUuid(task.uuid)).start).toBe(start);
    expect((await stopTaskHandler({ uuid: task.uuid })).status).toBe("success");
    expect((await stopTaskHandler({ uuid: task.uuid })).status).toBe("success");
    expect((await getTaskByUuid(task.uuid)).start).toBeUndefined();
    expect((await markTaskDoneHandler({ uuid: task.uuid })).status).toBe("success");
    expect((await markTaskDoneHandler({ uuid: task.uuid })).status).toBe("success");
    expect((await getTaskByUuid(task.uuid)).status).toBe("completed");
  });

  test("annotation contents stay literal, including newlines and attribute-like text", async () => {
    const task = await handleAddTask({ description: "Unchanged" });
    const annotation = "project:other\nsecond line";
    expect((await addAnnotationHandler({ uuid: task.uuid, annotation })).status).toBe("success");
    const annotated = await getTaskByUuid(task.uuid);
    expect(annotated.description).toBe("Unchanged");
    expect(annotated.project).toBeUndefined();
    expect(annotated.annotations?.some(note => note.description === annotation)).toBe(true);
    expect((await removeAnnotationHandler({ uuid: task.uuid, annotation })).status).toBe("success");
    expect((await getTaskByUuid(task.uuid)).annotations ?? []).toEqual([]);
  });

});
