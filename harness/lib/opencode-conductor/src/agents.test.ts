import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_FILES } from "./agents";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("AGENT_FILES", () => {
  test("covers all four managed agents", () => {
    expect(Object.keys(AGENT_FILES).sort()).toEqual([
      "conductor.md",
      "conductor/coder.md",
      "conductor/explore.md",
      "conductor/shell-runner.md",
    ]);
  });

  test("embedded contents match the agents/*.md source files", () => {
    for (const [rel, content] of Object.entries(AGENT_FILES)) {
      const onDisk = readFileSync(join(root, "agents", rel), "utf8");
      expect(content).toBe(onDisk);
    }
  });

  test("conductor primary may call 1brc remaining-time and resources, not shell", () => {
    const conductor = AGENT_FILES["conductor.md"];
    expect(conductor).toContain("action: 1brc_remaining_time");
    expect(conductor).toContain("action: 1brc_resources");
    expect(conductor).toContain("You DO call `1brc_remaining_time` and `1brc_resources` yourself");
    expect(conductor).not.toMatch(/action:\s+shell/);
    expect(conductor).not.toContain("1brc_bounded");
  });
});
