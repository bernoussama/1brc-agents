import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { HARNESS_BINARIES, HARNESS_TOOL_SPECS, runHarnessBinary } from "./harness-tools";

describe("HARNESS_TOOL_SPECS", () => {
  test("registers remaining-time and resources, not bounded", () => {
    expect(HARNESS_TOOL_SPECS.map((s) => s.name)).toEqual([
      "1brc_remaining_time",
      "1brc_resources",
    ]);
    expect(HARNESS_BINARIES["1brc_remaining_time"]).toBe("1brc-remaining-time");
    expect(HARNESS_BINARIES["1brc_resources"]).toBe("1brc-resources");
    expect(HARNESS_TOOL_SPECS.some((s) => s.name.includes("bounded"))).toBe(false);
  });
});

describe("runHarnessBinary", () => {
  test("returns stdout from a PATH helper", () => {
    const dir = join(tmpdir(), `1brc-harness-tools-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "1brc-remaining-time");
    writeFileSync(bin, "#!/bin/sh\nprintf '{\"remaining_seconds\":42}\\n'\n");
    chmodSync(bin, 0o755);
    const prev = process.env.PATH;
    process.env.PATH = `${dir}:${prev ?? ""}`;
    try {
      expect(runHarnessBinary("1brc-remaining-time")).toEqual({
        content: '{"remaining_seconds":42}',
      });
    } finally {
      process.env.PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns JSON error when the helper is missing", () => {
    const dir = join(tmpdir(), `1brc-harness-tools-missing-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const prev = process.env.PATH;
    process.env.PATH = dir;
    try {
      const result = runHarnessBinary("1brc-remaining-time");
      const body = JSON.parse(result.content) as { error?: string; command?: string };
      expect(body.command).toBe("1brc-remaining-time");
      expect(typeof body.error).toBe("string");
    } finally {
      process.env.PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
