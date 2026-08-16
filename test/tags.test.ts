import { describe, expect, test } from "bun:test";

import { mergeTags, tagAssignmentArg, tagFilterArgs } from "../src/utils/tags.ts";

describe("tag command arguments", () => {
  test("assigns the whole tag set in one argument", () => {
    expect(tagAssignmentArg(["home", "high-priority"])).toBe("tags:home,high-priority");
  });

  test("clears tags with an empty assignment", () => {
    expect(tagAssignmentArg([])).toBe("tags:");
  });

  test("builds one filter per tag", () => {
    expect(tagFilterArgs(["home", "high-priority"])).toEqual([
      "tags.has:home",
      "tags.has:high-priority",
    ]);
  });
});

describe("mergeTags", () => {
  test("keeps existing tags when only adding", () => {
    expect(mergeTags(["work"], ["urgent"], undefined)).toEqual(["work", "urgent"]);
  });

  test("drops only the requested tags", () => {
    expect(mergeTags(["work", "inbox"], undefined, ["inbox"])).toEqual(["work"]);
  });

  test("never duplicates an existing tag", () => {
    expect(mergeTags(["work"], ["work"], undefined)).toEqual(["work"]);
  });

  test("lets removals win over additions", () => {
    expect(mergeTags(["work"], ["inbox"], ["inbox"])).toEqual(["work"]);
  });

  test("treats a missing tag list as empty", () => {
    expect(mergeTags(undefined, ["inbox"], undefined)).toEqual(["inbox"]);
  });
});
