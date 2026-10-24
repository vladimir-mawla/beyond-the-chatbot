import type { Extent, Side } from "./bounds.js";
import type { FieldId, ObsId } from "./ids.js";

/**
 * A claim about one quantity: a draft claim OR the user's question, the same shape (plan 4.1). There is no
 * citation slot, on purpose (D2): the draft is untrusted and carries no evidence, so nothing can be forged.
 * Only the engine attaches support, computed from the snapshot.
 */
export interface Claim {
  readonly field: FieldId;
  readonly extent: Extent;
}

/**
 * The observations that certify each bound of an established extent, per side. `[]` means the bound needs no
 * evidence (it is implied by the schema, or it is unbounded). M4 computes it by deletion-minimisation in
 * ascending id order (D7); this type says nothing about irreducibility or order.
 */
export interface Support {
  readonly lo: readonly ObsId[];
  readonly hi: readonly ObsId[];
}

/** A base quantity with no observation bounding the given side: a named gap. */
export interface OpenEnd {
  readonly field: FieldId;
  readonly side: Side;
}
