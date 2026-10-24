import { describe, expect, it } from "vitest";
import type { Extent, NonEmptyReadonlyArray } from "../../contracts/index.js";
import { meet, sumBackward, sumForward } from "../index.js";
import { ext } from "./fixtures.js";

/**
 * `sumForward` and `sumBackward`, worked out by hand: numbers a reader can check with pencil and paper,
 * including the three the plan's section 7 gives for the order desk, so a bug that a brute-force enumeration
 * and the code happened to share would still meet an answer worked out independently.
 */

const ops = (...extents: Extent[]): NonEmptyReadonlyArray<Extent> => extents as unknown as NonEmptyReadonlyArray<Extent>;
const NONE = { lo: null, hi: null };

describe("sumForward, by hand", () => {
  it("adds lower bounds and upper bounds separately", () => {
    expect(sumForward(ops(ext(1, 2), ext(3, 5)))).toStrictEqual(ext(4, 7));
    expect(sumForward(ops(ext(-2, -1), ext(-5, -3)))).toStrictEqual(ext(-7, -4));
    expect(sumForward(ops(ext(-3, 4), ext(2, 2)))).toStrictEqual(ext(-1, 6));
  });

  it("the plan's section 7: step 4's delivery is [4, 9] and step 1's is 'at least 4'", () => {
    const pack = ext(1, 2);
    const transit = ext(3, 5);
    expect(sumForward(ops(pack, transit, ext(0, 2)))).toStrictEqual(ext(4, 9));
    expect(sumForward(ops(pack, transit, ext(0, null)))).toStrictEqual(ext(4, null));
  });

  it("one unbounded term makes that side of the sum unbounded, and only that side", () => {
    expect(sumForward(ops(ext(null, 5), ext(2, 3)))).toStrictEqual(ext(null, 8));
    expect(sumForward(ops(ext(1, null), ext(2, 3)))).toStrictEqual(ext(3, null));
    expect(sumForward(ops(ext(2, 3), ext(null, 5), ext(1, 1)))).toStrictEqual(ext(null, 9));
    expect(sumForward(ops(ext(null, 5), ext(2, null)))).toStrictEqual(NONE);
    expect(sumForward(ops(ext(null, null), ext(2, 3)))).toStrictEqual(NONE);
  });

  it("null is not 0: an unbounded lower side stays unbounded next to a negative bound, and an unbounded upper side next to a positive one", () => {
    expect(sumForward(ops(ext(null, 5), ext(-3, -1)))).toStrictEqual(ext(null, 4));
    expect(sumForward(ops(ext(null, -5), ext(-3, -1)))).toStrictEqual(ext(null, -6));
    expect(sumForward(ops(ext(3, null), ext(1, 2)))).toStrictEqual(ext(4, null));
    // Read as 0, the lower side of the first would be 0 + -3 = -3, a bound that nothing supports.
  });

  it("an unbounded FIRST operand is not skipped (the running total starts at 0 only because 0 adds nothing)", () => {
    expect(sumForward(ops(ext(null, 1), ext(2, 2)))).toStrictEqual(ext(null, 3));
    expect(sumForward(ops(ext(2, 2), ext(null, 1)))).toStrictEqual(ext(null, 3));
  });

  it("one operand sums to itself, as a new object; [0, 0] changes nothing", () => {
    const only = ext(-4, 9);
    const result = sumForward(ops(only));
    expect(result).toStrictEqual(ext(-4, 9));
    expect(result).not.toBe(only);
    expect(sumForward(ops(ext(1, 5), ext(0, 0)))).toStrictEqual(ext(1, 5));
    expect(sumForward(ops(ext(null, 5), ext(0, 0)))).toStrictEqual(ext(null, 5));
  });

  it("order of the operands does not matter", () => {
    expect(sumForward(ops(ext(1, 2), ext(null, 5), ext(-3, 7)))).toStrictEqual(sumForward(ops(ext(-3, 7), ext(1, 2), ext(null, 5))));
  });

  it("leaves its inputs alone: frozen operands are accepted, and the answer is never one of them", () => {
    const a = Object.freeze(ext(1, 2));
    const b = Object.freeze(ext(3, 4));
    const result = sumForward(ops(a, b));
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(sumForward(ops(a, b))).not.toBe(result);
  });

  it("an empty list is outside the type; the loop gives the exact sum of no terms, [0, 0] (pinned so a change is deliberate)", () => {
    expect(sumForward([] as unknown as NonEmptyReadonlyArray<Extent>)).toStrictEqual(ext(0, 0));
  });
});

