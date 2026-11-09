import { describe, expect, it } from "vitest";
import type { Entailment } from "../../lib/contracts/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { observationsOf } from "../../domains/order-desk/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, answerOk, claim, groundOk, obs, ruleOk } from "./helpers.js";

/**
 * KIND: DISCLOSES (plan section 11, case 06).
 * TRACES TO: D5 (weaken, don't merely refuse; name where evidence is missing).
 *
 * TWO LIMITS OF AN OPEN END.
 * (a) A loose bound names no gap. With `o1 o2 o3` and the claim "delivery at most 5", the evidence gives [4, 9]: bounded but
 *     too loose. The ruling is `weakened` with `openEnds: []`: the engine says "not established" and names nothing, because no
 *     quantity lacks a bound. It cannot say what evidence would settle the claim.
 * (b) A named open end says WHERE evidence is missing, not WHAT it will say. From step 1 ("delivery at most 12" on `o1 o2`) the
 *     one open end is `customsDays`, upper side. Filling it with a customs upper bound of 30 leaves the ruling `weakened`
 *     ([4, 37]); filling it with customs [20, 30] makes it `contradicted` ([24, 37]); filling it with customs at most 3 makes
 *     it `entailed` ([4, 10]). The same filled gap gives three different kinds.
 *
 * SCALE AND LAYER (M4's `open-ends.test.ts` and M5's `rule-table.test.ts` pin (a) and (b) by hand at their layers): here (a) is
 * read in the Brief, in the words the user sees and with a holder's `recheck`; and (b) is swept over every way of filling the
 * gap with a customs extent [L, C], 0 <= L <= C <= 24 (325 fills, and 25 more with only an upper bound C: 350), against a ruling table
 * stated in the test on its own (the established extent is [4 + L, 7 + C], so the kind is `contradicted` when 4 + L > 12,
 * `entailed` when 7 + C <= 12, `weakened` otherwise). Every fill supplies the missing upper bound, and every kind appears.
 *
 * WHAT WOULD MAKE THIS FAIL: (a) an open end listed for a bound that has support (the `openEnds: []` assertions go red); (b) a
 * ruling that depended only on whether the gap is filled (the sweep and the three named kinds go red), or one that dropped
 * `contradicted` or `entailed`, or an arithmetic slip in the sums (the extents go red).
 */

function fill(low: number | null, high: number) {
  const quote = low === null ? `Customs clearance takes at most ${high} days` : `Customs clearance takes ${low} to ${high} days`;
  return obs("fill", CUSTOMS, low, high, quote, "Customs bulletin");
}

describe("06 a named gap is a place, not a promise", () => {
  it("(a) with o1 o2 o3 and 'delivery at most 5': weakened [4, 9] with openEnds [], and the sentence says no quantity is named as missing", () => {
    const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2", "o3"]));
    const brief = answerOk(g, claim(DELIVERY, null, 5), []);
    expect(brief.answer).toEqual({
      kind: "weakened",
      field: DELIVERY,
      tested: { lo: null, hi: 5 },
      established: { lo: 4, hi: 9 },
      support: { lo: ["o1", "o2"], hi: ["o1", "o2", "o3"] },
      unmet: ["hi"],
      openEnds: [],
    });
    expect(renderBrief(g.schema, brief)).toBe(
      "Question: Not established: delivery (days from order) at most 5 days. What the evidence does establish: delivery (days from order) between 4 and 9 days (lower bound from o1, o2; upper bound from o1, o2, o3). Withheld: the upper bound. No quantity is named as missing.\nNo draft claims were ruled.",
    );
    expect(recheck(g.schema, brief)).toEqual({ ok: true, intact: true, findings: [{ position: "answer", result: { kind: "reproduced", silentSides: [] } }] });
  });

  it("(b) the starting point: step 1's 'delivery at most 12' is weakened, and its one open end is the customs upper bound", () => {
    const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
    expect(ruleOk(g, claim(DELIVERY, null, 12))).toEqual({
      kind: "weakened",
      field: DELIVERY,
      tested: { lo: null, hi: 12 },
      established: { lo: 4, hi: null },
      support: { lo: ["o1", "o2"], hi: [] },
      unmet: ["hi"],
      openEnds: [{ field: CUSTOMS, side: "hi" }],
    });
  });

  it("(b) the same filled gap, three kinds: customs at most 30 is weakened [4, 37]; customs [20, 30] is contradicted [24, 37]; customs at most 3 is entailed [4, 10]", () => {
    const rulings = ([[null, 30], [20, 30], [null, 3]] as const).map(([low, high]) => {
      const g = groundOk(ORDER_DESK_SCHEMA, [...observationsOf(["o1", "o2"]), fill(low, high)]);
      return ruleOk(g, claim(DELIVERY, null, 12));
    });
    expect(rulings[0]).toEqual({ kind: "weakened", field: DELIVERY, tested: { lo: null, hi: 12 }, established: { lo: 4, hi: 37 }, support: { lo: ["o1", "o2"], hi: ["fill", "o1", "o2"] }, unmet: ["hi"], openEnds: [] });
    expect(rulings[1]).toEqual({ kind: "contradicted", field: DELIVERY, tested: { lo: null, hi: 12 }, established: { lo: 24, hi: 37 }, support: { lo: ["fill", "o1", "o2"], hi: ["fill", "o1", "o2"] } });
    expect(rulings[2]).toEqual({ kind: "entailed", field: DELIVERY, tested: { lo: null, hi: 12 }, established: { lo: 4, hi: 10 }, support: { lo: ["o1", "o2"], hi: ["fill", "o1", "o2"] } });
    expect(rulings.map((r) => r.kind)).toEqual(["weakened", "contradicted", "entailed"]);
  });

  it("(b) SWEPT: every customs extent [L, C] with 0 <= L <= C <= 24, and every upper-bound-only fill, is ruled as the stated table says, and every kind appears", () => {
    const kinds = new Map<Entailment["kind"], number>();
    let fills = 0;
    const check = (low: number | null, high: number): void => {
      const g = groundOk(ORDER_DESK_SCHEMA, [...observationsOf(["o1", "o2"]), fill(low, high)]);
      const ruling = ruleOk(g, claim(DELIVERY, null, 12));
      const lo = 4 + (low ?? 0);
      const hi = 7 + high;
      const expected: Entailment["kind"] = lo > 12 ? "contradicted" : hi <= 12 ? "entailed" : "weakened";
      expect(ruling.kind, `customs ${low ?? "<="} ${high}`).toBe(expected);
      if (ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted") expect(ruling.established).toEqual({ lo, hi });
      // The upper end was the named gap, and it is filled: whatever the kind, it is no longer an open end.
      if (ruling.kind === "weakened") expect(ruling.openEnds).toEqual([]);
      kinds.set(ruling.kind, (kinds.get(ruling.kind) ?? 0) + 1);
      fills += 1;
    };
    for (let high = 0; high <= 24; high += 1) {
      for (let low = 0; low <= high; low += 1) check(low, high);
    }
    for (let high = 0; high <= 24; high += 1) check(null, high);
    expect(fills).toBe(350);
    expect([...kinds.keys()].sort()).toEqual(["contradicted", "entailed", "weakened"]);
    expect(Object.fromEntries([...kinds].sort())).toEqual({ contradicted: 136, entailed: 27, weakened: 187 });
  });
});
