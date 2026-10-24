import { isNonEmptyArray, type NonEmptyReadonlyArray } from "../../non-empty-array.js";
import type { Assert, Equal } from "../support/type-equal.js";

/**
 * Type-only proofs for `NonEmptyReadonlyArray` and `isNonEmptyArray` (see `support/proof-harness.ts`).
 * Every declaration is exported so `noUnusedLocals` cannot satisfy a directive.
 */
declare const maybeEmpty: number[];
declare const nonEmpty: NonEmptyReadonlyArray<number>;

// @ts-expect-error TS2322 Source has 0 element(s) but target requires 1
export const emptyLiteral: NonEmptyReadonlyArray<number> = [];
// @ts-expect-error TS2322 Source provides no match for required element at position 0 in target
export const mayBeEmpty: NonEmptyReadonlyArray<number> = maybeEmpty;
// @ts-expect-error TS2339 Property 'push' does not exist on type 'NonEmptyReadonlyArray<number>'
export const pushed = nonEmpty.push(2);
export function assignByIndex(): void {
  // @ts-expect-error TS2540 Cannot assign to '0' because it is a read-only property
  nonEmpty[0] = 2;
}

// The element type of the first slot is `number`, not `number | undefined`, once `isNonEmptyArray` has narrowed.
export function firstUnguarded(xs: readonly number[]): number {
  // @ts-expect-error TS2322 Type 'number | undefined' is not assignable to type 'number'
  return xs[0];
}
export function firstGuarded(xs: readonly number[]): number {
  if (isNonEmptyArray(xs)) return xs[0];
  return 0;
}

// CONTROLS (no directive, so they must compile).
export const oneElement: NonEmptyReadonlyArray<number> = [1];
export const manyElements: NonEmptyReadonlyArray<number> = [1, 2, 3];
export type FirstSlotIsPlainNumber = Assert<Equal<NonEmptyReadonlyArray<number>[0], number>>;
