import { describe, expect, it } from "vitest";
import { obsId } from "../../lib/contracts/index.js";
import type { Brief, Entailment, Observation } from "../../lib/contracts/index.js";
import { recheck } from "../../lib/entail/index.js";
import type { RecheckFinding } from "../../lib/entail/index.js";
import { OBSERVATIONS, observationsOf } from "../../domains/order-desk/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, PACK, answerOk, claim, copyOf, groundOk, obs } from "./helpers.js";

/**
 * KIND: HONEST PARTIAL PIN (plan section 11, case 02).
 * TRACES TO: D7 (support is a certificate), D2 (the draft carries no evidence; only the engine attaches support).
 *
 * WHAT `recheck` CERTIFIES AND WHAT IT CANNOT. A holder who has the schema and a Brief and nothing else can re-derive each
 * bound from the evidence the Brief carries. Pinned here, as `recheck`'s typed results on doctored copies of real Briefs:
 *  HALF 1, WHAT IS CAUGHT. A bound that still cites its support, tightened by 1 or loosened by 1, on either side, in the
 *  answer or in a draft claim: `not-reproduced { bound-differs }` naming the side, the carried and the re-derived bound. A
 *  flipped `unmet`: `unmet-differs`.
 *  HALF 2, WHAT IS NOT. (a) A supported bound dropped TOGETHER WITH its support (a forged omission): `reproduced`, with that
 *  side in `silentSides`, and the doctored Brief is exactly the honest Brief of a smaller snapshot, so nothing in the Brief
 *  can say it was cut; re-running `answer` on the full snapshot is what catches it. (b) A forged `ungrounded`:
 *  `uncertifiable-silence`, the same result an honest `ungrounded` gets, and it does not make the Brief not intact.
 *  (c) Evidence that is invented: `reproduced`, as long as every bound's digits occur in the carried quote. A certificate
 *  covers knowledge that cites evidence; it never covers ignorance and never provenance.
 * The assertions are `recheck`'s typed results. This file does not assert that a caller "should also replay".
 *
 * WHAT WOULD MAKE THIS FAIL: HALF 1: `recheck` comparing only `kind` (the bound tests go red), or not comparing `unmet` (the
 * flip test goes red). HALF 2: `recheck` flagging a Brief for an empty support (it would flag every honest Brief too, and
 * (a) goes red), certifying an `ungrounded` (b), or authenticating provenance in any way that rejected carried evidence
 * with the right digits (c); turning digit-containment off makes the digits contrast of (c) red.
 */

const intact = (position: "answer" | number, silentSides: readonly ("lo" | "hi")[] = []): RecheckFinding => ({ position, result: { kind: "reproduced", silentSides } });

/** Real Brief A: `{o1,o2,o3}` asked `delivery <= 12`, with the draft claim `packing = 1`. The answer is `entailed [4, 9]`. */
function briefA(): Brief {
  const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2", "o3"]));
  return answerOk(g, claim(DELIVERY, null, 12), [claim(PACK, 1, 1)]);
}

