import { describe, expect, it } from "vitest";
import type { Entailment, Extent } from "../../contracts/index.js";
import { oracleIsSubset, oracleMeet, oracleUnmetSides } from "../../extent/__tests__/fixtures.js";
import { classify } from "../../ground/__tests__/oracle.js";
import { rule } from "../index.js";
import { DESK, STEPS, base, canon, claim, derived, groundOf, obs, schemaOf } from "./fixtures.js";

/**
 * THE RULING TABLE (plan section 4.2 and section 6, M5, layer 1): `rule` over every (E, B, C) relation, with
 * masking-aware fixtures, written out in full, by hand, from the plan's section 7 where the plan has a row.
 *
 *  1. ONE-FIELD ROWS: `x` with baseline `[0, inf)`, one or two observations, and claims chosen so that each row is
 *     exactly one relation, with a neighbour row one step away that is the next relation (the boundary N / N + 1).
 *  2. THE PLAN'S SECTION 7: every question and every draft claim of the six steps, each ruling written out in full.
 *  3. THE VACUITY ROWS, which the plan says have to be pinned by a table fixture and not left to a property: on the
 *     model, deleting the rejection tripped 0 of 2 000 instances until an unrelated property happened to catch it.
 *  4. THE FULL GRID over one field: 5 baselines x (no observation, one of 26 extents, two of 8) x 26 claims, each ruled
 *     and compared with the plan's table as the brute-force oracle's set relations read it.
 *  5. NEGATIVE ROWS: what `rule` refuses (a ruling that depends on `source`, the order of the observations, the tested
 *     extent emitted by a `weakened`, a typed claim that is not read again).
 */

const X = schemaOf(base("x"), base("y", 0, 10), base("p"), base("q"), base("r"), derived("t", ["p", "q", "r"]));
const ruled = (g: ReturnType<typeof groundOf>, raw: unknown): Entailment => {
  const result = rule(g, raw);
  if (!result.ok) throw new Error(`expected a ruling, got ${JSON.stringify(result.fault)}`);
  return result.entailment;
};
const ext = (lo: number | null, hi: number | null): Extent => ({ lo, hi });
const ids = (...list: string[]): string[] => list;

