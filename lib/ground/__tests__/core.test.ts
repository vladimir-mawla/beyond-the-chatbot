import { describe, expect, it } from "vitest";
import { MAX_FIELDS, MAX_OBSERVATIONS, compareIds, fieldId } from "../../contracts/index.js";
import { extentOf, ground, supportOf } from "../index.js";
import { CANON, ORDER_DESK, base, canon, derived, genInstance, mulberry32, obs, oracleFields, refIntake, schemaOf } from "./fixtures.js";
import type { RawField, RawObservation } from "./fixtures.js";
import { observationsInTreeOf, oracleCost, oracleShrink, oracleTreeOf, oracleTrees } from "./oracle.js";
import type { OObs } from "./oracle.js";

/**
 * THE CORE OF A CONFLICT (plan D6 and D7; section 6 M4: "core: unsatisfiable by the oracle, and every strict subset
 * satisfiable by the oracle"). For every conflicted tree of every generated instance the engine's core is checked
 * against the brute-force oracle, not against `ground`:
 *  1. it is made of observations the engine accepted, all about that tree, sorted, without repeats, and at least two;
 *  2. the oracle finds NO world for the core alone;
 *  3. the oracle finds a world for EVERY strict subset of the core (all of them, the empty one included; cores have
 *     at most 5 members here, so that is at most 31);
 *  4. it is exactly what plan D7 produces, deletion in ascending id order judged by the oracle, so that which core
 *     is named, and not only that it is one, is checked.
 * A core is irreducible and is not the only one and not the smallest: the by-hand cases show a two-observation
 * conflict beside a three-observation one where the three is named (the one whose ids sort last), the plan's case 04,
 * and the largest core the contracts allow.
 *
 * The oracle is expensive, so an instance is asked only if its worlds are cheap to list (`oracleCost`); the number
 * skipped is printed and bounded.
 */

const CHUNKS = 25;
const PER_CHUNK = 60;
const BUDGET = 40_000;
const seen = { instances: 0, skipped: 0, cores: 0, sizes: new Map<number, number>(), subsetsChecked: 0 };

function subsetsOf<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask++) out.push(items.filter((_, bit) => (mask & (1 << bit)) !== 0));
  return out;
}

