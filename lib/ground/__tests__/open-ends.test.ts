import { describe, expect, it } from "vitest";
import { compareIds, fieldId } from "../../contracts/index.js";
import type { Bound, Side } from "../../contracts/index.js";
import { extentOf, ground, openEndsOf } from "../index.js";
import { CANON, ORDER_DESK, canon, genInstance, mulberry32, obs, oracleFields, refIntake } from "./fixtures.js";
import type { RawObservation } from "./fixtures.js";
import { observationsInTreeOf, oracleBounds, oracleCost, oracleTreeOf, oracleTrees } from "./oracle.js";
import type { OField, OObs } from "./oracle.js";

/**
 * OPEN ENDS (plan section 4.3 and section 6 M4): for each requested side whose support for `f` is empty, every
 * base field in `f`'s subtree whose own support for that side is empty. The plan's properties, each checked here
 * with the brute-force oracle as the judge of "has no support" (a side has an empty support exactly when the
 * oracle's bound with no observation at all is already the bound with all of them):
 *  - SOUNDNESS: every listed end is a base field in the subtree with an empty support on that side, and only
 *    requested sides appear;
 *  - COMPLETENESS: every requested side with an empty support for `f` has at least one listed end;
 *  - SUFFICIENCY ON `hi`: observing an upper bound on every listed `hi` end bounds `f`'s upper side, unless the
 *    tree turns conflicted (the oracle judges that too);
 *  - EXACTNESS, stronger than all three: the list equals what the definition produces, computed from the oracle's
 *    supports, in the engine's order (field id, then `lo` before `hi`);
 *  - the argument cannot change the answer by its order or by repeats, and a field no schema declares or one in a
 *    conflicted tree has none.
 * It is "a place and not a promise" (plan case 06, below): naming an end does not say what bounding it will do.
 */

const CHUNKS = 16;
const PER_CHUNK = 125;
const BUDGET = 40_000;
const SIDE_REQUESTS: readonly (readonly Side[])[] = [["lo"], ["hi"], ["lo", "hi"]];
const seen = { instances: 0, skipped: 0, requests: 0, nonEmpty: 0, hiEnds: 0, loEnds: 0, sufficiencyChecks: 0, becameConflicted: 0, mostEnds: 0 };

/** The base fields at or below `f`, from the raw schema (not from the engine). */
function leavesUnder(fields: readonly OField[], f: string): string[] {
  const def = fields.find((x) => x.id === f) as OField;
  if (def.sum === undefined) return [f];
  return def.sum.flatMap((operand) => leavesUnder(fields, operand)).sort(compareIds);
}

describe("openEndsOf against the definition, with the oracle deciding what has no support", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const inst = genInstance(mulberry32(seed));
        const fields = oracleFields(inst.schema);
        const accepted = refIntake(inst.schema, inst.observations, inst.hostile).accepted;
        if (oracleCost(fields, accepted) > BUDGET) {
          seen.skipped += 1;
          continue;
        }
        seen.instances += 1;
        const result = ground(inst.schema, inst.observations);
        if (!result.ok) throw new Error(`seed ${seed}: ground failed`);
        const g = result.grounding;
        const bound = oracleBounds(fields, accepted);
        const trees = oracleTrees(fields, accepted);

        for (const tree of trees) {
          const ids = observationsInTreeOf(fields, accepted, tree.fields[0] as string).map((o) => o.id);
          for (const f of tree.fields) {
            if (!tree.exists) {
              for (const sides of SIDE_REQUESTS) if (openEndsOf(g, fieldId(f), sides).length !== 0) problems.push(`seed ${seed}: ${f} is in a conflicted tree and has open ends`);
              continue;
            }
            const unsupported = (field: string, side: Side): boolean => bound([], field, side) === bound(ids, field, side);
            for (const sides of SIDE_REQUESTS) {
              const where = `seed ${seed}, ${f}, sides ${sides.join("+")}`;
              const ends = openEndsOf(g, fieldId(f), sides);
              seen.requests += 1;
              if (ends.length > 0) seen.nonEmpty += 1;
              seen.mostEnds = Math.max(seen.mostEnds, ends.length);
              const leaves = leavesUnder(fields, f);

              // soundness
              for (const end of ends) {
                if (!sides.includes(end.side)) problems.push(`${where}: lists ${end.field}.${end.side}, a side that was not asked for`);
                if (!leaves.includes(end.field)) problems.push(`${where}: lists ${end.field}, which is not a base field under ${f}`);
                if (!unsupported(end.field, end.side)) problems.push(`${where}: ${end.field}.${end.side} has a support`);
                if (!unsupported(f, end.side)) problems.push(`${where}: lists an end for ${end.side} although ${f} has a support there`);
                if (end.side === "hi") seen.hiEnds += 1;
                else seen.loEnds += 1;
              }
              // completeness
              for (const side of sides) {
                if (unsupported(f, side) && !ends.some((end) => end.side === side)) problems.push(`${where}: ${f}.${side} has no support and no open end is listed`);
              }
              // exactness: the definition, from the oracle's supports
              const expected = (["lo", "hi"] as const)
                .filter((side) => sides.includes(side) && unsupported(f, side))
                .flatMap((side) => leaves.filter((leaf) => unsupported(leaf, side)).map((leaf) => ({ field: leaf, side })));
              expected.sort((a, b) => compareIds(a.field, b.field) || (a.side === b.side ? 0 : a.side === "lo" ? -1 : 1));
              if (JSON.stringify(ends) !== JSON.stringify(expected)) problems.push(`${where}: the engine lists ${JSON.stringify(ends)}, the definition gives ${JSON.stringify(expected)}`);

              // sufficiency on hi
              if (sides.length === 1 && sides[0] === "hi" && ends.length > 0) {
                const fresh: OObs[] = ends.map((end, i) => {
                  const floor = (tree.extents?.get(end.field)?.lo ?? 0) as number;
                  return { id: `zz-bound${i}`, field: end.field, extent: { lo: null, hi: Math.max(floor, 0) + 3 } };
                });
                const after = oracleTreeOf(fields, [...accepted, ...fresh], f);
                seen.sufficiencyChecks += 1;
                if (!after.exists) seen.becameConflicted += 1;
                else if ((after.extents?.get(f) as { hi: Bound }).hi === null) problems.push(`${where}: after bounding every listed hi end ${f}.hi is still unbounded`);
              }
            }
            // the argument's order and repeats change nothing
            const base = JSON.stringify(openEndsOf(g, fieldId(f), ["lo", "hi"]));
            for (const sides of [["hi", "lo"], ["lo", "hi", "lo", "hi"], ["hi", "hi", "lo"]] as const) {
              if (JSON.stringify(openEndsOf(g, fieldId(f), sides)) !== base) problems.push(`seed ${seed}, ${f}: sides ${sides.join("+")} give another answer than lo+hi`);
            }
          }
        }
        // an undeclared field has none
        if (openEndsOf(g, fieldId("no-such-field"), ["lo", "hi"]).length !== 0) problems.push(`seed ${seed}: an undeclared field has open ends`);
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("every branch was reached (needs every chunk above to have run)", () => {
    console.log(
      `open ends: ${seen.instances} instances asked (${seen.skipped} skipped as too costly for the oracle), ${seen.requests} requests, ${seen.nonEmpty} with at least one end (most: ${seen.mostEnds}), ${seen.loEnds} lo ends and ${seen.hiEnds} hi ends listed, ${seen.sufficiencyChecks} sufficiency checks of which ${seen.becameConflicted} ended conflicted`,
    );
    expect(seen.instances + seen.skipped, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    expect(seen.skipped).toBeLessThanOrEqual(CHUNKS * PER_CHUNK * 0.1);
    expect(seen.nonEmpty).toBeGreaterThanOrEqual(4000);
    expect(seen.hiEnds).toBeGreaterThanOrEqual(2000);
    expect(seen.loEnds).toBeGreaterThanOrEqual(2000);
    expect(seen.sufficiencyChecks).toBeGreaterThanOrEqual(1500);
    expect(seen.becameConflicted, "the 'unless the tree turns conflicted' exception was reached").toBeGreaterThanOrEqual(1);
    expect(seen.mostEnds).toBeGreaterThanOrEqual(4);
  });
});

