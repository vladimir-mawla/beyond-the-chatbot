import type { Entailment } from "../../entailment.js";
import { ENTAILMENT_SAMPLES, SOME_CORE, SOME_EXTENT, SOME_OPEN_ENDS, SOME_SUPPORT, SOME_UNMET } from "../support/samples.js";

/**
 * Type-only proofs that no `Entailment` variant can carry a field that belongs to another variant: one block
 * per (variant, forbidden field), 15 blocks, each differing from a VALID sample of its variant in that field
 * and no other (see `support/proof-harness.ts` for how every line is checked). A value carrying several
 * forbidden fields at once would stay an error on the others and so hide the removal of one.
 *
 * Seven routes each, every one through a NON-FRESH carrier (a `const` bound once and then used): an
 * intermediate binding, a spread, a function return, `satisfies`, a generic helper, `Object.assign`, an array
 * element. They are the routes the excess-property check does NOT cover, so they go quiet when the `?: never`
 * is deleted; `never-sabotage.test.ts` runs that deletion for every field and every route.
 *
 * THERE IS NO FRESH-LITERAL ROUTE, ON PURPOSE. A fresh literal carrying the field fails to compile whether or
 * not the field is declared `?: never` (excess-property checking, TS2353, takes over), so a proof written that
 * way stays green when the `?: never` is deleted (plan section 8 defect 7), and its diagnostic text changes
 * when ANOTHER variant's field is deleted, so it cannot even be attributed to one field. The sabotage test
 * measures both facts on the real code and reports the literal form as non-discriminating.
 *
 * The carrier is built as `{ ...sample, <field>: <value> }` where `sample` is annotated with its variant,
 * so `kind` stays a literal without `as const` (an un-annotated `{ kind: "ungrounded", ... }` widens `kind`
 * to `string` and the line would fail on `kind`, not on the field under test). Every declaration the
 * directives sit on is exported so `noUnusedLocals` cannot satisfy a directive.
 *
 * The fragment `Types of property '<field>' are incompatible` appears in the diagnostic's elaboration
 * under both configs; the leading code is TS2375 under `tsconfig.lib.json` (exactOptionalPropertyTypes)
 * and TS2322 under `tsconfig.json`, hence `TS2322|TS2375`. A `satisfies` line is TS1360 under both.
 *
 * Written by a throwaway script; this file, not the script, is the source of truth, so edit it directly.
 */

/** The "generic helper" route: returns its argument at the argument's own type. */
function identity<T>(value: T): T {
  return value;
}

