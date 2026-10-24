import { describe, expect, it } from "vitest";
import type { Bound, Side } from "../../contracts/index.js";
import { isSubset, unmetSides } from "../index.js";
import { ext, gridExtents, GRID_VALUES, oracleUnmetSides } from "./fixtures.js";

/**
 * `unmetSides(established, tested)`: the sides of `tested` that `established` does not satisfy, which is the
 * cut a `weakened` ruling has to name (`.genesis/PLAN.md` section 4.2). Plan section 6 M3's fourth sabotage is
 * "make `unmetSides` report both sides always"; what that does to THESE tests is in the sabotage ledger of
 * `.genesis/decisions/0003-extent.md`.
 *
 * The table is the same six relations per side as in `meet-subset.test.ts`, with the answer rewritten from the
 * point of view of `tested`: a side is unmet only if `tested` BOUNDS it and `established` is unbounded there or
 * lies past it. Written separately and by hand, not derived from the other table.
 */

interface SideCase {
  readonly name: string;
  /** `established`'s bound and `tested`'s bound on this side. */
  readonly established: Bound;
  readonly tested: Bound;
  readonly unmet: boolean;
}

const LOWER: readonly SideCase[] = [
  { name: "lo: neither bounded: tested asks for nothing", established: null, tested: null, unmet: false },
  { name: "lo: established unbounded, tested asks for at least 0", established: null, tested: 0, unmet: true },
  { name: "lo: established is bounded, tested asks for nothing", established: 0, tested: null, unmet: false },
  { name: "lo: established starts below what tested asks", established: -1, tested: 0, unmet: true },
  { name: "lo: established starts exactly where tested asks", established: 0, tested: 0, unmet: false },
  { name: "lo: established starts above what tested asks", established: 1, tested: 0, unmet: false },
];

const UPPER: readonly SideCase[] = [
  { name: "hi: neither bounded: tested asks for nothing", established: null, tested: null, unmet: false },
  { name: "hi: established unbounded, tested asks for at most 10", established: null, tested: 10, unmet: true },
  { name: "hi: established is bounded, tested asks for nothing", established: 10, tested: null, unmet: false },
  { name: "hi: established ends below what tested allows", established: 9, tested: 10, unmet: false },
  { name: "hi: established ends exactly where tested allows", established: 10, tested: 10, unmet: false },
  { name: "hi: established ends above what tested allows", established: 11, tested: 10, unmet: true },
];

const expectedFor = (lo: SideCase, hi: SideCase): Side[] => [...(lo.unmet ? (["lo"] as const) : []), ...(hi.unmet ? (["hi"] as const) : [])];

describe("the table: every null/non-null relation on the lower side times every one on the upper side", () => {
  it("has 36 rows and reaches each of the four possible answers", () => {
    const answers = new Set<string>();
    for (const lo of LOWER) for (const hi of UPPER) answers.add(JSON.stringify(expectedFor(lo, hi)));
    expect([...answers].sort()).toEqual([JSON.stringify([]), JSON.stringify(["hi"]), JSON.stringify(["lo", "hi"]), JSON.stringify(["lo"])].sort());
    expect(LOWER.length * UPPER.length).toBe(36);
  });

  for (const lo of LOWER) {
    for (const hi of UPPER) {
      const established = ext(lo.established, hi.established);
      const tested = ext(lo.tested, hi.tested);
      it(`${lo.name}; ${hi.name}`, () => {
        expect(unmetSides(established, tested)).toStrictEqual(expectedFor(lo, hi));
      });
    }
  }
});

