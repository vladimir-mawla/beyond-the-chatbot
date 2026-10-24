import { describe, expect, it } from "vitest";
import { isNonEmptyArray } from "../non-empty-array.js";

/**
 * `isNonEmptyArray` is a user-defined type guard: it narrows whatever its body says, so the body is pinned
 * from both sides. (The compile-time half, that the narrowed first slot is `T` and that a plain array does
 * not assign, is `proofs/non-empty-array.proofs.ts`.)
 */
describe("isNonEmptyArray", () => {
  it("is false for an empty array", () => {
    expect(isNonEmptyArray([])).toBe(false);
  });

  it("is true for one element, and for one element that is falsy or undefined", () => {
    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyArray([0])).toBe(true);
    expect(isNonEmptyArray([undefined])).toBe(true);
    expect(isNonEmptyArray([null])).toBe(true);
  });

  it("is true for many elements", () => {
    expect(isNonEmptyArray([1, 2, 3])).toBe(true);
  });

  it("looks only at length: a sparse array of length 1 counts", () => {
    expect(isNonEmptyArray([,])).toBe(true);
  });
});
