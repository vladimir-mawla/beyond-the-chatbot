import type { Claim, FieldId } from "../../lib/contracts/index.js";
import { FIELDS } from "./schema.js";

/**
 * THE DRAFTER: a pure function standing in for a language model (plan D10; section 6, M6). It is what "a chatbot" says
 * about the order, written out so that it cannot be accused of being rigged: its whole rule is below, and
 * `__tests__/drafter.test.ts` pins it value by value.
 *
 * It imports from `lib/` only the types `Claim` and `FieldId`; it imports no engine function at all (plan D2: a
 * chatbot does not have the engine; a drafter that borrowed `lib/extent` would be the gate in a costume). The only
 * other thing it imports is this domain's `FIELDS`. `__tests__/architecture.test.ts` pins both.
 *
 * THE RULE. It states every one of the four quantities as an exact value, in the order packing, transit, customs,
 * delivery:
 *  - a base quantity that some observation is about: the midpoint, rounded down, of the observations' extents' finite
 *    sides. Written out: the lower end is the greatest finite `lo`, the upper end the least finite `hi`, and the value is
 *    `floor((lower + upper) / 2)`; if only one end is finite the value is that end; if no end is finite there is nothing
 *    to read and the prior is used. There is no special case for ends that cross (two documents that do not overlap):
 *    the crossed ends are averaged, which is what a fluent drafter does with disagreeing sources;
 *  - a base quantity no observation is about: a declared MODEL PRIOR (`PRIOR_*_DAYS`), labelled as one in the text;
 *  - `deliveryDay`: the same midpoint over the observations about it if there are any, else the sum of the three
 *    base statements.
 *
 * What is invented here, and disclosed: the three prior values (the plan names only `PRIOR_CUSTOMS_DAYS = 2`; the
 * other two are needed so that the drafter is total over all sixteen snapshots M8 offers, and are chosen to equal what
 * the canonical documents give), and the crossed-ends rule above.
 *
 * The question is carried into the draft so that the paragraph can answer it, and it does not change a single
 * statement: the same snapshot gets the same four claims whatever is asked (`drafter.test.ts` pins that).
 *
 * Its inputs are this package's own constants (or a subset of them), not untrusted data; what it produces goes to the
 * engine as `unknown`, which reads it as untrusted.
 */

export const PRIOR_PACK_DAYS = 1;
export const PRIOR_TRANSIT_DAYS = 4;
/** The plan's prior (section 6, M6): what the drafter says about customs clearance when no document does. */
export const PRIOR_CUSTOMS_DAYS = 2;

export interface Priors {
  readonly packDays: number;
  readonly transitDays: number;
  readonly customsDays: number;
}

export const MODEL_PRIORS: Priors = Object.freeze({ packDays: PRIOR_PACK_DAYS, transitDays: PRIOR_TRANSIT_DAYS, customsDays: PRIOR_CUSTOMS_DAYS });

/** What the drafter reads of an observation: the quantity and the extent. An `Observation` is assignable to it. */
export interface DrafterObservation {
  readonly field: FieldId;
  readonly extent: { readonly lo: number | null; readonly hi: number | null };
}

/** Where a stated value came from: a document, the model prior, or the sum of the other three statements. */
export type Basis = "observed" | "prior" | "sum";

export interface Statement {
  readonly claim: Claim;
  readonly basis: Basis;
}

export interface FluentDraft {
  /** The question the paragraph answers. */
  readonly question: Claim;
  /** Packing, transit, customs, delivery, in that order. One statement per quantity; nothing is index-paired. */
  readonly statements: readonly [Statement, Statement, Statement, Statement];
}

/** The midpoint rule over the extents of the observations about one field; `undefined` when no end is finite. */
function midpoint(observations: readonly DrafterObservation[], field: FieldId): number | undefined {
  let lower: number | undefined;
  let upper: number | undefined;
  for (const observation of observations) {
    if (observation.field !== field) continue;
    const lo = observation.extent.lo;
    const hi = observation.extent.hi;
    if (lo !== null && (lower === undefined || lo > lower)) lower = lo;
    if (hi !== null && (upper === undefined || hi < upper)) upper = hi;
  }
  if (lower !== undefined && upper !== undefined) return Math.floor((lower + upper) / 2);
  return lower ?? upper;
}

function exactly(field: FieldId, value: number, basis: Basis): Statement {
  return { claim: { field, extent: { lo: value, hi: value } }, basis };
}

/** What a fluent chatbot would claim about this order, given the documents it was shown. See the file header for the rule. */
export function fluentDraft(observations: readonly DrafterObservation[], question: Claim, priors: Priors = MODEL_PRIORS): FluentDraft {
  const read = (field: FieldId, prior: number): Statement => {
    const value = midpoint(observations, field);
    return value === undefined ? exactly(field, prior, "prior") : exactly(field, value, "observed");
  };
  const pack = read(FIELDS.packDays, priors.packDays);
  const transit = read(FIELDS.transitDays, priors.transitDays);
  const customs = read(FIELDS.customsDays, priors.customsDays);
  const direct = midpoint(observations, FIELDS.deliveryDay);
  const total = pack.claim.extent.lo! + transit.claim.extent.lo! + customs.claim.extent.lo!;
  const delivery = direct === undefined ? exactly(FIELDS.deliveryDay, total, "sum") : exactly(FIELDS.deliveryDay, direct, "observed");
  return { question, statements: [pack, transit, customs, delivery] };
}

/** The claims of a draft, in order: what the engine is asked to rule on. */
export function claimsOf(draft: FluentDraft): readonly Claim[] {
  return draft.statements.map((statement) => statement.claim);
}

const days = (n: number): string => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The chatbot's paragraph: confident, one value for everything, no hedge. It is a fixed template over the draft: the
 * only numbers are the stated values, and it prints no label or id; for a draft from `fluentDraft` it prints no free text, and it prints
 * whatever number-typed value a draft carries (a quantity it has no phrase for is printed as "that quantity"). A prior is labelled as one.
 */
export function renderFluent(draft: FluentDraft): string {
  const [pack, transit, customs, delivery] = draft.statements;
  const valueOf = (statement: Statement): number => statement.claim.extent.lo as number;
  const asked = draft.statements.find((statement) => statement.claim.field === draft.question.field);
  let verdict = "I cannot say";
  let subject = "that quantity";
  if (asked !== undefined) {
    const v = valueOf(asked);
    const { lo, hi } = draft.question.extent;
    verdict = (lo === null || v >= lo) && (hi === null || v <= hi) ? "Yes" : "No";
    subject =
      asked === delivery ? `delivery is around day ${v}` : asked === pack ? `packing takes about ${days(v)}` : asked === transit ? `transit takes about ${days(v)}` : `customs clearance takes about ${days(v)}`;
  }
  const priors = [pack, transit, customs].filter((statement) => statement.basis === "prior").length;
  const note = priors === 0 ? "" : " Figures marked as typical are a model prior, not taken from any document.";
  const typical = (statement: Statement): string => (statement.basis === "prior" ? " (typical)" : "");
  const how = `Packing takes about ${days(valueOf(pack))}${typical(pack)}, transit about ${days(valueOf(transit))}${typical(transit)} and customs clearance about ${days(valueOf(customs))}${typical(customs)}`;
  const landing = asked === delivery ? "" : ` Delivery lands around day ${valueOf(delivery)}.`;
  return `${verdict}: ${subject}. ${how}.${landing}${note}`;
}