describe("every core the engine returns is irreducible, unsatisfiable and exactly D7's, checked by the oracle", () => {
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
        const memo = new Map<string, boolean>();
        for (const tree of result.grounding.trees) {
          if (tree.state.kind !== "conflicted") continue;
          const core: readonly string[] = tree.state.core;
          const root = tree.fields[0] as string;
          const own: OObs[] = observationsInTreeOf(fields, accepted, root);
          const allIds = own.map((o) => o.id).sort(compareIds);
          const where = `seed ${seed}, tree ${root}`;
          const satisfiable = (ids: readonly string[]): boolean => {
            const key = [...ids].sort(compareIds).join(",");
            let known = memo.get(`${root}|${key}`);
            if (known === undefined) {
              known = oracleTreeOf(fields, own.filter((o) => ids.includes(o.id)), root).exists;
              memo.set(`${root}|${key}`, known);
            }
            return known;
          };
          seen.cores += 1;
          seen.sizes.set(core.length, (seen.sizes.get(core.length) ?? 0) + 1);

          // 1
          if (!core.every((id) => allIds.includes(id))) problems.push(`${where}: names an observation that is not accepted in this tree`);
          if (JSON.stringify([...core]) !== JSON.stringify([...new Set(core)].sort(compareIds))) problems.push(`${where}: not sorted, or repeated`);
          if (core.length < 2) problems.push(`${where}: a core of ${core.length}`);
          // 2
          if (satisfiable(core)) problems.push(`${where}: the oracle finds a world for the core ${JSON.stringify(core)}`);
          // 3
          if (core.length <= 5) {
            for (const subset of subsetsOf(core)) {
              if (subset.length === core.length) continue;
              seen.subsetsChecked += 1;
              if (!satisfiable(subset)) problems.push(`${where}: the strict subset ${JSON.stringify(subset)} of the core has no world`);
            }
          } else problems.push(`${where}: a core of ${core.length} is more than this test can check subset by subset`);
          // 4
          const expected = oracleShrink(allIds, (ids) => !satisfiable(ids));
          if (JSON.stringify(expected) !== JSON.stringify([...core])) problems.push(`${where}: D7 with the oracle gives ${JSON.stringify(expected)}, the engine ${JSON.stringify(core)}`);
        }
        // and a consistent tree has no core to compare: every tree the oracle calls consistent is consistent in the engine
        for (const o of oracleTrees(fields, accepted)) {
          const mine = result.grounding.trees.find((t) => t.fields.includes(fieldId(o.fields[0] as string)));
          if (mine?.state.kind === "conflicted" && o.exists) problems.push(`seed ${seed}: conflicted but the oracle finds a world`);
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("cores of every size the generator can make were checked (needs every chunk above to have run)", () => {
    console.log(
      `core: ${seen.instances} instances asked (${seen.skipped} skipped as too costly for the oracle), ${seen.cores} cores, sizes ${[...seen.sizes].sort(([a], [b]) => a - b).map(([k, v]) => `${k}:${v}`).join(" ")}, ${seen.subsetsChecked} strict subsets each given to the oracle`,
    );
    expect(seen.instances + seen.skipped, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    expect(seen.skipped).toBeLessThanOrEqual(CHUNKS * PER_CHUNK * 0.1);
    expect(seen.cores).toBeGreaterThanOrEqual(400);
    for (const [size, atLeast] of [[2, 200], [3, 40], [4, 10]] as const) expect(seen.sizes.get(size) ?? 0, `cores of ${size}`).toBeGreaterThanOrEqual(atLeast);
    expect(seen.subsetsChecked).toBeGreaterThanOrEqual(1500);
  });
});

describe("by hand: cores of two, three and four, and why a core is irreducible but not minimum", () => {
  const coreOf = (schema: unknown, list: unknown[], field: string): unknown => {
    const r = ground(schema, list);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return r.grounding.trees.find((t) => t.fields.includes(fieldId(field)))?.state;
  };

  it("two: two disjoint points on one field", () => {
    expect(coreOf(ORDER_DESK, [obs("p", "packDays", 5, 5), obs("q", "packDays", 0, 3)], "packDays")).toStrictEqual({ kind: "conflicted", core: ["p", "q"] });
  });

  it("three: x = a + b with a >= 5, b >= 5 and x <= 9; an unrelated observation beside them is not in the core", () => {
    const schema = schemaOf(base("a"), base("b"), derived("x", ["a", "b"]), base("other"));
    const list = [obs("m1", "a", 5, null), obs("m2", "b", 5, null), obs("m3", "x", null, 9), obs("m0", "other", 0, 4)];
    expect(coreOf(schema, list, "x")).toStrictEqual({ kind: "conflicted", core: ["m1", "m2", "m3"] });
    expect(coreOf(schema, list, "other")).toMatchObject({ kind: "consistent" });
  });

  it("four: the order desk's four documents, of which every pair and triple is fine", () => {
    expect(coreOf(ORDER_DESK, canon("o1", "o2", "o3", "o4"), "deliveryDay")).toStrictEqual({ kind: "conflicted", core: ["o1", "o2", "o3", "o4"] });
    expect(CANON.o4.extent).toEqual({ lo: 14, hi: 14 });
  });

  it("plan case 04: two disjoint conflicts in one tree; the core names the one whose ids sort last, and resolving it reveals the other", () => {
    const list = [obs("k1", "packDays", 5, 5), obs("k2", "packDays", 0, 3), obs("m1", "transitDays", 9, 9), obs("m2", "transitDays", 0, 2)];
    expect(coreOf(ORDER_DESK, list, "packDays")).toStrictEqual({ kind: "conflicted", core: ["m1", "m2"] });
    const without = list.filter((o) => o.id !== "m1");
    expect(coreOf(ORDER_DESK, without, "packDays")).toStrictEqual({ kind: "conflicted", core: ["k1", "k2"] });
  });

  it("irreducible, not minimum: a conflict of two observations beside one of three, and the three is named because its ids sort last", () => {
    const schema = schemaOf(base("p"), base("q"), base("r"), base("s"), derived("u", ["p", "q"]), derived("v", ["r", "s"]), derived("root", ["u", "v"]));
    const list = [obs("a1", "p", 5, 5), obs("a2", "p", 0, 3), obs("z1", "r", 5, null), obs("z2", "s", 5, null), obs("z3", "v", null, 9)];
    expect(coreOf(schema, list, "root")).toStrictEqual({ kind: "conflicted", core: ["z1", "z2", "z3"] });
    // the smaller conflict is real: a1 and a2 alone are unsatisfiable, so a core of size 2 exists
    expect(coreOf(schema, [list[0], list[1]], "root")).toStrictEqual({ kind: "conflicted", core: ["a1", "a2"] });
    // and each of z1, z2, z3 is needed (a core is irreducible)
    for (const drop of ["z1", "z2", "z3"]) expect(coreOf(schema, list.filter((o) => o.id !== drop && !["a1", "a2"].includes(o.id)), "root")).toMatchObject({ kind: "consistent" });
  });
});

describe("the largest core tested: 33 observations of a schema of 64 fields and 64 observations", () => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const derivedIds = Array.from({ length: 32 }, (_, k) => `d${pad(k)}`);
  const fields: RawField[] = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), base("spare")];
  for (let k = 1; k <= 31; k++) fields.push(derived(derivedIds[k] as string, [k === 1 ? "b00" : (derivedIds[k - 1] as string), `b${pad(k)}`]));
  const schema = schemaOf(...fields);

  /** 32 base fields each at most 5, so the root is at most 160, and the root pinned at 200 or more; 31 loose observations beside them. */
  const list = (): RawObservation[] => [
    ...Array.from({ length: 32 }, (_, i) => obs(`ob${pad(i)}`, `b${pad(i)}`, null, 5)),
    obs("oroot", derivedIds[31] as string, 200, null),
    ...Array.from({ length: 30 }, (_, j) => obs(`oloose${pad(j + 1)}`, derivedIds[j + 1] as string, 0, 1000)),
    obs("ospare", "spare", 0, 0),
  ];

  it("every one of the 32 upper bounds and the root's lower bound is needed, and nothing else is in the core", () => {
    expect(fields).toHaveLength(MAX_FIELDS);
    expect(list()).toHaveLength(MAX_OBSERVATIONS);
    const r = ground(schema, list());
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    expect(r.rejected).toEqual([]);
    const big = r.grounding.trees.find((t) => t.fields.length === 63);
    const expected = [...Array.from({ length: 32 }, (_, i) => `ob${pad(i)}`), "oroot"].sort(compareIds);
    expect(big?.state).toStrictEqual({ kind: "conflicted", core: expected });
    expect(expected).toHaveLength(33);
    // the spare field, alone in its tree, is untouched by the conflict next to it
    expect(r.grounding.trees.find((t) => t.fields.length === 1)?.state).toMatchObject({ kind: "consistent" });
    expect(supportOf(r.grounding, fieldId("spare"))).toMatchObject({ ok: true });
  });

  it("dropping any one of the 33 makes the tree consistent (it is irreducible)", () => {
    const all = list();
    const core = [...Array.from({ length: 32 }, (_, i) => `ob${pad(i)}`), "oroot"];
    for (const drop of core) {
      const r = ground(schema, all.filter((o) => o.id !== drop));
      if (!r.ok) throw new Error("failed");
      expect(r.grounding.trees.every((t) => t.state.kind === "consistent"), `without ${drop}`).toBe(true);
    }
  });
});

