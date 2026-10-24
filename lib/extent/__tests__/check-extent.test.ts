import { describe, expect, it } from "vitest";
import { checkExtent } from "../index.js";
import type { ExtentCheck } from "../index.js";

/**
 * `checkExtent` on ordinary input: what it accepts, and each of its five refusals with the side it names.
 * Input that fights back (getters, Proxies, coercion) is `hostile-input.test.ts`; the exact edge of
 * `MAX_MAGNITUDE` is `boundaries.test.ts`. The reasons and their precedence are the ones written on
 * `checkExtent` in `check-extent.ts`.
 *
 * Every expectation uses `toStrictEqual`, so a `side` key that is present-but-`undefined`, an extra key on the
 * extent, and a `-0` where `0` is expected are all failures, not passes.
 */

const refused = (reason: string, side?: "lo" | "hi"): ExtentCheck =>
  (side === undefined ? { ok: false, reason } : { ok: false, reason, side }) as ExtentCheck;

describe("checkExtent accepts a well-formed extent and hands back a fresh copy of exactly { lo, hi }", () => {
  const VALID: readonly (readonly [string, { lo: number | null; hi: number | null }])[] = [
    ["unbounded on both sides", { lo: null, hi: null }],
    ["unbounded above", { lo: 4, hi: null }],
    ["unbounded below", { lo: null, hi: 9 }],
    ["a negative upper bound with nothing below (null is not 0)", { lo: null, hi: -5 }],
    ["a positive lower bound with nothing above (null is not 0)", { lo: 5, hi: null }],
    ["a single point", { lo: 3, hi: 3 }],
    ["a single negative point", { lo: -2, hi: -2 }],
    ["zero", { lo: 0, hi: 0 }],
    ["a span across zero", { lo: -3, hi: 7 }],
    ["a negative span", { lo: -9, hi: -4 }],
  ];
  for (const [name, raw] of VALID) {
    it(name, () => {
      expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: raw.lo, hi: raw.hi } });
    });
  }

  it("returns a new object, not the one it was given, and a different one on every call", () => {
    const raw = { lo: 1, hi: 2 };
    const first = checkExtent(raw);
    const second = checkExtent(raw);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.extent).not.toBe(raw);
    expect(first.extent).not.toBe(second.extent);
  });

  it("is decoupled from its input: changing the input afterwards does not change the copy", () => {
    const raw = { lo: 1, hi: 2 };
    const result = checkExtent(raw);
    raw.lo = 100;
    raw.hi = 200;
    expect(result).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
  });

  it("copies only lo and hi: an extra property is dropped, not carried and not refused", () => {
    const result = checkExtent({ lo: 1, hi: 2, quote: "1 to 2 days", extra: { deep: true } });
    expect(result).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    if (result.ok) expect(Object.keys(result.extent)).toEqual(["lo", "hi"]);
  });

  it("accepts a frozen object and an object with no prototype", () => {
    expect(checkExtent(Object.freeze({ lo: 1, hi: 2 }))).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(checkExtent(Object.assign(Object.create(null) as object, { lo: null, hi: 2 }))).toStrictEqual({
      ok: true,
      extent: { lo: null, hi: 2 },
    });
  });
});

describe("checkExtent normalises -0 to 0 (so two extents that are equal compare equal)", () => {
  const isPositiveZero = (v: unknown): boolean => Object.is(v, 0);

  it("on either side, and on both", () => {
    for (const raw of [
      { lo: -0, hi: 5 },
      { lo: -5, hi: -0 },
      { lo: -0, hi: -0 },
      { lo: -0, hi: null },
      { lo: null, hi: -0 },
    ]) {
      const result = checkExtent(raw);
      expect(result.ok, JSON.stringify(raw)).toBe(true);
      if (!result.ok) continue;
      if (raw.lo !== null && Object.is(raw.lo, -0)) expect(isPositiveZero(result.extent.lo)).toBe(true);
      if (raw.hi !== null && Object.is(raw.hi, -0)) expect(isPositiveZero(result.extent.hi)).toBe(true);
    }
  });

  it("makes { -0, -0 } strictly equal to { 0, 0 }, which the unnormalised value is not", () => {
    expect(Object.is(-0, 0)).toBe(false); // the premise: a plain -0 would NOT equal 0 under Object.is
    expect(checkExtent({ lo: -0, hi: -0 })).toStrictEqual(checkExtent({ lo: 0, hi: 0 }));
  });

  it("does not read -0 against 0 as inverted: { lo: 0, hi: -0 } is the point 0", () => {
    expect(checkExtent({ lo: 0, hi: -0 })).toStrictEqual({ ok: true, extent: { lo: 0, hi: 0 } });
  });
});

describe("not-an-object: anything that is not a plain { lo, hi } record, with no side", () => {
  const NOT_OBJECTS: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["undefined", undefined],
    ["a number", 3],
    ["zero", 0],
    ["NaN", Number.NaN],
    ["a string", "1..2"],
    ["the empty string", ""],
    ["true", true],
    ["false", false],
    ["a symbol", Symbol("extent")],
    ["a bigint", 5n],
    ["a function that carries lo and hi", Object.assign(() => 0, { lo: 1, hi: 2 })],
    ["the empty array", []],
    ["an array of two integers", [1, 2]],
    ["an array that carries lo and hi", Object.assign([], { lo: 1, hi: 2 })],
  ];
  for (const [name, raw] of NOT_OBJECTS) {
    it(name, () => {
      expect(checkExtent(raw)).toStrictEqual(refused("not-an-object"));
    });
  }
});

