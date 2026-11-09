import { describe, expect, it } from "vitest";
import type { Brief, Observation } from "../../lib/contracts/index.js";
import { ground } from "../../lib/ground/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { fieldId } from "../../lib/contracts/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, PACK, TRANSIT, answerOk, baseField, claim, copyOf, groundOk, mulberry32, obs, schemaOf, sumField } from "./helpers.js";

/**
 * KIND: DISCLOSES (plan section 11, case 04).
 * TRACES TO: D6 (a conflict is refused, with an irreducible core named), D7 (found by deletion in ascending id order).
 *
 * THE LIMIT. The core the engine names is A core, not THE core. Two disjoint minimal conflicts in one tree
 * (`k1: packDays [5, 5]` against `k2: packDays [0, 3]`; `m1: transitDays [9, 9]` against `m2: transitDays [0, 2]`): the engine
 * names `m1 m2` (deletion in ascending id order drops early ids first, so the survivors are the LATEST ids; the plan's first
 * sketch said "the sorted-first core" and was wrong, plan section 8 defect 4). The conflict it did not name, `k1 k2`, is just
 * as real. Resolving the named conflict (dropping `m1`) makes the next `ground` name `k1 k2`.
 *
 * SCALE AND LAYER (M4's `core.test.ts` pins the two-conflict case by hand at `lib/ground`): here it is read through the Brief,
 * where it matters. (1) The Brief names `m1 m2`, renders it, and a holder's `recheck` says reproduced. (2) `recheck` says
 * reproduced for the OTHER core too, and for the union of both: a core is a certificate that these observations cannot all be
 * true, not a certificate that it is the only one or the smallest (irreducibility is not checked by `recheck`). (3) Six disjoint
 * conflicts in one tree take six resolutions to reach consistency, and each round names the pair whose ids sort last,
 * whatever order the observations arrive in.
 *
 * WHAT WOULD MAKE THIS FAIL: (1) a core chosen by the earliest ids (the `m1 m2` assertions and the six-round order go red);
 * (2) a core that is not shrunk, or that is the union of every conflict (the `m1 m2` assertions go red); (3) a `recheck` that
 * checked irreducibility or uniqueness (the second test goes red).
 */

const K1 = obs("k1", PACK, 5, 5, "exactly 5 days");
const K2 = obs("k2", PACK, 0, 3, "between 0 and 3 days");
const M1 = obs("m1", TRANSIT, 9, 9, "exactly 9 days");
const M2 = obs("m2", TRANSIT, 0, 2, "between 0 and 2 days");
const ALL = [K1, K2, M1, M2];

const coreOfDesk = (observations: readonly Observation[]) => {
  const result = ground(ORDER_DESK_SCHEMA, observations);
  if (!result.ok || result.rejected.length > 0) throw new Error("fixture");
  return result.grounding.trees.map((t) => (t.state.kind === "conflicted" ? t.state.core : "consistent"));
};

