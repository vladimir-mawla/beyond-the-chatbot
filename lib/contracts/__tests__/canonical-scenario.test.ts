import { describe, expect, it } from "vitest";
import type { Claim } from "../claim.js";
import type { Entailment } from "../entailment.js";
import { compareIds, type ObsId } from "../ids.js";
import { assertEntailmentWellFormed } from "../integrity.js";
import { CONFLICT_BRIEF, CUSTOMS, DELIVERY, ENTAILMENT_SAMPLES, O1, O2, O3, O4, OBSERVATIONS, ORDER_DESK_SCHEMA, PACK, TRANSIT } from "./support/samples.js";

/**
 * PLAN SECTION 7 TYPED AGAINST THE REAL CONTRACTS: an EXPRESSIBILITY check, nothing more. It shows that the
 * contracts can say everything the canonical order-desk scenario needs (the four-field schema, the four
 * documents with their real quotes, the six steps' rulings on the user's question, all five kinds, and a
 * self-consistent `Brief`), that the numbers written here are the plan's, and that every ruling is well formed.
 * It does NOT compute a ruling: that is M3-M5, and no engine exists. M6 owns the real order-desk data in
 * `domains/order-desk`; this is a test-local copy so that M1 does not depend on a later milestone.
 */
interface Step {
  readonly step: number;
  readonly snapshot: readonly ObsId[];
  readonly question: Claim;
  /** The ruling on the QUESTION, as plan section 7 states it. */
  readonly ruling: Entailment;
}

const STEPS: readonly Step[] = [
  { step: 1, snapshot: [O1, O2], question: { field: DELIVERY, extent: { lo: null, hi: 12 } }, ruling: ENTAILMENT_SAMPLES.weakened },
  {
    step: 2,
    snapshot: [O1, O2],
    question: { field: DELIVERY, extent: { lo: 4, hi: null } },
    ruling: { kind: "entailed", field: DELIVERY, tested: { lo: 4, hi: null }, established: { lo: 4, hi: null }, support: { lo: [O1, O2], hi: [] } },
  },
  { step: 3, snapshot: [O1, O2], question: { field: DELIVERY, extent: { lo: null, hi: 3 } }, ruling: ENTAILMENT_SAMPLES.contradicted },
  { step: 4, snapshot: [O1, O2, O3], question: { field: DELIVERY, extent: { lo: null, hi: 12 } }, ruling: ENTAILMENT_SAMPLES.entailed },
  { step: 5, snapshot: [O1, O2, O3, O4], question: { field: DELIVERY, extent: { lo: null, hi: 12 } }, ruling: ENTAILMENT_SAMPLES.conflicted },
  {
    step: 6,
    snapshot: [O1, O2, O4],
    question: { field: CUSTOMS, extent: { lo: null, hi: 3 } },
    // No document says 7 to 10: it is DERIVED (14 - (1..2) - (3..5)).
    ruling: { kind: "contradicted", field: CUSTOMS, tested: { lo: null, hi: 3 }, established: { lo: 7, hi: 10 }, support: { lo: [O1, O2, O4], hi: [O1, O2, O4] } },
  },
];

describe("the schema and the four documents of plan section 7", () => {
  it("is three base quantities in days with baseline [0, unbounded) and deliveryDay as their sum", () => {
    const [pack, transit, customs, delivery] = ORDER_DESK_SCHEMA.fields;
    for (const field of [pack, transit, customs]) {
      expect(field).toMatchObject({ kind: "base", unit: "days", baseline: { lo: 0, hi: null } });
    }
    expect([pack?.id, transit?.id, customs?.id]).toEqual([PACK, TRANSIT, CUSTOMS]);
    expect(delivery).toMatchObject({ kind: "derived", id: DELIVERY, unit: "days", sum: [PACK, TRANSIT, CUSTOMS] });
    expect(delivery && "baseline" in delivery).toBe(false);
  });

  it("the four observations carry the plan's extents, quotes and display sources", () => {
    expect(Object.values(OBSERVATIONS).map((o) => [o.id, o.field, o.extent.lo, o.extent.hi, o.source])).toEqual([
      ["o1", "packDays", 1, 2, "Warehouse system"],
      ["o2", "transitDays", 3, 5, "Carrier SLA sheet"],
      ["o3", "customsDays", 0, 2, "Customs bulletin"],
      ["o4", "deliveryDay", 14, 14, "Courier tracking page"],
    ]);
  });

  it("every bound of every observation occurs as a digit run in its quote (plan D8's partial guard, applied here by hand to the fixture)", () => {
    for (const o of Object.values(OBSERVATIONS)) {
      const digits = new Set([...o.quote.matchAll(/\d+/g)].map((m) => Number(m[0])));
      for (const bound of [o.extent.lo, o.extent.hi]) {
        expect(bound !== null && digits.has(Math.abs(bound)), `${o.id}: ${bound} in "${o.quote}"`).toBe(true);
      }
    }
  });
});