describe("bound-not-an-integer: names the side, and `null` is the only spelling of unbounded", () => {
  const NOT_INTEGERS: readonly (readonly [string, unknown])[] = [
    ["a fraction", 1.5],
    ["a tiny fraction", 0.1 + 0.2],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a numeric string", "3"],
    ["a boolean", true],
    ["a bigint", 3n],
    ["a symbol", Symbol("lo")],
    ["a boxed number", Object(3)],
    ["undefined (the field is there and empty)", undefined],
    ["an object", {}],
    ["an array", [3]],
    ["a function", () => 3],
  ];
  for (const [name, bad] of NOT_INTEGERS) {
    it(`${name} as lo`, () => {
      expect(checkExtent({ lo: bad, hi: null })).toStrictEqual(refused("bound-not-an-integer", "lo"));
    });
    it(`${name} as hi`, () => {
      expect(checkExtent({ lo: null, hi: bad })).toStrictEqual(refused("bound-not-an-integer", "hi"));
    });
  }

  it("a MISSING side is refused, never read as unbounded: { }, { lo } and { hi }", () => {
    expect(checkExtent({})).toStrictEqual(refused("bound-not-an-integer", "lo"));
    expect(checkExtent({ hi: 3 })).toStrictEqual(refused("bound-not-an-integer", "lo"));
    expect(checkExtent({ lo: 3 })).toStrictEqual(refused("bound-not-an-integer", "hi"));
  });

  it("an inherited side counts as present (it is read once like any other), but a missing one on a prototype-less object is refused", () => {
    expect(checkExtent(Object.create({ lo: 1, hi: 2 }))).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(checkExtent(Object.create(null))).toStrictEqual(refused("bound-not-an-integer", "lo"));
  });
});

describe("bound-out-of-range: an integer past MAX_MAGNITUDE (the exact edge is in boundaries.test.ts)", () => {
  for (const big of [2 ** 41, 2 ** 53, Number.MAX_SAFE_INTEGER, 1e300, Number.MAX_VALUE]) {
    it(`${big} and its negation, on each side`, () => {
      expect(checkExtent({ lo: -big, hi: null })).toStrictEqual(refused("bound-out-of-range", "lo"));
      expect(checkExtent({ lo: null, hi: big })).toStrictEqual(refused("bound-out-of-range", "hi"));
      expect(checkExtent({ lo: big, hi: null })).toStrictEqual(refused("bound-out-of-range", "lo"));
      expect(checkExtent({ lo: null, hi: -big })).toStrictEqual(refused("bound-out-of-range", "hi"));
    });
  }
});

describe("inverted: lo > hi when both are bounded, with no side", () => {
  for (const [lo, hi] of [
    [1, 0],
    [5, 1],
    [0, -1],
    [-1, -2],
    [3, -3],
    [2 ** 40, -(2 ** 40)],
  ] as const) {
    it(`[${lo}, ${hi}]`, () => {
      expect(checkExtent({ lo, hi })).toStrictEqual(refused("inverted"));
    });
  }

  it("is not triggered by a null side, however the other side compares with zero", () => {
    expect(checkExtent({ lo: null, hi: -5 }).ok).toBe(true);
    expect(checkExtent({ lo: 5, hi: null }).ok).toBe(true);
    expect(checkExtent({ lo: null, hi: null }).ok).toBe(true);
  });

  it("is not triggered by equal bounds: a single point is fine", () => {
    expect(checkExtent({ lo: 7, hi: 7 }).ok).toBe(true);
    expect(checkExtent({ lo: -7, hi: -7 }).ok).toBe(true);
  });
});

describe("precedence when more than one thing is wrong (lo is judged before hi; inverted comes last)", () => {
  it("a bad lo is reported even if hi is also bad", () => {
    expect(checkExtent({ lo: 1.5, hi: Number.NaN })).toStrictEqual(refused("bound-not-an-integer", "lo"));
    expect(checkExtent({ lo: 2 ** 41, hi: 1.5 })).toStrictEqual(refused("bound-out-of-range", "lo"));
    expect(checkExtent({ lo: 1.5, hi: 2 ** 41 })).toStrictEqual(refused("bound-not-an-integer", "lo"));
  });

  it("a value that is both not an integer and out of range is reported as not-an-integer (Infinity; 2**40 + 0.5)", () => {
    expect(Number.isInteger(2 ** 40 + 0.5)).toBe(false);
    expect(2 ** 40 + 0.5).toBeGreaterThan(2 ** 40);
    expect(checkExtent({ lo: Number.POSITIVE_INFINITY, hi: null })).toStrictEqual(refused("bound-not-an-integer", "lo"));
    expect(checkExtent({ lo: 2 ** 40 + 0.5, hi: null })).toStrictEqual(refused("bound-not-an-integer", "lo"));
  });

  it("a bad hi is reported before the extent is judged inverted, even when lo > hi numerically", () => {
    expect(checkExtent({ lo: 9, hi: 1.5 })).toStrictEqual(refused("bound-not-an-integer", "hi"));
    expect(checkExtent({ lo: 9, hi: -(2 ** 41) })).toStrictEqual(refused("bound-out-of-range", "hi"));
  });
});

describe("the result type narrows", () => {
  it("ok: true carries an extent, ok: false carries a reason", () => {
    const result: ExtentCheck = checkExtent({ lo: 1, hi: 2 });
    if (result.ok) {
      const lo: number | null = result.extent.lo;
      expect(lo).toBe(1);
    } else {
      throw new Error(result.reason);
    }
  });
});
