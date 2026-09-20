import { describe, expect, test } from "bun:test";
import {
  CONDUCTOR_ID,
  WORKER_IDS,
  buildMaxVariant,
  buildConductorPermissions,
  fillUnset,
  isSet,
  normalizeVariants,
  parseModelRef,
  selectWorkerModel,
  stripTools,
} from "./contract";

describe("stripTools", () => {
  test("keeps only subagent and question for conductor", () => {
    const tools = {
      subagent: { description: "s", input: {} },
      question: { description: "q", input: {} },
      read: { description: "r", input: {} },
      shell: { description: "sh", input: {} },
      edit: { description: "e", input: {} },
    };
    expect(Object.keys(stripTools(tools, ["subagent", "question"])).sort()).toEqual([
      "question",
      "subagent",
    ]);
  });

  test("keeps only subagent when question disabled", () => {
    const tools = {
      subagent: { description: "s", input: {} },
      question: { description: "q", input: {} },
      read: { description: "r", input: {} },
    };
    expect(Object.keys(stripTools(tools, ["subagent"]))).toEqual(["subagent"]);
  });

  test("does not mutate input", () => {
    const tools = { subagent: { description: "s", input: {} }, read: { description: "r", input: {} } };
    stripTools(tools, ["subagent"]);
    expect(Object.keys(tools).sort()).toEqual(["read", "subagent"]);
  });
});

describe("buildConductorPermissions", () => {
  test("denies all first, allows narrow subagents + question last", () => {
    const rules = buildConductorPermissions(WORKER_IDS, true);
    expect(rules[0]).toEqual({ action: "*", resource: "*", effect: "deny" });
    const allows = rules.filter((r) => r.effect === "allow");
    expect(allows).toContainEqual({ action: "question", resource: "*", effect: "allow" });
    for (const id of WORKER_IDS) {
      expect(allows).toContainEqual({ action: "subagent", resource: id, effect: "allow" });
    }
    // No broad subagent allow
    expect(allows.some((r) => r.action === "subagent" && r.resource === "*")).toBe(false);
  });

  test("omits question allow when disabled", () => {
    const rules = buildConductorPermissions(WORKER_IDS, false);
    expect(rules.some((r) => r.action === "question")).toBe(false);
  });
});

describe("conductor constants", () => {
  test("uses namespaced worker ids (no builtin explore collision)", () => {
    expect(CONDUCTOR_ID).toBe("conductor");
    expect(WORKER_IDS).toEqual([
      "conductor/explore",
      "conductor/shell-runner",
      "conductor/coder",
    ]);
    expect(WORKER_IDS).not.toContain("explore");
  });
});

describe("fillUnset", () => {
  test("fills missing scalars, preserves user values", () => {
    expect(fillUnset({ model: undefined, steps: 4 }, { model: "m", steps: 10 })).toEqual({
      model: "m",
      steps: 4,
    });
  });

  test("isSet treats empty string as unset", () => {
    expect(isSet("")).toBe(false);
    expect(isSet("x")).toBe(true);
    expect(isSet(undefined)).toBe(false);
  });
});

describe("parseModelRef", () => {
  test("splits provider/model#variant with slashes in model id", () => {
    expect(parseModelRef("cliproxy/revcmd/deepseek-v4.1-flash#max")).toEqual({
      providerID: "cliproxy",
      modelID: "revcmd/deepseek-v4.1-flash",
      variant: "max",
    });
  });

  test("handles ref without variant", () => {
    expect(parseModelRef("cliproxy/gpt-5.6-sol")).toEqual({
      providerID: "cliproxy",
      modelID: "gpt-5.6-sol",
      variant: undefined,
    });
  });
});

describe("buildMaxVariant", () => {
  test("adds max object variant, preserves existing, replaces duplicate max", () => {
    const existing = [{ id: "high", settings: { reasoningEffort: "high" } }, { id: "max", settings: { reasoningEffort: "low" } }];
    const out = buildMaxVariant(existing, { reasoningEffort: "max" });
    expect(out.filter((v) => v.id === "max")).toHaveLength(1);
    expect(out.find((v) => v.id === "max")).toEqual({ id: "max", settings: { reasoningEffort: "max" } });
    expect(out.some((v) => v.id === "high")).toBe(true);
  });

  test("handles legacy string variants", () => {
    const out = buildMaxVariant(["low", "high"], { reasoningEffort: "max" });
    expect(out).toContainEqual({ id: "max", settings: { reasoningEffort: "max" } });
    expect(out.some((v) => typeof v === "string" && v === "high")).toBe(true);
  });
});

describe("selectWorkerModel", () => {
  const preferred = "cliproxy/revcmd/deepseek-v4.1-flash#max";
  const fallback = "cliproxy/revcmd/deepseek-v4.1-flash#high";

  test("uses preferred when source variants include it", () => {
    expect(selectWorkerModel([{ id: "max" }, { id: "high" }], preferred, fallback)).toBe(preferred);
    expect(selectWorkerModel(["low", "max"], preferred, fallback)).toBe(preferred);
  });

  test("falls back when source variants lack it", () => {
    expect(selectWorkerModel([{ id: "low" }, { id: "high" }], preferred, fallback)).toBe(fallback);
    expect(selectWorkerModel(["low", "high"], preferred, fallback)).toBe(fallback);
  });

  test("falls back on missing or unreadable source variants", () => {
    expect(selectWorkerModel(undefined, preferred, fallback)).toBe(fallback);
    expect(selectWorkerModel([], preferred, fallback)).toBe(fallback);
  });

  test("keeps #max when OpenCode config variants are an object map", () => {
    const fromConfig = {
      max: { reasoningEffort: "max" },
      high: { reasoningEffort: "high" },
    };
    expect(selectWorkerModel(fromConfig, preferred, fallback)).toBe(preferred);
    expect(normalizeVariants(fromConfig).map((v) => (typeof v === "string" ? v : v.id)).sort()).toEqual(
      ["high", "max"],
    );
  });
});
