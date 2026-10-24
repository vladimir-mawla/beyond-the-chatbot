import { describe, expect, it } from "vitest";
import type { Extent, NonEmptyReadonlyArray } from "../../contracts/index.js";
import { MAX_FIELDS, MAX_MAGNITUDE } from "../../contracts/index.js";
import { checkExtent, sumBackward, sumForward } from "../index.js";
import { ext } from "./fixtures.js";

/**
 * THE BOUNDARIES (`.genesis/PLAN.md` section 6 M3, layer 2): N and N+1 for `MAX_MAGNITUDE`, and a worst case of
 * 63 operands cross-checked against `BigInt`.
 *
 * WHY 63. M1's `MAX_FIELDS` is 64, and a sum with 63 operands plus its own result field is the most operands one
 * 64-field schema can give a single sum. (`MAX_OPERANDS`, M1's cap of 8 operands per sum, is not enforced
 * anywhere in this layer, and 63 is past it.) With every bound at `MAX_MAGNITUDE` in absolute value, the largest
 * value a call on at most 63 operands can produce is 63 x 2**40, below `MAX_FIELDS x MAX_MAGNITUDE = 2**46`,
 * which is itself far below `Number.MAX_SAFE_INTEGER`. That is the argument for using plain `number` and not
 * `BigInt`; M1's `limits.ts` states it and leaves its check to this file.
 *
 * WHAT THIS DOES NOT SHOW. Two cases (a single call with 63 operands, and a ladder of 62 chained calls), each at
 * the extreme values and on a seeded sample of values near the extremes. It is not a proof for every magnitude
 * and every shape of tree, and it says nothing about a tree deeper or wider than a 64-field schema can be.
 */

const MAX = BigInt(MAX_MAGNITUDE);
const OPERANDS = 63;

const ops = (extents: readonly Extent[]): NonEmptyReadonlyArray<Extent> => extents as unknown as NonEmptyReadonlyArray<Extent>;

/** A seeded generator (mulberry32), so a failure here can be replayed. No new dependency. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Values at and next to the edge of the allowed range, and the middle. */
const NEAR_EDGE: readonly number[] = [-MAX_MAGNITUDE, -MAX_MAGNITUDE + 1, -MAX_MAGNITUDE + 2, -1, 0, 1, MAX_MAGNITUDE - 2, MAX_MAGNITUDE - 1, MAX_MAGNITUDE];

function randomExtent(next: () => number): Extent {
  const pick = (): number => NEAR_EDGE[Math.floor(next() * NEAR_EDGE.length)] as number;
  const [a, b] = [pick(), pick()];
  return a <= b ? ext(a, b) : ext(b, a);
}

const big = (bound: number | null): bigint => {
  if (bound === null) throw new Error("this cross-check is for finite bounds");
  return BigInt(bound);
};

