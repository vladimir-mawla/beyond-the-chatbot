import { describe, expect, it } from "vitest";
import { fieldId } from "../../lib/contracts/index.js";
import type { Claim } from "../../lib/contracts/index.js";
import { extentOf, supportOf } from "../../lib/ground/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { observationsOf } from "../../domains/order-desk/index.js";
import type { ObservationName } from "../../domains/order-desk/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, PACK, answerOk, baseField, claim, groundOk, obs, ruleOk, sumField } from "./helpers.js";

/**
 * KIND: PROVES LOCALITY, DISCLOSES THE COST (plan section 11, case 03).
 * TRACES TO: D6 (a conflict is never resolved: no trust order, no salvage; an unsatisfiable tree is refused whole).
 *
 * THE SCHEMA: the order desk's tree (packing + transit + customs = delivery) PLUS a second, unrelated tree,
 * `refundDay = returnWindowDays + restockDays`. One observation about returns, `r1` (returns accepted within 7 to 14 days).
 *
 * WHAT IS PROVED. Adding `o3` and `o4` (the plan's step-5 conflict) makes the desk's tree `conflicted` and changes NOTHING
 * about the refund tree: every ruling about it (five claims, covering entailed, weakened, contradicted and ungrounded), its
 * `extentOf` and its `supportOf` are byte-identical (JSON text) to what they were without the conflict.
 * WHAT IT COSTS. A perfectly well-grounded claim about packing, `weakened` to [1, 2] with support `o1`, becomes `conflicted`
 * (core o1 o2 o3 o4) once the conflict exists, although `o1` and `o2` agree and say what they said before. The engine does not
 * salvage the consistent rest, because salvaging needs a trust order (D6: which of the four to drop?). Over-refusal is the
 * price of never choosing. And the conflict is joint: with `o3` and without `o4` the same packing claim is still `weakened`.
 *
 * SCALE AND LAYER (M4's `locality.test.ts` pins this by hand at `lib/ground` and on generated instances): here it is read at the
 * layer a user meets, `answer`'s Brief with its rendering and its `recheck`, and over ALL 16 subsets of the four canonical
 * documents: the refund tree's rulings are byte-identical in every one, and the desk tree is conflicted in exactly one.
 *
 * WHAT WOULD MAKE THIS FAIL: (1) a conflict that leaked across trees (any ruling about the refund tree changing when the desk
 * tree conflicts: the locality half goes red); (2) a salvage (dropping the core and answering from the rest: the packing
 * claim stops being `conflicted`, the cost half goes red).
 */

const RETURN_WINDOW = fieldId("returnWindowDays");
const RESTOCK = fieldId("restockDays");
const REFUND = fieldId("refundDay");

const TWO_TREES = {
  fields: [
    ...ORDER_DESK_SCHEMA.fields,
    baseField("returnWindowDays", "return window"),
    baseField("restockDays", "restocking time"),
    sumField("refundDay", ["returnWindowDays", "restockDays"], "refund (days from order)"),
  ],
} as const;

const R1 = obs("r1", RETURN_WINDOW, 7, 14, "Returns are accepted within 7 to 14 days", "Returns policy");

/** Five claims about the refund tree, one per line, and the kind each is ruled. */
const REFUND_CLAIMS: readonly (readonly [string, Claim, string])[] = [
  ["refund at least 5", claim(REFUND, 5, null), "entailed"],
  ["refund at most 10", claim(REFUND, null, 10), "weakened"],
  ["refund at most 3", claim(REFUND, null, 3), "contradicted"],
  ["restocking at most 2", claim(RESTOCK, null, 2), "ungrounded"],
  ["return window at most 10", claim(RETURN_WINDOW, null, 10), "weakened"],
];

const DESK_ALONE = [...observationsOf(["o1", "o2"]), R1];
const DESK_WITH_O3 = [...observationsOf(["o1", "o2", "o3"]), R1];
const DESK_CONFLICTED = [...observationsOf(["o1", "o2", "o3", "o4"]), R1];

