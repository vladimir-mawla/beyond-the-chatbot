import { describe, expect, it } from "vitest";
import type { Bound, Extent } from "../../contracts/index.js";
import { checkExtent, isSameExtent, isSubset, meet } from "../index.js";
import { ext, gridExtents, GRID_VALUES, oracleIsSubset, oracleMeet } from "./fixtures.js";

/**
 * `meet`, `isSubset` and `isSameExtent` (`.genesis/PLAN.md` section 6 M3 layer 3: "a table for
 * isSubset/meet/unmetSides over every null/non-null combination"; `unmetSides` has its own file, `unmet.test.ts`).
 *
 * Four kinds of test, so that one wrong rule cannot hide behind another:
 *  1. THE TABLE. One side at a time there are six relations between a's bound and b's bound (both unbounded; only
 *     a unbounded; only b unbounded; a below b; equal; a above b). The six lower-side rows and the six upper-side
 *     rows below are written out by hand, each with its answer, and every one of the 36 (lower, upper)
 *     combinations is built from them. The expected answers are the rows, not a call to the code under test.
 *  2. Named cases that sit exactly ON a boundary or on a `null` (`<` against `<=`, `null` against `0`).
 *  3. Properties over the whole 34-extent grid: the lattice laws `meet` and `⊆` must obey.
 *  4. The same grid against the brute-force oracle in `fixtures.ts`.
 */

interface SideCase {
  readonly name: string;
  /** a's bound and b's bound on this side. */
  readonly a: Bound;
  readonly b: Bound;
  /** Is a's bound inside b's on this side (`isSubset` needs this on BOTH sides)? */
  readonly inside: boolean;
  /** What `meet` has on this side. */
  readonly meet: Bound;
  /** Are the two bounds the same (`isSameExtent` needs this on BOTH sides)? */
  readonly same: boolean;
}

// Lower bounds. `null` is minus infinity: a is inside b only if b asks for nothing, or a is bounded and not lower.
const LOWER: readonly SideCase[] = [
  { name: "lo: neither bounded", a: null, b: null, inside: true, meet: null, same: true },
  { name: "lo: only a unbounded", a: null, b: 0, inside: false, meet: 0, same: false },
  { name: "lo: only b unbounded", a: 0, b: null, inside: true, meet: 0, same: false },
  { name: "lo: a below b", a: -1, b: 0, inside: false, meet: 0, same: false },
  { name: "lo: a equals b", a: 0, b: 0, inside: true, meet: 0, same: true },
  { name: "lo: a above b", a: 1, b: 0, inside: true, meet: 1, same: false },
];

// Upper bounds. `null` is plus infinity: a is inside b only if b asks for nothing, or a is bounded and not higher.
const UPPER: readonly SideCase[] = [
  { name: "hi: neither bounded", a: null, b: null, inside: true, meet: null, same: true },
  { name: "hi: only a unbounded", a: null, b: 10, inside: false, meet: 10, same: false },
  { name: "hi: only b unbounded", a: 10, b: null, inside: true, meet: 10, same: false },
  { name: "hi: a below b", a: 9, b: 10, inside: true, meet: 9, same: false },
  { name: "hi: a equals b", a: 10, b: 10, inside: true, meet: 10, same: true },
  { name: "hi: a above b", a: 11, b: 10, inside: false, meet: 10, same: false },
];

describe("the table: every null/non-null relation on the lower side times every one on the upper side", () => {
  it("has 6 x 6 = 36 rows, and every extent in it is valid (lo < hi), so the table never tests an invalid input", () => {
    expect(LOWER).toHaveLength(6);
    expect(UPPER).toHaveLength(6);
    for (const lo of LOWER) {
      for (const hi of UPPER) {
        for (const e of [ext(lo.a, hi.a), ext(lo.b, hi.b)]) expect(checkExtent(e).ok, JSON.stringify(e)).toBe(true);
      }
    }
  });

  for (const lo of LOWER) {
    for (const hi of UPPER) {
      const a = ext(lo.a, hi.a);
      const b = ext(lo.b, hi.b);
      describe(`${lo.name}; ${hi.name}   a=${JSON.stringify(a)} b=${JSON.stringify(b)}`, () => {
        it("isSubset(a, b) holds iff a is inside b on both sides", () => {
          expect(isSubset(a, b)).toBe(lo.inside && hi.inside);
        });
        it("meet(a, b) takes the tighter bound on each side (it is never empty in this table)", () => {
          expect(meet(a, b)).toStrictEqual({ lo: lo.meet, hi: hi.meet });
        });
        it("isSameExtent(a, b) holds iff both sides are the same", () => {
          expect(isSameExtent(a, b)).toBe(lo.same && hi.same);
        });
      });
    }
  }
});

