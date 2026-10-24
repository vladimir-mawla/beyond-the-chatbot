import type { Extent, Side } from "../../bounds.js";
import type { OpenEnd, Support } from "../../claim.js";
import type { Brief } from "../../brief.js";
import type { Conflicted, Contradicted, Entailed, Entailment, Ungrounded, Weakened } from "../../entailment.js";
import { fieldId, obsId } from "../../ids.js";
import type { NonEmptyReadonlyArray } from "../../non-empty-array.js";
import type { Observation } from "../../observation.js";
import type { BaseField, DerivedField, Schema } from "../../schema.js";

/**
 * Shared sample values for the tests and proofs: the order-desk scenario of `.genesis/PLAN.md` section 7,
 * typed against the real contracts. These are TEST FIXTURES, not the domain (M6 owns `domains/order-desk`);
 * the numbers are the plan's, copied here so that M1's tests do not depend on a later milestone.
 *
 * Every sample is a VALID value of its variant. A proof or a test that needs a contaminated one derives it
 * from a sample by changing exactly one field, so "this value differs from a valid one in that field only"
 * is true by construction. Samples are plain mutable objects at run time (`readonly` is compile-time only),
 * so a test that mutates one must copy it first; none does.
 */

export const PACK = fieldId("packDays");
export const TRANSIT = fieldId("transitDays");
export const CUSTOMS = fieldId("customsDays");
export const DELIVERY = fieldId("deliveryDay");

export const O1 = obsId("o1");
export const O2 = obsId("o2");
export const O3 = obsId("o3");
export const O4 = obsId("o4");

/** Plan section 7: three base quantities (days, baseline [0, inf)) and `deliveryDay` as their sum. */
export const ORDER_DESK_SCHEMA: Schema = {
  fields: [
    { kind: "base", id: PACK, label: "packing time", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "base", id: TRANSIT, label: "transit time", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "base", id: CUSTOMS, label: "customs clearance", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "derived", id: DELIVERY, label: "delivery (days from order)", unit: "days", sum: [PACK, TRANSIT, CUSTOMS] },
  ],
};

/** Plan section 7's four canonical observations, with their real quotes. */
export const OBSERVATIONS: Readonly<Record<"o1" | "o2" | "o3" | "o4", Observation>> = {
  o1: { id: O1, field: PACK, extent: { lo: 1, hi: 2 }, quote: "Packed and dispatched within 1 to 2 days of the order", source: "Warehouse system" },
  o2: { id: O2, field: TRANSIT, extent: { lo: 3, hi: 5 }, quote: "Standard international transit takes 3 to 5 days", source: "Carrier SLA sheet" },
  o3: { id: O3, field: CUSTOMS, extent: { lo: 0, hi: 2 }, quote: "Customs clearance takes 0 to 2 days", source: "Customs bulletin" },
  o4: { id: O4, field: DELIVERY, extent: { lo: 14, hi: 14 }, quote: "Courier tracking estimates delivery on day 14", source: "Courier tracking page" },
};

/** The values each forbidden field is given in a contaminated sample. Typed so no proof needs a cast. */
export const SOME_EXTENT: Extent = { lo: 4, hi: 9 };
export const SOME_SUPPORT: Support = { lo: [O1, O2], hi: [O1, O2, O3] };
export const SOME_UNMET: NonEmptyReadonlyArray<Side> = ["hi"];
export const SOME_OPEN_END: OpenEnd = { field: CUSTOMS, side: "hi" };
export const SOME_OPEN_ENDS: readonly OpenEnd[] = [SOME_OPEN_END];
export const SOME_NONEMPTY_OPEN_ENDS: NonEmptyReadonlyArray<OpenEnd> = [SOME_OPEN_END];
export const SOME_CORE: NonEmptyReadonlyArray<typeof O1> = [O1, O2, O3, O4];

