import {
  MAX_DRAFT_CLAIMS,
  MAX_ID_LENGTH,
  MAX_OBSERVATIONS,
  assertEntailmentWellFormed,
  assertNeverEntailment,
  fieldId,
  obsId,
} from "../contracts/index.js";
import type { Bound, Brief, Entailment, Extent, NonEmptyReadonlyArray, ObservationFault, ObsId, Schema, Side } from "../contracts/index.js";
import { checkExtent, isSameExtent, isSubset, meet, unmetSides } from "../extent/index.js";
import { extentOf, ground } from "../ground/index.js";
import type { GroundFailure, Grounding } from "../ground/index.js";
import { deepFreeze, isCount, isRecord, isText, nonEmpty } from "./plain.js";

export type NotReproduced =
  | { readonly kind: "missing-evidence"; readonly id: ObsId }
  | { readonly kind: "evidence-rejected"; readonly fault: ObservationFault }
  | { readonly kind: "support-conflicted" }
  | { readonly kind: "bound-differs"; readonly side: Side; readonly carried: Bound; readonly rederived: Bound }
  | { readonly kind: "kind-differs"; readonly carried: Entailment["kind"]; readonly rederived: Entailment["kind"] }
  | { readonly kind: "unmet-differs" }
  | { readonly kind: "core-satisfiable" };
export type Reproduction =
  | { readonly kind: "reproduced"; readonly silentSides: readonly Side[] }
  | { readonly kind: "not-reproduced"; readonly reason: NotReproduced }
  | { readonly kind: "uncertifiable-silence" };
export interface RecheckFinding {
  readonly position: "answer" | number;
  readonly result: Reproduction;
}
export type RecheckResult =
  | { readonly ok: true; readonly intact: boolean; readonly findings: NonEmptyReadonlyArray<RecheckFinding> }
  | { readonly ok: false; readonly failure: GroundFailure };

/**
 * THE HOLDER'S CHECKER. `recheck(schema, brief)` takes the schema the HOLDER trusts and a `Brief` from anyone, and
 * says, ruling by ruling, whether the `Brief`'s own evidence re-derives what the ruling says. It never sees the
 * snapshot the `Brief` was made from (it imports only `lib/ground`'s public surface, and `architecture.test.ts` pins
 * that), and a `Brief` does not carry its schema, because a carried schema would make this circular.
 *
 * WHAT IT DOES, in order.
 *  1. Reads the `Brief` once into plain data (`readBrief`): `answer`, `claims` and `evidence`, each once, and for each
 *     ruling its eight properties once each. A read that throws, a value of the wrong shape or a ruling that fails
 *     `assertEntailmentWellFormed` is `ok: false` with `hostile-input` and a message of this package's own words.
 *     `Brief.rejected` is not read: a refused claim is a fault, not a ruling.
 *  2. Runs `ground(schema, evidence)`: the carried evidence passes intake again, digit-containment included. A schema
 *     or evidence `ground` refuses is `ok: false` with `ground`'s own failure. The `Grounding` it returns is the
 *     validated copy of the schema, which is what every later call uses, so the holder's schema is read once.
 *  3. A ruling about a field the schema does not declare makes the `Brief` unusable (`hostile-input`): the types of
 *     `RecheckResult` have no per-ruling reason for it.
 *  4. For each ruling (the answer, then each claim in order), a `Reproduction`:
 *      - `ungrounded`: `uncertifiable-silence`, whatever else it says. An absence cannot be certified from a subset.
 *      - `conflicted`: each core id must be carried and must have passed intake; the core alone, grounded, must leave
 *        the ruling's tree conflicted (`core-satisfiable` otherwise). Irreducibility is not checked.
 *      - `entailed`, `weakened`, `contradicted`: each named id must be carried (`missing-evidence`) and have passed
 *        intake (`evidence-rejected`); then, for each side, the carried observations that side's support names are
 *        grounded ON THEIR OWN and the field's extent is read: a conflict is `support-conflicted`, a side that is not
 *        the carried one is `bound-differs` (lower side first); then the kind is recomputed from the re-derived
 *        extent, the schema-only extent and the carried `tested` (`kind-differs`), and for a `weakened` the `unmet`
 *        sides likewise (`unmet-differs`). The first failing step is the answer. If every step passes it is
 *        `reproduced`, with `silentSides` listing each side whose support is empty.
 *  5. `intact` is true when no finding is `not-reproduced`. An `uncertifiable-silence` does not make a `Brief` not
 *     intact: it says what cannot be certified, not that anything is wrong.
 *
 * WHAT IT DOES NOT CERTIFY, at full strength, and `recheck.test.ts` pins each as a result rather than hiding it.
 *  - A bound with empty support is compared with the schema-only bound and nothing else, so a `Brief` that drops a
 *    supported bound AND its support together claims silence on that side and is `reproduced` with the side in
 *    `silentSides`. An omission cannot be seen from the `Brief` alone.
 *  - Carried observations that are invented, with quotes that contain the right digits, are certified: authorship is
 *    asserted, not proved. The quotes are carried so that a holder can compare them with the real documents.
 *  - A `weakened` ruling's `openEnds` is read for being an array and for being empty or not, and never compared with
 *    anything: it is an absence, and an absence is not certified.
 *  - Rulings are checked one at a time. Nothing compares one ruling with another, so a `Brief` whose rulings about
 *    one tree disagree is not noticed.
 *  - Observations that are carried and that no ruling names are grounded with the rest and otherwise not looked at.
 */