describe("meet: an empty intersection is `undefined`, and a shared single integer is not empty", () => {
  const CASES: readonly (readonly [string, Extent, Extent, Extent | undefined])[] = [
    ["overlap", ext(0, 5), ext(3, 9), ext(3, 5)],
    ["touching at one integer", ext(0, 5), ext(5, 9), ext(5, 5)],
    ["adjacent integers share none", ext(0, 4), ext(5, 9), undefined],
    ["a gap", ext(0, 1), ext(3, 4), undefined],
    ["two different points", ext(3, 3), ext(4, 4), undefined],
    ["the same point", ext(-5, -5), ext(-5, -5), ext(-5, -5)],
    ["the point zero", ext(0, 0), ext(0, 0), ext(0, 0)],
    ["below meets above, with a gap", ext(null, 0), ext(1, null), undefined],
    ["below meets above, sharing one integer", ext(null, 1), ext(1, null), ext(1, 1)],
    ["below a negative meets above zero", ext(null, -3), ext(0, null), undefined],
    ["unbounded meets a bounded extent", ext(null, null), ext(2, 7), ext(2, 7)],
    ["a bounded extent meets unbounded", ext(2, 7), ext(null, null), ext(2, 7)],
    ["unbounded below meets unbounded above", ext(null, 5), ext(2, null), ext(2, 5)],
    ["both unbounded above", ext(-5, null), ext(-9, null), ext(-5, null)],
    ["both unbounded below", ext(null, 5), ext(null, 3), ext(null, 3)],
    ["containment", ext(0, 10), ext(2, 3), ext(2, 3)],
  ];
  for (const [name, a, b, expected] of CASES) {
    it(name, () => {
      expect(meet(a, b)).toStrictEqual(expected);
      expect(meet(b, a)).toStrictEqual(expected); // commutative
    });
  }
});

describe("the boundary: `<=` against `<` in isSubset, and `null` against `0`", () => {
  it("an extent is a subset of itself, bound for bound", () => {
    for (const e of [ext(3, 5), ext(3, 3), ext(-4, -4), ext(null, 5), ext(3, null), ext(null, null)]) {
      expect(isSubset(e, e), JSON.stringify(e)).toBe(true);
    }
  });

  it("equal on one side and strictly inside on the other is a subset; strictly outside on either side is not", () => {
    expect(isSubset(ext(3, 5), ext(3, 6))).toBe(true); // lo equal, hi inside
    expect(isSubset(ext(3, 5), ext(2, 5))).toBe(true); // hi equal, lo inside
    expect(isSubset(ext(3, 5), ext(4, 5))).toBe(false); // lo one outside
    expect(isSubset(ext(3, 5), ext(3, 4))).toBe(false); // hi one outside
    expect(isSubset(ext(3, 3), ext(3, 3))).toBe(true);
    expect(isSubset(ext(3, 3), ext(4, 9))).toBe(false);
    expect(isSubset(ext(3, 3), ext(-9, 2))).toBe(false);
  });

  it("null is not 0: an unbounded side is not inside a bounded one, even the bound 0", () => {
    expect(isSubset(ext(null, 5), ext(0, 5))).toBe(false);
    expect(isSubset(ext(0, null), ext(0, 5))).toBe(false);
    expect(isSubset(ext(null, null), ext(0, 0))).toBe(false);
    expect(isSubset(ext(null, -1), ext(-9, -1))).toBe(false);
    expect(isSubset(ext(-9, null), ext(-9, -1))).toBe(false);
  });

  it("and anything is inside an unbounded side, including a bounded one whose bound is 0", () => {
    expect(isSubset(ext(0, 0), ext(null, null))).toBe(true);
    expect(isSubset(ext(0, 5), ext(null, 5))).toBe(true);
    expect(isSubset(ext(0, 5), ext(0, null))).toBe(true);
    expect(isSubset(ext(null, 5), ext(null, 9))).toBe(true);
    expect(isSubset(ext(3, null), ext(-2, null))).toBe(true);
  });

  it("meet does not read null as 0: an unbounded side takes the other operand's bound, whichever sign it has", () => {
    expect(meet(ext(null, 5), ext(-7, null))).toStrictEqual(ext(-7, 5));
    expect(meet(ext(null, -2), ext(-7, null))).toStrictEqual(ext(-7, -2));
    expect(meet(ext(null, null), ext(-7, -2))).toStrictEqual(ext(-7, -2));
    expect(meet(ext(4, null), ext(null, 9))).toStrictEqual(ext(4, 9));
  });

  it("isSameExtent: null is equal only to null, never to 0", () => {
    expect(isSameExtent(ext(null, 5), ext(0, 5))).toBe(false);
    expect(isSameExtent(ext(0, 5), ext(null, 5))).toBe(false);
    expect(isSameExtent(ext(3, null), ext(3, 0))).toBe(false);
    expect(isSameExtent(ext(null, null), ext(0, 0))).toBe(false);
    expect(isSameExtent(ext(null, null), ext(null, null))).toBe(true);
  });

  it("isSameExtent looks at both sides, and treats -0 as 0 without help from checkExtent", () => {
    expect(isSameExtent(ext(1, 2), ext(1, 2))).toBe(true);
    expect(isSameExtent(ext(1, 2), ext(1, 3))).toBe(false);
    expect(isSameExtent(ext(1, 2), ext(0, 2))).toBe(false);
    expect(isSameExtent(ext(-0, 2), ext(0, 2))).toBe(true);
    expect(isSameExtent(ext(0, -0), ext(0, 0))).toBe(true);
  });
});

