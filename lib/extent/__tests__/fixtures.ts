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
