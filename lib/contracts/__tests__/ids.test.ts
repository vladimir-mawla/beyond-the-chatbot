import { describe, expect, it } from "vitest";
import { compareIds, fieldId, obsId } from "../ids.js";

/**
 * Run-time behaviour of the mint functions and the id order. The type-level half (the two brands do not
 * mix) is `proofs/ids.proofs.ts`. What the mint functions refuse NOTHING of is pinned in
 * `honest-limits.test.ts`, not here.
 */
describe("fieldId and obsId", () => {
  it("return their argument unchanged: a brand is a compile-time statement and adds nothing at run time", () => {
    expect(fieldId("packDays")).toBe("packDays");
    expect(obsId("o1")).toBe("o1");
    expect(typeof fieldId("packDays")).toBe("string");
  });

  it("do not distinguish the two brands at run time", () => {
    expect(fieldId("x") === (obsId("x") as string)).toBe(true);
  });
});

describe("compareIds", () => {
  it("is -1, 0 or 1, and antisymmetric", () => {
    expect(compareIds("a", "b")).toBe(-1);
    expect(compareIds("b", "a")).toBe(1);
    expect(compareIds("a", "a")).toBe(0);
    expect(compareIds("", "a")).toBe(-1);
    expect(compareIds("a", "")).toBe(1);
  });

  it("is code-unit order, not locale order: an uppercase letter sorts before a lowercase one", () => {
    // `localeCompare` puts "a" before "B" in most locales; code-unit order puts "B" (0x42) before "a" (0x61).
    expect(compareIds("B", "a")).toBe(-1);
    expect(["b", "a", "C", "A", "B"].sort(compareIds)).toEqual(["A", "B", "C", "a", "b"]);
  });

  it("compares by prefix first and length second", () => {
    expect(compareIds("o1", "o10")).toBe(-1);
    expect(compareIds("o10", "o2")).toBe(-1);
  });

  it("is code-UNIT order, not code-POINT order: a surrogate pair sorts before a later BMP character", () => {
    // U+1F600 is the pair D83D DE00; U+FF5E is one unit. By code point U+1F600 > U+FF5E; by code unit
    // 0xD83D < 0xFF5E. A change to code-point order would flip this and so change which ids a support names.
    expect(compareIds("\u{1F600}", "～")).toBe(-1);
    expect(compareIds("～", "\u{1F600}")).toBe(1);
  });

  it("is a total order on a mixed list, whatever the input order (permutation-independent sort)", () => {
    const ids = ["z-direct", "a1", "a2", "a3", "0-direct", "A", "", "\u{1F600}", "～", "o10", "o2"];
    const expected = [...ids].sort(compareIds);
    for (const rotated of [ids.slice().reverse(), [...ids.slice(4), ...ids.slice(0, 4)], ids.slice(1).concat(ids[0] as string)]) {
      expect([...rotated].sort(compareIds)).toEqual(expected);
    }
  });
});
