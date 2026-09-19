import { Plugin } from "@opencode/plugin";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENT_FILES } from "./agents";
import {
  CONDUCTOR_ID,
  WORKER_IDS,
  buildMaxVariant,
  buildConductorPermissions,
  fillUnset,
  isSet,
  parseModelRef,
  selectWorkerModel,
  stripTools,
} from "./contract";

const DEFAULT_CONDUCTOR_MODEL = "cliproxy/gpt-5.6-sol#high";
const DEFAULT_WORKER_MODEL = "opencode/muse-spark-1.3-contributor-free#xhigh";
const DEFAULT_WORKER_FALLBACK_MODEL = "opencode/muse-spark-1.3-contributor-free#high";

interface Options {
  conductorId?: string;
  conductorModel?: string;
  workerModel?: string;
  workerFallbackModel?: string;
  maxVariantSettings?: Record<string, unknown>;
  enableQuestion?: boolean;
  setDefault?: boolean;
  installAgents?: boolean;
}

const CONDUCTOR_SYSTEM_APPEND =
  "You are an conductor. You never read files, edit files, or run shell commands directly: you have no direct tools. Delegate every concrete step to one of your subagents with a self-contained prompt (goal, constraints, repo paths, and the exact return shape you need). Fan out independent work in parallel with background subagents, then synthesize results into a decision-ready answer. Ask workers for distilled summaries, never raw transcripts.";

function workerKind(id: string): "explore" | "shell-runner" | "coder" | null {
  if (id.endsWith("/explore")) return "explore";
  if (id.endsWith("/shell-runner")) return "shell-runner";
  if (id.endsWith("/coder")) return "coder";
  return null;
}