describe("02 recheck cannot certify silence or fabrication", () => {
  describe("half 1: what recheck catches", () => {
    it("the honest Brief is intact: the answer and the draft claim are reproduced, and the supported sides are not silent", () => {
      const brief = briefA();
      expect(brief.answer).toMatchObject({ kind: "entailed", established: { lo: 4, hi: 9 }, support: { lo: ["o1", "o2"], hi: ["o1", "o2", "o3"] } });
      expect(recheck(ORDER_DESK_SCHEMA, brief)).toEqual({ ok: true, intact: true, findings: [intact("answer"), intact(0)] });
    });

    const sides = [
      ["upper", "hi", 9],
      ["lower", "lo", 4],
    ] as const;
    for (const [name, side, honestBound] of sides) {
      for (const [how, delta] of [
        ["tightened", side === "hi" ? -1 : 1],
        ["loosened", side === "hi" ? 1 : -1],
      ] as const) {
        it(`the answer's ${name} bound ${how} by 1, support unchanged, is not-reproduced { bound-differs ${side}, carried ${honestBound + delta}, re-derived ${honestBound} }`, () => {
          const brief = copyOf(briefA()) as { answer: { established: { lo: number; hi: number } } };
          brief.answer.established[side] = honestBound + delta;
          expect(recheck(ORDER_DESK_SCHEMA, brief as unknown as Brief)).toEqual({
            ok: true,
            intact: false,
            findings: [
              { position: "answer", result: { kind: "not-reproduced", reason: { kind: "bound-differs", side, carried: honestBound + delta, rederived: honestBound } } },
              intact(0),
            ],
          });
        });
      }
    }

    it("a draft claim's bound changed is caught at that claim's position, and the answer next to it is still reproduced", () => {
      const brief = copyOf(briefA()) as { claims: { established: { lo: number; hi: number } }[] };
      brief.claims[0]!.established.hi = 3; // honest: packing between 1 and 2
      expect(recheck(ORDER_DESK_SCHEMA, brief as unknown as Brief)).toEqual({
        ok: true,
        intact: false,
        findings: [intact("answer"), { position: 0, result: { kind: "not-reproduced", reason: { kind: "bound-differs", side: "hi", carried: 3, rederived: 2 } } }],
      });
    });

    it("a weakened ruling's `unmet` flipped from the upper side to the lower is not-reproduced { unmet-differs }", () => {
      const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
      const brief = answerOk(g, claim(DELIVERY, null, 12), []);
      expect(brief.answer).toMatchObject({ kind: "weakened", unmet: ["hi"] });
      const doctored = copyOf(brief) as unknown as { answer: { unmet: string[] } };
      doctored.answer.unmet = ["lo"];
      expect(recheck(ORDER_DESK_SCHEMA, doctored as unknown as Brief)).toEqual({
        ok: true,
        intact: false,
        findings: [{ position: "answer", result: { kind: "not-reproduced", reason: { kind: "unmet-differs" } } }],
      });
    });
  });

  describe("half 2: what recheck cannot see", () => {
    it("(a) a supported upper bound dropped together with its support is reproduced, silent on the upper side, and is the honest Brief of a smaller snapshot", () => {
      const full = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2", "o3"]));
      const real = answerOk(full, claim(DELIVERY, 4, null), []);
      expect(real.answer).toMatchObject({ kind: "entailed", established: { lo: 4, hi: 9 }, support: { lo: ["o1", "o2"], hi: ["o1", "o2", "o3"] } });

      // The forgery: say nothing about the upper side (the schema-only bound is unbounded), cite nothing for it, carry no o3.
      const forged = copyOf(real) as unknown as { answer: { established: { hi: number | null }; support: { hi: string[] } }; evidence: Observation[] };
      forged.answer.established.hi = null;
      forged.answer.support.hi = [];
      forged.evidence = forged.evidence.filter((o) => o.id !== "o3");
      expect(recheck(ORDER_DESK_SCHEMA, forged as unknown as Brief)).toEqual({ ok: true, intact: true, findings: [intact("answer", ["hi"])] });

      // Nothing in it says it was cut: it IS the Brief an honest run over {o1, o2} makes.
      const smaller = answerOk(groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"])), claim(DELIVERY, 4, null), []);
      expect(forged).toEqual(smaller);
      expect(recheck(ORDER_DESK_SCHEMA, smaller)).toEqual({ ok: true, intact: true, findings: [intact("answer", ["hi"])] });
      // Re-running `answer` on the full snapshot is what shows the difference.
      expect(real.answer).not.toEqual(smaller.answer);
      expect(real.answer).toMatchObject({ established: { hi: 9 } });
    });

    it("(b) a forged `ungrounded` over a claim the evidence does bound is uncertifiable-silence, the same result as an honest one, and the Brief stays intact", () => {
      const forged = copyOf(briefA()) as unknown as { claims: Entailment[] };
      const honestWeakened = forged.claims[0];
      expect(honestWeakened).toMatchObject({ kind: "weakened", field: PACK });
      forged.claims[0] = { kind: "ungrounded", field: PACK, tested: claim(PACK, 1, 1).extent, openEnds: [{ field: PACK, side: "hi" }] };
      expect(recheck(ORDER_DESK_SCHEMA, forged as unknown as Brief)).toEqual({
        ok: true,
        intact: true,
        findings: [intact("answer"), { position: 0, result: { kind: "uncertifiable-silence" } }],
      });

      // An honest `ungrounded` (customs, with only o1 and o2) gets the same result: the two cannot be told apart.
      const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
      const real = answerOk(g, claim(DELIVERY, null, 12), [claim(CUSTOMS, 2, 2)]);
      expect(real.claims[0]).toMatchObject({ kind: "ungrounded", field: CUSTOMS });
      expect(recheck(ORDER_DESK_SCHEMA, real)).toEqual({
        ok: true,
        intact: true,
        findings: [{ position: "answer", result: { kind: "reproduced", silentSides: ["hi"] } }, { position: 0, result: { kind: "uncertifiable-silence" } }],
      });
    });

    it("(c) evidence replaced by invented documents with the right digits is reproduced; the carried quotes are what a holder could compare with the real ones", () => {
      const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
      const real = answerOk(g, claim(DELIVERY, 4, null), []);
      const realQuotes = OBSERVATIONS.map((o) => o.quote);
      expect(real.evidence.every((o) => realQuotes.includes(o.quote))).toBe(true);

      // Same ids, same numbers, invented quotes and sources.
      const invented = copyOf(real) as unknown as { evidence: Observation[] };
      invented.evidence = [
        obs("o1", PACK, 1, 2, "I made this up: 1 to 2 days", "Nobody"),
        obs("o2", OBSERVATIONS[1]!.field, 3, 5, "also invented, 3 to 5 days", "Nobody either"),
      ];
      expect(recheck(ORDER_DESK_SCHEMA, invented as unknown as Brief)).toEqual({ ok: true, intact: true, findings: [intact("answer", ["hi"])] });
      expect(invented.evidence.every((o) => realQuotes.includes(o.quote))).toBe(false);

      // Wholly different evidence, ruled honestly by the engine over the invented snapshot: also reproduced, and it differs from the truth.
      const fabricated = answerOk(
        groundOk(ORDER_DESK_SCHEMA, [obs("f1", OBSERVATIONS[1]!.field, 30, 30, "transit takes 30 days"), obs("f2", PACK, 1, 1, "packed in 1 day")]),
        claim(DELIVERY, 20, null),
        [],
      );
      expect(fabricated.answer).toMatchObject({ kind: "entailed", established: { lo: 31, hi: null } });
      expect(recheck(ORDER_DESK_SCHEMA, fabricated)).toEqual({ ok: true, intact: true, findings: [intact("answer", ["hi"])] });
      expect(answerOk(g, claim(DELIVERY, 20, null), []).answer.kind).toBe("weakened");
    });

    it("(c, the contrast) what IS checked is the digits: the same invented evidence with no digit in its quote is evidence-rejected { number-not-in-quote }", () => {
      const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
      const doctored = copyOf(answerOk(g, claim(DELIVERY, 4, null), [])) as unknown as { evidence: Observation[] };
      doctored.evidence = doctored.evidence.map((o) => (o.id === obsId("o1") ? { ...o, quote: "I made this up, no numbers at all" } : o));
      expect(recheck(ORDER_DESK_SCHEMA, doctored as unknown as Brief)).toEqual({
        ok: true,
        intact: false,
        findings: [{ position: "answer", result: { kind: "not-reproduced", reason: { kind: "evidence-rejected", fault: { kind: "number-not-in-quote", value: 1 } } } }],
      });
    });
  });
});