describe("03 a conflict silences its whole tree, and only its tree", () => {
  it("the fixture: without the conflict the desk tree is consistent and the refund tree answers all four of the kinds it can", () => {
    const g = groundOk(TWO_TREES, DESK_ALONE);
    expect(g.trees.map((t) => [t.root, t.state.kind])).toEqual([
      ["deliveryDay", "consistent"],
      ["refundDay", "consistent"],
    ]);
    expect(REFUND_CLAIMS.map(([, c]) => ruleOk(g, c).kind)).toEqual(REFUND_CLAIMS.map(([, , kind]) => kind));
  });

  it("LOCALITY: adding o3 and o4 conflicts the desk tree and leaves every ruling, extent and support of the refund tree byte-identical", () => {
    const before = groundOk(TWO_TREES, DESK_ALONE);
    const after = groundOk(TWO_TREES, DESK_CONFLICTED);
    expect(after.trees.map((t) => [t.root, t.state.kind])).toEqual([
      ["deliveryDay", "conflicted"],
      ["refundDay", "consistent"],
    ]);
    for (const [name, c] of REFUND_CLAIMS) {
      expect(JSON.stringify(ruleOk(after, c)), name).toBe(JSON.stringify(ruleOk(before, c)));
    }
    for (const field of [REFUND, RETURN_WINDOW, RESTOCK]) {
      expect(JSON.stringify(extentOf(after, field)), `extentOf ${field}`).toBe(JSON.stringify(extentOf(before, field)));
      expect(JSON.stringify(supportOf(after, field)), `supportOf ${field}`).toBe(JSON.stringify(supportOf(before, field)));
    }
    expect(JSON.stringify(after.trees[1])).toBe(JSON.stringify(before.trees[1]));
  });

  it("LOCALITY, in one Brief: the refund question and its claims are ruled as before while the desk claims next to them are conflicted", () => {
    const draft = [...REFUND_CLAIMS.map(([, c]) => c), claim(PACK, 1, 1), claim(DELIVERY, null, 12)];
    const withConflict = answerOk(groundOk(TWO_TREES, DESK_CONFLICTED), claim(REFUND, null, 10), draft);
    const without = answerOk(groundOk(TWO_TREES, DESK_ALONE), claim(REFUND, null, 10), draft);
    expect(JSON.stringify(withConflict.answer)).toBe(JSON.stringify(without.answer));
    REFUND_CLAIMS.forEach((_, i) => expect(JSON.stringify(withConflict.claims[i])).toBe(JSON.stringify(without.claims[i])));
    expect(withConflict.claims.slice(-2).map((c) => c.kind)).toEqual(["conflicted", "conflicted"]);
    expect(without.claims.slice(-2).map((c) => c.kind)).toEqual(["weakened", "weakened"]);
  });

  it("THE COST: a packing claim that was `weakened` [1, 2] on support o1 is `conflicted` (core o1 o2 o3 o4) once o3 and o4 are added, though o1 and o2 are unchanged", () => {
    const before = ruleOk(groundOk(TWO_TREES, DESK_ALONE), claim(PACK, 1, 1));
    expect(before).toEqual({
      kind: "weakened",
      field: PACK,
      tested: { lo: 1, hi: 1 },
      established: { lo: 1, hi: 2 },
      support: { lo: ["o1"], hi: ["o1"] },
      unmet: ["hi"],
      openEnds: [],
    });
    const after = ruleOk(groundOk(TWO_TREES, DESK_CONFLICTED), claim(PACK, 1, 1));
    expect(after).toEqual({ kind: "conflicted", field: PACK, tested: { lo: 1, hi: 1 }, core: ["o1", "o2", "o3", "o4"] });
    // No salvage at the API either: the field has no extent and no support while its tree is conflicted.
    const g = groundOk(TWO_TREES, DESK_CONFLICTED);
    expect(extentOf(g, PACK)).toEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
    expect(supportOf(g, PACK)).toEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
    // The same goes for every field of the tree, the one that was never in dispute (customs has o3 only) included.
    expect(ruleOk(g, claim(CUSTOMS, null, 1)).kind).toBe("conflicted");
  });

  it("the conflict is joint: with o3 and without o4 the same packing claim is still the same `weakened` ruling", () => {
    const g = groundOk(TWO_TREES, DESK_WITH_O3);
    expect(g.trees[0]?.state.kind).toBe("consistent");
    expect(JSON.stringify(ruleOk(g, claim(PACK, 1, 1)))).toBe(JSON.stringify(ruleOk(groundOk(TWO_TREES, DESK_ALONE), claim(PACK, 1, 1))));
  });

  it("AT THE BRIEF: the over-refusal is what the user is shown and what a holder can certify: rendered as a refusal naming all four documents, and `recheck` says reproduced, intact", () => {
    const g = groundOk(TWO_TREES, DESK_CONFLICTED);
    const brief = answerOk(g, claim(DELIVERY, null, 12), [claim(PACK, 1, 1), ...REFUND_CLAIMS.map(([, c]) => c)]);
    const text = renderBrief(g.schema, brief);
    expect(text).toContain("- Refused: packing time exactly 1 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.");
    // The refund claims in the same Brief are ordinary rulings, not refusals.
    expect(brief.claims.slice(1).map((c) => c.kind)).toEqual(REFUND_CLAIMS.map(([, , kind]) => kind));
    expect(brief.evidence.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4", "r1"]);
    const rechecked = recheck(g.schema, brief);
    if (!rechecked.ok) throw new Error("fixture");
    expect(rechecked.intact).toBe(true);
    expect(rechecked.findings.slice(0, 2).map((f) => f.result)).toEqual([
      { kind: "reproduced", silentSides: [] },
      { kind: "reproduced", silentSides: [] },
    ]);
  });

  it("ACROSS ALL 16 SUBSETS of o1..o4: the refund tree's rulings never move, and the desk tree is conflicted for exactly one subset, the full four", () => {
    const names: readonly ObservationName[] = ["o1", "o2", "o3", "o4"];
    const alone = groundOk(TWO_TREES, [R1]);
    const wanted = REFUND_CLAIMS.map(([, c]) => JSON.stringify(ruleOk(alone, c)));
    const conflicted: string[] = [];
    for (let mask = 0; mask < 16; mask += 1) {
      const chosen = names.filter((_, i) => (mask & (1 << i)) !== 0);
      const g = groundOk(TWO_TREES, [...observationsOf(chosen), R1]);
      expect(REFUND_CLAIMS.map(([, c]) => JSON.stringify(ruleOk(g, c))), chosen.join("+") || "(none)").toEqual(wanted);
      if (g.trees[0]?.state.kind === "conflicted") conflicted.push(chosen.join("+"));
    }
    expect(conflicted).toEqual(["o1+o2+o3+o4"]);
  });
});
