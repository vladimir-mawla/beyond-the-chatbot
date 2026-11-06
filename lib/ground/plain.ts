import { isNonEmptyArray } from "../contracts/index.js";
import type { NonEmptyReadonlyArray } from "../contracts/index.js";

/**
 * Helpers over plain data that more than one module here needs. The plan's file list for `lib/ground` has no
 * home for something shared, so this is the one file beyond that list (ADR 0004, "Files").
 *
 * `deepFreeze` freezes a value and everything reachable from it through own enumerable properties, arrays
 * included, and returns the same value. `Object.freeze` alone is one level deep: freezing `grounding` would
 * leave `grounding.trees[0].state.extents` and every `Extent` inside it writable, which is the defect the
 * plan's sibling project records as `14-freeze-is-one-level-deep`. It never skips a node that is already
 * frozen (a frozen object can hold an unfrozen child), and it has no cycle guard: it is only ever handed data
 * this package has just built out of fresh objects and arrays, which cannot contain a cycle.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Narrows a list this package built to the non-empty tuple type the contract asks for. An empty list here is a
 * bug in this package (a validated schema has at least one field, a conflicted tree at least one observation),
 * not a result of any input I know of, so it throws: the plan's D11 allows a throw only for an internal invariant.
 */
export function nonEmpty<T>(items: readonly T[], what: string): NonEmptyReadonlyArray<T> {
  if (!isNonEmptyArray(items)) throw new Error(`lib/ground: internal invariant violated: ${what} is empty`);
  return items;
}

/** A string of 1 to `max` UTF-16 code units. No coercion: a boxed `String` object is not one, and nothing is called on it. */
export function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

/** A plain record: an object that is neither `null` nor an array. (`Array.isArray` throws on a revoked Proxy.) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A length as `.length` should give it. A real array always does; a Proxy standing in for one may not. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
