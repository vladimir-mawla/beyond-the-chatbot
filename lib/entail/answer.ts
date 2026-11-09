import { MAX_DRAFT_CLAIMS, assertNeverEntailment, compareIds } from "../contracts/index.js";
import type { Brief, ClaimFault, ClaimRejection, Entailment, Observation, ObsId } from "../contracts/index.js";
import type { Grounding } from "../ground/index.js";
import { deepFreeze, isCount } from "./plain.js";
import { rule } from "./rule.js";

export type AnswerFailure =
  | { readonly kind: "question-rejected"; readonly fault: ClaimFault }
  | { readonly kind: "draft-not-an-array" }
  | { readonly kind: "draft-too-long"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };
export type AnswerResult = { readonly ok: true; readonly brief: Brief } | { readonly ok: false; readonly failure: AnswerFailure };

/**
 * Rule the question, then every draft claim, and collect the rulings in a `Brief`.
 *
 * ORDER, which decides what is read. The question goes first: it is ruled by `rule` (so read once, by `readClaim`),
 * and a rejected question fails the whole call as `question-rejected`, with the draft not looked at, since there is no
 * answer without a question. Then the draft: `Array.isArray`, then `length` once; a value that is not an array is
 * `draft-not-an-array`; a read that throws, or a length that is not a count, is `hostile-input`; more than
 * `MAX_DRAFT_CLAIMS` is `draft-too-long`, decided from the length alone (no element is read). Then each element is read
 * once, by index, and ruled. An element whose read throws is refused, as a claim, with `hostile-input`; every other
 * refusal is `rule`'s. A refused claim goes to `Brief.rejected` with its position; a ruled one to `Brief.claims`;
 * both keep draft order, and the two together cover every position once.
 *
 * `Brief.evidence` is exactly the observations that some ruling's support or core names, once each, sorted by id, as
 * fresh copies out of `Grounding.observations`. An `ungrounded` ruling names none. A named id that the grounding
 * does not hold is an internal error (a `Grounding` that disagrees with itself) and throws.
 */
export function answer(g: Grounding, rawQuestion: unknown, rawDraft: unknown): AnswerResult {
  const question = rule(g, rawQuestion);
  if (!question.ok) return fail({ kind: "question-rejected", fault: question.fault });

  let isList: boolean;
  try {
    isList = Array.isArray(rawDraft);
  } catch {
    return fail({ kind: "hostile-input", message: "reading the draft threw" });
  }
  if (!isList) return fail({ kind: "draft-not-an-array" });
  const list = rawDraft as readonly unknown[];
  let length: unknown;
  try {
    length = list.length;
  } catch {
    return fail({ kind: "hostile-input", message: "reading draft.length threw" });
  }
  if (!isCount(length)) return fail({ kind: "hostile-input", message: "the draft has no usable length" });
  if (length > MAX_DRAFT_CLAIMS) return fail({ kind: "draft-too-long", count: length, max: MAX_DRAFT_CLAIMS });

  const claims: Entailment[] = [];
  const rejected: ClaimRejection[] = [];
  for (let index = 0; index < length; index++) {
    let element: unknown;
    try {
      element = list[index];
    } catch {
      rejected.push({ index, fault: { kind: "hostile-input", message: `reading draft[${index}] threw` } });
      continue;
    }
    const ruled = rule(g, element);
    if (ruled.ok) claims.push(ruled.entailment);
    else rejected.push({ index, fault: ruled.fault });
  }

  const brief: Brief = {
    answer: question.entailment,
    claims,
    rejected,
    evidence: evidenceFor(g, [question.entailment, ...claims]),
  };
  return deepFreeze({ ok: true, brief });
}

function fail(failure: AnswerFailure): AnswerResult {
  return deepFreeze({ ok: false, failure });
}

/** The observation ids a ruling rests on: a support's, or a core. Exhaustive over the five kinds. */
function idsNamedBy(e: Entailment): readonly ObsId[] {
  switch (e.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
      return [...e.support.lo, ...e.support.hi];
    case "conflicted":
      return e.core;
    case "ungrounded":
      return [];
    default:
      return assertNeverEntailment(e);
  }
}

function evidenceFor(g: Grounding, rulings: readonly Entailment[]): Observation[] {
  const named = new Set<string>();
  for (const ruling of rulings) for (const id of idsNamedBy(ruling)) named.add(id);
  const evidence: Observation[] = [];
  for (const id of [...named].sort(compareIds)) {
    const found = g.observations.find((observation) => observation.id === id);
    if (found === undefined) throw new Error(`lib/entail: internal invariant violated: a ruling names ${id} and the grounding holds no such observation`);
    evidence.push({ id: found.id, field: found.field, extent: { lo: found.extent.lo, hi: found.extent.hi }, quote: found.quote, source: found.source });
  }
  return evidence;
}