describe("results are fresh and inputs are left alone", () => {
  it("meet returns a new object even when the answer equals an operand, and does not alias either", () => {
    const a = Object.freeze(ext(1, 5));
    const b = Object.freeze(ext(1, 5));
    const result = meet(a, b);
    expect(result).toStrictEqual(ext(1, 5));
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(meet(a, b)).not.toBe(result);
  });

  it("frozen inputs are accepted by all three (none writes to its arguments)", () => {
    const a = Object.freeze(ext(1, 5));
    const b = Object.freeze(ext(null, 9));
    expect(() => {
      meet(a, b);
      isSubset(a, b);
      isSameExtent(a, b);
    }).not.toThrow();
  });
});

describe("the grid: the laws meet and ⊆ must obey, over all 34 valid extents with sides in {null, -2..3}", () => {
  const GRID = gridExtents(GRID_VALUES);

  it("the grid has the plan's 34 extents", () => {
    expect(GRID).toHaveLength(34);
  });

  it("meet is commutative, idempotent, and always valid (it passes checkExtent) when not empty", () => {
    for (const a of GRID) {
      expect(meet(a, a), JSON.stringify(a)).toStrictEqual(a);
      for (const b of GRID) {
        const ab = meet(a, b);
        expect(ab, `${JSON.stringify(a)} ${JSON.stringify(b)}`).toStrictEqual(meet(b, a));
        if (ab !== undefined) expect(checkExtent(ab).ok).toBe(true);
      }
    }
  });

  it("meet(a, b) is the greatest extent inside both: inside each, and every extent inside both is inside it", () => {
    let triples = 0;
    for (const a of GRID) {
      for (const b of GRID) {
        const ab = meet(a, b);
        if (ab !== undefined) {
          expect(isSubset(ab, a)).toBe(true);
          expect(isSubset(ab, b)).toBe(true);
        }
        for (const c of GRID) {
          triples += 1;
          const insideBoth = isSubset(c, a) && isSubset(c, b);
          // c is inside both exactly when the meet exists and c is inside it.
          expect(insideBoth, `${JSON.stringify(c)} in ${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(ab !== undefined && isSubset(c, ab));
        }
      }
    }
    expect(triples).toBe(34 ** 3);
  });

  it("⊆ is reflexive, transitive, and antisymmetric exactly up to isSameExtent", () => {
    for (const a of GRID) {
      expect(isSubset(a, a)).toBe(true);
      for (const b of GRID) {
        expect(isSubset(a, b) && isSubset(b, a), `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(isSameExtent(a, b));
        for (const c of GRID) {
          if (isSubset(a, b) && isSubset(b, c)) expect(isSubset(a, c)).toBe(true);
        }
      }
    }
  });

  it("a is inside b exactly when meet(a, b) is a", () => {
    for (const a of GRID) {
      for (const b of GRID) {
        const ab = meet(a, b);
        expect(isSubset(a, b), `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(ab !== undefined && isSameExtent(ab, a));
      }
    }
  });
});

describe("the grid against the brute-force oracle: every ordered pair of the 34 extents", () => {
  const GRID = gridExtents(GRID_VALUES);

  it("meet, isSubset and isSameExtent agree with listing the integers (34 x 34 = 1,156 pairs, three functions)", () => {
    let checks = 0;
    const mismatches: string[] = [];
    for (const a of GRID) {
      for (const b of GRID) {
        const where = `${JSON.stringify(a)} ${JSON.stringify(b)}`;
        const expectedMeet = oracleMeet(a, b);
        const actualMeet = meet(a, b);
        checks += 1;
        if (JSON.stringify(actualMeet) !== JSON.stringify(expectedMeet)) mismatches.push(`meet ${where}`);

        checks += 1;
        if (isSubset(a, b) !== oracleIsSubset(a, b)) mismatches.push(`isSubset ${where}`);

        // Two extents are the same exactly when each is a subset of the other, as listed.
        checks += 1;
        if (isSameExtent(a, b) !== (oracleIsSubset(a, b) && oracleIsSubset(b, a))) mismatches.push(`isSameExtent ${where}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(checks).toBe(3 * 34 * 34);
  });
});
