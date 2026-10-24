import type { Bound, Extent } from "../contracts/index.js";

/**
 * Does the lower bound `inner` stay inside the lower bound `outer`? An unbounded `outer` (`null`) asks for
 * nothing, so anything satisfies it; a bounded `outer` is only satisfied by a bounded `inner` at least as large.
 * `inner === null` against a bounded `outer` is NOT satisfied: "unbounded below" is not "at least `outer`".
 * Equal bounds satisfy it (`>=`): an extent is a subset of itself.
 *
 * Shared with `unmetSides` (`unmet.ts`) so that "is a subset" and "has no unmet side" are one rule written
 * once and cannot drift apart. Not exported from the package index.
 */
export function satisfiesLo(inner: Bound, outer: Bound): boolean {
  return outer === null || (inner !== null && inner >= outer);
}

/** The same question for an upper bound: `inner` must be bounded and at most `outer` (`<=`, equal is fine). */
export function satisfiesHi(inner: Bound, outer: Bound): boolean {
  return outer === null || (inner !== null && inner <= outer);
}

/** `inner ⊆ outer`: every integer in `inner` is in `outer`. */
export function isSubset(inner: Extent, outer: Extent): boolean {
  return satisfiesLo(inner.lo, outer.lo) && satisfiesHi(inner.hi, outer.hi);
}

/**
 * Do two extents denote the same set of integers? Compared with `===` on each side, so `null` equals only
 * `null` (never `0`), and `-0` equals `0` because `-0 === 0`. `checkExtent` normalises `-0` anyway; this does
 * not depend on that.
 */
export function isSameExtent(a: Extent, b: Extent): boolean {
  return a.lo === b.lo && a.hi === b.hi;
}