describe("the six steps' rulings on the question", () => {
  it("each is a well-formed Entailment about the field it was asked about", () => {
    for (const { step, question, ruling } of STEPS) {
      expect(assertEntailmentWellFormed(ruling), `step ${step}`).toEqual({ ok: true });
      expect(ruling.field, `step ${step}`).toBe(question.field);
      expect(ruling.tested, `step ${step}`).toEqual(question.extent);
    }
  });

  it("have the kinds plan section 7 gives them: weakened, entailed, contradicted, entailed, conflicted, contradicted", () => {
    expect(STEPS.map((s) => s.ruling.kind)).toEqual(["weakened", "entailed", "contradicted", "entailed", "conflicted", "contradicted"]);
  });

  it("the cut of step 1 is the upper side, and customs has no upper bound on file", () => {
    const step1 = STEPS[0]?.ruling;
    expect(step1?.kind).toBe("weakened");
    if (step1?.kind === "weakened") {
      expect(step1.unmet).toEqual(["hi"]);
      expect(step1.openEnds).toEqual([{ field: CUSTOMS, side: "hi" }]);
      expect(step1.established).toEqual({ lo: 4, hi: null });
      expect(step1.support).toEqual({ lo: [O1, O2], hi: [] });
    }
  });

  it("the conflict of step 5 names all four documents as its core and carries no established extent", () => {
    const step5 = STEPS[4]?.ruling;
    expect(step5?.kind).toBe("conflicted");
    if (step5?.kind === "conflicted") expect(step5.core).toEqual([O1, O2, O3, O4]);
    expect(step5 && "established" in step5).toBe(false);
  });

  it("the derived [7, 10] of step 6 is outside what any single document says (a number written in none of them)", () => {
    const step6 = STEPS[5]?.ruling;
    expect(step6?.kind === "contradicted" && step6.established).toEqual({ lo: 7, hi: 10 });
    for (const o of Object.values(OBSERVATIONS)) expect(o.extent).not.toEqual({ lo: 7, hi: 10 });
  });

  it("each snapshot is in id order and the ids a ruling cites are a subset of its snapshot", () => {
    for (const { step, snapshot, ruling } of STEPS) {
      expect([...snapshot].sort(compareIds), `step ${step}`).toEqual([...snapshot]);
      const cited: readonly ObsId[] = ruling.kind === "conflicted" ? ruling.core : ruling.kind === "ungrounded" ? [] : [...ruling.support.lo, ...ruling.support.hi];
      for (const id of cited) expect(snapshot, `step ${step} cites ${id}`).toContain(id);
    }
  });
});

describe("all five kinds appear in plan section 7 (entailed 2, 4; weakened 1; contradicted 3, 6; ungrounded: step 1's customs claim; conflicted 5)", () => {
  it("the five samples cover the five kinds, each well formed", () => {
    const kinds = new Set<string>([...STEPS.map((s) => s.ruling.kind), ENTAILMENT_SAMPLES.ungrounded.kind]);
    expect([...kinds].sort()).toEqual(["conflicted", "contradicted", "entailed", "ungrounded", "weakened"]);
    expect(assertEntailmentWellFormed(ENTAILMENT_SAMPLES.ungrounded)).toEqual({ ok: true });
  });

  it("the ungrounded draft claim names both ends of customs: nothing on file bounds it from either side", () => {
    expect(ENTAILMENT_SAMPLES.ungrounded.openEnds).toEqual([
      { field: CUSTOMS, side: "lo" },
      { field: CUSTOMS, side: "hi" },
    ]);
  });
});

describe("a Brief for step 5 is expressible and self-consistent", () => {
  /** Plan 4.1: "exactly the observations some support or core names, sorted by id". */
  const named = (e: Entailment): ObsId[] => (e.kind === "conflicted" ? [...e.core] : e.kind === "ungrounded" ? [] : [...e.support.lo, ...e.support.hi]);

  it("its evidence is exactly the observations its rulings name, sorted by id", () => {
    const cited = new Set([CONFLICT_BRIEF.answer, ...CONFLICT_BRIEF.claims].flatMap(named));
    expect(CONFLICT_BRIEF.evidence.map((o) => o.id)).toEqual([...cited].sort(compareIds));
  });

  it("all its rulings are well formed, and its rejected claim names its own index", () => {
    for (const e of [CONFLICT_BRIEF.answer, ...CONFLICT_BRIEF.claims]) expect(assertEntailmentWellFormed(e)).toEqual({ ok: true });
    expect(CONFLICT_BRIEF.rejected).toEqual([{ index: 1, fault: { kind: "vacuous-claim", field: CUSTOMS } }]);
  });

  it("carries no schema: the holder supplies it to recheck", () => {
    expect(Object.keys(CONFLICT_BRIEF).sort()).toEqual(["answer", "claims", "evidence", "rejected"]);
  });
});
