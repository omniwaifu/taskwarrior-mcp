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
    expect(tools).toHaveLength(22);
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

    const added = await client.callTool({ name: "add_task", arguments: { description: "disposable MCP test", tags: ["inbox"] } });
    expect(added.isError).not.toBe(true);
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
  } catch (error) {
    console.error(diagnostics);
    throw error;
  } finally {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