/** Plan section 7, step 4 ("delivery <= 12" with o1 o2 o3): entailed, established [4, 9]. */
const ENTAILED: Entailed = {
  kind: "entailed",
  field: DELIVERY,
  tested: { lo: null, hi: 12 },
  established: { lo: 4, hi: 9 },
  support: { lo: [O1, O2], hi: [O1, O2, O3] },
};

/** Step 1 ("delivery <= 12" with o1 o2): weakened to "at least 4"; the cut is the upper side; customs has no upper bound. */
const WEAKENED: Weakened = {
  kind: "weakened",
  field: DELIVERY,
  tested: { lo: null, hi: 12 },
  established: { lo: 4, hi: null },
  support: { lo: [O1, O2], hi: [] },
  unmet: ["hi"],
  openEnds: [{ field: CUSTOMS, side: "hi" }],
};

/** Step 3 ("delivery <= 3" with o1 o2): contradicted, established "at least 4". */
const CONTRADICTED: Contradicted = {
  kind: "contradicted",
  field: DELIVERY,
  tested: { lo: null, hi: 3 },
  established: { lo: 4, hi: null },
  support: { lo: [O1, O2], hi: [] },
};

/** Step 1's drafted "customs = 2": ungrounded, both sides of customs are open. */
const UNGROUNDED: Ungrounded = {
  kind: "ungrounded",
  field: CUSTOMS,
  tested: { lo: 2, hi: 2 },
  openEnds: [
    { field: CUSTOMS, side: "lo" },
    { field: CUSTOMS, side: "hi" },
  ],
};

/** Step 5 ("delivery <= 12" with all four documents): conflicted, the core is all four. */
const CONFLICTED: Conflicted = {
  kind: "conflicted",
  field: DELIVERY,
  tested: { lo: null, hi: 12 },
  core: [O1, O2, O3, O4],
};

export const ENTAILMENT_SAMPLES: {
  readonly entailed: Entailed;
  readonly weakened: Weakened;
  readonly contradicted: Contradicted;
  readonly ungrounded: Ungrounded;
  readonly conflicted: Conflicted;
} = { entailed: ENTAILED, weakened: WEAKENED, contradicted: CONTRADICTED, ungrounded: UNGROUNDED, conflicted: CONFLICTED };

export const ENTAILMENT_KINDS = ["entailed", "weakened", "contradicted", "ungrounded", "conflicted"] as const;

/** A `Brief` for step 5: the answer is conflicted and so is the one draft claim; the evidence is the four documents, sorted by id. */
export const CONFLICT_BRIEF: Brief = {
  answer: ENTAILMENT_SAMPLES.conflicted,
  claims: [{ ...ENTAILMENT_SAMPLES.conflicted, field: PACK, tested: { lo: 1, hi: 1 } }],
  rejected: [{ index: 1, fault: { kind: "vacuous-claim", field: CUSTOMS } }],
  evidence: [OBSERVATIONS.o1, OBSERVATIONS.o2, OBSERVATIONS.o3, OBSERVATIONS.o4],
};

/** The two field declarations the schema proofs derive their contaminated values from. */
export const BASE_FIELD: BaseField = { kind: "base", id: PACK, label: "packing time", unit: "days", baseline: { lo: 0, hi: null } };
export const DERIVED_FIELD: DerivedField = { kind: "derived", id: DELIVERY, label: "delivery (days from order)", unit: "days", sum: [PACK, TRANSIT, CUSTOMS] };

/** The extent every sample's `tested` is drawn from, for a proof or test that builds a literal. */
export const SOME_TESTED: Extent = { lo: null, hi: 12 };

/**
 * A fresh, unfrozen deep copy: what a test uses when it needs to contaminate a sample. JSON round-trip, not
 * `structuredClone`: the proof harness compiles this file without Node's type definitions, and every sample
 * is plain JSON-safe data (no `undefined`, no class instance).
 */
export function fresh<T extends Entailment>(sample: T): T {
  return JSON.parse(JSON.stringify(sample)) as T;
}