describe("named cases", () => {
  it("the four answers, one example each", () => {
    expect(unmetSides(ext(0, 10), ext(0, 10))).toStrictEqual([]);
    expect(unmetSides(ext(0, 20), ext(0, 10))).toStrictEqual(["hi"]);
    expect(unmetSides(ext(-5, 10), ext(0, 10))).toStrictEqual(["lo"]);
    expect(unmetSides(ext(-5, 20), ext(0, 10))).toStrictEqual(["lo", "hi"]);
  });

  it("the boundary: a side that equals the tested bound is met, one past it is not", () => {
    expect(unmetSides(ext(3, 5), ext(3, 5))).toStrictEqual([]);
    expect(unmetSides(ext(2, 5), ext(3, 5))).toStrictEqual(["lo"]);
    expect(unmetSides(ext(3, 6), ext(3, 5))).toStrictEqual(["hi"]);
    expect(unmetSides(ext(4, 4), ext(3, 5))).toStrictEqual([]);
  });

  it("null is not 0: an unbounded established side fails a bounded tested side, whatever that bound is", () => {
    expect(unmetSides(ext(null, 5), ext(0, 5))).toStrictEqual(["lo"]);
    expect(unmetSides(ext(null, 5), ext(-9, 5))).toStrictEqual(["lo"]);
    expect(unmetSides(ext(3, null), ext(null, 3))).toStrictEqual(["hi"]);
    expect(unmetSides(ext(3, null), ext(null, 99))).toStrictEqual(["hi"]);
    expect(unmetSides(ext(null, null), ext(0, 0))).toStrictEqual(["lo", "hi"]);
  });

  it("a tested side that is null is never unmet, however loose established is", () => {
    expect(unmetSides(ext(null, null), ext(null, null))).toStrictEqual([]);
    expect(unmetSides(ext(null, null), ext(null, 3))).toStrictEqual(["hi"]);
    expect(unmetSides(ext(null, null), ext(3, null))).toStrictEqual(["lo"]);
    expect(unmetSides(ext(5, 5), ext(null, null))).toStrictEqual([]);
  });

  it("the sides come out in the order lo, hi, never hi, lo", () => {
    expect(unmetSides(ext(null, null), ext(1, 2))).toStrictEqual(["lo", "hi"]);
  });

  it("the plan's section 7 rulings: the cut each weakened claim names, from the established extent the plan gives", () => {
    // Step 1, snapshot {o1, o2}: delivery established "at least 4" = [4, null].
    const delivery = ext(4, null);
    expect(unmetSides(delivery, ext(null, 12))).toStrictEqual(["hi"]); // the question "by day 12": the upper side is the cut
    expect(unmetSides(delivery, ext(7, 7))).toStrictEqual(["lo", "hi"]); // the draft "delivery = 7"
    expect(unmetSides(delivery, ext(4, null))).toStrictEqual([]); // step 2, "at least 4": entailed, no cut
    // Step 1, packDays established [1, 2]; the draft "pack = 1" is cut on the upper side only.
    expect(unmetSides(ext(1, 2), ext(1, 1))).toStrictEqual(["hi"]);
    // Step 4, customs established [0, 2]; the draft "customs = 1" is cut on both sides.
    expect(unmetSides(ext(0, 2), ext(1, 1))).toStrictEqual(["lo", "hi"]);
    // Step 4, delivery established [4, 9]; the question "by day 12" is entailed: no cut.
    expect(unmetSides(ext(4, 9), ext(null, 12))).toStrictEqual([]);
  });
});

describe("a fresh array every call", () => {
  it("is not shared: changing one answer does not change the next, and an empty answer is fresh too", () => {
    const first = unmetSides(ext(null, null), ext(1, 2)) as Side[];
    first.length = 0;
    first.push("hi");
    expect(unmetSides(ext(null, null), ext(1, 2))).toStrictEqual(["lo", "hi"]);

    const empty = unmetSides(ext(1, 2), ext(1, 2)) as Side[];
    empty.push("lo");
    expect(unmetSides(ext(1, 2), ext(1, 2))).toStrictEqual([]);
    expect(unmetSides(ext(1, 2), ext(1, 2))).not.toBe(unmetSides(ext(1, 2), ext(1, 2)));
  });

  it("frozen inputs are accepted", () => {
    expect(() => unmetSides(Object.freeze(ext(1, 2)), Object.freeze(ext(0, 5)))).not.toThrow();
  });
});

describe("the grid: all 34 x 34 ordered pairs of extents with sides in {null, -2..3}", () => {
  const GRID = gridExtents(GRID_VALUES);

  it("agrees with the brute-force oracle: a side is unmet iff some integer of established lies past tested's bound there", () => {
    let checks = 0;
    const mismatches: string[] = [];
    for (const established of GRID) {
      for (const tested of GRID) {
        checks += 1;
        const actual = unmetSides(established, tested);
        const expected = oracleUnmetSides(established, tested);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(`${JSON.stringify(established)} ${JSON.stringify(tested)}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(checks).toBe(34 * 34);
  });

  it("is empty exactly when established is a subset of tested", () => {
    for (const established of GRID) {
      for (const tested of GRID) {
        expect(unmetSides(established, tested).length === 0, `${JSON.stringify(established)} ${JSON.stringify(tested)}`).toBe(isSubset(established, tested));
      }
    }
  });

  it("never names a side tested leaves unbounded", () => {
    for (const established of GRID) {
      for (const tested of GRID) {
        const unmet = unmetSides(established, tested);
        if (tested.lo === null) expect(unmet).not.toContain("lo");
        if (tested.hi === null) expect(unmet).not.toContain("hi");
      }
    }
  });

  it("and over the grid every one of the four answers occurs, so the checks above are not all about one answer", () => {
    const seen = new Set<string>();
    for (const established of GRID) for (const tested of GRID) seen.add(JSON.stringify(unmetSides(established, tested)));
    expect(seen.size).toBe(4);
  });
});
