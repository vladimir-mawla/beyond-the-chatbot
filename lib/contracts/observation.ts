import type { Extent } from "./bounds.js";
import type { FieldId, ObsId } from "./ids.js";

/**
 * A typed fact about one quantity, read (by something outside this repository) from a document.
 *
 * `quote` is the clause the extent was read from. Plan D8: every bound's digits must occur in it. That check
 * is M4's `ground`; this type cannot say it, and the ONLY fidelity check the plan has is digit-containment:
 * a direction flip, a dropped bound or a semantic slip is accepted and then ruled as if it were true (the
 * plan's failure case 01, M7). `source` is a display label only and is never read by the engine (D6; the
 * metamorphic test is failure case 08).
 */
export interface Observation {
  readonly id: ObsId;
  readonly field: FieldId;
  readonly extent: Extent;
  readonly quote: string;
  readonly source: string;
}
