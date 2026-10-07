import { describe, expect, test } from "bun:test";
import { parseTaskwarriorDate } from "../src/utils/dates.ts";

describe("Taskwarrior export dates", () => {
  test.each([
    ["20000101T050000Z", "2000-01-01T05:00:00.000Z"],
    ["20990101T050000Z", "2099-01-01T05:00:00.000Z"],
    ["20240229T235959Z", "2024-02-29T23:59:59.000Z"],
    ["2024-02-29T23:59:59Z", "2024-02-29T23:59:59.000Z"],
    ["2024-02-29T23:59:59-05:00", "2024-03-01T04:59:59.000Z"],
  ])("parses %s as UTC", (input, expected) => {
    expect(parseTaskwarriorDate(input).toISOString()).toBe(expected);
  });

  test.each(["", "not-a-date", "20241301T000000Z", "20240101T256000Z"])(
    "does not turn invalid input %s into a usable date", (input) => {
      expect(Number.isNaN(parseTaskwarriorDate(input).getTime())).toBe(true);
    },
  );
});
