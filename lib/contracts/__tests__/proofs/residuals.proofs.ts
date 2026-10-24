import type { Entailment, Ungrounded } from "../../entailment.js";
import { ENTAILMENT_SAMPLES, SOME_EXTENT, fresh } from "../support/samples.js";

/**
 * DISCLOSURE, NOT A REGRESSION GUARD. Every line below COMPILES (no directive) and each is a way a
 * contaminated `Entailment` still reaches the type, because `?: never` closes the routes TypeScript checks by
 * ASSIGNABILITY and none of these is one. The proof harness requires every directive-free line in a proof file
 * to compile under both tsconfigs, so this file is itself the evidence that each route is open. They are here
 * so the limits are written as code a reader can run, not only as prose.
 *
 * Each route builds a value of the DoD gate's own example, an `ungrounded` carrying `established`, except
 * where the route name says otherwise. Each is exported in `RESIDUALS`, and `residual-routes.test.ts` runs
 * every one through `assertEntailmentWellFormed` and states what it reports; nothing in the types stops any of
 * them, so the run-time guard is the only thing that sees them. (Two limits are not in this file because they
 * hold under ONE tsconfig only: a plain `as Entailment` with no `unknown` compiles under `tsconfig.lib.json`
 * and not under `tsconfig.json`, and an explicit `established: undefined` compiles under `tsconfig.json` and
 * not under `tsconfig.lib.json`; `residual-routes.test.ts` pins both with the harness itself.)
 *
 * What is NOT here and is NOT a residual: `Object.assign({}, carrier)` where `carrier`'s TYPE already has the
 * forbidden field. That is refused (the `assign` route of `entailment-forbidden.proofs.ts`). What IS a residual
 * is `Object.assign` ADDING the field (routes 8 and 9): the field enters through an object-literal argument
 * and the result type is an intersection that still contains the clean variant, so it is assignable.
 */
const sample = ENTAILMENT_SAMPLES.ungrounded;
const contaminated = { ...sample, established: SOME_EXTENT };
/** A `boolean` the compiler cannot narrow (`JSON.parse` returns `any`), and `true` at run time so route 5 yields the contaminated value. */
const flag: boolean = JSON.parse("true");

/**
 * A supertype of both the clean and the contaminated value: `Ungrounded` with `established` taken away. Derived
 * with `Omit`, not written out, so that loosening or tightening any OTHER field of `Ungrounded` (which the
 * sabotage tests do, one at a time) cannot break this file: it is a disclosure of one route, not a proof about
 * the other fields.
 */
type Lax = Omit<Ungrounded, "established">;
const plain: Lax = sample;
function widen(value: Lax): Lax {
  return value;
}

// 1. An explicit assertion through `unknown`.
export const viaCast: Entailment = contaminated as unknown as Entailment;

// 2. An implicit `any`: no assertion is written. `JSON.parse` returns `any`.
export const viaAny: Entailment = JSON.parse(JSON.stringify(contaminated));

// 3 to 6. The static type is widened to a supertype that does not mention `established` BEFORE it meets
// `Entailment`. TypeScript allows this for any non-fresh object; the value is unchanged at run time, only what
// the compiler knows about it is.
// 3. An annotated variable.
const lax: Lax = contaminated;
export const viaSupertype: Entailment = lax;
// 4. A function parameter and return type.
export const viaFunction: Entailment = widen(contaminated);
// 5. A conditional expression: its type is the common supertype of its branches.
export const viaConditional: Entailment = flag ? contaminated : plain;
// 6. An array literal: its element type is reduced the same way.
export const viaArray: Entailment[] = [contaminated, plain];

// 7. A user-defined type guard whose body returns `true`: it narrows whatever it is given.
function lies(_value: unknown): _value is Entailment {
  return true;
}
export function viaTypeGuard(value: unknown): Entailment {
  if (lies(value)) return value;
  throw new Error("unreachable: the guard above always returns true");
}

// 8 to 10. MUTATION AFTER CONSTRUCTION. `readonly` is not enforced at run time. The value keeps its clean
// static type (`Ungrounded`) while the field is put on it by something the type system does not track.
// 8. `Object.assign(value, { ... })` as a statement: the return value is ignored, the argument is mutated.
const assigned = fresh(sample);
Object.assign(assigned, { established: SOME_EXTENT });
export const viaAssignStatement: Entailment = assigned;
// 9. `Object.assign` as an expression: the result type is `Ungrounded & { established: Extent }`, which is assignable to `Ungrounded`.
export const viaAssignExpression: Entailment = Object.assign(fresh(sample), { established: SOME_EXTENT });
// 10. `Object.defineProperty`.
const defined = fresh(sample);
Object.defineProperty(defined, "established", { value: SOME_EXTENT });
export const viaDefineProperty: Entailment = defined;
// 11. A writable alias typed as a supertype that PERMITS the field: `{ established?: Extent }` accepts an `Ungrounded`.
const aliased = fresh(sample);
const alias: { readonly kind: string; established?: typeof SOME_EXTENT } = aliased;
alias.established = SOME_EXTENT;
export const viaWritableAlias: Entailment = aliased;

// 12. A field the variants do not mention at all. `?: never` closes the fields the plan names, not every extra key.
const withUnrelatedKey = { ...ENTAILMENT_SAMPLES.entailed, note: "not an Entailment field" };
export const viaUnrelatedKey: Entailment = withUnrelatedKey;

// 13 and 14. The other two cells of M2's self-check, reached through the same two open doors: a `conflicted`
// with no `core` (a cast) and a `weakened` whose `unmet` is `[]` (an implicit `any`).
const conflictedWithoutCore: Record<string, unknown> = { ...ENTAILMENT_SAMPLES.conflicted };
delete conflictedWithoutCore["core"];
export const viaCastMissingCore: Entailment = conflictedWithoutCore as unknown as Entailment;
export const viaAnyEmptyUnmet: Entailment = JSON.parse(JSON.stringify({ ...ENTAILMENT_SAMPLES.weakened, unmet: [] }));

/** Every route above, by name, for the run-time test. */
export const RESIDUALS: readonly { readonly route: string; readonly value: Entailment }[] = [
  { route: "viaCast", value: viaCast },
  { route: "viaAny", value: viaAny },
  { route: "viaSupertype", value: viaSupertype },
  { route: "viaFunction", value: viaFunction },
  { route: "viaConditional", value: viaConditional },
  { route: "viaArray", value: viaArray[0] as Entailment },
  { route: "viaTypeGuard", value: viaTypeGuard(contaminated) },
  { route: "viaAssignStatement", value: viaAssignStatement },
  { route: "viaAssignExpression", value: viaAssignExpression },
  { route: "viaDefineProperty", value: viaDefineProperty },
  { route: "viaWritableAlias", value: viaWritableAlias },
  { route: "viaUnrelatedKey", value: viaUnrelatedKey },
  { route: "viaCastMissingCore", value: viaCastMissingCore },
  { route: "viaAnyEmptyUnmet", value: viaAnyEmptyUnmet },
];
