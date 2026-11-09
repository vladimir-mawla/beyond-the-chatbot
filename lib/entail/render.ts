import { assertNeverEntailment } from "../contracts/index.js";
import type { Brief, ClaimFault, Entailment, Extent, FieldId, OpenEnd, Schema, Side } from "../contracts/index.js";
import { declOf } from "../ground/index.js";

/**
 * RENDERING: a sentence is only ever a projection of a checked ruling (plan D1). Every function here is a fixed
 * template over an `Entailment` or a `Brief` and the labels and units of the `Schema`: no model, no free text, no
 * number that is not in the value being rendered. The words are the templates'; the numbers are the bounds of the
 * ruling's own extents, ids are the ruling's own ids, and a label or unit is the schema's text, printed as it is.
 *
 * What is NOT printed, on purpose: an observation's `quote` and `source` (free text, and `source` is never read by
 * the engine), and the text of a refused claim (`unknown-field` carries the draft's own, hostile, string, and it is
 * not echoed). A field the schema does not declare is printed by its id, so rendering never throws for want of a label.
 * Observation ids and field ids are printed as given; they are free text too (1 to 128 units), so an id containing a newline forges a line in the rendering. `lib/entail` does not escape them.
 *
 * It renders what it is given. It does not check that a ruling is true: that is `recheck`'s job, and a `Brief` from
 * elsewhere should go through it before anyone relies on its text.
 */

const sideName = (side: Side): string => (side === "lo" ? "lower" : "upper");
const direction = (side: Side): string => (side === "lo" ? "from below" : "from above");

function labelOf(schema: Schema, field: FieldId): string {
  const decl = declOf(schema, field);
  return decl === undefined ? field : decl.label;
}

function unitOf(schema: Schema, field: FieldId): string {
  const decl = declOf(schema, field);
  return decl === undefined ? "" : decl.unit;
}

/** "at least 4 days", "at most 12 days", "between 4 and 9 days", "exactly 14 days"; a bound is printed with `String`, an integer. */
function extentPhrase(extent: Extent, unit: string): string {
  const suffix = unit === "" ? "" : ` ${unit}`;
  if (extent.lo !== null && extent.hi !== null) return extent.lo === extent.hi ? `exactly ${extent.lo}${suffix}` : `between ${extent.lo} and ${extent.hi}${suffix}`;
  if (extent.lo !== null) return `at least ${extent.lo}${suffix}`;
  if (extent.hi !== null) return `at most ${extent.hi}${suffix}`;
  return "any value";
}

/** "(lower bound from o1, o2; upper bound from the schema only)": where each side of the established extent comes from. */
function supportClause(e: Extract<Entailment, { readonly support: unknown }>): string {
  const part = (side: Side): string => {
    const ids = e.support[side];
    if (ids.length > 0) return `${sideName(side)} bound from ${ids.join(", ")}`;
    return e.established[side] === null ? `no ${sideName(side)} bound` : `${sideName(side)} bound from the schema only`;
  };
  return `(${part("lo")}; ${part("hi")})`;
}

/** "no document bounds customs clearance from above; ..." for each open end. */
function gaps(schema: Schema, openEnds: readonly OpenEnd[]): string {
  return openEnds.map((end) => `no document bounds ${labelOf(schema, end.field)} ${direction(end.side)}`).join("; ");
}

/** One ruling as one paragraph of text. Exhaustive over the five kinds. */
export function renderEntailment(schema: Schema, e: Entailment): string {
  const label = labelOf(schema, e.field);
  const unit = unitOf(schema, e.field);
  const tested = `${label} ${extentPhrase(e.tested, unit)}`;
  switch (e.kind) {
    case "entailed":
      return `Established: ${tested}. The evidence gives ${label} ${extentPhrase(e.established, unit)} ${supportClause(e)}.`;
    case "contradicted":
      return `Ruled out: ${tested}. The evidence gives ${label} ${extentPhrase(e.established, unit)} ${supportClause(e)}.`;
    case "weakened": {
      const cut = e.unmet.map((side) => sideName(side)).join(" and ");
      const missing = e.openEnds.length > 0 ? ` ${capitalise(gaps(schema, e.openEnds))}.` : " No quantity is named as missing.";
      return `Not established: ${tested}. What the evidence does establish: ${label} ${extentPhrase(e.established, unit)} ${supportClause(e)}. Withheld: the ${cut} bound.${missing}`;
    }
    case "ungrounded":
      return `Cannot answer: ${tested}. The evidence does not move ${label} from what the schema implies. Missing: ${gaps(schema, e.openEnds)}.`;
    case "conflicted":
      return `Refused: ${tested}. Sources conflict: ${e.core.join(", ")} cannot all be true. No source is trusted over another.`;
    default:
      return assertNeverEntailment(e);
  }
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Why a draft claim was refused, without echoing anything the draft said. */
function faultText(schema: Schema, fault: ClaimFault): string {
  switch (fault.kind) {
    case "malformed":
      return `the claim is not well formed (${fault.fields.join(", ")})`;
    case "unknown-field":
      return "the claim names a quantity the schema does not declare";
    case "vacuous-claim":
      return `the claim rules nothing out about ${labelOf(schema, fault.field)}, which the schema already implies`;
    case "hostile-input":
      return "the claim could not be read safely";
    default: {
      const unreachable: never = fault;
      throw new Error(`lib/entail: unreachable ClaimFault: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * A whole `Brief` as text: the question's ruling, then each draft claim's in draft order, then each refusal with its
 * position. The evidence list is not printed (it is quotes and sources: see the header).
 */
export function renderBrief(schema: Schema, brief: Brief): string {
  const lines = [`Question: ${renderEntailment(schema, brief.answer)}`];
  if (brief.claims.length === 0) lines.push("No draft claims were ruled.");
  else {
    lines.push("Draft claims:");
    for (const claim of brief.claims) lines.push(`- ${renderEntailment(schema, claim)}`);
  }
  if (brief.rejected.length > 0) {
    lines.push("Refused before ruling:");
    for (const refusal of brief.rejected) lines.push(`- draft position ${refusal.index}: ${faultText(schema, refusal.fault)}`);
  }
  return lines.join("\n");
}
