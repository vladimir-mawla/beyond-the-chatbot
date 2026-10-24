/**
 * The public surface of `lib/contracts` (M1): every name later milestones may import, and nothing else
 * (`.genesis/PLAN.md` section 4.1, "FILE: lib/contracts/index.ts", and the ownership table of section 5).
 *
 * Deliberately NOT exported: `Brand` and `EntailmentBase`, which the plan declares without `export`; the
 * internal helper `describe` of `entailment.ts`; and `EntailmentTableMatchesTypes`, a compile-time assertion
 * inside `integrity.ts` that is not part of the contract. `__tests__/public-surface.test.ts` pins the
 * run-time names and, by reading this file with the TypeScript parser, the type names too: a name added or
 * dropped here must be a deliberate edit of that test.
 */
export {
  MAX_DRAFT_CLAIMS,
  MAX_FIELDS,
  MAX_ID_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_MAGNITUDE,
  MAX_OBSERVATIONS,
  MAX_OPERANDS,
  MAX_QUOTE_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_UNIT_LENGTH,
} from "./limits.js";

export { compareIds, fieldId, obsId } from "./ids.js";
export type { FieldId, ObsId } from "./ids.js";

export { isNonEmptyArray } from "./non-empty-array.js";
export type { NonEmptyReadonlyArray } from "./non-empty-array.js";

export type { Bound, Extent, Side } from "./bounds.js";

export type { BaseField, DerivedField, FieldDecl, Operands, Schema } from "./schema.js";
export type { Observation } from "./observation.js";
export type { Claim, OpenEnd, Support } from "./claim.js";

export { assertNeverEntailment } from "./entailment.js";
export type { Conflicted, Contradicted, Entailed, Entailment, Ungrounded, Weakened } from "./entailment.js";

export type { ClaimFault, ClaimRejection, ObservationFault, RejectedObservation, SchemaFault } from "./faults.js";
export type { Brief } from "./brief.js";

export { assertEntailmentWellFormed } from "./integrity.js";
export type { EntailmentIntegrity, EntailmentIntegrityError } from "./integrity.js";
