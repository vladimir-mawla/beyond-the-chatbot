import { describe, expect, it } from "vitest";
import { MAX_FIELDS, MAX_OBSERVATIONS, compareIds, fieldId } from "../../contracts/index.js";
import type { Bound, Side } from "../../contracts/index.js";
import { ground, supportOf } from "../index.js";
import { shrink } from "../shrink.js";
import { base, derived, genInstance, mulberry32, obs, oracleFields, refIntake, schemaOf } from "./fixtures.js";
import type { RawField, RawObservation } from "./fixtures.js";
import { observationsInTreeOf, oracleBound, oracleBounds, oracleCost, oracleShrink, oracleTrees } from "./oracle.js";
import type { OObs } from "./oracle.js";

/**
 * THE SUPPORT CERTIFICATE (plan D7, section 6 M4: "for every bound, re-grounding with ONLY that bound's support
 * reproduces it, and dropping any one element does not -- checked with the oracle, not with `ground`").
 *
 * For every consistent tree of every generated instance, every field and each side, the engine's `supportOf` is
 * checked four ways, none of them by calling `ground`:
 *  1. it is made of observations the engine accepted, about that field's tree, sorted, without repeats;
 *  2. REPRODUCES: the brute-force oracle, given only those observations, finds the same bound as with all of them;
 *  3. IRREDUCIBLE: for each element, the oracle without it finds a looser bound (it cannot find a tighter one);
 *  4. it is exactly what plan D7 produces: deletion in ascending id order, with the oracle as the judge of "is the
 *     bound still the same" (`oracleShrink`, plan D7 written out again in `oracle.ts`), so which irreducible subset
 *     is chosen is checked, not only that it is one;
 * and `[]` is the answer exactly when the oracle's bound with no observation at all is already that bound.
 *
 * The oracle is expensive, so each instance is asked only if listing its worlds is cheap (`oracleCost`), and the
 * number skipped is printed and bounded. Afterwards: the plan's case 05 (a route that sorts last, a route that sorts
 * first), `shrink` called directly with a pool in the wrong order, and the longest support the contracts allow.
 */

const CHUNKS = 50;
const PER_CHUNK = 60;
const BUDGET = 10_000;
const seen = { instances: 0, skipped: 0, bounds: 0, nonEmpty: 0, longest: 0, sizes: new Map<number, number>() };