describe("checkExtent at MAX_MAGNITUDE: N is accepted, N + 1 is refused, on each side and each sign", () => {
  it("the premise: MAX_MAGNITUDE + 1 is a distinct, exactly representable integer (so N + 1 is a real test, not a rounding of N)", () => {
    expect(MAX_MAGNITUDE + 1).not.toBe(MAX_MAGNITUDE);
    expect(Number.isSafeInteger(MAX_MAGNITUDE + 1)).toBe(true);
    expect(-(MAX_MAGNITUDE + 1)).not.toBe(-MAX_MAGNITUDE);
  });

  it("accepts N and -N, alone and together, and N - 1", () => {
    for (const [lo, hi] of [
      [MAX_MAGNITUDE, MAX_MAGNITUDE],
      [-MAX_MAGNITUDE, -MAX_MAGNITUDE],
      [-MAX_MAGNITUDE, MAX_MAGNITUDE],
      [-MAX_MAGNITUDE, null],
      [null, MAX_MAGNITUDE],
      [MAX_MAGNITUDE - 1, MAX_MAGNITUDE],
      [-MAX_MAGNITUDE, -MAX_MAGNITUDE + 1],
    ] as const) {
      expect(checkExtent({ lo, hi }), `[${lo}, ${hi}]`).toStrictEqual({ ok: true, extent: { lo, hi } });
    }
  });

  it("refuses N + 1 as lo, as hi, and the same negated, naming the side", () => {
    expect(checkExtent({ lo: MAX_MAGNITUDE + 1, hi: null })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "lo" });
    expect(checkExtent({ lo: null, hi: MAX_MAGNITUDE + 1 })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "hi" });
    expect(checkExtent({ lo: -(MAX_MAGNITUDE + 1), hi: null })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "lo" });
    expect(checkExtent({ lo: null, hi: -(MAX_MAGNITUDE + 1) })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "hi" });
  });

  it("refuses N + 1 even in an otherwise valid extent, and reports the lower side first when both are out", () => {
    expect(checkExtent({ lo: 0, hi: MAX_MAGNITUDE + 1 })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "hi" });
    expect(checkExtent({ lo: -(MAX_MAGNITUDE + 1), hi: 0 })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "lo" });
    expect(checkExtent({ lo: -(MAX_MAGNITUDE + 1), hi: MAX_MAGNITUDE + 1 })).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "lo" });
  });

  it("at the edge, an inverted pair is still inverted and a point is still a point", () => {
    expect(checkExtent({ lo: MAX_MAGNITUDE, hi: -MAX_MAGNITUDE })).toStrictEqual({ ok: false, reason: "inverted" });
    expect(checkExtent({ lo: MAX_MAGNITUDE, hi: MAX_MAGNITUDE - 1 })).toStrictEqual({ ok: false, reason: "inverted" });
    expect(checkExtent({ lo: -MAX_MAGNITUDE, hi: -MAX_MAGNITUDE }).ok).toBe(true);
  });
});

describe(`sumForward over ${OPERANDS} operands, against BigInt`, () => {
  it("the premise: 63 operands plus their result is the 64 fields of MAX_FIELDS, and 63 x 2**40 is below 2**46 = MAX_FIELDS x MAX_MAGNITUDE", () => {
    expect(OPERANDS + 1).toBe(MAX_FIELDS);
    expect(BigInt(OPERANDS) * MAX).toBeLessThan(2n ** 46n);
    expect(BigInt(MAX_FIELDS) * MAX).toBe(2n ** 46n);
  });

  const EXTREMES: readonly (readonly [string, Extent])[] = [
    ["[-N, N]", ext(-MAX_MAGNITUDE, MAX_MAGNITUDE)],
    ["[N, N]", ext(MAX_MAGNITUDE, MAX_MAGNITUDE)],
    ["[-N, -N]", ext(-MAX_MAGNITUDE, -MAX_MAGNITUDE)],
  ];
  for (const [name, operand] of EXTREMES) {
    it(`every operand ${name}: exact, a safe integer, and inside 2**46`, () => {
      const operands = Array.from({ length: OPERANDS }, () => operand);
      const result = sumForward(ops(operands));
      expect(BigInt(result.lo as number)).toBe(BigInt(OPERANDS) * big(operand.lo));
      expect(BigInt(result.hi as number)).toBe(BigInt(OPERANDS) * big(operand.hi));
      for (const side of [result.lo, result.hi] as const) {
        expect(Number.isSafeInteger(side)).toBe(true);
        expect(Math.abs(side as number)).toBeLessThan(2 ** 46);
      }
    });
  }

  it("one more than the plan's worst case, 64 operands at N, is exactly 2**46", () => {
    const result = sumForward(ops(Array.from({ length: 64 }, () => ext(MAX_MAGNITUDE, MAX_MAGNITUDE))));
    expect(result).toStrictEqual(ext(2 ** 46, 2 ** 46));
  });

  it("a seeded sample of 63-operand sums with values at and next to the edge: every side equals the BigInt sum", () => {
    const next = mulberry32(0xc0ffee);
    let checked = 0;
    for (let trial = 0; trial < 400; trial++) {
      const operands = Array.from({ length: OPERANDS }, () => randomExtent(next));
      const result = sumForward(ops(operands));
      expect(BigInt(result.lo as number)).toBe(operands.reduce((total, e) => total + big(e.lo), 0n));
      expect(BigInt(result.hi as number)).toBe(operands.reduce((total, e) => total + big(e.hi), 0n));
      checked += 2;
    }
    expect(checked).toBe(800);
  });

  it("one unbounded operand among the 63 still makes that side null, and nothing else changes", () => {
    const operands: Extent[] = Array.from({ length: OPERANDS }, () => ext(MAX_MAGNITUDE, MAX_MAGNITUDE));
    operands[41] = ext(null, MAX_MAGNITUDE);
    expect(sumForward(ops(operands))).toStrictEqual(ext(null, 63 * MAX_MAGNITUDE));
    operands[41] = ext(MAX_MAGNITUDE, null);
    expect(sumForward(ops(operands))).toStrictEqual(ext(63 * MAX_MAGNITUDE, null));
  });
});

