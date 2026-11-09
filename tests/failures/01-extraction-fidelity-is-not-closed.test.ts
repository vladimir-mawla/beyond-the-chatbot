import { describe, expect, it } from "vitest";
import type { Claim, Extent, FieldId } from "../../lib/contracts/index.js";
import { ground } from "../../lib/ground/index.js";
import { recheck } from "../../lib/entail/index.js";
import { OBSERVATIONS, observationsOf } from "../../domains/order-desk/index.js";
import type { ObservationName } from "../../domains/order-desk/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, TRANSIT, answerOk, claim, groundOk, inside, obs, ruleOk } from "./helpers.js";

/**
 * KIND: DISCLOSES + PROVES THE PARTIAL GUARD. This is the project's deliberate failure test (plan section 6 M7; section 11, case 01).
 * TRACES TO: D8 (the extractor is outside the trust boundary; the only fidelity check is digit-containment), D2 (the draft
 * carries no evidence, so the observations are the only thing the gate stands on).
 *
 * THE LIMIT, STATED AS A FAILURE. The gate is sound relative to its observations, not relative to the world. The one check
 * on an extraction is that every finite bound occurs as a digit run in the quote it was read from. That check HOLDS for a
 * number the quote does not contain (customs "0 to 2 days" read as [0, 7] is refused, `number-not-in-quote { value: 7 }`).
 * It cannot hold for a number the quote does contain but means differently. Three mis-extractions below pass it, and then
 * `ground` accepts them, `rule` rules a claim `entailed` that is false in the world the quote's author meant, and `recheck`
 * says `reproduced`: a direction flip ("at most 5" read as 5 or more), a dropped bound ("3 to 5" read as exactly 3) and a
 * semantic slip ("5 business days" read as exactly 5). In each, the same engine rules the HONEST extraction differently
 * (the first two) or refuses it at intake (the third: the honest value, 7 calendar days, is not a digit run of the quote).
 * "False in the world" is stated in each case as the value the quote's author meant, and `inside` is a check written in
 * helpers.ts that does not call the engine.
 *
 * WHAT WOULD MAKE THIS FAIL: (1) any change that lets `ground` accept a bound whose digits are not in its quote (the first
 * test and its `[0, 9]` twin go red); (2) any change that makes `ground` refuse one of the three accepted mis-extractions
 * (a direction check, a "both numbers must be used" check, a unit check) or makes `recheck` flag them (which would mean it
 * read something it must not): each of the three tests goes red on its own. Closing the gap is a good change; this file
 * then has to be replaced, because it pins a limit that is no longer there.
 */

function honest(quote: string, extent: Extent, field: FieldId = TRANSIT) {
  return obs("x1", field, extent.lo, extent.hi, quote, "Carrier SLA sheet");
}

