import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const hasTask = spawnSync("task", ["--version"], { stdio: "ignore" }).status === 0;

// Run against source under Bun in the usual suite; the same test also runs
// against the shipped Node bundle with MCP_TEST_COMMAND/MCP_TEST_ENTRY.
(hasTask ? test : test.skip)("stdio schemas advertise bounds and validation precedes Taskwarrior writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-zod4-"));
  const taskrc = join(directory, "taskrc");
  mkdirSync(join(directory, "data"));
  writeFileSync(taskrc, `data.location=${join(directory, "data")}\nconfirmation=no\nverbose=nothing\njson.array=on\n`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) as Record<string, string>;
  env.TASKRC = taskrc;
  env.TASKDATA = join(directory, "data");
  env.TASK_BIN = "task";
  const transport = new StdioClientTransport({
    command: process.env.MCP_TEST_COMMAND ?? process.execPath,
    args: [resolve(process.env.MCP_TEST_ENTRY ?? "src/index.ts")],
    env,
    stderr: "pipe",
  });
  let diagnostics = "";
  transport.stderr?.on("data", chunk => { diagnostics += String(chunk); });
  const client = new Client({ name: "zod-compatibility-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(27);
    const schema = (name: string) => tools.find(tool => tool.name === name)!.inputSchema;
    const add = schema("add_task");
    expect(add.required).toContain("description");
    expect(add.required).not.toContain("tags");
    expect(add.properties!.tags).toMatchObject({ type: "array", maxItems: 64 });
    expect(add.properties!.depends).toMatchObject({ type: "array", maxItems: 128 });
    expect(add.properties!.annotations).toMatchObject({ type: "array", maxItems: 64 });
    expect(schema("batch_modify_tasks").properties!.uuids).toMatchObject({ maxItems: 100 });
    expect(schema("create_project_tree").properties!.tasks).toMatchObject({ maxItems: 100 });

    function checkArrayBounds(value: unknown): void {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "array") expect(typeof node.maxItems).toBe("number");
      for (const child of Object.values(node)) checkArrayBounds(child);
    }
    for (const tool of tools) checkArrayBounds(tool.inputSchema);

    const rejected = await client.callTool({ name: "add_task", arguments: {
      description: "must not be created", tags: Array(65).fill("tag"),
    } });
    expect(rejected.isError).toBe(true);
    const untouched = spawnSync("task", ["export"], { env, encoding: "utf8" });
    expect(untouched.status).toBe(0);
    expect(JSON.parse(untouched.stdout)).toEqual([]);

    for (const tool of tools) {
      expect(tool.outputSchema?.properties?.status).toBeDefined();
      expect(tool.annotations?.readOnlyHint).toBeDefined();
    }
    const added = await client.callTool({ name: "add_task", arguments: { description: "disposable MCP test", tags: ["inbox"] } });
    expect(added.isError).not.toBe(true);
    expect(added.structuredContent).toMatchObject({ status: "success", data: { description: "disposable MCP test" } });

    const listed = await client.callTool({ name: "list_tasks", arguments: { tags: ["inbox"] } });
    expect(listed.isError).not.toBe(true);
    const tasks = JSON.parse((listed.content as { text: string }[])[0].text);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("disposable MCP test");
    const modified = await client.callTool({ name: "modify_task", arguments: {
      uuid: tasks[0].uuid, addTags: ["next"], removeTags: ["inbox"],
    } });
    expect(modified.isError).not.toBe(true);
    const final = spawnSync("task", ["export"], { env, encoding: "utf8" });
    expect(final.status).toBe(0);
    expect(JSON.parse(final.stdout)[0].tags).toEqual(["next"]);
    const missing = await client.callTool({ name: "modify_task", arguments: { uuid: "00000000-0000-0000-0000-000000000000", project: "Missing" } });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toMatchObject({ status: "error", error: { code: "TASK_NOT_FOUND" } });
    const capture = await client.callTool({ name: "quick_capture", arguments: { description: "Feature workflow" } });
    const captured = (capture.structuredContent!.data as { uuid: string });
    const clarified = await client.callTool({ name: "process_inbox_item", arguments: { uuid: captured.uuid, action: "waiting", waiting_for: "Reviewer", follow_up: "2000-01-01", estimated_minutes: 20 } });
    expect(clarified.structuredContent).toMatchObject({ status: "success", data: { task: { waiting_for: "Reviewer", estimated_minutes: 20 } } });
    const queried = await client.callTool({ name: "query_tasks", arguments: { waiting_for: "Reviewer", limit: 1 } });
    expect(queried.structuredContent).toMatchObject({ status: "success", data: { page: { total: 1, returned: 1, has_more: false } } });
    const tree = await client.callTool({ name: "get_task_tree", arguments: { uuid: captured.uuid } });
    expect(tree.structuredContent).toMatchObject({ status: "success", data: { metadata: { returned: 1, truncated: false } } });
    const health = await client.callTool({ name: "get_server_status", arguments: {} });
    expect(health.structuredContent).toMatchObject({ status: "success" });

    const deleted = await client.callTool({ name: "delete_task", arguments: { uuid: tasks[0].uuid, skipConfirmation: true } });
    expect(deleted.isError).not.toBe(true);
    const afterDelete = spawnSync("task", [tasks[0].uuid, "export"], { env, encoding: "utf8" });
    expect(JSON.parse(afterDelete.stdout)[0].status).toBe("deleted");

  } catch (error) {
    console.error(diagnostics);
    throw error;
  } finally {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