describe("the failures of extentOf and supportOf", () => {
  const g = (ids: ("o1" | "o2" | "o3" | "o4")[]) => {
    const r = ground(ORDER_DESK, canon(...ids));
    if (!r.ok) throw new Error("failed");
    return r.grounding;
  };

  it("a field no schema declares is unknown-field, whatever it is called, including names that exist on every object", () => {
    const grounding = g(["o1", "o2"]);
    for (const name of ["ghost", "constructor", "__proto__", "toString", "", "PACKDAYS"]) {
      expect(extentOf(grounding, fieldId(name)), name).toStrictEqual({ ok: false, failure: { kind: "unknown-field", field: name } });
      expect(supportOf(grounding, fieldId(name)), name).toStrictEqual({ ok: false, failure: { kind: "unknown-field", field: name } });
    }
  });

  it("every field of a conflicted tree is conflicted with that tree's core, a fresh copy each time", () => {
    const grounding = g(["o1", "o2", "o3", "o4"]);
    const tree = grounding.trees[0]!;
    if (tree.state.kind !== "conflicted") throw new Error("expected conflicted");
    for (const field of ["packDays", "transitDays", "customsDays", "deliveryDay"]) {
      const e = extentOf(grounding, fieldId(field));
      const s = supportOf(grounding, fieldId(field));
      expect(e).toStrictEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
      expect(s).toStrictEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
      if (e.ok || e.failure.kind !== "conflicted") throw new Error("expected conflicted");
      expect(e.failure.core).not.toBe(tree.state.core);
    }
  });
});