describe("every support the engine returns is a certificate, checked by the oracle", () => {
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
        const trees = oracleTrees(fields, accepted);
        const bound = oracleBounds(fields, accepted);
        for (const tree of trees) {
          if (!tree.exists) continue;
          const mine: OObs[] = observationsInTreeOf(fields, accepted, tree.fields[0] as string);
          const allIds = mine.map((o) => o.id).sort(compareIds);
          for (const f of tree.fields) {
            const read = supportOf(result.grounding, fieldId(f));
            if (!read.ok) {
              problems.push(`seed ${seed}: supportOf(${f}) failed in a consistent tree`);
              continue;
            }
            for (const side of ["lo", "hi"] as const satisfies readonly Side[]) {
              const support: readonly string[] = read.support[side];
              const full = (tree.extents?.get(f) as { lo: Bound; hi: Bound })[side];
              const where = `seed ${seed}, ${f}.${side}`;
              seen.bounds += 1;
              if (support.length > 0) seen.nonEmpty += 1;
              seen.longest = Math.max(seen.longest, support.length);
              seen.sizes.set(support.length, (seen.sizes.get(support.length) ?? 0) + 1);

              // 1. made of this tree's accepted observations, sorted, no repeats
              if (!support.every((id) => allIds.includes(id))) problems.push(`${where}: names an observation that is not accepted in this tree`);
              if (JSON.stringify([...support]) !== JSON.stringify([...new Set(support)].sort(compareIds))) problems.push(`${where}: not sorted, or repeated`);
              // 2. reproduces
              const alone = bound(support, f, side);
              if (alone !== full) problems.push(`${where}: the oracle gives ${String(alone)} from the support alone, and ${String(full)} from everything`);
              // 3. irreducible
              for (const drop of support) {
                const without = bound(support.filter((id) => id !== drop), f, side);
                if (without === full) problems.push(`${where}: ${drop} is not needed`);
              }
              // [] exactly when nothing is needed
              const none = bound([], f, side);
              if ((support.length === 0) !== (none === full)) problems.push(`${where}: ${support.length === 0 ? "empty" : "non-empty"} but the schema alone ${none === full ? "gives" : "does not give"} the bound`);
              // 4. exactly D7's deletion, judged by the oracle
              const expected = oracleShrink(allIds, (subset) => bound(subset, f, side) === full);
              if (JSON.stringify(expected) !== JSON.stringify([...support])) problems.push(`${where}: D7 with the oracle gives ${JSON.stringify(expected)}, the engine ${JSON.stringify(support)}`);
            }
          }
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("enough was asked, and a good share of it was a non-empty support (needs every chunk above to have run)", () => {
    console.log(
      `support certificate: ${seen.instances} instances asked (${seen.skipped} skipped as too costly for the oracle), ${seen.bounds} bounds, ${seen.nonEmpty} with a non-empty support, the longest has ${seen.longest} observations; sizes ${[...seen.sizes].sort(([a], [b]) => a - b).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    );
    expect(seen.instances + seen.skipped, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    expect(seen.skipped).toBeLessThanOrEqual(CHUNKS * PER_CHUNK * 0.1);
    expect(seen.bounds).toBeGreaterThanOrEqual(12000);
    expect(seen.nonEmpty).toBeGreaterThanOrEqual(5000);
    for (const [size, atLeast] of [[1, 1000], [2, 200], [3, 40], [4, 8]] as const) expect(seen.sizes.get(size) ?? 0, `supports of ${size}`).toBeGreaterThanOrEqual(atLeast);
    expect(seen.longest).toBeGreaterThanOrEqual(4);
  });
});

describe("plan case 05 by hand: the certificate is irreducible, not minimum, and depends on ids and never on input order", () => {
  const schema = schemaOf(base("p"), base("q"), base("r"), derived("total", ["p", "q", "r"]));
  const route = (direct: string): RawObservation[] => [obs(direct, "total", null, 9), obs("a1", "p", null, 2), obs("a2", "q", null, 5), obs("a3", "r", null, 2)];
  const hi = (list: RawObservation[]): readonly string[] => {
    const r = ground(schema, list);
    if (!r.ok) throw new Error("failed");
    const s = supportOf(r.grounding, fieldId("total"));
    if (!s.ok) throw new Error("conflicted");
    return s.support.hi;
  };

  it("the same E, the same bound 9, two certificates, by how the ids sort; and reversing the input changes nothing", () => {
    expect(hi(route("z-direct"))).toEqual(["z-direct"]);
    expect(hi(route("0-direct"))).toEqual(["a1", "a2", "a3"]);
    expect(hi([...route("z-direct")].reverse())).toEqual(["z-direct"]);
    expect(hi([...route("0-direct")].reverse())).toEqual(["a1", "a2", "a3"]);
    for (const direct of ["z-direct", "0-direct"]) {
      const r = ground(schema, route(direct));
      if (!r.ok) throw new Error("failed");
      expect(r.grounding.trees[0]!.state).toMatchObject({ kind: "consistent", extents: expect.arrayContaining([{ field: "total", extent: { lo: 0, hi: 9 } }]) });
    }
    // the larger certificate is real: with only the three, the oracle finds 9; and the smaller one is not the one chosen
    const accepted = (list: RawObservation[]): OObs[] => list.map((o) => ({ id: o.id, field: o.field, extent: o.extent }));
    const fields = oracleFields(schema);
    expect(oracleBound(fields, accepted(route("0-direct")), ["a1", "a2", "a3"], "total", "hi")).toBe(9);
    expect(oracleBound(fields, accepted(route("0-direct")), ["0-direct"], "total", "hi")).toBe(9);
  });

  it("a bound the schema already gives needs no evidence: [] even though an observation states it", () => {
    const r = ground(schema, [obs("floor", "p", 0, null), obs("x", "p", null, 4)]);
    if (!r.ok) throw new Error("failed");
    const s = supportOf(r.grounding, fieldId("p"));
    expect(s).toStrictEqual({ ok: true, support: { lo: [], hi: ["x"] } });
  });
});

describe("`shrink` itself", () => {
  const ids = (xs: string[]) => xs as never[];
  it("sorts its pool, so the order a caller built it in cannot reach the answer; it tries the smallest id first", () => {
    const holds = (subset: readonly string[]): boolean => subset.includes("m") || subset.length >= 3;
    // from {a, b, m, z}: a goes, b goes (m is still there), m must stay (alone, z has neither m nor three members), z goes
    const sorted = shrink(ids(["a", "b", "m", "z"]), holds);
    const shuffled = shrink(ids(["z", "m", "b", "a"]), holds);
    expect(shuffled).toEqual(sorted);
    expect(sorted).toEqual(["m"]);
    // drop order is ascending: with two ways to keep the property, the later ids survive
    const either = (subset: readonly string[]): boolean => subset.includes("a") || subset.includes("z");
    expect(shrink(ids(["a", "z"]), either)).toEqual(["z"]);
    expect(shrink(ids(["z", "a"]), either)).toEqual(["z"]);
  });

  it("it returns a fresh array and leaves its pool alone, and an always-true predicate empties it", () => {
    const pool = ids(["c", "b", "a"]);
    const out = shrink(pool, () => true);
    expect(out).toEqual([]);
    expect(pool).toEqual(["c", "b", "a"]);
    const kept = shrink(pool, () => false);
    expect(kept).toEqual(["a", "b", "c"]);
    expect(kept).not.toBe(pool);
  });

  it("each survivor is needed: with a monotone predicate, removing any one breaks it (an irreducible set)", () => {
    const need = new Set(["b", "d"]);
    const holds = (subset: readonly string[]): boolean => [...need].every((x) => subset.includes(x));
    const out = shrink(ids(["a", "b", "c", "d", "e"]), holds);
    expect(out).toEqual(["b", "d"]);
    for (const drop of out) expect(holds(out.filter((x) => x !== drop))).toBe(false);
  });
});

describe("the longest support the contracts allow, worked out by hand", () => {
  /** b00..b31 in [i, i+1] and D1..D31 the running sums, 64 fields with the spare, as in oracle-exactness.test.ts. */
  const derivedIds = Array.from({ length: 32 }, (_, k) => `d${String(k).padStart(2, "0")}`);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fields: RawField[] = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), base("spare")];
  for (let k = 1; k <= 31; k++) fields.push(derived(derivedIds[k] as string, [k === 1 ? "b00" : (derivedIds[k - 1] as string), `b${pad(k)}`]));
  const schema = schemaOf(...fields);

  it("with only the 32 base observations, the root's upper bound needs all 32 and its lower bound 31: b00's lower bound is the schema's own floor", () => {
    const list = Array.from({ length: 32 }, (_, i) => obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1));
    const r = ground(schema, list);
    if (!r.ok) throw new Error("failed");
    expect(fields).toHaveLength(MAX_FIELDS);
    const everything = list.map((o) => o.id);
    const root = supportOf(r.grounding, fieldId(derivedIds[31] as string));
    // D31 = [0 + .. + 31, 1 + .. + 32] = [496, 528]. The upper end is the sum of all 32 upper bounds. The lower end is the
    // sum of the lower bounds 0, 1, .. 31, and the 0 of b00 is what the schema says anyway, so ob00 is not in its support.
    expect(root).toStrictEqual({ ok: true, support: { lo: everything.slice(1), hi: everything } });
    expect(everything).toHaveLength(32);
    // a base field needs only its own observation on a side, and none for b00's floor
    expect(supportOf(r.grounding, fieldId("b07"))).toStrictEqual({ ok: true, support: { lo: ["ob07"], hi: ["ob07"] } });
    expect(supportOf(r.grounding, fieldId("b00"))).toStrictEqual({ ok: true, support: { lo: [], hi: ["ob00"] } });
  });

  it("with all 64 observations (32 on bases, 31 loose ones and the spare's), the root is supported by the same ones and none of the loose ones", () => {
    const list = [
      ...Array.from({ length: 32 }, (_, i) => obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1)),
      ...Array.from({ length: 31 }, (_, j) => obs(`oloose${pad(j + 1)}`, derivedIds[j + 1] as string, 0, 1000)),
      obs("ospare", "spare", 0, 0),
    ];
    expect(list).toHaveLength(MAX_OBSERVATIONS);
    const r = ground(schema, list);
    if (!r.ok) throw new Error("failed");
    const everything = Array.from({ length: 32 }, (_, i) => `ob${pad(i)}`);
    expect(supportOf(r.grounding, fieldId(derivedIds[31] as string))).toStrictEqual({ ok: true, support: { lo: everything.slice(1), hi: everything } });
  });
});