export default Plugin.define({
  id: "conductor",
  async setup(ctx: any) {
    const opts: Options = ctx.options ?? {};
    const conductorId = opts.conductorId ?? CONDUCTOR_ID;
    const conductorModel = opts.conductorModel ?? DEFAULT_CONDUCTOR_MODEL;
    const workerModel = opts.workerModel ?? DEFAULT_WORKER_MODEL;
    const workerFallback = opts.workerFallbackModel ?? DEFAULT_WORKER_FALLBACK_MODEL;
    const enableQuestion = opts.enableQuestion ?? true;
    const setDefault = opts.setDefault ?? true;
    const installAgents = opts.installAgents ?? true;
    const maxSettings = opts.maxVariantSettings ?? { reasoningEffort: "max" };

    const keepTools = enableQuestion ? ["subagent", "question"] : ["subagent"];

    // 0. Self-install agent definitions. The agent API has no `add`, so this
    // is how plugins ship custom agents: write missing .md files, then reload.
    // Fill-unset semantics: never overwrite an existing file.
    if (installAgents) {
      try {
        const base = (ctx.location as any)?.directory;
        if (typeof base === "string" && base) {
          let wrote = 0;
          for (const [rel, content] of Object.entries(AGENT_FILES)) {
            const target = join(base, ".opencode", "agents", rel);
            if (existsSync(target)) continue;
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, content, "utf8");
            wrote++;
          }
          if (wrote > 0) {
            try {
              await ctx.agent.reload();
            } catch {
              // Watcher picks up the files even if reload is unavailable.
            }
          }
        }
      } catch (err) {
        console.warn(`[conductor] agent self-install failed: ${String(err)}`);
      }
    }

    // 1. Resolve the worker model against the LIVE provider catalog.
    // The #max variant only works if the proxy actually serves it; the runner
    // rejects unknown variants at child-session creation ("Variant unavailable").
    // Probe source variants first: use preferred only when confirmed, else fall
    // back. Never trust a transform that "succeeds" vacuously.
    const preferredRef = parseModelRef(workerModel);
    const workerBase = preferredRef.modelID;
    let sourceVariants: Array<{ id: string }> | string[] | undefined;
    try {
      const providers = await ctx.provider.list();
      const records = Array.isArray(providers) ? providers : [];
      for (const record of records) {
        const pid =
          record?.provider?.id ?? record?.providerID ?? record?.id ?? record?.info?.id;
        if (pid !== preferredRef.providerID) continue;
        const models = record?.models;
        const entry =
          typeof models?.get === "function"
            ? models.get(workerBase)
            : models?.[workerBase];
        const variants = entry?.variants;
        if (Array.isArray(variants)) {
          sourceVariants = variants;
        }
        break;
      }
    } catch (err) {
      console.warn(`[conductor] could not probe provider variants: ${String(err)}`);
    }

    const effectiveWorkerModel = selectWorkerModel(sourceVariants as any, workerModel, workerFallback);
    if (effectiveWorkerModel !== workerModel) {
      console.warn(
        `[conductor] variant "${preferredRef.variant ?? "?"}" not served for ${preferredRef.providerID}/${workerBase}; workers use fallback ${workerFallback}`,
      );
    }

    // Register the custom #max variant only when the source already serves it
    // (keeps metadata in sync without advertising an unresolvable variant).
    if (effectiveWorkerModel === workerModel && preferredRef.variant) {
      try {
        const variantId = preferredRef.variant;
        await ctx.provider.transform((editor: any) => {
          try {
            const record = editor.get(preferredRef.providerID);
            if (!record?.models?.get?.(workerBase)) return;
            editor.models.update(preferredRef.providerID, workerBase, (draft: any) => {
              draft.variants = buildMaxVariant(draft.variants, maxSettings);
            });
          } catch {
            // Leave catalog untouched on unexpected shapes.
          }
        });
        void variantId;
      } catch (err) {
        console.warn(`[conductor] could not register variant: ${String(err)}`);
      }
    }

    // 2. Harden agents with fill-unset semantics (user config wins).
    try {
      await ctx.agent.transform((editor: any) => {
        const has = (id: string) => {
          try {
            return !!editor.get(id);
          } catch {
            return false;
          }
        };

        if (has(conductorId)) {
          editor.update(conductorId, (agent: any) => {
            const filled = fillUnset(agent, {
              mode: "primary",
              model: conductorModel,
              description: "Delegates all work via subagents. Has no direct tools.",
            });
            Object.assign(agent, filled);
            if (!isSet(agent.permissions) || (Array.isArray(agent.permissions) && agent.permissions.length === 0)) {
              agent.permissions = buildConductorPermissions(WORKER_IDS as unknown as string[], enableQuestion);
            }
          });
        } else {
          console.warn(
            `[conductor] agent "${conductorId}" not found — create .opencode/agents/conductor.md (see plugin README). Skipping default selection to avoid falling back to build.`,
          );
        }

        const workerModels: Record<string, string> = {};
        for (const id of WORKER_IDS as unknown as string[]) workerModels[id] = effectiveWorkerModel;

        for (const id of Object.keys(workerModels)) {
          if (!has(id)) {
            console.warn(`[conductor] worker agent "${id}" not found — add its agent file (see plugin README).`);
            continue;
          }
          editor.update(id, (agent: any) => {
            const kind = workerKind(id);
            const filled = fillUnset(agent, { mode: "subagent", model: workerModels[id] });
            Object.assign(agent, filled);
            // Permissions intentionally left alone when the user/file defined any.
          });
        }

        if (setDefault && has(conductorId)) {
          try {
            editor.default(conductorId);
          } catch (err) {
            console.warn(`[conductor] could not set default agent: ${String(err)}`);
          }
        }
      });
    } catch (err) {
      console.warn(`[conductor] agent transform failed: ${String(err)}`);
    }

    // 3. Hide tool schemas from the conductor on every tool-bearing request.
    // Permissions remain the security boundary; this controls context size/behavior.
    const strip = (event: any) => {
      try {
        if (event.agent !== conductorId) return;
        if (!event.tools || typeof event.tools !== "object") return;
        const kept = stripTools(event.tools, keepTools);
        for (const key of Object.keys(event.tools)) delete event.tools[key];
        Object.assign(event.tools, kept);
        if (Array.isArray(event.system)) {
          event.system.push({ type: "text", text: CONDUCTOR_SYSTEM_APPEND });
        }
      } catch {
        // Never break a model request from a hook.
      }
    };

    for (const name of ["context", "compaction", "generate"] as const) {
      try {
        await ctx.session.hook(name, strip);
      } catch (err) {
        console.warn(`[conductor] could not register ${name} hook: ${String(err)}`);
      }
    }
  },
});
