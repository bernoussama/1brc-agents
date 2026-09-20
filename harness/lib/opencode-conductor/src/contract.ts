export const CONDUCTOR_ID = "conductor";

export const WORKER_IDS = [
  "conductor/explore",
  "conductor/shell-runner",
  "conductor/coder",
] as const;

export type WorkerID = (typeof WORKER_IDS)[number];

export interface PermissionRule {
  action: string;
  resource: string;
  effect: "allow" | "deny" | "ask";
}

export interface ToolDef {
  description: string;
  input: unknown;
}

export function stripTools(
  tools: Record<string, ToolDef>,
  keep: readonly string[],
): Record<string, ToolDef> {
  const allow = new Set(keep);
  const out: Record<string, ToolDef> = {};
  for (const [name, def] of Object.entries(tools)) {
    if (allow.has(name)) out[name] = def;
  }
  return out;
}

export function buildConductorPermissions(
  workerIDs: readonly string[],
  enableQuestion: boolean,
): PermissionRule[] {
  const rules: PermissionRule[] = [{ action: "*", resource: "*", effect: "deny" }];
  if (enableQuestion) rules.push({ action: "question", resource: "*", effect: "allow" });
  for (const id of workerIDs) rules.push({ action: "subagent", resource: id, effect: "allow" });
  return rules;
}

export function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function fillUnset<T extends Record<string, unknown>>(
  target: T,
  defaults: Partial<T>,
): T {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(defaults)) {
    if (!isSet(out[key])) out[key] = value;
  }
  return out as T;
}

export interface ModelRef {
  providerID: string;
  modelID: string;
  variant?: string;
}

export function parseModelRef(ref: string): ModelRef {
  const hash = ref.indexOf("#");
  const variant = hash >= 0 ? ref.slice(hash + 1) || undefined : undefined;
  const base = hash >= 0 ? ref.slice(0, hash) : ref;
  const slash = base.indexOf("/");
  if (slash < 0) return { providerID: base, modelID: "", variant };
  return {
    providerID: base.slice(0, slash),
    modelID: base.slice(slash + 1),
    variant,
  };
}

export interface VariantDef {
  id: string;
  settings?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export type ExistingVariant = VariantDef | string;

function variantId(value: ExistingVariant): string {
  return typeof value === "string" ? value : value.id;
}

/** OpenCode config uses a variant object map; the live catalog may also return an array. */
export function normalizeVariants(source: unknown): ExistingVariant[] {
  if (source == null) return [];
  if (Array.isArray(source)) {
    return source.filter(
      (item): item is ExistingVariant =>
        typeof item === "string" ||
        (typeof item === "object" && item !== null && typeof (item as VariantDef).id === "string"),
    );
  }
  if (typeof source !== "object") return [];
  const out: ExistingVariant[] = [];
  for (const [id, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === "string") {
      out.push({ id });
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const rec = value as Record<string, unknown>;
      if (typeof rec.id === "string") {
        out.push(rec as VariantDef);
        continue;
      }
      const def: VariantDef = { id };
      if (rec.settings && typeof rec.settings === "object" && !Array.isArray(rec.settings)) {
        def.settings = rec.settings as Record<string, unknown>;
      } else if (!("settings" in rec) && !("headers" in rec) && !("body" in rec)) {
        def.settings = rec;
      }
      if (rec.headers && typeof rec.headers === "object" && !Array.isArray(rec.headers)) {
        def.headers = rec.headers as Record<string, string>;
      }
      if (rec.body && typeof rec.body === "object" && !Array.isArray(rec.body)) {
        def.body = rec.body as Record<string, unknown>;
      }
      out.push(def);
      continue;
    }
    out.push({ id });
  }
  return out;
}

export function buildMaxVariant(
  existing: unknown,
  settings: Record<string, unknown>,
): ExistingVariant[] {
  const rest = normalizeVariants(existing).filter((v) => variantId(v) !== "max");
  return [...rest, { id: "max", settings }];
}

export function sourceHasVariant(existing: unknown, id: string): boolean {
  return normalizeVariants(existing).some((v) => variantId(v) === id);
}

export function selectWorkerModel(
  sourceVariants: unknown,
  preferred: string,
  fallback: string,
): string {
  const { variant } = parseModelRef(preferred);
  if (!variant) return preferred;
  return sourceHasVariant(sourceVariants, variant) ? preferred : fallback;
}
