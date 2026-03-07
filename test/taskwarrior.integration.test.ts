import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addAnnotationHandler } from "../src/tools/addAnnotation/handler.ts";
import { handleAddDependency } from "../src/tools/addDependency/handler.ts";
import { handleAddTask } from "../src/tools/addTask/handler.ts";
import { handleListTasks } from "../src/tools/listTasks/handler.ts";
import { modifyTaskHandler } from "../src/tools/modifyTask/handler.ts";
import { removeAnnotationHandler } from "../src/tools/removeAnnotation/handler.ts";
import { handleRemoveDependency } from "../src/tools/removeDependency/handler.ts";
import {
  executeTaskWarriorCommandJson,
  getTaskByUuid,
} from "../src/utils/taskwarrior.ts";

interface TaskwarriorSandbox {
  tempDir: string;
  taskrc: string;
  previousTaskrc?: string;
  previousTaskBin?: string;
}

const hasTaskwarrior =
  spawnSync("task", ["--version"], { stdio: "ignore" }).status === 0;

const integrationDescribe = hasTaskwarrior ? describe : describe.skip;

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
      "",
    ].join("\n"),
  );

  return {
    tempDir,
    taskrc,
    previousTaskrc: process.env.TASKRC,
    previousTaskBin: process.env.TASK_BIN,
  };
}

function restoreSandbox(sandbox: TaskwarriorSandbox): void {
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

  test("surfaces taskwarrior infrastructure errors instead of returning an empty list", async () => {
    await expect(
      executeTaskWarriorCommandJson([
        "rc.data.location=/proc/does-not-exist/task-data",
        "export",
      ]),
    ).rejects.toThrow();
  });
});
