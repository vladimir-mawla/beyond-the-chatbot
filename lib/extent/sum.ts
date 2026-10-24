import type { Bound, Extent, NonEmptyReadonlyArray } from "../contracts/index.js";

/**
 * The extent the SUM of `operands` must lie in: lower bound the sum of the lower bounds, upper bound the sum of
 * the upper bounds, and a side is `null` as soon as any operand is unbounded on it (one unbounded term makes
 * the whole sum unbounded; `null` is absorbing and is never added as `0`).
 *
 * The loop starts at `0` because `0` is the identity of addition (the sum of no terms), not because a `null`
 * is read as zero: the first operand's `null` makes the result `null` like any other.
 *
 * Exact over the integers: the set of values a sum of integer intervals can take has no holes, so `[lo, hi]`
 * loses nothing (checked against enumeration in `__tests__/sum-exactness.test.ts`). The inputs are trusted to be
 * `checkExtent`-valid; with `MAX_MAGNITUDE` and `MAX_FIELDS` the intermediate values stay far below 2**53, and
 * `__tests__/boundaries.test.ts` checks that against `BigInt`. This function does not re-check its inputs.
 * An empty list is outside the type; the loop then yields `[0, 0]`, the exact sum of no terms.
 */
export function sumForward(operands: NonEmptyReadonlyArray<Extent>): Extent {
  let lo: Bound = 0;
  let hi: Bound = 0;
  for (const operand of operands) {
    lo = lo === null || operand.lo === null ? null : lo + operand.lo;
    hi = hi === null || operand.hi === null ? null : hi + operand.hi;
  }
  return { lo, hi };
}

/**
 * What `result` implies for `operands[index]`: it equals `result` minus the other operands, so its LOWER bound is
 * `result.lo` minus the others' UPPER bounds and its UPPER bound is `result.hi` minus the others' LOWER bounds
 * (the two sides cross; swapping them gives an answer that is wrong and looks plausible). A side is `null` when
 * `result` is unbounded on it or any other operand is unbounded on the side it needs.
 *
 * The answer is NOT intersected with `operands[index]`'s own extent: that is the caller's `meet`, and keeping
 * it out is what lets the exactness test compare this function with a plain enumeration.
 *
 * An `index` that names no operand (negative, past the end, fractional, `NaN`, not a number) implies NOTHING:
 * `{ lo: null, hi: null }`, never a throw and never a tightening. It is the one answer that can never rule
 * anything out, so a bad index from a caller cannot invent a bound.
 */
export function sumBackward(result: Extent, operands: NonEmptyReadonlyArray<Extent>, index: number): Extent {
  if (!Number.isInteger(index) || index < 0 || index >= operands.length) return { lo: null, hi: null };
  let lo: Bound = result.lo;
  let hi: Bound = result.hi;
  for (const [position, other] of operands.entries()) {
    if (position === index) continue;
    lo = lo === null || other.hi === null ? null : lo - other.hi;
    hi = hi === null || other.lo === null ? null : hi - other.lo;
  }
  return { lo, hi };
}
