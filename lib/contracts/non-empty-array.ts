/**
 * A readonly array with at least one element, as a tuple type.
 *
 * Used where emptiness would be a malformed fact rather than an edge case: a sum with no operands, an
 * `ungrounded` ruling that names no open end, a `conflicted` ruling that names no core, a `weakened`
 * ruling that names no cut (`.genesis/PLAN.md` section 4.1).
 *
 * WHAT IT GUARANTEES. A value of this type cannot be built from `[]`, nor from a `T[]` that might be
 * empty, without a cast, and its first element has type `T` rather than `T | undefined` under
 * `noUncheckedIndexedAccess`. It is `readonly`, so `push` and index assignment do not compile (all proved
 * in `__tests__/proofs/non-empty-array.proofs.ts`).
 *
 * WHAT IT DOES NOT. It is a compile-time statement only: at run time this is an ordinary array, so a value
 * that arrives through a cast or from `JSON.parse` can be empty. `assertEntailmentWellFormed` re-checks the
 * three `Entailment` fields typed this way (`weakened.unmet`, `ungrounded.openEnds`, `conflicted.core`).
 * `Operands` and `Schema.fields` are NOT re-checked by anything in M1: M4's `readSchema` is the layer the plan
 * gives the reading of a schema's shape (`malformed`), and it is not built. Operations that return a plain array (`map`,
 * `filter`, `slice`) lose the guarantee; nothing here provides helpers to keep it.
 */
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

/**
 * Narrows `readonly T[]` to `NonEmptyReadonlyArray<T>`: the one place a plain array becomes a non-empty one.
 *
 * A user-defined type guard is only as honest as its body (that is one of the routes `?: never` cannot
 * close: a guard that always returns `true` narrows anything). The body here is a single length test; the
 * unit test pins `[]` -> false and `[x]` -> true so a weakened test (`>= 0`) goes red.
 */
export function isNonEmptyArray<T>(xs: readonly T[]): xs is NonEmptyReadonlyArray<T> {
  return xs.length > 0;
}
