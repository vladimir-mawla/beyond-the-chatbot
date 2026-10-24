import type { Extent, Side } from "./bounds.js";
import type { OpenEnd, Support } from "./claim.js";
import type { FieldId, ObsId } from "./ids.js";
import type { NonEmptyReadonlyArray } from "./non-empty-array.js";

/**
 * THE CLOSED ENUM AT THE CENTRE: `Entailment` is `entailed`, `weakened`, `contradicted`, `ungrounded` or
 * `conflicted` (`.genesis/PLAN.md` section 4.2). For a claim `C` about a quantity `f`, with `B` the
 * schema-only extent of `f` and `E` the extent the evidence implies, the five are the set relations between
 * `E`, `B` and `C`. THAT RULING TABLE IS M5's; this file only fixes the shapes.
 *
 * THE VARIANTS ARE MUTUALLY EXCLUSIVE BY ASSIGNABILITY, NOT BY EXCESS-PROPERTY CHECKING. Each variant
 * declares every field that belongs to another variant as `?: never`. That is what makes "an `ungrounded`
 * carrying `established`, or a `weakened` without `unmet`, does not compile" true at EVERY assignment site
 * for any value whose STATIC TYPE includes the field (under `tsconfig.json`, other than a field typed
 * `undefined` or `any`: see the last bullet below). The tempting alternative, simply not declaring the
 * field, relies on the excess-property check, which only fires on a fresh object literal; a sibling project
 * (adaptive-agent, its ADR 0001 decision 1) made that claim and seven ordinary routes walked past it: an
 * intermediate binding, a spread, a function return, `satisfies`, a generic helper, `Object.assign`, an
 * array element. With `?: never` all seven fail. (A fresh literal fails too, but it fails with or without the
 * `?: never`, so no proof here relies on it; see the header of `entailment-forbidden.proofs.ts`.) The seven are
 * proved one by one, for each of the 17 `?: never` fields, in `__tests__/proofs/entailment-forbidden.proofs.ts`
 * and `schema-forbidden.proofs.ts`, under both of this repo's tsconfigs, and `__tests__/never-sabotage.test.ts`
 * deletes each field in turn, in a copy, and checks that exactly its own proofs go red.
 *
 * WHAT THIS DOES NOT CLOSE, at full strength (each is a directive-free line in
 * `__tests__/proofs/residuals.proofs.ts`; `__tests__/residual-routes.test.ts` states, route by route, what
 * `assertEntailmentWellFormed` in `integrity.ts` makes of the value that results. It catches every route below
 * EXCEPT an unrelated extra key, which nothing in M1 catches):
 *  - A value whose STATIC TYPE no longer names the forbidden field. `?: never` refuses every value whose
 *    static type carries one, by every route above (but see the last bullet for a field typed `undefined` or
 *    `any` under `tsconfig.json`). It cannot refuse an object that was first assigned to a
 *    SUPERTYPE that lacks the field (TypeScript allows that for any non-fresh object, through a variable, a
 *    function parameter or an explicit type argument), nor one whose type the compiler reduces to such a
 *    supertype (the branches of a conditional expression, the elements of an array literal). The field is
 *    still there at run time.
 *  - MUTATION AFTER CONSTRUCTION. `readonly` is not enforced at run time, and a writable alias typed as a
 *    supertype that permits the field (or `Object.assign(value, { ... })`, `Object.defineProperty`) puts the
 *    field onto a value whose static type is still the clean variant.
 *  - An explicit assertion through `unknown` (`x as unknown as Entailment`), or any assertion TypeScript
 *    permits from the source type.
 *  - An implicit `any`: a value from `JSON.parse(...)` is assignable to `Entailment` with no cast written.
 *  - A user-defined type guard that lies (`x is Entailment` over a body that returns `true`).
 *  - A field the variants do not mention at all. `?: never` closes the fields listed here, not every
 *    possible extra property: an object with an unrelated `note` key still reaches `Entailment` through a
 *    non-literal route, and `assertEntailmentWellFormed` does not flag it either.
 *  - A forbidden field typed `undefined` or `any`, under `tsconfig.json`, which does not set
 *    `exactOptionalPropertyTypes`: there `established?: never` reads as `undefined`, so `established: undefined`
 *    and `established: <a value typed any>` (for instance one read out of a `JSON.parse` result) are both
 *    accepted, by all seven routes; `tsconfig.lib.json` rejects both.
 *    `assertEntailmentWellFormed` treats the KEY being present as present, so it flags either.
 *
 * Cross-field facts the plan states are NOT in the types: `unmet` is exactly the sides of `tested` that
 * `established` does not satisfy; `established` is contained in `tested` for `entailed`; a `support` list
 * names an irreducible set; a `core` is unsatisfiable. Those are M4's and M5's to produce and to test.
 */