describe("one-field rows: each is exactly one relation of E, B and C, and its neighbour is the next", () => {
  const g = groundOf(X, [obs("o1", "x", 3, 5)]); // E(x) = [3, 5], B(x) = [0, inf)

  it("entailed: E strictly inside C", () => {
    expect(ruled(g, claim("x", null, 9))).toStrictEqual({ kind: "entailed", field: "x", tested: ext(null, 9), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") } });
  });
  it("entailed: E equal to C", () => {
    expect(ruled(g, claim("x", 3, 5))).toStrictEqual({ kind: "entailed", field: "x", tested: ext(3, 5), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") } });
  });
  it("entailed: C bounded on one side only, E on both (the support still names both sides of E)", () => {
    expect(ruled(g, claim("x", 2, null))).toStrictEqual({ kind: "entailed", field: "x", tested: ext(2, null), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") } });
  });
  it("entailed with a floor from the schema: E's lower bound is the baseline's, so its support is empty", () => {
    const floor = groundOf(X, [obs("o1", "x", null, 5)]);
    expect(ruled(floor, claim("x", null, 9))).toStrictEqual({ kind: "entailed", field: "x", tested: ext(null, 9), established: ext(0, 5), support: { lo: [], hi: ids("o1") } });
  });

  it("the boundary between weakened and entailed: x <= 5 is entailed by [3, 5], x <= 4 is weakened", () => {
    expect(ruled(g, claim("x", null, 5)).kind).toBe("entailed");
    expect(ruled(g, claim("x", null, 4))).toStrictEqual({ kind: "weakened", field: "x", tested: ext(null, 4), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") }, unmet: ["hi"], openEnds: [] });
  });
  it("the boundary between weakened and entailed on the lower side: x >= 3 is entailed, x >= 4 is weakened", () => {
    expect(ruled(g, claim("x", 3, null)).kind).toBe("entailed");
    expect(ruled(g, claim("x", 4, null))).toStrictEqual({ kind: "weakened", field: "x", tested: ext(4, null), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") }, unmet: ["lo"], openEnds: [] });
  });
  it("weakened on both sides: x in [4, 4] against [3, 5]; the ruling carries E, never the tested extent", () => {
    const e = ruled(g, claim("x", 4, 4));
    expect(e).toStrictEqual({ kind: "weakened", field: "x", tested: ext(4, 4), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") }, unmet: ["lo", "hi"], openEnds: [] });
    expect(e.kind === "weakened" && e.established).not.toStrictEqual(ext(4, 4));
  });

  it("the boundary between contradicted and weakened: x >= 5 shares the integer 5 (weakened), x >= 6 shares none (contradicted)", () => {
    expect(ruled(g, claim("x", 5, null)).kind).toBe("weakened");
    expect(ruled(g, claim("x", 6, null))).toStrictEqual({ kind: "contradicted", field: "x", tested: ext(6, null), established: ext(3, 5), support: { lo: ids("o1"), hi: ids("o1") } });
  });
  it("the same boundary below: x <= 3 shares the integer 3 (weakened), x <= 2 shares none (contradicted)", () => {
    expect(ruled(g, claim("x", null, 3)).kind).toBe("weakened");
    expect(ruled(g, claim("x", null, 2)).kind).toBe("contradicted");
  });
  it("contradicted by a bounded claim that sits wholly past E: x in [7, 9]", () => {
    expect(ruled(g, claim("x", 7, 9)).kind).toBe("contradicted");
  });

  it("ungrounded: no observation about x, so E = B, and every unmet side names the field's own missing bound", () => {
    const empty = groundOf(X, []);
    expect(ruled(empty, claim("x", 3, 5))).toStrictEqual({ kind: "ungrounded", field: "x", tested: ext(3, 5), openEnds: [{ field: "x", side: "lo" }, { field: "x", side: "hi" }] });
    expect(ruled(empty, claim("x", null, 9))).toStrictEqual({ kind: "ungrounded", field: "x", tested: ext(null, 9), openEnds: [{ field: "x", side: "hi" }] });
    expect(ruled(empty, claim("x", 3, null))).toStrictEqual({ kind: "ungrounded", field: "x", tested: ext(3, null), openEnds: [{ field: "x", side: "lo" }] });
  });
  it("ungrounded with a finite baseline: y in [0, 10], claim y >= 3 names the lower end only, and y <= 9 the upper end only", () => {
    const empty = groundOf(X, []);
    expect(ruled(empty, claim("y", 3, null))).toStrictEqual({ kind: "ungrounded", field: "y", tested: ext(3, null), openEnds: [{ field: "y", side: "lo" }] });
    expect(ruled(empty, claim("y", null, 9))).toStrictEqual({ kind: "ungrounded", field: "y", tested: ext(null, 9), openEnds: [{ field: "y", side: "hi" }] });
  });
  it("evidence about OTHER fields leaves a field ungrounded: an observation about y does not touch x", () => {
    const other = groundOf(X, [obs("o1", "y", 2, 3)]);
    expect(ruled(other, claim("x", 3, 5)).kind).toBe("ungrounded");
    expect(ruled(other, claim("y", 3, 5)).kind).toBe("weakened");
  });
  it("an observation that does not move the field leaves it ungrounded: x >= 0 stated by a document is the schema's own floor", () => {
    const same = groundOf(X, [obs("o1", "x", 0, null)]);
    expect(ruled(same, claim("x", 3, 5)).kind).toBe("ungrounded");
    expect(ruled(same, claim("x", 3, 5))).toStrictEqual({ kind: "ungrounded", field: "x", tested: ext(3, 5), openEnds: [{ field: "x", side: "lo" }, { field: "x", side: "hi" }] });
  });

  it("conflicted: two observations that cannot both hold name their core, whatever the claim", () => {
    const conflict = groundOf(X, [obs("b", "x", 0, 3), obs("a", "x", 5, 5)]);
    for (const c of [claim("x", 1, 2), claim("x", null, 100), claim("x", 6, null), claim("x", 5, 5)]) {
      expect(ruled(conflict, c)).toStrictEqual({ kind: "conflicted", field: "x", tested: c.extent, core: ["a", "b"] });
    }
  });
  it("a conflict in one tree changes no ruling in another: y keeps its ruling", () => {
    const with_ = groundOf(X, [obs("o9", "y", 2, 3), obs("b", "x", 0, 3), obs("a", "x", 5, 5)]);
    const without = groundOf(X, [obs("o9", "y", 2, 3)]);
    expect(ruled(with_, claim("y", 3, 5))).toStrictEqual(ruled(without, claim("y", 3, 5)));
    expect(ruled(with_, claim("y", 3, 5)).kind).toBe("weakened");
  });
});

describe("a derived field: open ends name the base quantities under it, and a loose bound names none", () => {
  const three = groundOf(X, [obs("o1", "p", 1, 2), obs("o2", "q", 3, 5)]); // t = p + q + r, r unobserved: E(t) = [4, inf)
  it("a sum with an unobserved operand: weakened, the upper side is unmet, and the open end is that operand's upper bound", () => {
    expect(ruled(three, claim("t", null, 12))).toStrictEqual({
      kind: "weakened",
      field: "t",
      tested: ext(null, 12),
      established: ext(4, null),
      support: { lo: ids("o1", "o2"), hi: [] },
      unmet: ["hi"],
      openEnds: [{ field: "r", side: "hi" }],
    });
  });
  it("closing the gap with a bounded operand makes the same claim entailed, with the new observation in the upper support", () => {
    const closed = groundOf(X, [obs("o1", "p", 1, 2), obs("o2", "q", 3, 5), obs("o3", "r", 0, 2)]);
    expect(ruled(closed, claim("t", null, 12))).toStrictEqual({ kind: "entailed", field: "t", tested: ext(null, 12), established: ext(4, 9), support: { lo: ids("o1", "o2"), hi: ids("o1", "o2", "o3") } });
  });
  it("a bounded but loose E names no gap: weakened with openEnds [] (plan case 06)", () => {
    const closed = groundOf(X, [obs("o1", "p", 1, 2), obs("o2", "q", 3, 5), obs("o3", "r", 0, 2)]);
    expect(ruled(closed, claim("t", null, 5))).toStrictEqual({ kind: "weakened", field: "t", tested: ext(null, 5), established: ext(4, 9), support: { lo: ids("o1", "o2"), hi: ids("o1", "o2", "o3") }, unmet: ["hi"], openEnds: [] });
  });
  it("an observation can leave a derived field exactly at its baseline: p, q, r observed only from below never move t's upper side, but they move its lower", () => {
    const only = groundOf(X, [obs("o3", "r", 0, 2)]);
    expect(ruled(only, claim("t", null, 12))).toStrictEqual({ kind: "ungrounded", field: "t", tested: ext(null, 12), openEnds: [{ field: "p", side: "hi" }, { field: "q", side: "hi" }] });
  });
});

describe("the plan's section 7: every question and every draft claim of the six steps, ruled in full", () => {
  const o = (...names: ("o1" | "o2" | "o3" | "o4")[]) => groundOf(DESK, canon(...names));
  const end = (field: string, side: "lo" | "hi") => ({ field, side });

  it("step 1 (o1 o2): the question 'delivery <= 12' is weakened, 'at least 4', the upper side withheld, customsDays' upper bound the open end", () => {
    const g = o("o1", "o2");
    expect(ruled(g, STEPS[0]?.question)).toStrictEqual({
      kind: "weakened", field: "deliveryDay", tested: ext(null, 12), established: ext(4, null), support: { lo: ids("o1", "o2"), hi: [] }, unmet: ["hi"], openEnds: [end("customsDays", "hi")],
    });
  });
  it("step 1's four draft claims: pack = 1, transit = 4 and delivery = 7 weakened, customs = 2 ungrounded with both of its ends", () => {
    const g = o("o1", "o2");
    expect(ruled(g, claim("packDays", 1, 1))).toStrictEqual({ kind: "weakened", field: "packDays", tested: ext(1, 1), established: ext(1, 2), support: { lo: ids("o1"), hi: ids("o1") }, unmet: ["hi"], openEnds: [] });
    expect(ruled(g, claim("transitDays", 4, 4))).toStrictEqual({ kind: "weakened", field: "transitDays", tested: ext(4, 4), established: ext(3, 5), support: { lo: ids("o2"), hi: ids("o2") }, unmet: ["lo", "hi"], openEnds: [] });
    expect(ruled(g, claim("customsDays", 2, 2))).toStrictEqual({ kind: "ungrounded", field: "customsDays", tested: ext(2, 2), openEnds: [end("customsDays", "lo"), end("customsDays", "hi")] });
    expect(ruled(g, claim("deliveryDay", 7, 7))).toStrictEqual({
      kind: "weakened", field: "deliveryDay", tested: ext(7, 7), established: ext(4, null), support: { lo: ids("o1", "o2"), hi: [] }, unmet: ["lo", "hi"], openEnds: [end("customsDays", "hi")],
    });
  });
  it("steps 2 and 3 (o1 o2): 'delivery >= 4' is entailed and 'delivery <= 3' is contradicted, both by 'at least 4' from o1 o2", () => {
    const g = o("o1", "o2");
    expect(ruled(g, STEPS[1]?.question)).toStrictEqual({ kind: "entailed", field: "deliveryDay", tested: ext(4, null), established: ext(4, null), support: { lo: ids("o1", "o2"), hi: [] } });
    expect(ruled(g, STEPS[2]?.question)).toStrictEqual({ kind: "contradicted", field: "deliveryDay", tested: ext(null, 3), established: ext(4, null), support: { lo: ids("o1", "o2"), hi: [] } });
  });
  it("step 4 (o1 o2 o3): 'delivery <= 12' is entailed by [4, 9], lower support o1 o2, upper support o1 o2 o3; customs = 1 is weakened with the floor open", () => {
    const g = o("o1", "o2", "o3");
    expect(ruled(g, STEPS[3]?.question)).toStrictEqual({ kind: "entailed", field: "deliveryDay", tested: ext(null, 12), established: ext(4, 9), support: { lo: ids("o1", "o2"), hi: ids("o1", "o2", "o3") } });
    expect(ruled(g, claim("customsDays", 1, 1))).toStrictEqual({ kind: "weakened", field: "customsDays", tested: ext(1, 1), established: ext(0, 2), support: { lo: [], hi: ids("o3") }, unmet: ["lo", "hi"], openEnds: [end("customsDays", "lo")] });
    expect(ruled(g, claim("deliveryDay", 6, 6))).toStrictEqual({ kind: "weakened", field: "deliveryDay", tested: ext(6, 6), established: ext(4, 9), support: { lo: ids("o1", "o2"), hi: ids("o1", "o2", "o3") }, unmet: ["lo", "hi"], openEnds: [] });
  });
  it("step 5 (o1 o2 o3 o4): every claim is conflicted with the same four-document core", () => {
    const g = o("o1", "o2", "o3", "o4");
    for (const c of [STEPS[4]?.question, claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 1, 1), claim("deliveryDay", 6, 6)]) {
      expect(ruled(g, c).kind).toBe("conflicted");
      expect((ruled(g, c) as { core: string[] }).core).toStrictEqual(ids("o1", "o2", "o3", "o4"));
    }
  });
  it("step 6 (o1 o2 o4): customs is [7, 10], a number in no document, from o1 o2 o4 on both sides; 'customs <= 3' is contradicted; delivery = 14 is entailed from o4", () => {
    const g = o("o1", "o2", "o4");
    expect(ruled(g, STEPS[5]?.question)).toStrictEqual({ kind: "contradicted", field: "customsDays", tested: ext(null, 3), established: ext(7, 10), support: { lo: ids("o1", "o2", "o4"), hi: ids("o1", "o2", "o4") } });
    expect(ruled(g, claim("customsDays", 2, 2)).kind).toBe("contradicted");
    expect(ruled(g, claim("deliveryDay", 14, 14))).toStrictEqual({ kind: "entailed", field: "deliveryDay", tested: ext(14, 14), established: ext(14, 14), support: { lo: ids("o4"), hi: ids("o4") } });
  });
  it("every kind of every step is the plan's table (the fixtures' kinds, ruled)", () => {
    for (const step of STEPS) {
      const g = groundOf(DESK, canon(...step.ids));
      expect(ruled(g, step.question).kind, `step ${step.number} question`).toBe(step.questionKind);
      step.draft.forEach((c, i) => expect(ruled(g, c).kind, `step ${step.number} draft ${i}`).toBe(step.draftKinds[i]));
    }
    const kinds = new Set(STEPS.flatMap((s) => [s.questionKind, ...s.draftKinds]));
    expect([...kinds].sort()).toEqual(["conflicted", "contradicted", "entailed", "ungrounded", "weakened"]);
  });
});

describe("the vacuous claim is a fault and never a ruling: pinned by rows, not left to a property", () => {
  const empty = groundOf(X, []);
  const moved = groundOf(X, [obs("o1", "x", 3, 5)]);
  it("with no evidence a vacuous claim is refused, not ruled ungrounded (where it would name no open end)", () => {
    expect(rule(empty, claim("x", 0, null))).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "x" } });
    expect(rule(empty, claim("x", null, null))).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "x" } });
  });
  it("with evidence that WOULD entail it, a vacuous claim is still refused, and the claim one step past the baseline is ruled entailed", () => {
    expect(rule(moved, claim("x", 0, null))).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "x" } });
    expect(ruled(moved, claim("x", 1, null)).kind).toBe("entailed");
  });
  it("on a finite baseline: y in [0, 10] makes 'y <= 10' and 'y in [-3, 12]' vacuous and 'y <= 9' not", () => {
    expect(rule(empty, claim("y", null, 10)).ok).toBe(false);
    expect(rule(empty, claim("y", -3, 12)).ok).toBe(false);
    expect(rule(empty, claim("y", null, 9)).ok).toBe(true);
  });
  it("in a conflicted tree a vacuous claim is still a vacuous-claim fault, not conflicted", () => {
    const conflict = groundOf(X, [obs("b", "x", 0, 3), obs("a", "x", 5, 5)]);
    expect(rule(conflict, claim("x", 0, null))).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "x" } });
  });
});

