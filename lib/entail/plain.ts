import { isNonEmptyArray } from "../contracts/index.js";
import type { NonEmptyReadonlyArray } from "../contracts/index.js";

/**
 * Helpers over plain data that more than one module here needs. The plan's file list for `lib/entail` has no home
 * for something shared, and `lib/ground`'s own copies of these are internal to it (its `index.ts` exports none),
 * so this is the one file beyond that list (ADR 0005, "Files"). Each is small enough that writing it again here is
 * cheaper than widening `lib/ground`'s public surface, which is frozen.
 *
 * `deepFreeze` freezes a value and everything reachable from it through own enumerable properties, arrays
 * included, and returns the same value. `Object.freeze` alone is one level deep (the plan's sibling project
 * records the defect as `14-freeze-is-one-level-deep`). It never skips a node that is already frozen, because a
 * frozen object can hold an unfrozen child, and it has no cycle guard: it is only ever handed data this package
 * has just built out of fresh objects and arrays, which cannot contain a cycle.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Narrows a list this package built to the non-empty tuple type the contract asks for. An empty list here means the
 * layer below handed back something its own contract rules out (or a hand-built `Grounding` that disagrees with
 * itself), not a result of any input this package reads, so it throws: the plan's D11 allows a throw only for an
 * internal invariant.
 */
export function nonEmpty<T>(items: readonly T[], what: string): NonEmptyReadonlyArray<T> {
  if (!isNonEmptyArray(items)) throw new Error(`lib/entail: internal invariant violated: ${what} is empty`);
  return items;
}

/** A string of 1 to `max` UTF-16 code units. No coercion: a boxed `String` object is not one, and nothing is called on it. */
export function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

/** A plain record: an object that is neither `null` nor an array. (`Array.isArray` throws on a revoked Proxy; callers guard it.) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A length as `.length` should give it. A real array always does; a Proxy standing in for one may not. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
