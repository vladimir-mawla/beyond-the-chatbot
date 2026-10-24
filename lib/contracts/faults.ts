import type { FieldId } from "./ids.js";
import type { NonEmptyReadonlyArray } from "./non-empty-array.js";

/**
 * Typed refusals, by the layer that raises them (`.genesis/PLAN.md` sections 4.1 and 4.4). A FAULT says why
 * something never reached a ruling; it is never an `Entailment` and never a throw (D11). These are
 * declarations only: nothing in M1 raises one. Each union's order below is its precedence where the plan
 * states one, and the comments say which layer raises it and which of the plan's precedence it follows.
 *
 * Fields typed `string` rather than `FieldId`/`ObsId` (`field`, `operand`, `result`, `id`) hold text that is
 * HOSTILE until it has been matched against the schema: a fault is raised about input that may not be a valid
 * id, so it cannot honestly be branded.
 */

/** M4 `readSchema`. Precedence: malformed > too-many-fields > duplicate-field > unknown-operand > operand-reused > rule-cycle > unit-mismatch. */
export type SchemaFault =
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "too-many-fields"; readonly count: number; readonly max: number }
  | { readonly kind: "duplicate-field"; readonly field: string }
  | { readonly kind: "unknown-operand"; readonly result: string; readonly operand: string }
  | { readonly kind: "operand-reused"; readonly operand: string }
  | { readonly kind: "rule-cycle"; readonly field: string }
  | { readonly kind: "unit-mismatch"; readonly result: string; readonly operand: string }
  | { readonly kind: "hostile-input"; readonly message: string };

/** M4 `ground`. Precedence: duplicate-id > malformed > unknown-field > number-not-in-quote > outside-baseline. */
export type ObservationFault =
  /** Every occurrence of a repeated id is rejected, so input order cannot pick a winner. */
  | { readonly kind: "duplicate-id"; readonly id: string }
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "number-not-in-quote"; readonly value: number }
  /** The extent's intersection with the field's computed baseline is empty: impossible by the schema's own invariants. */
  | { readonly kind: "outside-baseline"; readonly field: FieldId }
  | { readonly kind: "hostile-input"; readonly message: string };

/** M5 `readClaim`. Precedence: malformed > unknown-field > vacuous-claim. */
export type ClaimFault =
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "unknown-field"; readonly field: string }
  /** The computed baseline already satisfies the claim: it rules nothing out. */
  | { readonly kind: "vacuous-claim"; readonly field: FieldId }
  | { readonly kind: "hostile-input"; readonly message: string };

/** An observation refused at intake: its position in the input, and why. */
export interface RejectedObservation {
  readonly index: number;
  readonly fault: ObservationFault;
}

/** A draft claim refused before ruling: its position in the draft, and why. */
export interface ClaimRejection {
  readonly index: number;
  readonly fault: ClaimFault;
}
