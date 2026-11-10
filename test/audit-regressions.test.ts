import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { parseTaskwarriorExport, executeTaskWarriorCommandRaw } from "../src/utils/taskwarrior.ts";
import { habitStats } from "../src/utils/habits.ts";
import { isActionable, taskStatuses } from "../src/utils/actionability.ts";
import { runTool, toTextResult } from "../src/utils/toolResult.ts";
import type { TaskWarriorTask } from "../src/types/task.ts";

function task(fields: Partial<TaskWarriorTask> = {}): TaskWarriorTask {
  return { id: 1, uuid: randomUUID(), description: "fixture", status: "pending", entry: "20260101T000000Z", ...fields };
}

describe("export validation", () => {
  test("preserves custom priorities and non-ASCII task data", () => {
    const original = task({ priority: "critical", project: "研究", tags: ["café"], custom: "value" });
    expect(parseTaskwarriorExport(JSON.stringify([original]))).toEqual([original]);
  });
  test("rejects malformed or partially invalid exports instead of losing tasks", () => {
    for (const value of ["", "not json", "{}", JSON.stringify([task(), { description: "incomplete" }])]) {
      expect(() => parseTaskwarriorExport(value)).toThrow();
    }
  });
});

describe("habit history", () => {
  const template = task({ status: "recurring", recur: "daily" });
  const now = Date.parse("2026-01-03T12:00:00Z");
  test("future pending occurrences do not break a completed streak", () => {
    const history = [
      task({ due: "20260101T000000Z", status: "completed" }),
      task({ due: "20260102T000000Z", status: "completed" }),
      task({ due: "20260104T000000Z" }),
    ];
    expect(habitStats(template, history, now)).toMatchObject({ total_instances: 3, evaluated_instances: 2, completion_rate: 100, current_streak: 2, longest_streak: 2 });
  });
  test("missed and deleted due occurrences break streaks; waiting future ones do not", () => {
    const history = [task({ due: "20260101T000000Z", status: "completed" }), task({ due: "20260102T000000Z", status: "deleted" }), task({ due: "20260103T000000Z", status: "completed" }), task({ due: "20260104T000000Z", status: "waiting" })];
    expect(habitStats(template, history, now)).toMatchObject({ completion_rate: 67, current_streak: 1, longest_streak: 1 });
  });
});

test("completed dependencies no longer block actionability", () => {
  const completed = task({ status: "completed" });
  const dependent = task({ depends: [completed.uuid] });
  expect(isActionable(dependent, Date.now(), false, taskStatuses([completed, dependent]))).toBe(true);
  expect(isActionable(dependent, Date.now(), false, taskStatuses([dependent]))).toBe(false);
});

test("application failures propagate to MCP and queued requests recover after errors", async () => {
  expect(toTextResult({ status: "error" }).isError).toBe(true);
  expect(toTextResult({ status: "success" }).isError).toBeUndefined();
  const order: string[] = [];
  const first = runTool(async () => { await new Promise(resolve => setTimeout(resolve, 10)); order.push("first"); throw new Error("failed"); });
  const second = runTool(async () => { order.push("second"); return { status: "success" }; });
  await expect(first).rejects.toThrow("failed");
  expect((await second).isError).toBeUndefined();
  expect(order).toEqual(["first", "second"]);
});

test("a slow subprocess times out while the event loop remains responsive", async () => {
  const previous = process.env.TASK_BIN;
  process.env.TASK_BIN = process.execPath;
  try {
    let timerFired = false;
    const timer = setTimeout(() => { timerFired = true; }, 10);
    await expect(executeTaskWarriorCommandRaw(["-e", "setInterval(() => {}, 1000)"], { encoding: "utf8", timeout: 150 })).rejects.toThrow("timed out");
    clearTimeout(timer);
    expect(timerFired).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.TASK_BIN;
    else process.env.TASK_BIN = previous;
  }
});
