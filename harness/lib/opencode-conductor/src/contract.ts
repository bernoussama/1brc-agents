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

export function parseModelRef(ref: string): ModelRef {  const hash = ref.indexOf("#");
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

type ExistingVariant = VariantDef | string;

export function buildMaxVariant(
  existing: readonly ExistingVariant[] | undefined,
  settings: Record<string, unknown>,
): ExistingVariant[] {
  const rest = (existing ?? []).filter((v) =>
    typeof v === "string" ? v !== "max" : v.id !== "max",
  );
  return [...rest, { id: "max", settings }];
}

export function sourceHasVariant(
  existing: readonly ExistingVariant[] | undefined,
  id: string,
): boolean {
  return (existing ?? []).some((v) => (typeof v === "string" ? v : v.id) === id);
}

export function selectWorkerModel(
  sourceVariants: readonly ExistingVariant[] | undefined,
  preferred: string,
  fallback: string,
): string {
  const { variant } = parseModelRef(preferred);
  if (!variant) return preferred;
  return sourceHasVariant(sourceVariants, variant) ? preferred : fallback;
}
