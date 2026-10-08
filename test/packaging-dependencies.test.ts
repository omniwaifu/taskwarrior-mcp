import { expect, test } from "bun:test";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ExternalEditor } from "external-editor";

// MCPB's Inquirer 6 dependency still requests tmp 0.0.x through external-editor.
// Exercise its actual tmpNameSync consumer against our patched tmp override.
test("MCPB's external editor can create, read, and clean up a temporary file", () => {
  const editor = new ExternalEditor("initial text", {
    prefix: "taskwarrior-mcp-",
    postfix: ".txt",
    mode: 0o600,
  });

  try {
    expect(dirname(resolve(editor.tempFile))).toBe(resolve(tmpdir()));
    expect(basename(editor.tempFile)).toStartWith("taskwarrior-mcp-");
    expect(basename(editor.tempFile)).toEndWith(".txt");
    expect(readFileSync(editor.tempFile, "utf8")).toBe("initial text");
    if (process.platform !== "win32") {
      expect(statSync(editor.tempFile).mode & 0o777).toBe(0o600);
    }
    writeFileSync(editor.tempFile, "edited text");
    // Use a no-op subprocess instead of opening the developer's actual editor.
    editor.editor = { bin: process.execPath, args: ["-e", ""] };
    expect(editor.run()).toBe("edited text");
    expect(editor.lastExitStatus).toBe(0);
  } finally {
    editor.cleanup();
  }

  expect(existsSync(editor.tempFile)).toBe(false);
});

for (const option of ["prefix", "postfix"] as const) {
  test(`MCPB's temporary editor rejects path separators in ${option}`, () => {
    const sandbox = mkdtempSync(join(tmpdir(), "taskwarrior-mcp-editor-"));
    const directory = join(sandbox, "nested");
    mkdirSync(directory);
    let editor: ExternalEditor | undefined;
    try {
      // Both paths would resolve to writable locations inside our sandbox with
      // the old tmp version, so a filesystem permission error cannot mask a miss.
      expect(() => {
        editor = new ExternalEditor("text", {
          dir: directory,
          [option]: option === "prefix" ? "../escape-" : "/../escape",
        });
      }).toThrow();
    } finally {
      editor?.cleanup();
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
}
