import { describe, expect, it } from "vitest";
import { fieldId } from "../../../lib/contracts/index.js";
import type { Claim } from "../../../lib/contracts/index.js";
import { FIELDS, MODEL_PRIORS, OBSERVATIONS, PRIOR_CUSTOMS_DAYS, PRIOR_PACK_DAYS, PRIOR_TRANSIT_DAYS, QUESTIONS, SNAPSHOTS, claimsOf, fluentDraft, observationsOf, renderFluent } from "../index.js";
import type { DrafterObservation, FluentDraft, Statement } from "../index.js";
import { isDeepFrozen } from "./fixtures.js";

/**
 * THE DRAFTER'S RULE, value by value (plan section 6, M6: "fully specified, so it cannot be accused of being rigged"), and the
 * paragraph it is rendered as. The §7 table is pinned literally; the rule is pinned on hand-worked cases and against an
 * independent re-statement over generated observation lists.
 */

const DELIVERY_Q: Claim = QUESTIONS[0]!.claim;
const obs = (field: keyof typeof FIELDS, lo: number | null, hi: number | null): DrafterObservation => ({ field: FIELDS[field], extent: { lo, hi } });
const valuesOf = (draft: FluentDraft): number[] => draft.statements.map((s) => s.claim.extent.lo as number);
const basesOf = (draft: FluentDraft): string[] => draft.statements.map((s) => s.basis);

describe("the plan's section 7 drafter column, exactly (packing, transit, customs, delivery)", () => {
  const table: readonly (readonly [number, number, readonly number[], readonly string[]])[] = [
    // step, snapshot index, the four stated values, how each was got
    [1, 0, [1, 4, 2, 7], ["observed", "observed", "prior", "sum"]],
    [4, 1, [1, 4, 1, 6], ["observed", "observed", "observed", "sum"]],
    [5, 2, [1, 4, 1, 14], ["observed", "observed", "observed", "observed"]],
    [6, 3, [1, 4, 2, 14], ["observed", "observed", "prior", "observed"]],
  ];
  for (const [step, snapshot, values, bases] of table) {
    it(`step ${step}: ${values.join(", ")}`, () => {
      const draft = fluentDraft(observationsOf(SNAPSHOTS[snapshot]!), DELIVERY_Q);
      expect(valuesOf(draft)).toEqual(values);
      expect(basesOf(draft)).toEqual(bases);
      expect(draft.statements.map((s) => s.claim.field)).toEqual(["packDays", "transitDays", "customsDays", "deliveryDay"]);
      for (const s of draft.statements) expect(s.claim.extent).toEqual({ lo: s.claim.extent.lo, hi: s.claim.extent.lo });
    });
  }

  it("steps 2 and 3 share step 1's snapshot, and the question does not change a single statement: the same four claims for every question on every snapshot", () => {
    for (const ids of SNAPSHOTS) {
      const reference = JSON.stringify(claimsOf(fluentDraft(observationsOf(ids), QUESTIONS[0]!.claim)));
      for (const q of QUESTIONS) expect(JSON.stringify(claimsOf(fluentDraft(observationsOf(ids), q.claim))), q.label).toBe(reference);
    }
  });

  it("claimsOf gives the four claims in order, and nothing else", () => {
    const draft = fluentDraft(observationsOf(SNAPSHOTS[0]!), DELIVERY_Q);
    expect(claimsOf(draft)).toEqual([
      { field: "packDays", extent: { lo: 1, hi: 1 } },
      { field: "transitDays", extent: { lo: 4, hi: 4 } },
      { field: "customsDays", extent: { lo: 2, hi: 2 } },
      { field: "deliveryDay", extent: { lo: 7, hi: 7 } },
    ]);
  });
});

