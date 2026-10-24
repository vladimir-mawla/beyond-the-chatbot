import type { Side } from "../../bounds.js";
import type { OpenEnd } from "../../claim.js";
import type { Conflicted, Contradicted, Entailed, Entailment, Ungrounded, Weakened } from "../../entailment.js";
import type { ObsId, FieldId } from "../../ids.js";
import type { BaseField, DerivedField, FieldDecl } from "../../schema.js";
import {
  CUSTOMS,
  DELIVERY,
  ENTAILMENT_SAMPLES,
  BASE_FIELD,
  DERIVED_FIELD,
  PACK,
  SOME_CORE,
  SOME_EXTENT,
  SOME_NONEMPTY_OPEN_ENDS,
  SOME_OPEN_ENDS,
  SOME_SUPPORT,
  SOME_TESTED,
  SOME_UNMET,
} from "../support/samples.js";

/**
 * Type-only proofs for what each variant REQUIRES, and for the three fields (plus the sum's operands) that
 * must be non-empty (see `support/proof-harness.ts` for how every line is checked).
 *
 * Two kinds of block, each with the same seven routes as `entailment-forbidden.proofs.ts` (read its header):
 *  - `<variant>_<field>_missing`: a value that lacks one required field. The carrier is `Omit<Variant, field>`,
 *    a non-fresh type that differs from the valid variant in that field only. 12 blocks: every cell of the
 *    plan's required table that is a field (established, support, unmet, openEnds, core), plus
 *    `BaseField.baseline` and `DerivedField.sum`.
 *  - `<variant>_<field>_empty` (an un-annotated `[]`, which widens to `never[]`), `_emptytuple` (`[] as const`),
 *    `_maybeempty` (a `T[]`, which may be empty) and, for the sum only, `_short` (a one-element tuple): a value
 *    whose non-empty field is not non-empty. The cells are `Weakened.unmet`, `Ungrounded.openEnds`,
 *    `Conflicted.core` and `DerivedField.sum`; 13 blocks.
 *
 * Like the forbidden-field proofs, there is no fresh-literal route (see the header of
 * `entailment-forbidden.proofs.ts`).
 *
 * CONTROLS, no directive (they must compile): every valid sample assigns, and a `weakened` with NO open end is
 * legal (plan failure case 06: a loose bound names no gap), so the `openEnds` proofs above are about the
 * field being present, not about it being non-empty.
 *
 * Written by a throwaway script; this file, not the script, is the source of truth, so edit it directly.
 */
declare const sides: Side[];
declare const openEnds: OpenEnd[];
declare const obsIds: ObsId[];
declare const fieldIds: FieldId[];

/** The "generic helper" route: returns its argument at the argument's own type. */
function identity<T>(value: T): T {
  return value;
}