describe("sumBackward, by hand", () => {
  it("lower bound is result.lo minus the OTHERS' upper bounds; upper bound is result.hi minus the others' lower bounds", () => {
    const z = ext(10, 20);
    const xs = ops(ext(0, 0), ext(1, 2), ext(3, 5));
    // index 0: others are [1,2] and [3,5]: lo = 10 - (2 + 5) = 3, hi = 20 - (1 + 3) = 16.
    expect(sumBackward(z, xs, 0)).toStrictEqual(ext(3, 16));
    // The two sides cross. Swapping them would give [6, 13] (lo = 10 - (1 + 3), hi = 20 - (2 + 5)), which is NOT this.
    expect(sumBackward(z, xs, 0)).not.toStrictEqual(ext(6, 13));
    // index 1: others are [0,0] and [3,5]: lo = 10 - 5 = 5, hi = 20 - 3 = 17.
    expect(sumBackward(z, xs, 1)).toStrictEqual(ext(5, 17));
    // index 2: others are [0,0] and [1,2]: lo = 10 - 2 = 8, hi = 20 - 1 = 19.
    expect(sumBackward(z, xs, 2)).toStrictEqual(ext(8, 19));
  });

  it("the plan's section 7, step 6: 14 days in all, packing 1 to 2 and transit 3 to 5, leaves customs 7 to 10, a number no document says", () => {
    const delivery = ext(14, 14);
    const operands = ops(ext(1, 2), ext(3, 5), ext(0, null));
    expect(sumBackward(delivery, operands, 2)).toStrictEqual(ext(7, 10));
  });

  it("the operand at `index` is ignored, even when it is unbounded; the others are not", () => {
    expect(sumBackward(ext(10, 20), ops(ext(null, null), ext(1, 2)), 0)).toStrictEqual(ext(8, 19));
    expect(sumBackward(ext(10, 20), ops(ext(null, null), ext(1, 2)), 1)).toStrictEqual(NONE);
    expect(sumBackward(ext(10, 20), ops(ext(0, 0), ext(7, 7)), 0)).toStrictEqual(ext(3, 13));
  });

  it("null: an unbounded result side, or an unbounded other operand on the side it needs, gives null on the matching side only", () => {
    // result.lo null -> lo null, hi still computed.
    expect(sumBackward(ext(null, 20), ops(ext(0, 0), ext(1, 2)), 0)).toStrictEqual(ext(null, 19));
    // result.hi null -> hi null, lo still computed.
    expect(sumBackward(ext(10, null), ops(ext(0, 0), ext(1, 2)), 0)).toStrictEqual(ext(8, null));
    // another operand unbounded ABOVE hurts the lower bound (it could be huge, so this one could be tiny)...
    expect(sumBackward(ext(10, 20), ops(ext(0, 0), ext(1, null)), 0)).toStrictEqual(ext(null, 19));
    // ...and one unbounded BELOW hurts the upper bound.
    expect(sumBackward(ext(10, 20), ops(ext(0, 0), ext(null, 2)), 0)).toStrictEqual(ext(8, null));
    // Neither side of an operand that is unbounded on the OTHER side matters here.
    expect(sumBackward(ext(10, 20), ops(ext(0, 0), ext(null, null)), 0)).toStrictEqual(NONE);
    expect(sumBackward(NONE, ops(ext(0, 0), ext(1, 2)), 0)).toStrictEqual(NONE);
  });

  it("null is not 0: an unbounded result side next to a negative or positive bound still gives null", () => {
    expect(sumBackward(ext(null, -3), ops(ext(0, 0), ext(-9, -4)), 0)).toStrictEqual(ext(null, 6));
    expect(sumBackward(ext(3, null), ops(ext(0, 0), ext(4, 9)), 0)).toStrictEqual(ext(-6, null));
  });

  it("one operand: the result itself, as a new object", () => {
    const z = ext(-2, 7);
    const answer = sumBackward(z, ops(ext(0, 0)), 0);
    expect(answer).toStrictEqual(ext(-2, 7));
    expect(answer).not.toBe(z);
  });

  it("is not intersected with the operand's own extent (that is the caller's meet)", () => {
    // x0 is declared [0, 1] but the others leave 8 to 19 for it: the answer is [8, 19], not their overlap.
    expect(sumBackward(ext(10, 20), ops(ext(0, 1), ext(1, 2)), 0)).toStrictEqual(ext(8, 19));
  });

  it("leaves its inputs alone and returns a new object each time", () => {
    const z = Object.freeze(ext(10, 20));
    const xs = ops(Object.freeze(ext(0, 1)), Object.freeze(ext(1, 2)));
    const first = sumBackward(z, xs, 0);
    expect(first).not.toBe(z);
    expect(sumBackward(z, xs, 0)).not.toBe(first);
  });
});