describe(`sumBackward over ${OPERANDS} operands, against BigInt`, () => {
  it("result [-N, N] with 62 other operands at [-N, N]: every one of the 63 indexes gets [-63N, 63N], exactly", () => {
    const operands = Array.from({ length: OPERANDS }, () => ext(-MAX_MAGNITUDE, MAX_MAGNITUDE));
    for (let index = 0; index < OPERANDS; index++) {
      const answer = sumBackward(ext(-MAX_MAGNITUDE, MAX_MAGNITUDE), ops(operands), index);
      expect(BigInt(answer.lo as number), `index ${index}`).toBe(-63n * MAX);
      expect(BigInt(answer.hi as number), `index ${index}`).toBe(63n * MAX);
      expect(Number.isSafeInteger(answer.lo) && Number.isSafeInteger(answer.hi)).toBe(true);
    }
  });

  it("the crossed extremes: result [N, N] with the others all [-N, -N] gives 63N on both sides; the mirror gives -63N", () => {
    const negative = Array.from({ length: OPERANDS }, () => ext(-MAX_MAGNITUDE, -MAX_MAGNITUDE));
    expect(sumBackward(ext(MAX_MAGNITUDE, MAX_MAGNITUDE), ops(negative), 7)).toStrictEqual(ext(63 * MAX_MAGNITUDE, 63 * MAX_MAGNITUDE));
    const positive = Array.from({ length: OPERANDS }, () => ext(MAX_MAGNITUDE, MAX_MAGNITUDE));
    expect(sumBackward(ext(-MAX_MAGNITUDE, -MAX_MAGNITUDE), ops(positive), 7)).toStrictEqual(ext(-63 * MAX_MAGNITUDE, -63 * MAX_MAGNITUDE));
  });

  it("a seeded sample, at every index of each: lo = result.lo - sum of the others' hi, hi = result.hi - sum of the others' lo, in BigInt", () => {
    const next = mulberry32(0xbadcafe);
    let checked = 0;
    for (let trial = 0; trial < 40; trial++) {
      const result = randomExtent(next);
      const operands = Array.from({ length: OPERANDS }, () => randomExtent(next));
      for (let index = 0; index < OPERANDS; index++) {
        const answer = sumBackward(result, ops(operands), index);
        const others = operands.filter((_, position) => position !== index);
        expect(BigInt(answer.lo as number)).toBe(big(result.lo) - others.reduce((total, e) => total + big(e.hi), 0n));
        expect(BigInt(answer.hi as number)).toBe(big(result.hi) - others.reduce((total, e) => total + big(e.lo), 0n));
        checked += 2;
      }
    }
    expect(checked).toBe(40 * OPERANDS * 2);
  });

  it("one unbounded operand among the others makes the matching side null: its hi hurts lo, its lo hurts hi", () => {
    const operands: Extent[] = Array.from({ length: OPERANDS }, () => ext(-MAX_MAGNITUDE, MAX_MAGNITUDE));
    operands[10] = ext(-MAX_MAGNITUDE, null);
    expect(sumBackward(ext(-MAX_MAGNITUDE, MAX_MAGNITUDE), ops(operands), 0)).toStrictEqual(ext(null, 63 * MAX_MAGNITUDE));
    operands[10] = ext(null, MAX_MAGNITUDE);
    expect(sumBackward(ext(-MAX_MAGNITUDE, MAX_MAGNITUDE), ops(operands), 0)).toStrictEqual(ext(-63 * MAX_MAGNITUDE, null));
    // ...but not when the unbounded operand is the one asked about.
    expect(sumBackward(ext(-MAX_MAGNITUDE, MAX_MAGNITUDE), ops(operands), 10)).toStrictEqual(ext(-63 * MAX_MAGNITUDE, 63 * MAX_MAGNITUDE));
  });
});