describe("rule is readClaim and then the table: a fault is a result, and a typed claim is read again", () => {
  const g = groundOf(X, [obs("o1", "x", 3, 5)]);
  it("each of the three readClaim faults passes through as { ok: false, fault }", () => {
    expect(rule(g, { field: 1, extent: null })).toStrictEqual({ ok: false, fault: { kind: "malformed", fields: ["extent", "field"] } });
    expect(rule(g, claim("ghost", 1, 2))).toStrictEqual({ ok: false, fault: { kind: "unknown-field", field: "ghost" } });
    expect(rule(g, claim("x", null, null))).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "x" } });
  });
  it("a value typed as a Claim that is not one (an inverted extent, cast in) is refused: the typed signature is read again", () => {
    const lying = { field: "x", extent: { lo: 9, hi: 1 } } as unknown as Parameters<typeof rule>[1];
    expect(rule(g, lying)).toStrictEqual({ ok: false, fault: { kind: "malformed", fields: ["extent"] } });
  });
  it("a ruling never depends on `source`: relabelling every observation changes nothing", () => {
    const relabelled = groundOf(X, [{ ...obs("o1", "x", 3, 5), source: "A forum post" }]);
    for (const c of [claim("x", null, 9), claim("x", 4, 4), claim("x", 7, null), claim("y", 3, 5)]) expect(rule(relabelled, c)).toStrictEqual(rule(g, c));
  });
  it("a ruling never depends on the order of the observations: reversing the snapshot changes nothing", () => {
    const list = [obs("o1", "p", 1, 2), obs("o2", "q", 3, 5), obs("o3", "r", 0, 2), obs("o4", "p", 0, 7)];
    const a = groundOf(X, list);
    const b = groundOf(X, [...list].reverse());
    for (const c of [claim("t", null, 12), claim("t", null, 5), claim("p", 1, 1), claim("r", 1, 1), claim("t", 20, null)]) expect(rule(a, c)).toStrictEqual(rule(b, c));
  });
});