describe("sumBackward with an index that names no operand implies NOTHING: { lo: null, hi: null }, never a throw, never a bound", () => {
  const z = ext(3, 3);
  const operands = ops(ext(0, 0), ext(1, 1), ext(2, 2));
  const BAD: readonly (readonly [string, unknown])[] = [
    ["-1", -1],
    ["the length", 3],
    ["one past the length", 4],
    ["a huge index", Number.MAX_SAFE_INTEGER],
    ["2**53", 2 ** 53],
    ["a fraction", 1.5],
    ["a fraction just above 0", 0.1],
    ["a fraction just below the length", 2.9],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a numeric string", "0"],
    ["undefined", undefined],
    ["null", null],
    ["an object", {}],
    ["a boolean", true],
  ];
  for (const [name, index] of BAD) {
    it(name, () => {
      expect(() => sumBackward(z, operands, index as number)).not.toThrow();
      expect(sumBackward(z, operands, index as number)).toStrictEqual(NONE);
    });
  }

  it("is a new object each time, so a caller that edits it cannot change the next answer", () => {
    const first = sumBackward(z, operands, 99) as { lo: number | null; hi: number | null };
    first.lo = 7;
    expect(sumBackward(z, operands, 99)).toStrictEqual(NONE);
  });

  it("never tightens: whatever extent the caller meets the answer with comes back unchanged", () => {
    for (const domain of [ext(0, 0), ext(-5, 9), ext(null, 3), ext(2, null), ext(null, null)]) {
      for (const index of [-1, 3, Number.NaN, 0.5]) {
        expect(meet(domain, sumBackward(z, operands, index)), `${JSON.stringify(domain)} at ${index}`).toStrictEqual(domain);
      }
    }
  });

  it("the valid indexes at the two ends still work: 0 and length - 1 (so the guard is not off by one either way)", () => {
    expect(sumBackward(z, operands, 0)).toStrictEqual(ext(0, 0)); // 3 - (1 + 2) = 0 on both sides
    expect(sumBackward(z, operands, 2)).toStrictEqual(ext(2, 2)); // 3 - (0 + 1) = 2
  });

  it("-0 is the index 0 (as operands[-0] is operands[0]), not an out-of-range index", () => {
    expect(sumBackward(z, operands, -0)).toStrictEqual(sumBackward(z, operands, 0));
  });

  it("an empty operand list is outside the type, and every index is then out of range", () => {
    expect(sumBackward(z, [] as unknown as NonEmptyReadonlyArray<Extent>, 0)).toStrictEqual(NONE);
  });
});
