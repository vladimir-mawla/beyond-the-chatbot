import { describe, expect, it } from "vitest";
import type { Observation } from "../../lib/contracts/index.js";
import { extentOf } from "../../lib/ground/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, PACK, TRANSIT, answerOk, claim, groundOk, obs } from "./helpers.js";

/**
 * KIND: DISCLOSES (plan section 11, case 05).
 * TRACES TO: D7 (support is a certificate found by deletion in ascending id order: irreducible, not minimum, and a function of
 * the ids, never of the input order).
 *
 * THE LIMIT. The same evidence under two id schemes gives two different certificates for the same bound. One route to
 * `deliveryDay <= 9` is a single document, `direct` ("Delivery by day 9"); the other is three, `a1: packDays <= 2`,
 * `a2: transitDays <= 5`, `a3: customsDays <= 2` (2 + 5 + 2 = 9). Named `z-direct`, the single document survives deletion and the
 * support is `["z-direct"]`; named `0-direct`, it is dropped first (its three rivals still give the bound) and the support is
 * `["a1", "a2", "a3"]`. Identical evidence, identical established extent, a three-times larger certificate that is no less
 * valid: irreducible (drop any one id and the bound loosens), not minimum (a one-document certificate exists).
 *
 * SCALE AND LAYER (M4's `support-certificate.test.ts` pins the two-scheme pair by hand at `lib/ground`): here the certificate is
 * read where a user meets it, in the Brief (the `support`, the `evidence` list, the rendered sentence, a holder's `recheck`),
 * and over all 24 ways of giving the four documents four ids, by a rule the test states on its own: the support is the three
 * route documents when the single document's id sorts before the other three, and the single document otherwise (6 of the 24
 * and 18 of the 24).
 *
 * WHAT WOULD MAKE THIS FAIL: (1) a support chosen by input order, by recency or by size (the 24-way rule and the reversed-array
 * assertions go red); (2) deletion in descending order (the `z-direct` and `0-direct` pair swap places); (3) a support
 * minimised by cardinality (`0-direct` would give `["0-direct"]`: the "not minimum" assertions go red); (4) a support that is
 * not irreducible (the drop-one assertions go red).
 */

const route = (direct: string): Observation[] => [
  obs(direct, DELIVERY, null, 9, "Delivery by day 9", "Courier tracking page"),
  obs("a1", PACK, null, 2, "Packed within 2 days", "Warehouse system"),
  obs("a2", TRANSIT, null, 5, "Transit within 5 days", "Carrier SLA sheet"),
  obs("a3", CUSTOMS, null, 2, "Customs within 2 days", "Customs bulletin"),
];

const upperBoundOf = (observations: readonly Observation[]): number | null => {
  const read = extentOf(groundOk(ORDER_DESK_SCHEMA, observations), DELIVERY);
  if (!read.ok) throw new Error("fixture");
  return read.extent.hi;
};

describe("05 a support is irreducible, not minimum, and depends on ids, never on input order", () => {
  it("the plan's pair: z-direct gives [z-direct]; 0-direct gives [a1 a2 a3]; the extent is the same; reversing the array changes nothing", () => {
    for (const [direct, expected] of [
      ["z-direct", ["z-direct"]],
      ["0-direct", ["a1", "a2", "a3"]],
    ] as const) {
      for (const list of [route(direct), [...route(direct)].reverse()]) {
        const g = groundOk(ORDER_DESK_SCHEMA, list);
        const read = extentOf(g, DELIVERY);
        expect(read).toEqual({ ok: true, extent: { lo: 0, hi: 9 }, baseline: { lo: 0, hi: null } });
        const ruling = answerOk(g, claim(DELIVERY, null, 9), []).answer;
        expect(ruling).toEqual({
          kind: "entailed",
          field: DELIVERY,
          tested: { lo: null, hi: 9 },
          established: { lo: 0, hi: 9 },
          support: { lo: [], hi: expected },
        });
      }
    }
  });

  it("AT THE BRIEF: the evidence list and the sentence differ between the two schemes, and a holder's recheck certifies both as reproduced", () => {
    const outcomes = (["z-direct", "0-direct"] as const).map((direct) => {
      const g = groundOk(ORDER_DESK_SCHEMA, route(direct));
      const brief = answerOk(g, claim(DELIVERY, null, 9), []);
      return { ids: brief.evidence.map((o) => o.id), text: renderBrief(g.schema, brief), result: recheck(g.schema, brief) };
    });
    expect(outcomes[0]?.ids).toEqual(["z-direct"]);
    expect(outcomes[1]?.ids).toEqual(["a1", "a2", "a3"]);
    expect(outcomes[0]?.text).toContain("upper bound from z-direct)");
    expect(outcomes[1]?.text).toContain("upper bound from a1, a2, a3)");
    for (const outcome of outcomes) {
      expect(outcome.result).toEqual({ ok: true, intact: true, findings: [{ position: "answer", result: { kind: "reproduced", silentSides: ["lo"] } }] });
    }
  });

  it("NOT MINIMUM: under 0-direct the support has three documents although one document alone gives the same bound; IRREDUCIBLE: dropping any one of the three loosens it", () => {
    const g = groundOk(ORDER_DESK_SCHEMA, route("0-direct"));
    const ruling = answerOk(g, claim(DELIVERY, null, 9), []).answer;
    if (ruling.kind !== "entailed") throw new Error("fixture");
    const support = ruling.support.hi;
    expect(support).toEqual(["a1", "a2", "a3"]);
    const byId = (ids: readonly string[]) => route("0-direct").filter((o) => ids.includes(o.id));
    expect(upperBoundOf(byId(["0-direct"]))).toBe(9);
    expect(upperBoundOf(byId(support))).toBe(9);
    for (const dropped of support) expect(upperBoundOf(byId(support.filter((id) => id !== dropped))), `without ${dropped}`).toBeNull();
  });

  it("ALL 24 NAMINGS of the four documents with four ids: the support follows the stated rule, the extent never moves, the input order never matters", () => {
    const pool = ["m1", "n2", "p3", "q4"];
    const permutations = (items: readonly string[]): string[][] =>
      items.length <= 1 ? [[...items]] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
    const named = permutations(pool);
    expect(named).toHaveLength(24);
    let single = 0;
    let triple = 0;
    for (const ids of named) {
      const [directId, id1, id2, id3] = ids as [string, string, string, string];
      const documents = [
        obs(directId, DELIVERY, null, 9, "Delivery by day 9"),
        obs(id1, PACK, null, 2, "Packed within 2 days"),
        obs(id2, TRANSIT, null, 5, "Transit within 5 days"),
        obs(id3, CUSTOMS, null, 2, "Customs within 2 days"),
      ];
      const directIsSmallest = [id1, id2, id3].every((other) => directId < other);
      const expected = directIsSmallest ? [id1, id2, id3].sort() : [directId];
      for (const list of [documents, [...documents].reverse()]) {
        const g = groundOk(ORDER_DESK_SCHEMA, list);
        const ruling = answerOk(g, claim(DELIVERY, null, 9), []).answer;
        expect(ruling, ids.join(" ")).toMatchObject({ kind: "entailed", established: { lo: 0, hi: 9 }, support: { lo: [], hi: expected } });
        expect(recheck(g.schema, answerOk(g, claim(DELIVERY, null, 9), []))).toMatchObject({ ok: true, intact: true });
      }
      if (directIsSmallest) triple += 1;
      else single += 1;
    }
    expect([single, triple]).toEqual([18, 6]);
  });
});