describe("the full grid over one field: 5 baselines, no observation or one of 26 extents or two of 8, against 26 claims", () => {
  const SIDES: (number | null)[] = [null, -1, 0, 1, 2, 3];
  const GRID: Extent[] = [];
  for (const lo of SIDES) for (const hi of SIDES) if (lo === null || hi === null || lo <= hi) GRID.push({ lo, hi });
  const SMALL: Extent[] = [ext(null, null), ext(0, null), ext(null, 1), ext(1, 2), ext(2, 2), ext(-1, 1), ext(3, null), ext(null, 0)];
  const BASELINES: Extent[] = [ext(0, null), ext(0, 3), ext(null, 2), ext(-1, 1), ext(null, null)];
  const seen = new Map<string, number>();

  it("the grid has the sizes this test says (26 extents)", () => {
    expect(GRID).toHaveLength(26);
  });

  BASELINES.forEach((b, i) => {
    it(`baseline ${JSON.stringify(b)}: every grounding and every claim equals the plan's table, the oracle's way`, () => {
      const schema = schemaOf(base("f", b.lo, b.hi));
      const sets: Extent[][] = [[], ...GRID.map((e) => [e]), ...SMALL.flatMap((e1) => SMALL.map((e2) => [e1, e2]))];
      let n = 0;
      for (const list of sets) {
        const g = groundOf(schema, list.map((e, k) => obs(`o${k}`, "f", e.lo, e.hi)));
        // E by the oracle: B intersected with every accepted observation; undefined once empty
        let e: Extent | undefined = b;
        for (const accepted of g.observations) e = e === undefined ? undefined : oracleMeet(e, accepted.extent);
        for (const c of GRID) {
          const want = classify(e, b, c);
          const got = rule(g, claim("f", c.lo, c.hi));
          const label = `B ${JSON.stringify(b)}, observations ${JSON.stringify(g.observations.map((o) => o.extent))}, claim ${JSON.stringify(c)}`;
          if (want === "vacuous") {
            expect(got, label).toStrictEqual({ ok: false, fault: { kind: "vacuous-claim", field: "f" } });
          } else {
            expect(got.ok && got.entailment.kind, label).toBe(want);
            if (got.ok && e !== undefined && got.entailment.kind !== "ungrounded" && got.entailment.kind !== "conflicted") {
              expect(got.entailment.established, label).toStrictEqual(e);
              if (got.entailment.kind === "weakened") expect(got.entailment.unmet, label).toStrictEqual(oracleUnmetSides(e, c));
              if (got.entailment.kind === "entailed") expect(oracleIsSubset(e, c), label).toBe(true);
            }
          }
          seen.set(`${i}/${want}`, (seen.get(`${i}/${want}`) ?? 0) + 1);
          n += 1;
        }
      }
      expect(n).toBe(sets.length * GRID.length);
    });
  });

  it("every baseline reached every relation the table has (needs every baseline test above to have run)", () => {
    for (let i = 0; i < BASELINES.length; i++) {
      for (const kind of ["entailed", "weakened", "contradicted", "ungrounded", "conflicted", "vacuous"]) expect(seen.get(`${i}/${kind}`) ?? 0, `baseline ${i} ${kind}`).toBeGreaterThan(0);
    }
  });
});
