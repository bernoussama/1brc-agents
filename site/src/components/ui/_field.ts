// src/components/ui/_field.ts — shared form-field contract for the input-like primitives.
// Input and Textarea (and future Checkbox / Select / File Input, etc.) compose these so the field
// look and the validation states have a single source of truth. Not a primitive itself — the
// leading underscore marks it as an internal shared module, not a ui/ component folder.

/** Base look shared by all text-field primitives (layout, typography, focus ring, disabled). */
export const fieldBase = [
  "text-foreground placeholder:text-muted-foreground w-full rounded-md border bg-transparent shadow-xs",
  "transition-[color,box-shadow] outline-none",
  "focus-visible:ring-3",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "peer",
];

/** Validation `state` variant: border + focus ring per status. Tokens only. */
export const fieldState = {
  default: "border-input focus-visible:border-outline focus-visible:ring-outline",
  error: "border-error focus-visible:border-error focus-visible:ring-error",
  success: "border-success focus-visible:border-success focus-visible:ring-success",
};
