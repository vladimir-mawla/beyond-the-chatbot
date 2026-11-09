import { assertEntailmentWellFormed, fieldId } from "../contracts/index.js";
import type { Claim, ClaimFault, Entailment, Extent, ObsId } from "../contracts/index.js";
import { isSameExtent, isSubset, meet, unmetSides } from "../extent/index.js";
import { extentOf, openEndsOf, supportOf } from "../ground/index.js";
import type { Grounding } from "../ground/index.js";
import { deepFreeze, nonEmpty } from "./plain.js";
import { readClaim } from "./read-claim.js";

export type RuleResult = { readonly ok: true; readonly entailment: Entailment } | { readonly ok: false; readonly fault: ClaimFault };

/**
 * Rule one claim against the grounding: `readClaim` first (so a typed claim is read again, as the plan asks), then the
 * ruling table of plan section 4.2. A fault is a result, never an `Entailment`.
 */
export function rule(g: Grounding, raw: unknown): RuleResult {
  const read = readClaim(g, raw);
  if (!read.ok) return deepFreeze({ ok: false, fault: read.fault });
  return deepFreeze({ ok: true, entailment: entail(g, read.claim) });
}

const copyExtent = (extent: Extent): Extent => ({ lo: extent.lo, hi: extent.hi });
const copyIds = (ids: readonly ObsId[]): ObsId[] => [...ids];

/**
 * The ruling table for a claim `C` that `readClaim` accepted, with `B` the schema-only extent of its field and `E`
 * the extent the evidence leaves it. In this precedence (plan section 4.2), the first that holds wins:
 *  - `conflicted`: the tree is refused; the core is the tree's own.
 *  - `ungrounded`: `E = B`. Say nothing about the quantity, name where evidence is missing.
 *  - `entailed`: `E` inside `C`.
 *  - `contradicted`: `E` and `C` share no integer.
 *  - `weakened`: anything else, so `E` overlaps `C`, is not inside it, and is not `B`: say `E`, name the cut.
 * `ungrounded` is checked before `entailed`, but no claim `readClaim` accepts can tell the two orders apart: a claim
 * with `E = B` inside `C` is a claim whose `B` is inside `C`, which is `vacuous-claim` and is refused first.
 *
 * Every `Entailment` built here goes through `assertEntailmentWellFormed` before it is returned, and an
 * `Entailment` that fails it is an internal error and throws (plan section 6, M5). Everything is built fresh, from
 * copies, so nothing in the result is an object of the `Grounding` or of the claim.
 */
function entail(g: Grounding, claim: Claim): Entailment {
  const field = fieldId(claim.field);
  const tested = copyExtent(claim.extent);
  const read = extentOf(g, field);
  if (!read.ok) {
    if (read.failure.kind === "conflicted") return finish({ kind: "conflicted", field, tested, core: nonEmpty(copyIds(read.failure.core), "a core") });
    throw new Error("lib/entail: internal invariant violated: readClaim accepted a field the grounding does not know");
  }
  const established = copyExtent(read.extent);

  if (isSameExtent(established, read.baseline)) {
    const openEnds = openEndsOf(g, field, unmetSides(established, tested)).map((end) => ({ field: end.field, side: end.side }));
    return finish({ kind: "ungrounded", field, tested, openEnds: nonEmpty(openEnds, "the open ends of an ungrounded claim") });
  }

  const supported = supportOf(g, field);
  if (!supported.ok) throw new Error("lib/entail: internal invariant violated: a field with an extent has no support");
  const support = { lo: copyIds(supported.support.lo), hi: copyIds(supported.support.hi) };

  if (isSubset(established, tested)) return finish({ kind: "entailed", field, tested, established, support });
  if (meet(established, tested) === undefined) return finish({ kind: "contradicted", field, tested, established, support });
  const unmet = unmetSides(established, tested);
  const openEnds = openEndsOf(g, field, unmet).map((end) => ({ field: end.field, side: end.side }));
  return finish({ kind: "weakened", field, tested, established, support, unmet: nonEmpty(unmet, "the unmet sides of a weakened claim"), openEnds });
}

/** The one place an `Entailment` leaves `rule`: checked by M1's guard, then frozen. */
function finish(entailment: Entailment): Entailment {
  const verdict = assertEntailmentWellFormed(entailment);
  if (!verdict.ok) {
    const { error } = verdict;
    const where = error.kind === "unknown-variant" ? error.found : `${error.variant}.${error.field}`;
    throw new Error(`lib/entail: internal invariant violated: a ${entailment.kind} ruling failed assertEntailmentWellFormed (${error.kind}: ${where})`);
  }
  return deepFreeze(entailment);
}