describe("by hand", () => {
  const ground4 = (list: RawObservation[]) => {
    const r = ground(ORDER_DESK, list);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return r.grounding;
  };
  const f = fieldId;

  it("an unknown field, a field in a conflicted tree, and no requested side, each have none", () => {
    const g = ground4(canon("o1", "o2"));
    expect(openEndsOf(g, f("ghost"), ["lo", "hi"])).toEqual([]);
    expect(openEndsOf(g, f("deliveryDay"), [])).toEqual([]);
    expect(openEndsOf(ground4(canon("o1", "o2", "o3", "o4")), f("deliveryDay"), ["lo", "hi"])).toEqual([]);
  });

  it("a derived field's open ends are the base fields under it with nothing behind the side, and only those", () => {
    // o1 gives pack [1, 2] and o2 transit [3, 5]; customs has nothing: the upper side of delivery is open at customs alone
    const g = ground4(canon("o1", "o2"));
    expect(openEndsOf(g, f("deliveryDay"), ["hi"])).toStrictEqual([{ field: "customsDays", side: "hi" }]);
    // the lower side of delivery has a support (o1, o2), so asking for it lists nothing
    expect(openEndsOf(g, f("deliveryDay"), ["lo"])).toStrictEqual([]);
    // with nothing at all, all three bases are open on the upper side, and on the lower side too: every floor is the schema's own
    const empty = ground4([]);
    expect(openEndsOf(empty, f("deliveryDay"), ["hi"])).toStrictEqual([
      { field: "customsDays", side: "hi" },
      { field: "packDays", side: "hi" },
      { field: "transitDays", side: "hi" },
    ]);
    expect(openEndsOf(empty, f("deliveryDay"), ["lo", "hi"])).toHaveLength(6);
  });

  it("plan case 06 (a): a loose bound names no gap. With o1 o2 o3 delivery is [4, 9]; its upper side has a support, so there is no open end", () => {
    const g = ground4(canon("o1", "o2", "o3"));
    expect(extentOf(g, f("deliveryDay"))).toMatchObject({ ok: true, extent: { lo: 4, hi: 9 } });
    expect(openEndsOf(g, f("deliveryDay"), ["hi"])).toStrictEqual([]);
  });

  it("plan case 06 (b): a named end is a place and not a promise. Filling customs from above gives [4, 37], [24, 37] or [4, 10]", () => {
    const e = (list: RawObservation[]) => {
      const r = extentOf(ground4(list), f("deliveryDay"));
      return r.ok ? r.extent : undefined;
    };
    const base2 = canon("o1", "o2");
    expect(openEndsOf(ground4(base2), f("deliveryDay"), ["hi"])).toStrictEqual([{ field: "customsDays", side: "hi" }]);
    expect(e([...base2, obs("c30", "customsDays", null, 30)])).toEqual({ lo: 4, hi: 37 });
    expect(e([...base2, obs("c2030", "customsDays", 20, 30)])).toEqual({ lo: 24, hi: 37 });
    expect(e([...base2, obs("c3", "customsDays", null, 3)])).toEqual({ lo: 4, hi: 10 });
    expect(CANON.o3.quote).toContain("0 to 2");
  });
});
