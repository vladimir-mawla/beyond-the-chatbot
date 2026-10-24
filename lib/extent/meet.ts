import type { Bound, Extent } from "../contracts/index.js";

/**
 * The larger of two LOWER bounds. `null` is minus infinity here, so it loses to any number; it is never
 * compared as if it were `0`.
 */
function tighterLo(x: Bound, y: Bound): Bound {
  if (x === null) return y;
  if (y === null) return x;
  return x > y ? x : y;
}

/** The smaller of two UPPER bounds. `null` is plus infinity here, so it loses to any number. */
function tighterHi(x: Bound, y: Bound): Bound {
  if (x === null) return y;
  if (y === null) return x;
  return x < y ? x : y;
}

/**
 * The intersection of two extents: the integers in both. `undefined` means the intersection is empty, which
 * is the only way "no integer satisfies both" is reported (an `Extent` cannot be empty, so there is no empty
 * extent to return). The result is always a new object.
 */
export function meet(a: Extent, b: Extent): Extent | undefined {
  const lo = tighterLo(a.lo, b.lo);
  const hi = tighterHi(a.hi, b.hi);
  if (lo !== null && hi !== null && lo > hi) return undefined;
  return { lo, hi };
}
