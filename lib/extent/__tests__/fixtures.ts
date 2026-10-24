import type { Bound, Extent } from "../../contracts/index.js";

/**
 * Shared test support for `lib/extent`: the grids of extents the exhaustive tests walk, and the brute-force
 * ORACLE they compare the library with. Nothing here imports the library under test, so an oracle answer can
 * never be produced by the code it is checking.
 *
 * THE ORACLE, AND THE ONE TRAP IN IT. The oracle answers a question about a set of integers by listing the
 * integers. An extent with a `null` side is infinite, so it cannot be listed whole: it is listed inside a
 * WINDOW `[-cap, cap]`, a side that is `null` running to the edge of the window. That makes "is this side
 * unbounded?" the delicate part, and the obvious rule is wrong:
 *
 *   WRONG: "a side is unbounded when the oracle's bound reaches the edge of the window."
 *     It misreports a finite bound that happens to sit AT the edge as unbounded, and in the backward direction
 *     (`result` minus the others) it misreports every unbounded side. The plan (section 8, defect 9) records
 *     that the first version of its model's harness got 24,276 of 79,764 forward/backward checks wrong this way.
 *   RIGHT: "a side is unbounded when WIDENING the window moves the oracle's bound."
 *     Compute the bound at a window and again at a larger one. An unbounded side keeps running to the new edge,
 *     so the bound moves; a finite bound is the same in both. `boundMoves` below is that comparison.
 *
 * The window is always at least one wider than the largest finite bound in the case (`windowFor`), so every
 * finite bound is inside it and a bounded side cannot be mistaken for the edge.
 */

export const ext = (lo: Bound, hi: Bound): Extent => ({ lo, hi });

/** Every side value of the plan's main grid: unbounded, and the integers -2 to 3. */
export const GRID_VALUES: readonly Bound[] = [null, -2, -1, 0, 1, 2, 3];
/** The reduced grid the 3-operand check uses: unbounded, and 0 to 2. */
export const REDUCED_VALUES: readonly Bound[] = [null, 0, 1, 2];

/** Every VALID extent whose sides come from `values`: `lo <= hi` whenever both are bounded (34 for `GRID_VALUES`, 13 for `REDUCED_VALUES`). */
export function gridExtents(values: readonly Bound[]): Extent[] {
  const out: Extent[] = [];
  for (const lo of values) {
    for (const hi of values) {
      if (lo === null || hi === null || lo <= hi) out.push({ lo, hi });
    }
  }
  return out;
}

/** The largest absolute finite bound among `extents` (0 when every side is unbounded). */
export function largestFinite(extents: readonly Extent[]): number {
  let largest = 0;
  for (const e of extents) {
    for (const bound of [e.lo, e.hi]) if (bound !== null) largest = Math.max(largest, Math.abs(bound));
  }
  return largest;
}

/** The small and the large window for a case: both strictly wider than every finite bound in it. */
export function windowFor(extents: readonly Extent[]): { readonly small: number; readonly large: number } {
  const widest = largestFinite(extents);
  return { small: widest + 1, large: widest + 3 };
}

/** The integers `extent` contains inside the window `[-cap, cap]`: a `null` side runs to the edge of the window. */
export function integersIn(extent: Extent, cap: number): number[] {
  const first = extent.lo === null ? -cap : extent.lo;
  const last = extent.hi === null ? cap : extent.hi;
  if (first < -cap || last > cap) throw new Error(`the window ${cap} does not contain ${JSON.stringify(extent)}`);
  const out: number[] = [];
  for (let x = first; x <= last; x++) out.push(x);
  return out;
}

/**
 * A bound of a set of integers, read off at two window sizes: `null` (unbounded) exactly when widening the
 * window MOVES it, otherwise the bound itself. `inSmall` and `inLarge` are the same set listed in the small and
 * the large window; neither may be empty.
 */
export function boundMoves(inSmall: readonly number[], inLarge: readonly number[], side: "lo" | "hi"): Bound {
  if (inSmall.length === 0 || inLarge.length === 0) throw new Error("an empty set has no bound");
  const pick = side === "lo" ? Math.min : Math.max;
  const small = pick(...inSmall);
  const large = pick(...inLarge);
  return small === large ? small : null;
}

