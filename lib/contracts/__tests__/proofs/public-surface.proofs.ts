import type {
  BaseField,
  Bound,
  Brief,
  Claim,
  ClaimFault,
  ClaimRejection,
  Conflicted,
  Contradicted,
  DerivedField,
  Entailed,
  Entailment,
  EntailmentIntegrity,
  EntailmentIntegrityError,
  Extent,
  FieldDecl,
  FieldId,
  NonEmptyReadonlyArray,
  ObsId,
  Observation,
  ObservationFault,
  OpenEnd,
  Operands,
  RejectedObservation,
  Schema,
  SchemaFault,
  Side,
  Support,
  Ungrounded,
  Weakened,
} from "../../index.js";
// @ts-expect-error TS2305 has no exported member 'Brand'
import type { Brand } from "../../index.js";
// @ts-expect-error TS2724 has no exported member named 'EntailmentBase'
import type { EntailmentBase } from "../../index.js";
// @ts-expect-error TS2305 has no exported member 'EntailmentTableMatchesTypes'
import type { EntailmentTableMatchesTypes } from "../../index.js";

/**
 * Type-only proofs for the type names of the barrel (`.genesis/PLAN.md` section 4.1). The 29 imports above are
 * the plan's type names: if the barrel stops exporting one, this file stops compiling. The three below them
 * are names that must NOT be public: the plan declares `Brand` and `EntailmentBase` without `export`, and
 * `EntailmentTableMatchesTypes` is a compile-time assertion inside `integrity.ts`. The RUN-TIME names, and the
 * complete list of both kinds read from `index.ts` with the TypeScript parser, are in `public-surface.test.ts`.
 *
 * The tuple type below reads every imported name, so `noUnusedLocals` cannot be what makes the proof compile.
 */
export type PlanTypes = [
  BaseField,
  Bound,
  Brief,
  Claim,
  ClaimFault,
  ClaimRejection,
  Conflicted,
  Contradicted,
  DerivedField,
  Entailed,
  Entailment,
  EntailmentIntegrity,
  EntailmentIntegrityError,
  Extent,
  FieldDecl,
  FieldId,
  NonEmptyReadonlyArray<number>,
  ObsId,
  Observation,
  ObservationFault,
  OpenEnd,
  Operands,
  RejectedObservation,
  Schema,
  SchemaFault,
  Side,
  Support,
  Ungrounded,
  Weakened,
];
export type NotPublic = [Brand<string, "x">, EntailmentBase, EntailmentTableMatchesTypes];