describe("a ladder of 62 chained calls (each result is an operand of the next), every intermediate value checked", () => {
  const LADDER = 63; // leaves; 62 chained calls, each taking the previous result as one of its two operands

  it("forward: the running extent grows by one leaf per step; every value is exact against BigInt and inside 2**46", () => {
    const next = mulberry32(0x1add3d);
    for (let trial = 0; trial < 30; trial++) {
      const leaves = Array.from({ length: LADDER }, () => randomExtent(next));
      let running: Extent = leaves[0] as Extent;
      let loTotal = big(running.lo);
      let hiTotal = big(running.hi);
      for (let step = 1; step < LADDER; step++) {
        running = sumForward(ops([running, leaves[step] as Extent]));
        loTotal += big((leaves[step] as Extent).lo);
        hiTotal += big((leaves[step] as Extent).hi);
        expect(BigInt(running.lo as number)).toBe(loTotal);
        expect(BigInt(running.hi as number)).toBe(hiTotal);
        expect(Math.abs(running.lo as number)).toBeLessThan(2 ** 46);
        expect(Math.abs(running.hi as number)).toBeLessThan(2 ** 46);
      }
    }
  });

  it("backward: pushing a result down the ladder subtracts one sibling per step; every value is exact and inside 2**46", () => {
    const next = mulberry32(0xdeadbeef);
    for (let trial = 0; trial < 30; trial++) {
      const leaves = Array.from({ length: LADDER }, () => randomExtent(next));
      const result = randomExtent(next);
      let pushed: Extent = result;
      let loTotal = big(result.lo);
      let hiTotal = big(result.hi);
      // Each step: sum = (the part so far) + leaf, so the part so far is `pushed` minus that leaf.
      for (let step = LADDER - 1; step >= 1; step--) {
        const leaf = leaves[step] as Extent;
        pushed = sumBackward(pushed, ops([ext(0, 0), leaf]), 0);
        loTotal -= big(leaf.hi);
        hiTotal -= big(leaf.lo);
        expect(BigInt(pushed.lo as number)).toBe(loTotal);
        expect(BigInt(pushed.hi as number)).toBe(hiTotal);
        expect(Math.abs(pushed.lo as number)).toBeLessThan(2 ** 46);
        expect(Math.abs(pushed.hi as number)).toBeLessThan(2 ** 46);
      }
    }
  });
});

describe("HONEST LIMITS of this layer: the algebra trusts its inputs", () => {
  it("a sum's bounds are not clamped: two bounds at N sum to 2N, which checkExtent would then refuse as out of range", () => {
    const sum = sumForward(ops([ext(MAX_MAGNITUDE, MAX_MAGNITUDE), ext(1, 1)]));
    expect(sum).toStrictEqual(ext(MAX_MAGNITUDE + 1, MAX_MAGNITUDE + 1));
    expect(checkExtent(sum)).toStrictEqual({ ok: false, reason: "bound-out-of-range", side: "lo" });
  });

  it("and past 2**53 an addition silently loses exactness, because nothing here re-checks a value: only checkExtent keeps the inputs below that", () => {
    const wrong = sumForward(ops([ext(2 ** 53, 2 ** 53), ext(1, 1)]));
    // 2**53 + 1 is not representable as a double; the true sum is 9007199254740993.
    expect(BigInt(wrong.lo as number)).not.toBe(2n ** 53n + 1n);
    expect(checkExtent(ext(2 ** 53, 2 ** 53)).ok).toBe(false); // the gate that keeps this out of the engine
  });
});