/** The set of integers as an extent, by cap widening, or `undefined` when it is empty. */
export function extentOfSet(inSmall: readonly number[], inLarge: readonly number[]): Extent | undefined {
  if (inSmall.length === 0 && inLarge.length === 0) return undefined;
  if (inSmall.length === 0 || inLarge.length === 0) throw new Error("a set empty in one window and not in the other: the windows are too small");
  return { lo: boundMoves(inSmall, inLarge, "lo"), hi: boundMoves(inSmall, inLarge, "hi") };
}

/** `a ∩ b` by listing the integers of each in two windows. */
export function oracleMeet(a: Extent, b: Extent): Extent | undefined {
  const { small, large } = windowFor([a, b]);
  const common = (cap: number): number[] => {
    const inB = new Set(integersIn(b, cap));
    return integersIn(a, cap).filter((x) => inB.has(x));
  };
  return extentOfSet(common(small), common(large));
}

/**
 * `inner ⊆ outer`: every integer listed for `inner` is listed for `outer`. Asked in both windows, which must
 * agree (they always do for a valid case; a disagreement would mean the window is too small to judge).
 */
export function oracleIsSubset(inner: Extent, outer: Extent): boolean {
  const { small, large } = windowFor([inner, outer]);
  const subsetIn = (cap: number): boolean => {
    const inOuter = new Set(integersIn(outer, cap));
    return integersIn(inner, cap).every((x) => inOuter.has(x));
  };
  const atSmall = subsetIn(small);
  const atLarge = subsetIn(large);
  if (atSmall !== atLarge) throw new Error(`the windows disagree about ${JSON.stringify(inner)} ⊆ ${JSON.stringify(outer)}`);
  return atSmall;
}

/**
 * The sides of `tested` that `established` violates: the lower side when some integer of `established` lies
 * BELOW `tested.lo`, the upper side when some lies ABOVE `tested.hi`. A `null` side of `tested` is violated by
 * nothing. Both windows must agree, as for `oracleIsSubset`.
 */
export function oracleUnmetSides(established: Extent, tested: Extent): ("lo" | "hi")[] {
  const { small, large } = windowFor([established, tested]);
  const unmetIn = (cap: number): ("lo" | "hi")[] => {
    const values = integersIn(established, cap);
    const out: ("lo" | "hi")[] = [];
    if (tested.lo !== null && values.some((x) => x < (tested.lo as number))) out.push("lo");
    if (tested.hi !== null && values.some((x) => x > (tested.hi as number))) out.push("hi");
    return out;
  };
  const atSmall = unmetIn(small);
  const atLarge = unmetIn(large);
  if (atSmall.join() !== atLarge.join()) throw new Error(`the windows disagree about the unmet sides of ${JSON.stringify(established)} against ${JSON.stringify(tested)}`);
  return atSmall;
}

// ---------------------------------------------------------------------------------------------------------
// The sum oracle: a signed sum of integers drawn from extents, by enumerating every assignment.
// ---------------------------------------------------------------------------------------------------------

/** One term of a signed sum: an integer drawn from `extent`, added (`+1`) or subtracted (`-1`). */
export interface Term {
  readonly extent: Extent;
  readonly sign: 1 | -1;
}

export interface Reached {
  readonly min: number;
  readonly max: number;
  /** How many DIFFERENT values the sum took. */
  readonly distinct: number;
}

/**
 * Every assignment of an integer to every term, each term's integer drawn from its extent inside `[-cap, cap]`
 * (a `null` side running to the edge), and the least, greatest and number of distinct values of the signed sum.
 * Plain nested loops, no formula: the sum is built one assignment at a time. The innermost term is a loop and not
 * a call, which is most of the speed of the 3-operand grid.
 */
function enumerateSigned(terms: readonly Term[], cap: number): Reached {
  const n = terms.length;
  const lows = new Int32Array(n);
  const highs = new Int32Array(n);
  const signs = new Int32Array(n);
  terms.forEach((term, t) => {
    const values = integersIn(term.extent, cap); // throws if the window is too small for a finite bound
    lows[t] = values[0] as number;
    highs[t] = values[values.length - 1] as number;
    signs[t] = term.sign;
  });
  // Every term's integer is within `cap` in absolute value, so the signed sum is within `n * cap`.
  const offset = n * cap;
  const seen = new Uint8Array(2 * offset + 1);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let distinct = 0;
  const last = n - 1;
  const lastSign = signs[last] as number;
  const lastLow = lows[last] as number;
  const lastHigh = highs[last] as number;
  const visit = (t: number, partial: number): void => {
    if (t === last) {
      for (let v = lastLow; v <= lastHigh; v++) {
        const total = partial + lastSign * v;
        if (total < min) min = total;
        if (total > max) max = total;
        const slot = total + offset;
        if (seen[slot] === 0) {
          seen[slot] = 1;
          distinct += 1;
        }
      }
      return;
    }
    const sign = signs[t] as number;
    for (let v = lows[t] as number; v <= (highs[t] as number); v++) visit(t + 1, partial + sign * v);
  };
  visit(0, 0);
  return { min, max, distinct };
}