describe("01 extraction fidelity is not closed: the gate is sound relative to its observations, not to the world", () => {
  describe("the half of the guard that holds", () => {
    it("customs 'takes 0 to 2 days' read as [0, 7] is refused, number-not-in-quote { value: 7 }, and the tree is left as the schema has it", () => {
      const result = ground(ORDER_DESK_SCHEMA, [obs("x1", CUSTOMS, 0, 7, "Customs clearance takes 0 to 2 days")]);
      if (!result.ok) throw new Error("fixture");
      expect(result.rejected).toEqual([{ index: 0, fault: { kind: "number-not-in-quote", value: 7 } }]);
      expect(result.grounding.observations).toEqual([]);
      // Nothing of the refused observation is in the snapshot: customs is ungrounded, as with no document at all.
      expect(ruleOk(result.grounding, claim(CUSTOMS, null, 2)).kind).toBe("ungrounded");
    });

    it("the lower bound is judged too: the same quote read as [9, unbounded) names 9", () => {
      const result = ground(ORDER_DESK_SCHEMA, [obs("x1", CUSTOMS, 9, null, "Customs clearance takes 0 to 2 days")]);
      if (!result.ok) throw new Error("fixture");
      expect(result.rejected).toEqual([{ index: 0, fault: { kind: "number-not-in-quote", value: 9 } }]);
    });

    it("the honest reading of the same quote, [0, 2], is accepted", () => {
      const g = groundOk(ORDER_DESK_SCHEMA, [obs("x1", CUSTOMS, 0, 2, "Customs clearance takes 0 to 2 days")]);
      expect(g.observations.map((o) => o.id)).toEqual(["x1"]);
    });
  });

  interface MisExtraction {
    readonly name: string;
    readonly quote: string;
    readonly wrong: Extent;
    readonly field: FieldId;
    /** Other documents in the snapshot (the canonical `o1`, packing 1 to 2 days, where a claim about delivery needs it). */
    readonly alongside: readonly ObservationName[];
    readonly question: Claim;
    /** A value the quote's author meant, for the quantity the question is about, under which the question is FALSE. */
    readonly meant: number;
    /** What the engine rules for the wrong extraction. */
    readonly ruled: {
      readonly established: Extent;
      readonly support: { readonly lo: readonly string[]; readonly hi: readonly string[] };
      readonly silentSides: readonly ("lo" | "hi")[];
    };
  }

  const cases: readonly MisExtraction[] = [
    {
      name: "a direction flip: 'transit takes at most 5 days' read as transit in [5, unbounded), with o1 (packing 1 to 2 days), makes 'delivery at least 6' entailed",
      quote: "Standard transit takes at most 5 days",
      wrong: { lo: 5, hi: null },
      field: TRANSIT,
      alongside: ["o1"],
      question: claim(DELIVERY, 6, null),
      // The author meant at most 5: transit 1, packing 1, customs 0 is a delivery on day 2, which 'at least 6' rules out.
      meant: 2,
      ruled: { established: { lo: 6, hi: null }, support: { lo: ["o1", "x1"], hi: [] }, silentSides: ["hi"] },
    },
    {
      name: "a dropped bound: 'transit takes 3 to 5 days' read as exactly 3 makes 'transit at most 3' entailed",
      quote: "Standard transit takes 3 to 5 days",
      wrong: { lo: 3, hi: 3 },
      field: TRANSIT,
      alongside: [],
      question: claim(TRANSIT, null, 3),
      // The author meant 3 to 5: a transit of 5 days is inside what the quote says, and 'at most 3' is false there.
      meant: 5,
      ruled: { established: { lo: 3, hi: 3 }, support: { lo: ["x1"], hi: ["x1"] }, silentSides: [] },
    },
    {
      name: "a semantic slip: 'transit takes 5 business days' read as exactly 5 calendar days makes 'transit at most 5' entailed",
      quote: "Standard transit takes 5 business days",
      wrong: { lo: 5, hi: 5 },
      field: TRANSIT,
      alongside: [],
      question: claim(TRANSIT, null, 5),
      // Five business days is seven calendar days; 'at most 5' is false in that world.
      meant: 7,
      ruled: { established: { lo: 5, hi: 5 }, support: { lo: ["x1"], hi: ["x1"] }, silentSides: [] },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: ground accepts it, rule says entailed, the ruling is false in the world meant, and recheck says reproduced`, () => {
      const documents = [...observationsOf(c.alongside), honest(c.quote, c.wrong, c.field)];
      const g = groundOk(ORDER_DESK_SCHEMA, documents);

      const ruling = ruleOk(g, c.question);
      expect(ruling).toEqual({
        kind: "entailed",
        field: c.question.field,
        tested: c.question.extent,
        established: c.ruled.established,
        support: c.ruled.support,
      });
      // ... and it is false in the world the quote's author meant (a check that does not call the engine).
      expect(inside(c.meant, c.question.extent)).toBe(false);

      const brief = answerOk(g, c.question, []);
      expect(brief.answer).toEqual(ruling);
      expect(recheck(g.schema, brief)).toEqual({
        ok: true,
        intact: true,
        findings: [{ position: "answer", result: { kind: "reproduced", silentSides: c.ruled.silentSides } }],
      });
    });
  }

  it("the same engine rules the honest extractions differently: a flip and a dropped bound are `weakened`, and the slip's honest value 7 is refused at intake", () => {
    const o1 = OBSERVATIONS[0];
    if (o1 === undefined) throw new Error("fixture");
    const flipHonest = groundOk(ORDER_DESK_SCHEMA, [o1, honest("Standard transit takes at most 5 days", { lo: null, hi: 5 })]);
    expect(ruleOk(flipHonest, claim(DELIVERY, 6, null))).toMatchObject({ kind: "weakened", established: { lo: 1, hi: null }, unmet: ["lo"] });

    const dropHonest = groundOk(ORDER_DESK_SCHEMA, [honest("Standard transit takes 3 to 5 days", { lo: 3, hi: 5 })]);
    expect(ruleOk(dropHonest, claim(TRANSIT, null, 3))).toMatchObject({ kind: "weakened", established: { lo: 3, hi: 5 }, unmet: ["hi"] });

    const slipHonest = ground(ORDER_DESK_SCHEMA, [honest("Standard transit takes 5 business days", { lo: 7, hi: 7 })]);
    if (!slipHonest.ok) throw new Error("fixture");
    expect(slipHonest.rejected).toEqual([{ index: 0, fault: { kind: "number-not-in-quote", value: 7 } }]);
  });
});