describe("the midpoint rule, hand-worked", () => {
  const stated = (observations: readonly DrafterObservation[], field: keyof typeof FIELDS): Statement => {
    const draft = fluentDraft(observations, DELIVERY_Q);
    return draft.statements[["packDays", "transitDays", "customsDays", "deliveryDay"].indexOf(field)] as Statement;
  };
  const valueOf = (s: Statement): number => s.claim.extent.lo as number;

  it("[1,2] -> 1 (1.5 rounded down), [3,5] -> 4, [0,2] -> 1, [4,4] -> 4", () => {
    expect(valueOf(stated([obs("packDays", 1, 2)], "packDays"))).toBe(1);
    expect(valueOf(stated([obs("transitDays", 3, 5)], "transitDays"))).toBe(4);
    expect(valueOf(stated([obs("customsDays", 0, 2)], "customsDays"))).toBe(1);
    expect(valueOf(stated([obs("customsDays", 4, 4)], "customsDays"))).toBe(4);
  });

  it("two documents about one quantity: the midpoint of their MEET ([0,10] and [4,20] meet at [4,10] -> 7), whatever the order", () => {
    for (const list of [[obs("packDays", 0, 10), obs("packDays", 4, 20)], [obs("packDays", 4, 20), obs("packDays", 0, 10)]]) {
      expect(valueOf(stated(list, "packDays"))).toBe(7);
    }
  });

  it("an end that is not finite is skipped: lower only -> that end, upper only -> that end, neither -> the prior", () => {
    expect(valueOf(stated([obs("packDays", 5, null)], "packDays"))).toBe(5);
    expect(valueOf(stated([obs("packDays", null, 9)], "packDays"))).toBe(9);
    expect(valueOf(stated([obs("packDays", 5, null), obs("packDays", null, 9)], "packDays"))).toBe(7);
    const none = stated([obs("packDays", null, null)], "packDays");
    expect(valueOf(none)).toBe(PRIOR_PACK_DAYS);
    expect(none.basis).toBe("prior");
  });

  it("ends that cross (documents that do not overlap) are averaged, with no special case: [1,2] and [5,6] -> floor((5+2)/2) = 3", () => {
    expect(valueOf(stated([obs("packDays", 1, 2), obs("packDays", 5, 6)], "packDays"))).toBe(3);
  });

  it("negative midpoints round down, not toward zero: [-3,-2] -> -3 and [-5,-2] -> -4", () => {
    expect(valueOf(stated([obs("packDays", -3, -2)], "packDays"))).toBe(-3);
    expect(valueOf(stated([obs("packDays", -5, -2)], "packDays"))).toBe(-4);
  });

  it("a document about another quantity does not count: an observation of customs leaves packing at its prior", () => {
    const s = stated([obs("customsDays", 9, 9)], "packDays");
    expect(valueOf(s)).toBe(PRIOR_PACK_DAYS);
    expect(s.basis).toBe("prior");
  });

  it("delivery: a direct document wins over the sum ([10,13] -> 11, though the three statements add to 7); without one it is the sum of the three statements", () => {
    const withDirect = fluentDraft([obs("packDays", 1, 2), obs("transitDays", 3, 5), obs("deliveryDay", 10, 13)], DELIVERY_Q);
    expect(valuesOf(withDirect)).toEqual([1, 4, 2, 11]);
    expect(basesOf(withDirect)).toEqual(["observed", "observed", "prior", "observed"]);
    const without = fluentDraft([obs("packDays", 1, 2), obs("transitDays", 3, 5)], DELIVERY_Q);
    expect(valuesOf(without)).toEqual([1, 4, 2, 7]);
    expect(valuesOf(without)[3]).toBe(valuesOf(without)[0]! + valuesOf(without)[1]! + valuesOf(without)[2]!);
  });

  it("delivery with a document that has no finite end falls back to the sum", () => {
    const draft = fluentDraft([obs("deliveryDay", null, null)], DELIVERY_Q);
    expect(valuesOf(draft)).toEqual([PRIOR_PACK_DAYS, PRIOR_TRANSIT_DAYS, PRIOR_CUSTOMS_DAYS, PRIOR_PACK_DAYS + PRIOR_TRANSIT_DAYS + PRIOR_CUSTOMS_DAYS]);
    expect(draft.statements[3]?.basis).toBe("sum");
  });
});

describe("the priors", () => {
  it("are 1, 4 and 2 days, frozen; the plan names only the customs one (2)", () => {
    expect([PRIOR_PACK_DAYS, PRIOR_TRANSIT_DAYS, PRIOR_CUSTOMS_DAYS]).toEqual([1, 4, 2]);
    expect(MODEL_PRIORS).toEqual({ packDays: 1, transitDays: 4, customsDays: 2 });
    expect(isDeepFrozen(MODEL_PRIORS)).toBe(true);
  });

  it("a different prior moves only the statement that rests on a prior, and the sum that adds it", () => {
    const base = fluentDraft(observationsOf(SNAPSHOTS[0]!), DELIVERY_Q);
    const moved = fluentDraft(observationsOf(SNAPSHOTS[0]!), DELIVERY_Q, { packDays: 50, transitDays: 60, customsDays: 9 });
    expect(valuesOf(base)).toEqual([1, 4, 2, 7]);
    expect(valuesOf(moved)).toEqual([1, 4, 9, 14]); // packing and transit are observed: their priors are not read
    // and a prior is not read where a document speaks (customs observed at step 4)
    expect(valuesOf(fluentDraft(observationsOf(SNAPSHOTS[1]!), DELIVERY_Q, { packDays: 50, transitDays: 60, customsDays: 9 }))).toEqual([1, 4, 1, 6]);
  });
});

