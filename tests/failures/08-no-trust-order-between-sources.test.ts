import { describe, expect, it } from "vitest";
import type { Observation } from "../../lib/contracts/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { OBSERVATIONS, QUESTIONS, claimsOf, fluentDraft, observationsOf } from "../../domains/order-desk/index.js";
import type { ObservationName } from "../../domains/order-desk/index.js";
import { DELIVERY, ORDER_DESK_SCHEMA, TRANSIT, answerOk, claim, groundOk, obs, ruleOk } from "./helpers.js";

/**
 * KIND: PROVES A METAMORPHIC CLAIM, DISCLOSES THE COST (plan section 11, case 08).
 * TRACES TO: D6 (a conflict is never resolved: there is no trust order, recency or vote in the engine).
 *
 * WHAT IS PROVED. Relabel every `source` (and swap which observation carries "Warehouse system" and which "A forum post"): no
 * `Entailment` changes. Over ALL 80 states of the demo (every one of the 16 subsets of `o1..o4`, each asked each of the five
 * menu questions, with the chatbot stand-in's draft claims), under five relabelings, the Brief's `answer`, `claims` and
 * `rejected`, the grounding's trees and baselines, the rendered text and `recheck`'s result are byte-identical; the
 * `evidence` is identical except for the one field that was changed, `source`, which is carried as given.
 * WHAT IT COSTS. Given a conflict between an authoritative source and a flaky one, the engine refuses both equally and cannot
 * prefer the right one; and a flaky source alone is believed exactly as an authoritative one is. Swapping which of the two
 * carries which label changes nothing in the rulings.
 * The assertions are about engine OUTPUT invariance under the relabelling, not about what a caller does with it.
 *
 * WHAT WOULD MAKE THIS FAIL: any engine read of `source` that reached a ruling: a source-based drop at intake, a source-ordered
 * deletion in a core or a support, a source-keyed tie-break, a "trusted source" list. The relabelings include the labels such a
 * list would use ("Warehouse system", "A forum post"), so a list keyed on either is caught.
 */

type Relabel = (observation: Observation, position: number) => string;

const RELABELINGS: readonly (readonly [string, Relabel])[] = [
  ["every source the same label", () => "x"],
  ["sources rotated one place along the four documents", (o) => (OBSERVATIONS[(OBSERVATIONS.findIndex((c) => c.id === o.id) + 1) % 4] as Observation).source],
  ["the first two documents are 'A forum post', the last two 'Warehouse system'", (o) => (o.id === "o1" || o.id === "o2" ? "A forum post" : "Warehouse system")],
  ["the first two documents are 'Warehouse system', the last two 'A forum post'", (o) => (o.id === "o1" || o.id === "o2" ? "Warehouse system" : "A forum post")],
  ["the longest label the contracts allow, 64 characters", () => "z".repeat(64)],
];

const NAMES: readonly ObservationName[] = ["o1", "o2", "o3", "o4"];

function view(documents: readonly Observation[], questionIndex: number) {
  const question = (QUESTIONS[questionIndex] as (typeof QUESTIONS)[number]).claim;
  const g = groundOk(ORDER_DESK_SCHEMA, documents);
  const brief = answerOk(g, question, claimsOf(fluentDraft(documents, question)));
  const rechecked = recheck(g.schema, brief);
  return {
    g,
    brief,
    entailments: JSON.stringify([brief.answer, brief.claims, brief.rejected]),
    structure: JSON.stringify([g.trees, g.baseline]),
    text: renderBrief(g.schema, brief),
    rechecked: JSON.stringify(rechecked),
  };
}

describe("08 there is no trust order between sources", () => {
  it("METAMORPHIC: over all 80 states and five relabelings, no ruling, no tree, no baseline, no text and no recheck result changes; only the carried `source` does", () => {
    let comparisons = 0;
    let withEvidence = 0;
    for (let mask = 0; mask < 16; mask += 1) {
      const documents = observationsOf(NAMES.filter((_, i) => (mask & (1 << i)) !== 0));
      for (let q = 0; q < QUESTIONS.length; q += 1) {
        const original = view(documents, q);
        for (const [name, relabel] of RELABELINGS) {
          const relabelled = documents.map((o, position) => ({ ...o, source: relabel(o, position) }));
          const other = view(relabelled, q);
          const where = `subset ${mask}, question ${q}, ${name}`;
          expect(other.entailments, where).toBe(original.entailments);
          expect(other.structure, where).toBe(original.structure);
          expect(other.text, where).toBe(original.text);
          expect(other.rechecked, where).toBe(original.rechecked);
          // The evidence is carried, so its sources are the relabelling's; everything else about it is unchanged.
          const strip = (o: Observation) => ({ id: o.id, field: o.field, extent: o.extent, quote: o.quote });
          expect(other.brief.evidence.map(strip), where).toEqual(original.brief.evidence.map(strip));
          other.brief.evidence.forEach((o) => {
            const input = relabelled.find((r) => r.id === o.id);
            expect(o.source, where).toBe(input?.source);
          });
          if (other.brief.evidence.length > 0) withEvidence += 1;
          comparisons += 1;
        }
      }
    }
    expect(comparisons).toBe(80 * 5);
    // Not vacuous: most of the 400 comparisons carried evidence whose source really was relabelled.
    expect(withEvidence).toBeGreaterThan(250);
  });

  it("THE COST: an authoritative source and a flaky one that disagree are refused equally, and swapping which carries which label changes nothing", () => {
    const authority = (id: string) => obs(id, TRANSIT, 3, 5, "Standard international transit takes 3 to 5 days", "Carrier SLA sheet (contractual)");
    const flaky = (id: string) => obs(id, TRANSIT, 20, 20, "someone says transit takes 20 days", "A forum post");
    const question = claim(DELIVERY, null, 12);

    const outcomeOf = (first: Observation, second: Observation) => {
      const g = groundOk(ORDER_DESK_SCHEMA, [first, second]);
      const brief = answerOk(g, question, [claim(TRANSIT, 4, 4)]);
      return { rulings: JSON.stringify([brief.answer, brief.claims]), text: renderBrief(g.schema, brief) };
    };
    const one = outcomeOf(authority("a"), flaky("b"));
    const swapped = outcomeOf(flaky("a"), authority("b"));
    expect(one.rulings).toBe(swapped.rulings);
    expect(JSON.parse(one.rulings)).toEqual([
      { kind: "conflicted", field: DELIVERY, tested: { lo: null, hi: 12 }, core: ["a", "b"] },
      [{ kind: "conflicted", field: TRANSIT, tested: { lo: 4, hi: 4 }, core: ["a", "b"] }],
    ]);
    expect(one.text).toContain("Sources conflict: a, b cannot all be true. No source is trusted over another.");
    expect(swapped.text).toBe(one.text);

    // ... and the flaky source ALONE is believed exactly as the authoritative one is: same structure, same kind of ruling.
    const alone = (o: Observation) => ruleOk(groundOk(ORDER_DESK_SCHEMA, [o]), claim(TRANSIT, 20, 20));
    expect(alone(flaky("b")).kind).toBe("entailed");
    expect(ruleOk(groundOk(ORDER_DESK_SCHEMA, [authority("b")]), claim(TRANSIT, 3, 5)).kind).toBe("entailed");
  });
});
