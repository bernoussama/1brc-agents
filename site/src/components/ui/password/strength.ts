// src/components/ui/password/strength.ts — the scoring rule behind PasswordStrength, in a plain module
// so it's unit-checkable (see strength.test.ts) and swappable per project.

export type Strength = 0 | 1 | 2 | 3 | 4; // none · weak · fair · good · strong

/**
 * Score a password's strength on a 0–4 scale.
 *
 * ponytail: naive rule-based scorer (length + character-class diversity), NOT entropy. Ceiling: it
 * rates "Password1!" as strong even though it's weak. Upgrade path: drop in `zxcvbn` per-project for
 * real estimation — keep this signature so callers (PasswordStrength) don't change.
 *
 * @param pw - the raw password string
 * @returns a {@link Strength} from 0 (empty) to 4 (strong)
 * @example scorePassword("Abcd1234!xyz") // => 4
 */
export function scorePassword(pw: string): Strength {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as Strength;
}
