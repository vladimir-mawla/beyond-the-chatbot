import type { FieldDecl, Operands } from "../../schema.js";
import { BASE_FIELD, CUSTOMS, DERIVED_FIELD, PACK, SOME_EXTENT } from "../support/samples.js";

/**
 * Type-only proofs that a `FieldDecl` cannot be both variants: a base field carrying `sum`, a derived field
 * carrying `baseline`. Same seven routes and the same reasoning as `entailment-forbidden.proofs.ts` (read its
 * header); the carrier differs from a valid `BaseField` / `DerivedField` in that one field only.
 *
 * Written by a throwaway script; this file, not the script, is the source of truth, so edit it directly.
 */

/** The "generic helper" route: returns its argument at the argument's own type. */
function identity<T>(value: T): T {
  return value;
}

// ---- a `base` field declaration carrying `sum` ----
const base_sum_carrier = { ...BASE_FIELD, sum: [PACK, CUSTOMS] as Operands };
// @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
export const base_sum_binding: FieldDecl = base_sum_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
export const base_sum_spread: FieldDecl = { ...base_sum_carrier };
export function base_sum_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
  return base_sum_carrier;
}
// @ts-expect-error TS1360 Types of property 'sum' are incompatible
export const base_sum_satisfies = base_sum_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
export const base_sum_identity: FieldDecl = identity(base_sum_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
export const base_sum_assign: FieldDecl = Object.assign({}, base_sum_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'sum' are incompatible
export const base_sum_array: FieldDecl[] = [base_sum_carrier];

// ---- a `derived` field declaration carrying `baseline` ----
const derived_baseline_carrier = { ...DERIVED_FIELD, baseline: SOME_EXTENT };
// @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
export const derived_baseline_binding: FieldDecl = derived_baseline_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
export const derived_baseline_spread: FieldDecl = { ...derived_baseline_carrier };
export function derived_baseline_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
  return derived_baseline_carrier;
}
// @ts-expect-error TS1360 Types of property 'baseline' are incompatible
export const derived_baseline_satisfies = derived_baseline_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
export const derived_baseline_identity: FieldDecl = identity(derived_baseline_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
export const derived_baseline_assign: FieldDecl = Object.assign({}, derived_baseline_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'baseline' are incompatible
export const derived_baseline_array: FieldDecl[] = [derived_baseline_carrier];