// ---- an `entailed` ruling carrying `unmet` ----
const entailed_unmet_carrier = { ...ENTAILMENT_SAMPLES.entailed, unmet: SOME_UNMET };
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const entailed_unmet_binding: Entailment = entailed_unmet_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const entailed_unmet_spread: Entailment = { ...entailed_unmet_carrier };
export function entailed_unmet_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
  return entailed_unmet_carrier;
}
// @ts-expect-error TS1360 Types of property 'unmet' are incompatible
export const entailed_unmet_satisfies = entailed_unmet_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const entailed_unmet_identity: Entailment = identity(entailed_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const entailed_unmet_assign: Entailment = Object.assign({}, entailed_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const entailed_unmet_array: Entailment[] = [entailed_unmet_carrier];

// ---- an `entailed` ruling carrying `openEnds` ----
const entailed_openEnds_carrier = { ...ENTAILMENT_SAMPLES.entailed, openEnds: SOME_OPEN_ENDS };
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const entailed_openEnds_binding: Entailment = entailed_openEnds_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const entailed_openEnds_spread: Entailment = { ...entailed_openEnds_carrier };
export function entailed_openEnds_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
  return entailed_openEnds_carrier;
}
// @ts-expect-error TS1360 Types of property 'openEnds' are incompatible
export const entailed_openEnds_satisfies = entailed_openEnds_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const entailed_openEnds_identity: Entailment = identity(entailed_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const entailed_openEnds_assign: Entailment = Object.assign({}, entailed_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const entailed_openEnds_array: Entailment[] = [entailed_openEnds_carrier];

// ---- an `entailed` ruling carrying `core` ----
const entailed_core_carrier = { ...ENTAILMENT_SAMPLES.entailed, core: SOME_CORE };
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const entailed_core_binding: Entailment = entailed_core_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const entailed_core_spread: Entailment = { ...entailed_core_carrier };
export function entailed_core_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
  return entailed_core_carrier;
}
// @ts-expect-error TS1360 Types of property 'core' are incompatible
export const entailed_core_satisfies = entailed_core_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const entailed_core_identity: Entailment = identity(entailed_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const entailed_core_assign: Entailment = Object.assign({}, entailed_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const entailed_core_array: Entailment[] = [entailed_core_carrier];

// ---- a `weakened` ruling carrying `core` ----
const weakened_core_carrier = { ...ENTAILMENT_SAMPLES.weakened, core: SOME_CORE };
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const weakened_core_binding: Entailment = weakened_core_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const weakened_core_spread: Entailment = { ...weakened_core_carrier };
export function weakened_core_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
  return weakened_core_carrier;
}
// @ts-expect-error TS1360 Types of property 'core' are incompatible
export const weakened_core_satisfies = weakened_core_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const weakened_core_identity: Entailment = identity(weakened_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const weakened_core_assign: Entailment = Object.assign({}, weakened_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const weakened_core_array: Entailment[] = [weakened_core_carrier];

// ---- a `contradicted` ruling carrying `unmet` ----
const contradicted_unmet_carrier = { ...ENTAILMENT_SAMPLES.contradicted, unmet: SOME_UNMET };
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const contradicted_unmet_binding: Entailment = contradicted_unmet_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const contradicted_unmet_spread: Entailment = { ...contradicted_unmet_carrier };
export function contradicted_unmet_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
  return contradicted_unmet_carrier;
}
// @ts-expect-error TS1360 Types of property 'unmet' are incompatible
export const contradicted_unmet_satisfies = contradicted_unmet_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const contradicted_unmet_identity: Entailment = identity(contradicted_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const contradicted_unmet_assign: Entailment = Object.assign({}, contradicted_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const contradicted_unmet_array: Entailment[] = [contradicted_unmet_carrier];

// ---- a `contradicted` ruling carrying `openEnds` ----
const contradicted_openEnds_carrier = { ...ENTAILMENT_SAMPLES.contradicted, openEnds: SOME_OPEN_ENDS };
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_binding: Entailment = contradicted_openEnds_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_spread: Entailment = { ...contradicted_openEnds_carrier };
export function contradicted_openEnds_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
  return contradicted_openEnds_carrier;
}
// @ts-expect-error TS1360 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_satisfies = contradicted_openEnds_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_identity: Entailment = identity(contradicted_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_assign: Entailment = Object.assign({}, contradicted_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const contradicted_openEnds_array: Entailment[] = [contradicted_openEnds_carrier];

// ---- a `contradicted` ruling carrying `core` ----
const contradicted_core_carrier = { ...ENTAILMENT_SAMPLES.contradicted, core: SOME_CORE };
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const contradicted_core_binding: Entailment = contradicted_core_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const contradicted_core_spread: Entailment = { ...contradicted_core_carrier };
export function contradicted_core_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
  return contradicted_core_carrier;
}
// @ts-expect-error TS1360 Types of property 'core' are incompatible
export const contradicted_core_satisfies = contradicted_core_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const contradicted_core_identity: Entailment = identity(contradicted_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const contradicted_core_assign: Entailment = Object.assign({}, contradicted_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const contradicted_core_array: Entailment[] = [contradicted_core_carrier];

// ---- an `ungrounded` ruling carrying `established` ----
const ungrounded_established_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, established: SOME_EXTENT };
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const ungrounded_established_binding: Entailment = ungrounded_established_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const ungrounded_established_spread: Entailment = { ...ungrounded_established_carrier };
export function ungrounded_established_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
  return ungrounded_established_carrier;
}
// @ts-expect-error TS1360 Types of property 'established' are incompatible
export const ungrounded_established_satisfies = ungrounded_established_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const ungrounded_established_identity: Entailment = identity(ungrounded_established_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const ungrounded_established_assign: Entailment = Object.assign({}, ungrounded_established_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const ungrounded_established_array: Entailment[] = [ungrounded_established_carrier];

// ---- an `ungrounded` ruling carrying `support` ----
const ungrounded_support_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, support: SOME_SUPPORT };
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const ungrounded_support_binding: Entailment = ungrounded_support_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const ungrounded_support_spread: Entailment = { ...ungrounded_support_carrier };
export function ungrounded_support_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
  return ungrounded_support_carrier;
}
// @ts-expect-error TS1360 Types of property 'support' are incompatible
export const ungrounded_support_satisfies = ungrounded_support_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const ungrounded_support_identity: Entailment = identity(ungrounded_support_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const ungrounded_support_assign: Entailment = Object.assign({}, ungrounded_support_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const ungrounded_support_array: Entailment[] = [ungrounded_support_carrier];

// ---- an `ungrounded` ruling carrying `unmet` ----
const ungrounded_unmet_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, unmet: SOME_UNMET };
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const ungrounded_unmet_binding: Entailment = ungrounded_unmet_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const ungrounded_unmet_spread: Entailment = { ...ungrounded_unmet_carrier };
export function ungrounded_unmet_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
  return ungrounded_unmet_carrier;
}
// @ts-expect-error TS1360 Types of property 'unmet' are incompatible
export const ungrounded_unmet_satisfies = ungrounded_unmet_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const ungrounded_unmet_identity: Entailment = identity(ungrounded_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const ungrounded_unmet_assign: Entailment = Object.assign({}, ungrounded_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const ungrounded_unmet_array: Entailment[] = [ungrounded_unmet_carrier];

// ---- an `ungrounded` ruling carrying `core` ----
const ungrounded_core_carrier = { ...ENTAILMENT_SAMPLES.ungrounded, core: SOME_CORE };
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const ungrounded_core_binding: Entailment = ungrounded_core_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const ungrounded_core_spread: Entailment = { ...ungrounded_core_carrier };
export function ungrounded_core_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
  return ungrounded_core_carrier;
}
// @ts-expect-error TS1360 Types of property 'core' are incompatible
export const ungrounded_core_satisfies = ungrounded_core_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const ungrounded_core_identity: Entailment = identity(ungrounded_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const ungrounded_core_assign: Entailment = Object.assign({}, ungrounded_core_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'core' are incompatible
export const ungrounded_core_array: Entailment[] = [ungrounded_core_carrier];

// ---- a `conflicted` ruling carrying `established` ----
const conflicted_established_carrier = { ...ENTAILMENT_SAMPLES.conflicted, established: SOME_EXTENT };
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const conflicted_established_binding: Entailment = conflicted_established_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const conflicted_established_spread: Entailment = { ...conflicted_established_carrier };
export function conflicted_established_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
  return conflicted_established_carrier;
}
// @ts-expect-error TS1360 Types of property 'established' are incompatible
export const conflicted_established_satisfies = conflicted_established_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const conflicted_established_identity: Entailment = identity(conflicted_established_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const conflicted_established_assign: Entailment = Object.assign({}, conflicted_established_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible
export const conflicted_established_array: Entailment[] = [conflicted_established_carrier];

// ---- a `conflicted` ruling carrying `support` ----
const conflicted_support_carrier = { ...ENTAILMENT_SAMPLES.conflicted, support: SOME_SUPPORT };
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const conflicted_support_binding: Entailment = conflicted_support_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const conflicted_support_spread: Entailment = { ...conflicted_support_carrier };
export function conflicted_support_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
  return conflicted_support_carrier;
}
// @ts-expect-error TS1360 Types of property 'support' are incompatible
export const conflicted_support_satisfies = conflicted_support_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const conflicted_support_identity: Entailment = identity(conflicted_support_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const conflicted_support_assign: Entailment = Object.assign({}, conflicted_support_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'support' are incompatible
export const conflicted_support_array: Entailment[] = [conflicted_support_carrier];

// ---- a `conflicted` ruling carrying `unmet` ----
const conflicted_unmet_carrier = { ...ENTAILMENT_SAMPLES.conflicted, unmet: SOME_UNMET };
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const conflicted_unmet_binding: Entailment = conflicted_unmet_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const conflicted_unmet_spread: Entailment = { ...conflicted_unmet_carrier };
export function conflicted_unmet_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
  return conflicted_unmet_carrier;
}
// @ts-expect-error TS1360 Types of property 'unmet' are incompatible
export const conflicted_unmet_satisfies = conflicted_unmet_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const conflicted_unmet_identity: Entailment = identity(conflicted_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const conflicted_unmet_assign: Entailment = Object.assign({}, conflicted_unmet_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'unmet' are incompatible
export const conflicted_unmet_array: Entailment[] = [conflicted_unmet_carrier];

// ---- a `conflicted` ruling carrying `openEnds` ----
const conflicted_openEnds_carrier = { ...ENTAILMENT_SAMPLES.conflicted, openEnds: SOME_OPEN_ENDS };
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_binding: Entailment = conflicted_openEnds_carrier;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_spread: Entailment = { ...conflicted_openEnds_carrier };
export function conflicted_openEnds_return(): Entailment {
  // @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
  return conflicted_openEnds_carrier;
}
// @ts-expect-error TS1360 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_satisfies = conflicted_openEnds_carrier satisfies Entailment;
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_identity: Entailment = identity(conflicted_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_assign: Entailment = Object.assign({}, conflicted_openEnds_carrier);
// @ts-expect-error TS2322|TS2375 Types of property 'openEnds' are incompatible
export const conflicted_openEnds_array: Entailment[] = [conflicted_openEnds_carrier];
