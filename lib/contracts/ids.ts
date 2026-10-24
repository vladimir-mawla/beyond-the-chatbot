/**
 * Opaque identity tokens: `FieldId` (a quantity in a schema) and `ObsId` (an observation).
 *
 * WHY BRANDED, NOT BARE `string`. Both are strings, and the engine is full of calls where swapping them is
 * a plausible slip that a plain `string` signature would accept (`supportOf(g, obsId)`, an `ObsId` handed to
 * `extentOf`). Each brand makes that a compile error (proved in `__tests__/proofs/ids.proofs.ts`).
 *
 * WHAT A BRAND IS NOT. It exists only at compile time: at run time both are the same plain string, so
 * `fieldId("x") === obsId("x")`. It is not a trust boundary: anyone can mint any id from any string.
 * `.genesis/PLAN.md` section 4.1 says "NO PARSERS (ids are not grammars)", so the mint functions validate
 * nothing: `fieldId("")` and `fieldId("x".repeat(10_000))` both succeed. That is an HONEST LIMIT pinned in
 * `__tests__/honest-limits.test.ts`. The refusals that close it belong to later layers and are not built
 * yet: M4's `readSchema`/`ground` (`malformed`, `duplicate-field`, `unknown-field`) and M5's `readClaim`
 * (`unknown-field`). The plan does not say which of them enforces `MAX_ID_LENGTH`.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type FieldId = Brand<string, "FieldId">;
export type ObsId = Brand<string, "ObsId">;

/** Brands a string as a `FieldId`. Validates nothing (see the file header). */
export function fieldId(raw: string): FieldId {
  return raw as FieldId;
}

/** Brands a string as an `ObsId`. Validates nothing (see the file header). */
export function obsId(raw: string): ObsId {
  return raw as ObsId;
}

/**
 * Total order on ids: UTF-16 code-unit order, the order of the `<` operator on strings. It is NOT
 * `localeCompare`, which depends on the host's locale and ICU data and so makes a sort (and with it a
 * support or a core, which are chosen by id order) nondeterministic across machines (plan D7). The
 * determinism guard bans `localeCompare` under `lib/**` and `domains/**` for the same reason.
 *
 * Code-UNIT order is not code-POINT order: a character outside the Basic Multilingual Plane is two
 * surrogates (0xD800..0xDFFF), which sort BEFORE a BMP character such as U+FF5E. The unit test pins that
 * case, because a "fix" to code-point order would change which observations a certificate names.
 */
export function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