interface EntailmentBase {
  readonly field: FieldId;
  /** The extent that was ruled on: a draft claim's, or the user's question's. */
  readonly tested: Extent;
}

/** `E ⊆ C`: the claim may be said as drafted. Carries the extent and the certificate that re-derives it. */
export interface Entailed extends EntailmentBase {
  readonly kind: "entailed";
  readonly established: Extent;
  readonly support: Support;
  readonly unmet?: never;
  readonly openEnds?: never;
  readonly core?: never;
}

/** `E ∩ C ≠ ∅`, `E ⊄ C`, `E ≠ B`: say `E`, not `C`; the cut is `unmet`. */
export interface Weakened extends EntailmentBase {
  readonly kind: "weakened";
  readonly established: Extent;
  readonly support: Support;
  /** The sides of `tested` that `established` does not satisfy: the cut, named. Non-empty by type. */
  readonly unmet: NonEmptyReadonlyArray<Side>;
  /** May be empty: a loose bound names no gap (plan failure case 06). */
  readonly openEnds: readonly OpenEnd[];
  readonly core?: never;
}

/** `E ∩ C = ∅`: the claim is ruled out. Not a bare "no": it carries `E` and the support that rules `C` out. */
export interface Contradicted extends EntailmentBase {
  readonly kind: "contradicted";
  readonly established: Extent;
  readonly support: Support;
  readonly unmet?: never;
  readonly openEnds?: never;
  readonly core?: never;
}

/** `E = B`: say nothing about `f`; name what is missing. At least one open end, by type. */
export interface Ungrounded extends EntailmentBase {
  readonly kind: "ungrounded";
  readonly openEnds: NonEmptyReadonlyArray<OpenEnd>;
  readonly established?: never;
  readonly support?: never;
  readonly unmet?: never;
  readonly core?: never;
}

/** The tree's observations are jointly unsatisfiable: refuse the tree; name an irreducible core. */
export interface Conflicted extends EntailmentBase {
  readonly kind: "conflicted";
  /** An irreducible set that cannot all hold. Non-empty by type; the plan says at least two, which the type does not. */
  readonly core: NonEmptyReadonlyArray<ObsId>;
  readonly established?: never;
  readonly support?: never;
  readonly unmet?: never;
  readonly openEnds?: never;
}

export type Entailment = Entailed | Weakened | Contradicted | Ungrounded | Conflicted;

/**
 * Exhaustiveness gate for a `switch` over `Entailment`: called in the `default` of a switch that handles
 * every variant, `value` is `never` and the call compiles. Add a variant to the union (or leave one out of a
 * switch) and every such call site FAILS TO COMPILE; `npm run typecheck` reports it, `npm test` strips types
 * and does not. At run time the call is unreachable unless a value arrived that the type does not describe
 * (a cast, `any`, parsed JSON), and then it throws rather than silently falling through.
 *
 * The proof that a sixth variant breaks a switch is on a LOCAL STAND-IN union in
 * `__tests__/proofs/exhaustiveness.proofs.ts` (a proof cannot edit the real union), together with a switch
 * over the real union that leaves a variant out. The sabotage run in the ADR adds a sixth variant to the real
 * union and shows the consumer switch in `__tests__/entailment.test.ts` stop compiling.
 */
export function assertNeverEntailment(value: never): never {
  throw new Error(`unreachable Entailment variant: ${describe(value)}`);
}

function describe(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? typeof value : json;
  } catch {
    return "[a value JSON.stringify cannot print]";
  }
}