describe("totality: every one of the 16 snapshots with every one of the 5 questions", () => {
  const subsets: (typeof OBSERVATIONS)[number][][] = [];
  for (let mask = 0; mask < 16; mask++) subsets.push(OBSERVATIONS.filter((_, i) => (mask & (1 << i)) !== 0));

  it("yields four statements in the fixed order, each an exact integer, and never throws (80 drafts)", () => {
    let drafts = 0;
    for (const subset of subsets)
      for (const q of QUESTIONS) {
        const draft = fluentDraft(subset, q.claim);
        drafts++;
        expect(draft.statements.map((s) => s.claim.field)).toEqual(["packDays", "transitDays", "customsDays", "deliveryDay"]);
        for (const s of draft.statements) {
          expect(Number.isInteger(s.claim.extent.lo)).toBe(true);
          expect(s.claim.extent.lo).toBe(s.claim.extent.hi);
        }
        expect(draft.question).toBe(q.claim);
      }
    expect(drafts).toBe(80);
  });

  it("reads its input without changing it (frozen observations) and does not depend on their order (every reversal agrees)", () => {
    for (const subset of subsets) {
      const frozen = subset.map((o) => o);
      const forward = JSON.stringify(fluentDraft(frozen, DELIVERY_Q));
      const reversed = JSON.stringify(fluentDraft([...frozen].reverse(), DELIVERY_Q));
      expect(reversed).toBe(forward);
    }
    expect(isDeepFrozen(OBSERVATIONS)).toBe(true);
  });
});