describe("04 a core is a core, not the core", () => {
  it("two disjoint minimal conflicts in one tree: the engine names m1 m2, and resolving it (dropping m1) makes the next ground name k1 k2", () => {
    expect(coreOfDesk(ALL)).toEqual([["m1", "m2"]]);
    expect(coreOfDesk([K1, K2, M2])).toEqual([["k1", "k2"]]);
    // Resolve both and the tree is consistent: one member of each pair is enough to leave no conflict.
    expect(coreOfDesk([K1, M1])).toEqual(["consistent"]);
    // The conflict it did not name is a conflict on its own: it was there the whole time.
    expect(coreOfDesk([K1, K2])).toEqual([["k1", "k2"]]);
    expect(coreOfDesk([M1, M2])).toEqual([["m1", "m2"]]);
    // Arrival order changes nothing.
    expect(coreOfDesk([...ALL].reverse())).toEqual([["m1", "m2"]]);
  });

  it("AT THE BRIEF: every claim in the tree is conflicted with core m1 m2, the evidence is those two, the text says so, and recheck certifies it", () => {
    const g = groundOk(ORDER_DESK_SCHEMA, ALL);
    const brief = answerOk(g, claim(DELIVERY, null, 12), [claim(PACK, 1, 1), claim(TRANSIT, 4, 4), claim(CUSTOMS, 2, 2)]);
    for (const ruling of [brief.answer, ...brief.claims]) expect(ruling).toMatchObject({ kind: "conflicted", core: ["m1", "m2"] });
    expect(brief.evidence.map((o) => o.id)).toEqual(["m1", "m2"]);
    expect(renderBrief(g.schema, brief)).toContain("Sources conflict: m1, m2 cannot all be true. No source is trusted over another.");
    expect(recheck(g.schema, brief)).toMatchObject({ ok: true, intact: true });
  });

  it("recheck certifies the OTHER core too, and the union of both: it certifies unsatisfiability, not that a core is the only one or the smallest", () => {
    const g = groundOk(ORDER_DESK_SCHEMA, ALL);
    const brief = answerOk(g, claim(DELIVERY, null, 12), []);
    const everything = copyOf(g.observations) as Observation[];
    const withCore = (ids: readonly string[]): Brief => {
      const doctored = copyOf(brief) as unknown as { answer: { core: string[] }; evidence: Observation[] };
      doctored.answer.core = [...ids];
      doctored.evidence = everything.filter((o) => ids.includes(o.id));
      return doctored as unknown as Brief;
    };
    for (const ids of [["m1", "m2"], ["k1", "k2"], ["k1", "k2", "m1", "m2"]]) {
      expect(recheck(g.schema, withCore(ids)), ids.join(" ")).toEqual({ ok: true, intact: true, findings: [{ position: "answer", result: { kind: "reproduced", silentSides: [] } }] });
    }
    // What it does check: a set that is NOT a conflict is not a core.
    expect(recheck(g.schema, withCore(["k1", "m1"]))).toEqual({
      ok: true,
      intact: false,
      findings: [{ position: "answer", result: { kind: "not-reproduced", reason: { kind: "core-satisfiable" } } }],
    });
  });

  it("AT SCALE: six disjoint conflicts in one tree take six resolutions, each round names the pair whose ids sort last, in any arrival order", () => {
    const fieldNames = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;
    const schema = schemaOf(baseField("f1"), baseField("f2"), baseField("f3"), baseField("f4"), baseField("f5"), baseField("f6"), sumField("total", ["f1", "f2", "f3", "f4", "f5", "f6"]));
    // Pair i: `c{i}a` says field i is exactly 10, `c{i}b` says at most 3 (and at least 0): together, impossible; each alone, fine.
    const all = fieldNames.flatMap((name, i) => [obs(`c${i + 1}a`, fieldId(name), 10, 10, "exactly 10 days"), obs(`c${i + 1}b`, fieldId(name), 0, 3, "between 0 and 3 days")]);
    const random = mulberry32(4);
    const shuffled = (list: readonly Observation[]): Observation[] => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as Observation, copy[i] as Observation];
      }
      return copy;
    };
    const named: string[][] = [];
    let alive: readonly Observation[] = all;
    for (let round = 0; round < 10; round += 1) {
      const state = groundOk(schema, alive).trees[0]?.state;
      if (state?.kind !== "conflicted") break;
      named.push([...state.core]);
      // Any arrival order names the same core.
      for (let k = 0; k < 5; k += 1) expect(groundOk(schema, shuffled(alive)).trees[0]?.state).toEqual(state);
      // Resolve it by dropping the first of the named pair.
      alive = alive.filter((o) => o.id !== state.core[0]);
    }
    expect(named).toEqual([["c6a", "c6b"], ["c5a", "c5b"], ["c4a", "c4b"], ["c3a", "c3b"], ["c2a", "c2b"], ["c1a", "c1b"]]);
    expect(groundOk(schema, alive).trees[0]?.state.kind).toBe("consistent");
  });
});