export function recheck(schema: Schema, brief: Brief): RecheckResult {
  const read = readBrief(brief);
  if (!read.ok) return hostile(read.message);
  const grounded = ground(schema, read.evidence);
  if (!grounded.ok) return deepFreeze({ ok: false, failure: grounded.failure });
  const g = grounded.grounding;

  for (const { position, ruling } of read.rulings) {
    if (!g.baseline.some((entry) => entry.field === ruling.field)) return hostile(`${where(position)} names a field the schema does not declare`);
  }
  const index = evidenceIndex(g, grounded.rejected, read.evidence);
  const findings = read.rulings.map(({ position, ruling }): RecheckFinding => ({ position, result: reproduce(g, index, ruling) }));
  return deepFreeze({
    ok: true,
    intact: findings.every((finding) => finding.result.kind !== "not-reproduced"),
    findings: nonEmpty(findings, "the findings of a brief"),
  });
}

function hostile(message: string): RecheckResult {
  return deepFreeze({ ok: false, failure: { kind: "hostile-input", message } });
}

function where(position: "answer" | number): string {
  return position === "answer" ? "brief.answer" : `brief.claims[${position}]`;
}

// ---------------------------------------------------------------------------------------------------------
// Reading the Brief: once, into plain data.
// ---------------------------------------------------------------------------------------------------------

interface PositionedRuling {
  readonly position: "answer" | number;
  readonly ruling: Entailment;
}
type BriefRead =
  | { readonly ok: true; readonly rulings: readonly PositionedRuling[]; readonly evidence: readonly unknown[] }
  | { readonly ok: false; readonly message: string };

/**
 * Read `brief` once. The reads, in order: `answer`, `claims`, `evidence` (each once); the answer's eight properties
 * (`kind` `field` `tested` `established` `support` `unmet` `openEnds` `core`), once each; `claims.length`, then each
 * claim by index and its eight properties; `evidence.length`, then each carried observation by index and its
 * `id` `field` `extent` `quote` `source`, and its extent's `lo` and `hi`. Lists are read as far as the contracts'
 * caps allow and no further (more than `MAX_DRAFT_CLAIMS` claims, or more than `MAX_OBSERVATIONS` ids in one list, is
 * refused; more than `MAX_OBSERVATIONS` carried observations is left to `ground` to refuse, from the length alone).
 *
 * Every ruling is rebuilt from fresh copies, only the properties that were not `undefined`, and checked with
 * `assertEntailmentWellFormed` before anything else looks at it, so what the rest of this file reads is a ruling the
 * contract admits. ONE EXCEPTION, stated: `openEnds` is rebuilt as an empty array or a one-element array of `null`,
 * because nothing here reads an open end and only its emptiness matters to the guard. Nothing may read it.
 */