describe("the rule against an independent restatement, over generated observation lists", () => {
  // A small seeded generator (mulberry-free: a 32-bit LCG is enough here). The reference restates the rule with arrays
  // and an arithmetic shift where the drafter uses a running minimum and Math.floor.
  let state = 20260109;
  const next = (n: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
  const NAMES = ["packDays", "transitDays", "customsDays", "deliveryDay"] as const;
  const bound = (): number | null => (next(4) === 0 ? null : next(25) - 6);

  function reference(list: readonly DrafterObservation[], field: string, prior: number): number | undefined {
    const mine = list.filter((o) => o.field === field);
    const los = mine.map((o) => o.extent.lo).filter((v): v is number => v !== null);
    const his = mine.map((o) => o.extent.hi).filter((v): v is number => v !== null);
    if (los.length > 0 && his.length > 0) return (Math.max(...los) + Math.min(...his)) >> 1;
    if (los.length > 0) return Math.max(...los);
    if (his.length > 0) return Math.min(...his);
    return prior === -1 ? undefined : prior;
  }

  it("agrees on 600 generated lists; the tallies show the interesting cases were reached", () => {
    const tally = { lists: 0, longest: 0, crossed: 0, oneSided: 0, noneFinite: 0, priorUsed: 0, sumUsed: 0, directUsed: 0, negative: 0 };
    for (let i = 0; i < 600; i++) {
      const count = next(9);
      const list: DrafterObservation[] = [];
      for (let k = 0; k < count; k++) {
        let lo = bound();
        let hi = bound();
        if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
        list.push({ field: fieldId(NAMES[next(4)]!), extent: { lo, hi } });
      }
      tally.lists++;
      tally.longest = Math.max(tally.longest, count);
      const draft = fluentDraft(list, DELIVERY_Q);
      const priors = [PRIOR_PACK_DAYS, PRIOR_TRANSIT_DAYS, PRIOR_CUSTOMS_DAYS];
      const base = NAMES.slice(0, 3).map((f, k) => reference(list, f, priors[k]!)!);
      const direct = reference(list, "deliveryDay", -1);
      expect(valuesOf(draft)).toEqual([...base, direct ?? base[0]! + base[1]! + base[2]!]);
      for (const f of NAMES) {
        const mine = list.filter((o) => o.field === f);
        const los = mine.map((o) => o.extent.lo).filter((v): v is number => v !== null);
        const his = mine.map((o) => o.extent.hi).filter((v): v is number => v !== null);
        if (los.length > 0 && his.length > 0 && Math.max(...los) > Math.min(...his)) tally.crossed++;
        if (mine.length > 0 && (los.length === 0) !== (his.length === 0)) tally.oneSided++;
        if (mine.length > 0 && los.length === 0 && his.length === 0) tally.noneFinite++;
      }
      tally.priorUsed += draft.statements.filter((s) => s.basis === "prior").length;
      tally.sumUsed += draft.statements.filter((s) => s.basis === "sum").length;
      tally.directUsed += draft.statements[3]?.basis === "observed" ? 1 : 0;
      tally.negative += valuesOf(draft).some((v) => v < 0) ? 1 : 0;
    }
    expect(tally.lists).toBe(600);
    expect(tally.longest).toBe(8);
    for (const key of ["crossed", "oneSided", "noneFinite", "priorUsed", "sumUsed", "directUsed", "negative"] as const) expect(tally[key], key).toBeGreaterThan(20);
    console.log(`drafter generated: ${JSON.stringify(tally)}`);
  });
});

describe("renderFluent: the chatbot's confident paragraph", () => {
  const paragraph = (snapshot: number, question: number): string => renderFluent(fluentDraft(observationsOf(SNAPSHOTS[snapshot]!), QUESTIONS[question]!.claim));

  it("the paragraphs of steps 1, 3, 4, 5 and 6, exactly", () => {
    expect(paragraph(0, 0)).toBe(
      "Yes: delivery is around day 7. Packing takes about 1 day, transit about 4 days and customs clearance about 2 days (typical). Figures marked as typical are a model prior, not taken from any document.",
    );
    expect(paragraph(0, 2)).toBe(
      "No: delivery is around day 7. Packing takes about 1 day, transit about 4 days and customs clearance about 2 days (typical). Figures marked as typical are a model prior, not taken from any document.",
    );
    expect(paragraph(1, 0)).toBe("Yes: delivery is around day 6. Packing takes about 1 day, transit about 4 days and customs clearance about 1 day.");
    expect(paragraph(2, 0)).toBe("No: delivery is around day 14. Packing takes about 1 day, transit about 4 days and customs clearance about 1 day.");
    expect(paragraph(3, 3)).toBe(
      "Yes: customs clearance takes about 2 days. Packing takes about 1 day, transit about 4 days and customs clearance about 2 days (typical). Delivery lands around day 14. Figures marked as typical are a model prior, not taken from any document.",
    );
  });

  it("the verdict is Yes exactly when the stated value of the asked quantity lies in the question's extent, in all 80 states", () => {
    let yes = 0;
    let no = 0;
    for (let mask = 0; mask < 16; mask++) {
      const subset = OBSERVATIONS.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const q of QUESTIONS) {
        const draft = fluentDraft(subset, q.claim);
        const v = draft.statements.find((s) => s.claim.field === q.claim.field)!.claim.extent.lo as number;
        const holds = (q.claim.extent.lo === null || v >= q.claim.extent.lo) && (q.claim.extent.hi === null || v <= q.claim.extent.hi);
        const text = renderFluent(draft);
        expect(text.startsWith(holds ? "Yes:" : "No:"), `${mask} ${q.label}`).toBe(true);
        if (holds) yes++;
        else no++;
      }
    }
    expect(yes + no).toBe(80);
    expect(yes).toBeGreaterThan(10);
    expect(no).toBeGreaterThan(10);
  });

  it("prints no number that the draft did not state, and the word 'typical' only for a prior (80 states)", () => {
    for (let mask = 0; mask < 16; mask++) {
      const subset = OBSERVATIONS.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const q of QUESTIONS) {
        const draft = fluentDraft(subset, q.claim);
        const text = renderFluent(draft);
        const stated = new Set(valuesOf(draft).map(String));
        for (const token of text.match(/-?\d+/g) ?? []) expect(stated.has(token), `${token} in ${text}`).toBe(true);
        expect(text.includes("typical"), text).toBe(draft.statements.some((s) => s.basis === "prior"));
      }
    }
  });

  it("is a template over the draft alone: no field id, label or source text appears, and a question about a quantity it does not state is 'I cannot say'", () => {
    const text = paragraph(2, 0);
    for (const word of ["packDays", "transitDays", "customsDays", "deliveryDay", "o1", "o4", "Warehouse", "Courier"]) expect(text).not.toContain(word);
    const draft = fluentDraft(observationsOf(SNAPSHOTS[0]!), { field: fieldId("ghost"), extent: { lo: null, hi: 1 } });
    expect(renderFluent(draft).startsWith("I cannot say: that quantity. ")).toBe(true);
  });

  it("says 1 day, not 1 days, and 0 days", () => {
    const draft = fluentDraft([obs("packDays", 1, 1), obs("transitDays", 0, 0), obs("customsDays", 2, 2)], DELIVERY_Q);
    expect(renderFluent(draft)).toBe("Yes: delivery is around day 3. Packing takes about 1 day, transit about 0 days and customs clearance about 2 days.");
  });
});