/**
 * Is a set of `distinct` integers, whose least is `min` and greatest is `max`, NOT every integer from `min` to
 * `max`? `{0, 2}` (2 values, 0 to 2) has a hole; `{0, 1, 2}` does not. A pure function so that a test can show it
 * says yes when it should: the grids assert "0 sets with a hole", which a detector that always said no would also pass.
 */
export function hasHole(distinct: number, min: number, max: number): boolean {
  return distinct !== max - min + 1;
}

export interface SumOracle {
  readonly extent: Extent;
  /** True if the integers the sum can take are NOT every integer between its least and greatest (an interval would then be inexact). */
  readonly hasHole: boolean;
}

/**
 * The extent of a signed sum, by cap widening: each side is `null` iff widening the window moves it. The set of
 * values is also checked for holes in the small window, so "an interval represents it exactly" is observed here
 * rather than assumed.
 *
 * `enumerate` is the enumeration, and is a parameter only so that a test can hand `oracleSum` a set WITH a hole
 * (a sum of intervals never has one, so no real input can): that is the only way to see the detector fire all the
 * way through `oracleSum`, call site included.
 */
export function oracleSum(terms: readonly Term[], enumerate: (terms: readonly Term[], cap: number) => Reached = enumerateSigned): SumOracle {
  const { small, large } = windowFor(terms.map((t) => t.extent));
  const atSmall = enumerate(terms, small);
  const atLarge = enumerate(terms, large);
  return {
    extent: { lo: atSmall.min === atLarge.min ? atSmall.min : null, hi: atSmall.max === atLarge.max ? atSmall.max : null },
    hasHole: hasHole(atSmall.distinct, atSmall.min, atSmall.max),
  };
}

/** The extent the sum of `operands` must lie in. */
export function oracleForward(operands: readonly Extent[]): SumOracle {
  return oracleSum(operands.map((extent) => ({ extent, sign: 1 })));
}

/** The extent `result` implies for `operands[index]`: the values `result - (the other operands)` can take. */
export function oracleBackward(result: Extent, operands: readonly Extent[], index: number): SumOracle {
  const others: Term[] = operands.flatMap((extent, position): Term[] => (position === index ? [] : [{ extent, sign: -1 }]));
  return oracleSum([{ extent: result, sign: 1 }, ...others]);
}

/** A running tally for a grid: how many comparisons, and the first few disagreements for the failure message. */
export class Tally {
  checks = 0;
  mismatches = 0;
  holes = 0;
  invalid = 0;
  readonly first: string[] = [];
  note(where: string, actual: Extent, oracle: SumOracle, valid: boolean): void {
    this.checks += 1;
    if (oracle.hasHole) this.holes += 1;
    if (!valid) this.invalid += 1;
    if (actual.lo !== oracle.extent.lo || actual.hi !== oracle.extent.hi) {
      this.mismatches += 1;
      if (this.first.length < 5) this.first.push(`${where}: got ${JSON.stringify(actual)}, oracle ${JSON.stringify(oracle.extent)}`);
    }
  }
}

/**
 * THE WRONG RULE, kept so a test can show it is wrong: "a side is unbounded when the enumerated bound sits at the
 * edge of the (small) window". It is here only for `sum-exactness.test.ts`; nothing else may use it. It is not
 * known to be the rule the plan's first harness used (that harness got 24,276 of 79,764 checks wrong), so its
 * error count is its own and not a reproduction of that figure.
 */
export function naiveSum(terms: readonly Term[]): Extent {
  const { small } = windowFor(terms.map((t) => t.extent));
  const reached = enumerateSigned(terms, small);
  return { lo: reached.min === -small ? null : reached.min, hi: reached.max === small ? null : reached.max };
}