// ---- entailed_established_missing ----
declare const entailed_established_missing_carrier: Omit<Entailed, "established">;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const entailed_established_missing_binding: Entailment = entailed_established_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const entailed_established_missing_spread: Entailment = { ...entailed_established_missing_carrier };
export function entailed_established_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
  return entailed_established_missing_carrier;
}
// @ts-expect-error TS1360 Property 'established' is missing in type
export const entailed_established_missing_satisfies = entailed_established_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const entailed_established_missing_identity: Entailment = identity(entailed_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const entailed_established_missing_assign: Entailment = Object.assign({}, entailed_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const entailed_established_missing_array: Entailment[] = [entailed_established_missing_carrier];

// ---- entailed_support_missing ----
declare const entailed_support_missing_carrier: Omit<Entailed, "support">;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const entailed_support_missing_binding: Entailment = entailed_support_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const entailed_support_missing_spread: Entailment = { ...entailed_support_missing_carrier };
export function entailed_support_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
  return entailed_support_missing_carrier;
}
// @ts-expect-error TS1360 Property 'support' is missing in type
export const entailed_support_missing_satisfies = entailed_support_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const entailed_support_missing_identity: Entailment = identity(entailed_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const entailed_support_missing_assign: Entailment = Object.assign({}, entailed_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const entailed_support_missing_array: Entailment[] = [entailed_support_missing_carrier];

// ---- weakened_established_missing ----
declare const weakened_established_missing_carrier: Omit<Weakened, "established">;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const weakened_established_missing_binding: Entailment = weakened_established_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const weakened_established_missing_spread: Entailment = { ...weakened_established_missing_carrier };
export function weakened_established_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
  return weakened_established_missing_carrier;
}
// @ts-expect-error TS1360 Property 'established' is missing in type
export const weakened_established_missing_satisfies = weakened_established_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const weakened_established_missing_identity: Entailment = identity(weakened_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const weakened_established_missing_assign: Entailment = Object.assign({}, weakened_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const weakened_established_missing_array: Entailment[] = [weakened_established_missing_carrier];

// ---- weakened_support_missing ----
declare const weakened_support_missing_carrier: Omit<Weakened, "support">;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const weakened_support_missing_binding: Entailment = weakened_support_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const weakened_support_missing_spread: Entailment = { ...weakened_support_missing_carrier };
export function weakened_support_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
  return weakened_support_missing_carrier;
}
// @ts-expect-error TS1360 Property 'support' is missing in type
export const weakened_support_missing_satisfies = weakened_support_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const weakened_support_missing_identity: Entailment = identity(weakened_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const weakened_support_missing_assign: Entailment = Object.assign({}, weakened_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const weakened_support_missing_array: Entailment[] = [weakened_support_missing_carrier];

// ---- weakened_unmet_missing ----
declare const weakened_unmet_missing_carrier: Omit<Weakened, "unmet">;
// @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
export const weakened_unmet_missing_binding: Entailment = weakened_unmet_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
export const weakened_unmet_missing_spread: Entailment = { ...weakened_unmet_missing_carrier };
export function weakened_unmet_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
  return weakened_unmet_missing_carrier;
}
// @ts-expect-error TS1360 Property 'unmet' is missing in type
export const weakened_unmet_missing_satisfies = weakened_unmet_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
export const weakened_unmet_missing_identity: Entailment = identity(weakened_unmet_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
export const weakened_unmet_missing_assign: Entailment = Object.assign({}, weakened_unmet_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'unmet' is missing in type
export const weakened_unmet_missing_array: Entailment[] = [weakened_unmet_missing_carrier];

// ---- weakened_openEnds_missing ----
declare const weakened_openEnds_missing_carrier: Omit<Weakened, "openEnds">;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_binding: Entailment = weakened_openEnds_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_spread: Entailment = { ...weakened_openEnds_missing_carrier };
export function weakened_openEnds_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
  return weakened_openEnds_missing_carrier;
}
// @ts-expect-error TS1360 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_satisfies = weakened_openEnds_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_identity: Entailment = identity(weakened_openEnds_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_assign: Entailment = Object.assign({}, weakened_openEnds_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const weakened_openEnds_missing_array: Entailment[] = [weakened_openEnds_missing_carrier];

// ---- contradicted_established_missing ----
declare const contradicted_established_missing_carrier: Omit<Contradicted, "established">;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const contradicted_established_missing_binding: Entailment = contradicted_established_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const contradicted_established_missing_spread: Entailment = { ...contradicted_established_missing_carrier };
export function contradicted_established_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
  return contradicted_established_missing_carrier;
}
// @ts-expect-error TS1360 Property 'established' is missing in type
export const contradicted_established_missing_satisfies = contradicted_established_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const contradicted_established_missing_identity: Entailment = identity(contradicted_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const contradicted_established_missing_assign: Entailment = Object.assign({}, contradicted_established_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'established' is missing in type
export const contradicted_established_missing_array: Entailment[] = [contradicted_established_missing_carrier];

// ---- contradicted_support_missing ----
declare const contradicted_support_missing_carrier: Omit<Contradicted, "support">;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const contradicted_support_missing_binding: Entailment = contradicted_support_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const contradicted_support_missing_spread: Entailment = { ...contradicted_support_missing_carrier };
export function contradicted_support_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
  return contradicted_support_missing_carrier;
}
// @ts-expect-error TS1360 Property 'support' is missing in type
export const contradicted_support_missing_satisfies = contradicted_support_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const contradicted_support_missing_identity: Entailment = identity(contradicted_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const contradicted_support_missing_assign: Entailment = Object.assign({}, contradicted_support_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'support' is missing in type
export const contradicted_support_missing_array: Entailment[] = [contradicted_support_missing_carrier];

// ---- ungrounded_openEnds_missing ----
declare const ungrounded_openEnds_missing_carrier: Omit<Ungrounded, "openEnds">;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_binding: Entailment = ungrounded_openEnds_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_spread: Entailment = { ...ungrounded_openEnds_missing_carrier };
export function ungrounded_openEnds_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
  return ungrounded_openEnds_missing_carrier;
}
// @ts-expect-error TS1360 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_satisfies = ungrounded_openEnds_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_identity: Entailment = identity(ungrounded_openEnds_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_assign: Entailment = Object.assign({}, ungrounded_openEnds_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'openEnds' is missing in type
export const ungrounded_openEnds_missing_array: Entailment[] = [ungrounded_openEnds_missing_carrier];

// ---- conflicted_core_missing ----
declare const conflicted_core_missing_carrier: Omit<Conflicted, "core">;
// @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
export const conflicted_core_missing_binding: Entailment = conflicted_core_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
export const conflicted_core_missing_spread: Entailment = { ...conflicted_core_missing_carrier };
export function conflicted_core_missing_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
  return conflicted_core_missing_carrier;
}
// @ts-expect-error TS1360 Property 'core' is missing in type
export const conflicted_core_missing_satisfies = conflicted_core_missing_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
export const conflicted_core_missing_identity: Entailment = identity(conflicted_core_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
export const conflicted_core_missing_assign: Entailment = Object.assign({}, conflicted_core_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'core' is missing in type
export const conflicted_core_missing_array: Entailment[] = [conflicted_core_missing_carrier];

// ---- base_baseline_missing ----
declare const base_baseline_missing_carrier: Omit<BaseField, "baseline">;
// @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
export const base_baseline_missing_binding: FieldDecl = base_baseline_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
export const base_baseline_missing_spread: FieldDecl = { ...base_baseline_missing_carrier };
export function base_baseline_missing_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
  return base_baseline_missing_carrier;
}
// @ts-expect-error TS1360 Property 'baseline' is missing in type
export const base_baseline_missing_satisfies = base_baseline_missing_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
export const base_baseline_missing_identity: FieldDecl = identity(base_baseline_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
export const base_baseline_missing_assign: FieldDecl = Object.assign({}, base_baseline_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'baseline' is missing in type
export const base_baseline_missing_array: FieldDecl[] = [base_baseline_missing_carrier];

// ---- derived_sum_missing ----
declare const derived_sum_missing_carrier: Omit<DerivedField, "sum">;
// @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
export const derived_sum_missing_binding: FieldDecl = derived_sum_missing_carrier;
// @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
export const derived_sum_missing_spread: FieldDecl = { ...derived_sum_missing_carrier };
export function derived_sum_missing_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
  return derived_sum_missing_carrier;
}
// @ts-expect-error TS1360 Property 'sum' is missing in type
export const derived_sum_missing_satisfies = derived_sum_missing_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
export const derived_sum_missing_identity: FieldDecl = identity(derived_sum_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
export const derived_sum_missing_assign: FieldDecl = Object.assign({}, derived_sum_missing_carrier);
// @ts-expect-error TS2322|TS2375 Property 'sum' is missing in type
export const derived_sum_missing_array: FieldDecl[] = [derived_sum_missing_carrier];

// ---- weakened_unmet_empty ----
const weakened_unmet_empty_carrier = { ...ENTAILMENT_SAMPLES.weakened, unmet: [] };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_binding: Entailment = weakened_unmet_empty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_spread: Entailment = { ...weakened_unmet_empty_carrier };
export function weakened_unmet_empty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return weakened_unmet_empty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_satisfies = weakened_unmet_empty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_identity: Entailment = identity(weakened_unmet_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_assign: Entailment = Object.assign({}, weakened_unmet_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_empty_array: Entailment[] = [weakened_unmet_empty_carrier];

// ---- weakened_unmet_emptytuple ----
const weakened_unmet_emptytuple_carrier = { ...ENTAILMENT_SAMPLES.weakened, unmet: [] as const };
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_binding: Entailment = weakened_unmet_emptytuple_carrier;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_spread: Entailment = { ...weakened_unmet_emptytuple_carrier };
export function weakened_unmet_emptytuple_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
  return weakened_unmet_emptytuple_carrier;
}
// @ts-expect-error TS1360 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_satisfies = weakened_unmet_emptytuple_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_identity: Entailment = identity(weakened_unmet_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_assign: Entailment = Object.assign({}, weakened_unmet_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const weakened_unmet_emptytuple_array: Entailment[] = [weakened_unmet_emptytuple_carrier];

// ---- weakened_unmet_maybeempty ----
const weakened_unmet_maybeempty_carrier = { ...ENTAILMENT_SAMPLES.weakened, unmet: sides };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_binding: Entailment = weakened_unmet_maybeempty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_spread: Entailment = { ...weakened_unmet_maybeempty_carrier };
export function weakened_unmet_maybeempty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return weakened_unmet_maybeempty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_satisfies = weakened_unmet_maybeempty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_identity: Entailment = identity(weakened_unmet_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_assign: Entailment = Object.assign({}, weakened_unmet_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const weakened_unmet_maybeempty_array: Entailment[] = [weakened_unmet_maybeempty_carrier];

// ---- ungrounded_openEnds_empty ----
const ungrounded_openEnds_empty_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, openEnds: [] };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_binding: Entailment = ungrounded_openEnds_empty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_spread: Entailment = { ...ungrounded_openEnds_empty_carrier };
export function ungrounded_openEnds_empty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return ungrounded_openEnds_empty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_satisfies = ungrounded_openEnds_empty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_identity: Entailment = identity(ungrounded_openEnds_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_assign: Entailment = Object.assign({}, ungrounded_openEnds_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_empty_array: Entailment[] = [ungrounded_openEnds_empty_carrier];

// ---- ungrounded_openEnds_emptytuple ----
const ungrounded_openEnds_emptytuple_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, openEnds: [] as const };
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_binding: Entailment = ungrounded_openEnds_emptytuple_carrier;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_spread: Entailment = { ...ungrounded_openEnds_emptytuple_carrier };
export function ungrounded_openEnds_emptytuple_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
  return ungrounded_openEnds_emptytuple_carrier;
}
// @ts-expect-error TS1360 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_satisfies = ungrounded_openEnds_emptytuple_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_identity: Entailment = identity(ungrounded_openEnds_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_assign: Entailment = Object.assign({}, ungrounded_openEnds_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const ungrounded_openEnds_emptytuple_array: Entailment[] = [ungrounded_openEnds_emptytuple_carrier];

// ---- ungrounded_openEnds_maybeempty ----
const ungrounded_openEnds_maybeempty_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, openEnds: openEnds };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_binding: Entailment = ungrounded_openEnds_maybeempty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_spread: Entailment = { ...ungrounded_openEnds_maybeempty_carrier };
export function ungrounded_openEnds_maybeempty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return ungrounded_openEnds_maybeempty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_satisfies = ungrounded_openEnds_maybeempty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_identity: Entailment = identity(ungrounded_openEnds_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_assign: Entailment = Object.assign({}, ungrounded_openEnds_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const ungrounded_openEnds_maybeempty_array: Entailment[] = [ungrounded_openEnds_maybeempty_carrier];

// ---- conflicted_core_empty ----
const conflicted_core_empty_carrier = { ...ENTAILMENT_SAMPLES.conflicted, core: [] };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_binding: Entailment = conflicted_core_empty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_spread: Entailment = { ...conflicted_core_empty_carrier };
export function conflicted_core_empty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return conflicted_core_empty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_satisfies = conflicted_core_empty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_identity: Entailment = identity(conflicted_core_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_assign: Entailment = Object.assign({}, conflicted_core_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_empty_array: Entailment[] = [conflicted_core_empty_carrier];

// ---- conflicted_core_emptytuple ----
const conflicted_core_emptytuple_carrier = { ...ENTAILMENT_SAMPLES.conflicted, core: [] as const };
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_binding: Entailment = conflicted_core_emptytuple_carrier;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_spread: Entailment = { ...conflicted_core_emptytuple_carrier };
export function conflicted_core_emptytuple_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
  return conflicted_core_emptytuple_carrier;
}
// @ts-expect-error TS1360 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_satisfies = conflicted_core_emptytuple_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_identity: Entailment = identity(conflicted_core_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_assign: Entailment = Object.assign({}, conflicted_core_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 1
export const conflicted_core_emptytuple_array: Entailment[] = [conflicted_core_emptytuple_carrier];

// ---- conflicted_core_maybeempty ----
const conflicted_core_maybeempty_carrier = { ...ENTAILMENT_SAMPLES.conflicted, core: obsIds };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_binding: Entailment = conflicted_core_maybeempty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_spread: Entailment = { ...conflicted_core_maybeempty_carrier };
export function conflicted_core_maybeempty_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return conflicted_core_maybeempty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_satisfies = conflicted_core_maybeempty_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_identity: Entailment = identity(conflicted_core_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_assign: Entailment = Object.assign({}, conflicted_core_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const conflicted_core_maybeempty_array: Entailment[] = [conflicted_core_maybeempty_carrier];

// ---- derived_sum_empty ----
const derived_sum_empty_carrier = { ...DERIVED_FIELD, sum: [] };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_empty_binding: FieldDecl = derived_sum_empty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_empty_spread: FieldDecl = { ...derived_sum_empty_carrier };
export function derived_sum_empty_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return derived_sum_empty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const derived_sum_empty_satisfies = derived_sum_empty_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_empty_identity: FieldDecl = identity(derived_sum_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_empty_assign: FieldDecl = Object.assign({}, derived_sum_empty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_empty_array: FieldDecl[] = [derived_sum_empty_carrier];

// ---- derived_sum_emptytuple ----
const derived_sum_emptytuple_carrier = { ...DERIVED_FIELD, sum: [] as const };
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_binding: FieldDecl = derived_sum_emptytuple_carrier;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_spread: FieldDecl = { ...derived_sum_emptytuple_carrier };
export function derived_sum_emptytuple_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
  return derived_sum_emptytuple_carrier;
}
// @ts-expect-error TS1360 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_satisfies = derived_sum_emptytuple_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_identity: FieldDecl = identity(derived_sum_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_assign: FieldDecl = Object.assign({}, derived_sum_emptytuple_carrier);
// @ts-expect-error TS2322|TS2375 Source has 0 element(s) but target requires 2
export const derived_sum_emptytuple_array: FieldDecl[] = [derived_sum_emptytuple_carrier];

// ---- derived_sum_short ----
const derived_sum_short_carrier = { ...DERIVED_FIELD, sum: [PACK] as [FieldId] };
// @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
export const derived_sum_short_binding: FieldDecl = derived_sum_short_carrier;
// @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
export const derived_sum_short_spread: FieldDecl = { ...derived_sum_short_carrier };
export function derived_sum_short_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
  return derived_sum_short_carrier;
}
// @ts-expect-error TS1360 Source has 1 element(s) but target requires 2
export const derived_sum_short_satisfies = derived_sum_short_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
export const derived_sum_short_identity: FieldDecl = identity(derived_sum_short_carrier);
// @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
export const derived_sum_short_assign: FieldDecl = Object.assign({}, derived_sum_short_carrier);
// @ts-expect-error TS2322|TS2375 Source has 1 element(s) but target requires 2
export const derived_sum_short_array: FieldDecl[] = [derived_sum_short_carrier];

// ---- derived_sum_maybeempty ----
const derived_sum_maybeempty_carrier = { ...DERIVED_FIELD, sum: fieldIds };
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_binding: FieldDecl = derived_sum_maybeempty_carrier;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_spread: FieldDecl = { ...derived_sum_maybeempty_carrier };
export function derived_sum_maybeempty_return(): FieldDecl {
  // @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
  return derived_sum_maybeempty_carrier;
}
// @ts-expect-error TS1360 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_satisfies = derived_sum_maybeempty_carrier satisfies FieldDecl;
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_identity: FieldDecl = identity(derived_sum_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_assign: FieldDecl = Object.assign({}, derived_sum_maybeempty_carrier);
// @ts-expect-error TS2322|TS2375 Source provides no match for required element at position 0 in target
export const derived_sum_maybeempty_array: FieldDecl[] = [derived_sum_maybeempty_carrier];

// ---- CONTROLS: these must compile ----
export const entailedSample: Entailment = ENTAILMENT_SAMPLES.entailed;
export const weakenedSample: Entailment = ENTAILMENT_SAMPLES.weakened;
export const contradictedSample: Entailment = ENTAILMENT_SAMPLES.contradicted;
export const ungroundedSample: Entailment = ENTAILMENT_SAMPLES.ungrounded;
export const conflictedSample: Entailment = ENTAILMENT_SAMPLES.conflicted;
export const baseSample: FieldDecl = BASE_FIELD;
export const derivedSample: FieldDecl = DERIVED_FIELD;
// A loose bound names no gap (plan failure case 06), so `weakened.openEnds` may be `[]`.
export const weakenedNoOpenEnd: Entailment = { ...ENTAILMENT_SAMPLES.weakened, openEnds: [] };
// A derived field with exactly two operands, and with three, is legal.
export const twoOperands: FieldDecl = { ...DERIVED_FIELD, sum: [PACK, CUSTOMS] };
export const threeOperands: FieldDecl = { ...DERIVED_FIELD, sum: [PACK, CUSTOMS, DELIVERY] };
// Not used by a proof, kept so the type imports above are all read:
export type RequiredTypes = [Entailed, Weakened, Contradicted, Ungrounded, Conflicted, BaseField, DerivedField];
export const requiredValues = [SOME_CORE, SOME_EXTENT, SOME_NONEMPTY_OPEN_ENDS, SOME_OPEN_ENDS, SOME_SUPPORT, SOME_TESTED, SOME_UNMET, DELIVERY, CUSTOMS];