function readBrief(raw: unknown): BriefRead {
  const token = { message: "" };
  const refuse = (message: string): never => {
    token.message = message;
    throw token;
  };
  const attempt = <T>(what: string, read: () => T): T => {
    try {
      return read();
    } catch {
      return refuse(`reading ${what} threw`);
    }
  };
  const isArray = (what: string, value: unknown): value is readonly unknown[] => attempt(what, () => Array.isArray(value));
  const recordOf = (what: string, value: unknown): Record<string, unknown> => {
    if (typeof value !== "object" || value === null || attempt(what, () => Array.isArray(value))) return refuse(`${what} is not an object`);
    return value as Record<string, unknown>;
  };
  const lengthOf = (what: string, list: readonly unknown[]): number => {
    const length = attempt(`${what}.length`, () => list.length);
    return isCount(length) ? length : refuse(`${what} has no usable length`);
  };
  const extentOf1 = (what: string, value: unknown): Extent => {
    const checked = checkExtent(value);
    if (checked.ok) return checked.extent;
    return refuse(checked.reason === "hostile-input" ? `reading ${what} threw` : `${what} is not an extent`);
  };
  const idsOf = (what: string, value: unknown): ObsId[] => {
    if (!isArray(what, value)) return refuse(`${what} is not a list`);
    const length = lengthOf(what, value);
    if (length > MAX_OBSERVATIONS) return refuse(`${what} has more than ${MAX_OBSERVATIONS} entries`);
    const ids: ObsId[] = [];
    for (let i = 0; i < length; i++) {
      const id = attempt(`${what}[${i}]`, () => value[i]);
      ids.push(isText(id, MAX_ID_LENGTH) ? obsId(id) : refuse(`${what}[${i}] is not an id`));
    }
    return ids;
  };
  const sidesOf = (what: string, value: unknown): Side[] => {
    if (!isArray(what, value)) return refuse(`${what} is not a list`);
    const length = lengthOf(what, value);
    if (length > MAX_OBSERVATIONS) return refuse(`${what} has more than ${MAX_OBSERVATIONS} entries`);
    const sides: Side[] = [];
    for (let i = 0; i < length; i++) {
      const side = attempt(`${what}[${i}]`, () => value[i]);
      sides.push(side === "lo" || side === "hi" ? side : refuse(`${what}[${i}] is not a side`));
    }
    return sides;
  };

  const rulingOf = (position: "answer" | number, value: unknown): Entailment => {
    const at = where(position);
    const record = recordOf(at, value);
    const kind = attempt(`${at}.kind`, () => record["kind"]);
    const field = attempt(`${at}.field`, () => record["field"]);
    const tested = attempt(`${at}.tested`, () => record["tested"]);
    const established = attempt(`${at}.established`, () => record["established"]);
    const support = attempt(`${at}.support`, () => record["support"]);
    const unmet = attempt(`${at}.unmet`, () => record["unmet"]);
    const openEnds = attempt(`${at}.openEnds`, () => record["openEnds"]);
    const core = attempt(`${at}.core`, () => record["core"]);

    if (kind !== "entailed" && kind !== "weakened" && kind !== "contradicted" && kind !== "ungrounded" && kind !== "conflicted") return refuse(`${at} has an unknown kind`);
    if (!isText(field, MAX_ID_LENGTH)) return refuse(`${at}.field is not a field id`);
    const candidate: Record<string, unknown> = { kind, field: fieldId(field), tested: extentOf1(`${at}.tested`, tested) };
    if (established !== undefined) candidate["established"] = extentOf1(`${at}.established`, established);
    if (support !== undefined) {
      const holder = recordOf(`${at}.support`, support);
      const lo = attempt(`${at}.support.lo`, () => holder["lo"]);
      const hi = attempt(`${at}.support.hi`, () => holder["hi"]);
      candidate["support"] = { lo: idsOf(`${at}.support.lo`, lo), hi: idsOf(`${at}.support.hi`, hi) };
    }
    if (unmet !== undefined) candidate["unmet"] = sidesOf(`${at}.unmet`, unmet);
    if (openEnds !== undefined) {
      if (!isArray(`${at}.openEnds`, openEnds)) return refuse(`${at}.openEnds is not a list`);
      candidate["openEnds"] = lengthOf(`${at}.openEnds`, openEnds) === 0 ? [] : [null];
    }
    if (core !== undefined) candidate["core"] = idsOf(`${at}.core`, core);

    const ruling = candidate as unknown as Entailment;
    const verdict = assertEntailmentWellFormed(ruling);
    if (!verdict.ok) {
      const { error } = verdict;
      return refuse(`${at} is not a well-formed ${kind}: ${error.kind}${error.kind === "unknown-variant" ? "" : ` ${error.field}`}`);
    }
    return ruling;
  };

  const observationOf = (index: number, value: unknown): unknown => {
    const at = `brief.evidence[${index}]`;
    if (typeof value !== "object" || value === null) return value;
    if (attempt(at, () => Array.isArray(value))) return null;
    const record = value as Record<string, unknown>;
    const extent = attempt(`${at}.extent`, () => record["extent"]);
    let copy: unknown = extent;
    if (typeof extent === "object" && extent !== null) {
      if (attempt(`${at}.extent`, () => Array.isArray(extent))) copy = null;
      else {
        const holder = extent as Record<string, unknown>;
        copy = { lo: attempt(`${at}.extent.lo`, () => holder["lo"]), hi: attempt(`${at}.extent.hi`, () => holder["hi"]) };
      }
    }
    return {
      id: attempt(`${at}.id`, () => record["id"]),
      field: attempt(`${at}.field`, () => record["field"]),
      extent: copy,
      quote: attempt(`${at}.quote`, () => record["quote"]),
      source: attempt(`${at}.source`, () => record["source"]),
    };
  };

  try {
    const top = recordOf("the brief", raw);
    const answer = attempt("brief.answer", () => top["answer"]);
    const claims = attempt("brief.claims", () => top["claims"]);
    const evidence = attempt("brief.evidence", () => top["evidence"]);

    const rulings: PositionedRuling[] = [{ position: "answer", ruling: rulingOf("answer", answer) }];
    if (!isArray("brief.claims", claims)) return refuse("brief.claims is not an array");
    const claimCount = lengthOf("brief.claims", claims);
    if (claimCount > MAX_DRAFT_CLAIMS) return refuse(`brief.claims has more than ${MAX_DRAFT_CLAIMS} entries`);
    for (let i = 0; i < claimCount; i++) rulings.push({ position: i, ruling: rulingOf(i, attempt(`brief.claims[${i}]`, () => claims[i])) });

    if (!isArray("brief.evidence", evidence)) return refuse("brief.evidence is not an array");
    const evidenceCount = lengthOf("brief.evidence", evidence);
    // Too long to take in: `ground` refuses from the length alone, and a sparse array of that length is all it reads.
    if (evidenceCount > MAX_OBSERVATIONS) return { ok: true, rulings, evidence: new Array<unknown>(evidenceCount) };
    const snapshot: unknown[] = [];
    for (let i = 0; i < evidenceCount; i++) snapshot.push(observationOf(i, attempt(`brief.evidence[${i}]`, () => evidence[i])));
    return { ok: true, rulings, evidence: snapshot };
  } catch (thrown) {
    if (thrown === token) return { ok: false, message: token.message };
    throw thrown;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Re-deriving each ruling from the evidence the Brief carries.
// ---------------------------------------------------------------------------------------------------------

/** What happened to each id the carried evidence used: it passed intake, or it was refused for this reason. */
type EvidenceState = { readonly kind: "accepted" } | { readonly kind: "rejected"; readonly fault: ObservationFault };

function evidenceIndex(g: Grounding, rejected: readonly { readonly index: number; readonly fault: ObservationFault }[], evidence: readonly unknown[]): ReadonlyMap<string, EvidenceState> {
  const states = new Map<string, EvidenceState>();
  for (const { index, fault } of rejected) {
    const carried = evidence[index];
    const id = isRecord(carried) ? carried["id"] : undefined;
    if (isText(id, MAX_ID_LENGTH) && !states.has(id)) states.set(id, { kind: "rejected", fault });
  }
  for (const observation of g.observations) states.set(observation.id, { kind: "accepted" });
  return states;
}

/** The first id of `ids` that cannot be used as evidence, as the reason, or `undefined` if every one can. */
function unusable(states: ReadonlyMap<string, EvidenceState>, ids: readonly ObsId[]): NotReproduced | undefined {
  for (const id of ids) {
    const state = states.get(id);
    if (state === undefined) return { kind: "missing-evidence", id };
    if (state.kind === "rejected") return { kind: "evidence-rejected", fault: state.fault };
  }
  return undefined;
}

/** The grounding of the accepted carried observations whose ids are in `ids`, on their own. */
function regrounded(g: Grounding, ids: readonly ObsId[]): Grounding {
  const wanted = new Set<string>(ids);
  const result = ground(g.schema, g.observations.filter((observation) => wanted.has(observation.id)));
  if (!result.ok || result.rejected.length > 0) throw new Error("lib/entail: internal invariant violated: accepted observations were refused on a second grounding");
  return result.grounding;
}

/** The kind of ruling an extent `rederived` gives a claim `tested` about a field whose schema-only extent is `baseline`: the plan's precedence, without `conflicted`. */
function kindOf(rederived: Extent, baseline: Extent, tested: Extent): Entailment["kind"] {
  if (isSameExtent(rederived, baseline)) return "ungrounded";
  if (isSubset(rederived, tested)) return "entailed";
  if (meet(rederived, tested) === undefined) return "contradicted";
  return "weakened";
}

function notReproduced(reason: NotReproduced): Reproduction {
  return { kind: "not-reproduced", reason };
}

function reproduce(g: Grounding, states: ReadonlyMap<string, EvidenceState>, ruling: Entailment): Reproduction {
  switch (ruling.kind) {
    case "ungrounded":
      return { kind: "uncertifiable-silence" };
    case "conflicted": {
      const bad = unusable(states, ruling.core);
      if (bad !== undefined) return notReproduced(bad);
      const read = extentOf(regrounded(g, ruling.core), ruling.field);
      if (read.ok) return notReproduced({ kind: "core-satisfiable" });
      if (read.failure.kind === "conflicted") return { kind: "reproduced", silentSides: [] };
      throw new Error("lib/entail: internal invariant violated: a field of the brief is not in the schema");
    }
    case "entailed":
    case "weakened":
    case "contradicted": {
      const bad = unusable(states, [...ruling.support.lo, ...ruling.support.hi]);
      if (bad !== undefined) return notReproduced(bad);
      const bounds: { lo: Bound; hi: Bound } = { lo: null, hi: null };
      for (const side of ["lo", "hi"] as const) {
        const read = extentOf(regrounded(g, ruling.support[side]), ruling.field);
        if (!read.ok) {
          if (read.failure.kind === "conflicted") return notReproduced({ kind: "support-conflicted" });
          throw new Error("lib/entail: internal invariant violated: a field of the brief is not in the schema");
        }
        bounds[side] = read.extent[side];
      }
      for (const side of ["lo", "hi"] as const) {
        if (ruling.established[side] !== bounds[side]) return notReproduced({ kind: "bound-differs", side, carried: ruling.established[side], rederived: bounds[side] });
      }
      const baseline = g.baseline.find((entry) => entry.field === ruling.field);
      if (baseline === undefined) throw new Error("lib/entail: internal invariant violated: a field of the brief is not in the schema");
      const rederived = kindOf(bounds, baseline.extent, ruling.tested);
      if (rederived !== ruling.kind) return notReproduced({ kind: "kind-differs", carried: ruling.kind, rederived });
      if (ruling.kind === "weakened") {
        const expected = unmetSides(bounds, ruling.tested);
        if (expected.length !== ruling.unmet.length || expected.some((side, i) => side !== ruling.unmet[i])) return notReproduced({ kind: "unmet-differs" });
      }
      const silentSides: Side[] = [];
      for (const side of ["lo", "hi"] as const) if (ruling.support[side].length === 0) silentSides.push(side);
      return { kind: "reproduced", silentSides };
    }
    default:
      return assertNeverEntailment(ruling);
  }
}
