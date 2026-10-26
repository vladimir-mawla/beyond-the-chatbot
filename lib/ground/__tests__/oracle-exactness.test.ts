import { describe, expect, it } from "vitest";
import { MAX_FIELDS, MAX_OBSERVATIONS, MAX_OPERANDS, fieldId } from "../../contracts/index.js";
import type { Extent } from "../../contracts/index.js";
import { extentOf, ground, openEndsOf, readSchema, supportOf } from "../index.js";
import { constraintsOf, solve, structureOf, treesOf } from "../solve.js";
import { CANON, ORDER_DESK, base, canon, derived, genClaims, genInstance, mulberry32, obs, oracleFields, refIntake, schemaOf, shuffled } from "./fixtures.js";
import type { Instance, RawField, RawObservation, RawSchema } from "./fixtures.js";
import { classify, hasHole, oracleBaselines, oracleCost, oracleTrees } from "./oracle.js";
import type { OField, Reach, Ruling } from "./oracle.js";

/**
 * ORACLE EXACTNESS (plan section 6, M4, layer 2). Over a seeded generator (hand-rolled `mulberry32`, no new
 * dependency), per tree, for every field: `E(f)` and `B(f)` equal a brute-force enumeration of the tree's worlds
 * (`oracle.ts`), and a tree is `conflicted` exactly when it has no world. Value sets are contiguous (the interval
 * representation loses nothing), unboundedness is found by widening the window (M3's rule, recorded in
 * `oracle.ts`), and each observation's intake verdict equals the reference's (`refIntake`, whose `outside-baseline`
 * comes from the oracle's `B`).
 *
 * THE GENERATOR IS PROVEN ABLE TO REACH WHAT IT IS SAID TO REACH. Every instance adds to one tally, and the last
 * test asserts what the tally holds: trees of one, two and three levels, several trees in one schema, conflicted
 * trees and cores of size 2, 3 and 4, every intake fault, and, for four claims per instance, every precondition of
 * the plan's five rulings (plus the vacuous claim that never reaches them) as the oracle classifies them. It also
 * prints the depth reached, the largest core and the most worlds one oracle call listed. The chunks are separate
 * tests so that none of them is near a timeout; the coverage test needs all of them to have run, so it fails
 * loudly under a `-t` filter instead of passing on a partial tally.
 *
 * After the generated instances come hand-worked cases at the largest sizes the contracts allow, whose answers are
 * worked out by arithmetic in the test and not by the oracle (which cannot list 2**32 worlds): a 64-field schema
 * 31 levels deep with 64 observations, in three id orders chosen to make the order of propagation as awkward as it
 * gets, and an 8-operand sum; and the canonical scenario of plan section 7 at this layer.
 */

const CHUNKS = 160;
const PER_CHUNK = 50;
const TOTAL = CHUNKS * PER_CHUNK;
/**
 * An instance whose worlds the oracle would have to list more than this many times over is not asked: a handful of the
 * 8 000 cost half of all the oracle time (`oracleCost` is an upper bound on the worlds listed, before asking). Its intake
 * verdicts are still checked against the reference, and the number skipped is printed and bounded.
 */
const ORACLE_BUDGET = 200_000;

interface Tally {
  instances: number;
  trees: number;
  consistentTrees: number;
  conflictedTrees: number;
  levels: Map<number, number>;
  multiTree: number;
  cores: Map<number, number>;
  intake: Map<string, number>;
  rulings: Map<Ruling, number>;
  claims: number;
  maxWorlds: number;
  maxFieldsInTree: number;
  nonContiguous: number;
  withSupport: number;
  skippedForCost: number;
}
const tally: Tally = {
  instances: 0,
  trees: 0,
  consistentTrees: 0,
  conflictedTrees: 0,
  levels: new Map(),
  multiTree: 0,
  cores: new Map(),
  intake: new Map(),
  rulings: new Map(),
  claims: 0,
  maxWorlds: 0,
  maxFieldsInTree: 0,
  nonContiguous: 0,
  withSupport: 0,
  skippedForCost: 0,
};
const bump = <K>(map: Map<K, number>, key: K): void => void map.set(key, (map.get(key) ?? 0) + 1);

const same = (a: Extent, b: Extent): boolean => a.lo === b.lo && a.hi === b.hi;
const show = (e: Extent | undefined): string => (e === undefined ? "none" : `[${e.lo ?? "-inf"}, ${e.hi ?? "+inf"}]`);

/** Everything the engine says about one generated instance, against everything the oracle says. Returns what disagrees. */
function checkInstance(seed: number): string[] {
  const rng = mulberry32(seed);
  const inst: Instance = genInstance(rng);
  const problems: string[] = [];
  const result = ground(inst.schema, inst.observations);
  if (!result.ok) return [`seed ${seed}: ground failed: ${JSON.stringify(result.failure)}`];
  const g = result.grounding;

  // intake
  const ref = refIntake(inst.schema, inst.observations, inst.hostile);
  const refused = new Map(result.rejected.map((r) => [r.index, r.fault.kind] as const));
  for (const v of ref.verdicts) {
    const got = refused.get(v.index) ?? "accepted";
    if (got !== v.verdict) problems.push(`seed ${seed}: observation ${v.index} is ${got}, the reference says ${v.verdict}`);
    if (v.verdict !== "accepted") bump(tally.intake, v.verdict);
  }
  if (JSON.stringify(g.observations.map((o) => o.id)) !== JSON.stringify(ref.accepted.map((o) => o.id).sort())) problems.push(`seed ${seed}: the accepted ids differ`);

  // B and E, tree by tree
  const fields = oracleFields(inst.schema);
  const baselines = oracleBaselines(fields);
  for (const entry of g.baseline) {
    const b = baselines.get(entry.field);
    if (b === undefined || !same(b, entry.extent)) problems.push(`seed ${seed}: B(${entry.field}) is ${show(entry.extent)}, the oracle says ${show(b)}`);
  }
  if (g.baseline.length !== fields.length) problems.push(`seed ${seed}: baseline has ${g.baseline.length} entries for ${fields.length} fields`);

  tally.instances += 1;
  if (oracleCost(fields, ref.accepted) > ORACLE_BUDGET) {
    tally.skippedForCost += 1;
    return problems;
  }
  const oracle = oracleTrees(fields, ref.accepted);
  const extents = new Map<string, Extent | undefined>();
  tally.trees += oracle.length;
  if (oracle.length > 1) tally.multiTree += 1;
  bump(tally.levels, inst.shape.levels);
  for (const tree of oracle) {
    tally.maxWorlds = Math.max(tally.maxWorlds, tree.worlds);
    tally.maxFieldsInTree = Math.max(tally.maxFieldsInTree, tree.fields.length);
    if (!tree.contiguous) {
      tally.nonContiguous += 1;
      problems.push(`seed ${seed}: the values of a field in ${tree.fields.join(",")} are not contiguous`);
    }
    const mine = g.trees.find((t) => t.fields.includes(fieldId(tree.fields[0] as string)));
    if (mine === undefined) {
      problems.push(`seed ${seed}: no engine tree holds ${tree.fields[0]}`);
      continue;
    }
    if (JSON.stringify(mine.fields) !== JSON.stringify(tree.fields)) problems.push(`seed ${seed}: the engine's tree ${mine.fields.join(",")} is not the oracle's ${tree.fields.join(",")}`);
    if (!tree.exists) {
      tally.conflictedTrees += 1;
      if (mine.state.kind !== "conflicted") problems.push(`seed ${seed}: ${tree.fields.join(",")} has no world and the engine says consistent`);
      else bump(tally.cores, mine.state.core.length);
      for (const f of tree.fields) extents.set(f, undefined);
      continue;
    }
    tally.consistentTrees += 1;
    if (mine.state.kind !== "consistent") {
      problems.push(`seed ${seed}: ${tree.fields.join(",")} has a world and the engine says conflicted`);
      continue;
    }
    for (const entry of mine.state.extents) {
      const e = tree.extents?.get(entry.field);
      extents.set(entry.field, e);
      if (e === undefined || !same(e, entry.extent)) problems.push(`seed ${seed}: E(${entry.field}) is ${show(entry.extent)}, the oracle says ${show(e)}`);
    }
  }

  // extentOf agrees with the tree it reads
  for (const f of fields) {
    const read = extentOf(g, fieldId(f.id));
    const e = extents.get(f.id);
    if (e === undefined) {
      if (read.ok || read.failure.kind !== "conflicted") problems.push(`seed ${seed}: extentOf(${f.id}) should be conflicted`);
    } else if (!read.ok || !same(read.extent, e) || !same(read.baseline, baselines.get(f.id) as Extent)) problems.push(`seed ${seed}: extentOf(${f.id}) differs from the oracle`);
  }

  // the five rulings' preconditions, as the oracle and as the engine's extents classify four claims
  const claims = genClaims(rng, fields.map((f) => f.id), extents);
  for (const claim of claims) {
    const b = baselines.get(claim.field) as Extent;
    const want = classify(extents.get(claim.field), b, claim.extent);
    const read = extentOf(g, fieldId(claim.field));
    const got = classify(read.ok ? read.extent : undefined, read.ok ? read.baseline : b, claim.extent);
    if (got !== want) problems.push(`seed ${seed}: a claim on ${claim.field} classifies as ${got} from the engine's extents and ${want} from the oracle's`);
    bump(tally.rulings, want);
    tally.claims += 1;
  }
  return problems;
}

describe("the engine against brute-force world enumeration on generated instances", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: B, E, conflicted, contiguity, intake and the classification of four claims each`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) problems.push(...checkInstance(seed));
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("the generator reached what it is said to reach (needs every chunk above to have run)", () => {
    expect(tally.instances, "all chunks ran: do not filter this file with -t").toBe(TOTAL);
    const count = (map: Map<string | number, number>, key: string | number): number => map.get(key) ?? 0;
    const levels = tally.levels as Map<string | number, number>;
    const cores = tally.cores as Map<string | number, number>;
    const rulings = tally.rulings as Map<string | number, number>;
    const intake = tally.intake as Map<string | number, number>;
    const deepest = Math.max(...tally.levels.keys());
    const largestCore = Math.max(0, ...tally.cores.keys());
    console.log(
      [
        `oracle exactness: ${tally.instances} instances, ${tally.trees} trees (${tally.consistentTrees} consistent, ${tally.conflictedTrees} conflicted, ${tally.multiTree} instances with more than one tree), 0 mismatches asserted`,
        `levels (instances): ${[...tally.levels].sort(([a], [b]) => a - b).map(([k, v]) => `${k}: ${v}`).join(", ")}; deepest tree ${deepest} levels, most fields in one tree ${tally.maxFieldsInTree}`,
        `cores (trees): ${[...tally.cores].sort(([a], [b]) => a - b).map(([k, v]) => `size ${k}: ${v}`).join(", ")}; largest ${largestCore}`,
        `intake verdicts other than accepted: ${[...tally.intake].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`,
        `${tally.claims} claims: ${[...tally.rulings].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`,
        `the most worlds one tree listed in its larger window: ${tally.maxWorlds}; trees whose values were not contiguous: ${tally.nonContiguous}; instances not given to the oracle for cost: ${tally.skippedForCost}`,
      ].join("\n"),
    );
    expect(tally.nonContiguous).toBe(0);
    expect(tally.skippedForCost, "instances too costly for the oracle").toBeLessThanOrEqual(TOTAL * 0.01);
    expect(count(levels, 0), "instances with no sum rule").toBeGreaterThanOrEqual(300);
    expect(count(levels, 1), "one-level trees").toBeGreaterThanOrEqual(1000);
    expect(count(levels, 2), "two-level trees").toBeGreaterThanOrEqual(1000);
    expect(count(levels, 3), "three-level trees").toBeGreaterThanOrEqual(100);
    expect(deepest).toBe(3);
    expect(tally.multiTree, "instances with more than one tree").toBeGreaterThanOrEqual(1500);
    expect(tally.consistentTrees).toBeGreaterThanOrEqual(5000);
    expect(tally.conflictedTrees).toBeGreaterThanOrEqual(1000);
    for (const size of [2, 3, 4]) expect(count(cores, size), `cores of size ${size}`).toBeGreaterThanOrEqual(25);
    expect(largestCore, "the largest core the generator reached").toBeGreaterThanOrEqual(4);
    expect(tally.maxFieldsInTree, "the most fields in one generated tree").toBeGreaterThanOrEqual(6);
    for (const kind of ["duplicate-id", "malformed", "unknown-field", "number-not-in-quote", "outside-baseline", "hostile-input"]) expect(count(intake, kind), `intake fault ${kind}`).toBeGreaterThanOrEqual(25);
    for (const ruling of ["entailed", "weakened", "contradicted", "ungrounded", "conflicted", "vacuous"]) expect(count(rulings, ruling), `claims ruled ${ruling}`).toBeGreaterThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Hand-worked cases at the largest sizes the contracts allow.
// ---------------------------------------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * The deepest 64-field schema: bases b00 to b31, derived D1 = b0 + b1 and Dk = D(k-1) + bk up to D31, and a spare
 * base field alone in its own tree: 32 + 31 + 1 = 64 fields, a tree of 63 with 31 levels. `derivedIds[k]` is Dk's id.
 */
function deepest(derivedIds: readonly string[]): RawSchema {
  const fields: RawField[] = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), base("spare")];
  for (let k = 1; k <= 31; k++) fields.push(derived(derivedIds[k] as string, [k === 1 ? "b00" : (derivedIds[k - 1] as string), `b${pad(k)}`]));
  return schemaOf(...fields);
}

/** 64 observations: bi in [i, i+1] for 32 bases, D31 in [500, 510], D1..D30 in [0, 1000], and the spare in [0, 0]. */
function deepestObservations(derivedIds: readonly string[]): RawObservation[] {
  const out: RawObservation[] = [];
  for (let i = 0; i < 32; i++) out.push(obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1));
  out.push(obs("oroot", derivedIds[31] as string, 500, 510));
  for (let k = 1; k <= 30; k++) out.push(obs(`oloose${pad(k)}`, derivedIds[k] as string, 0, 1000));
  out.push(obs("ospare", "spare", 0, 0));
  return out;
}

/** Dk in closed form: with Fk = 0 + 1 + .. + k, Dk lies in [Fk + max(0, k - 27), Fk + min(k + 1, 14)]. */
const closedForm = (k: number): Extent => ({ lo: (k * (k + 1)) / 2 + Math.max(0, k - 27), hi: (k * (k + 1)) / 2 + Math.min(k + 1, 14) });

describe("hand-worked at the maximum: 64 fields, 64 observations, 31 levels, in three id orders", () => {
  const ids = (name: (k: number) => string): string[] => Array.from({ length: 32 }, (_, k) => name(k));
  const SCHEMES: readonly (readonly [string, string[]])[] = [
    ["ascending id order is bottom-up (children before parents)", ids((k) => `d${pad(k)}`)],
    ["ascending id order is top-down (parents before children)", ids((k) => `d${pad(99 - k)}`)],
    ["ascending id order is a shuffle of the levels", ids(((perm) => (k: number) => `q${pad(perm[k] as number)}`)(shuffled(mulberry32(7), Array.from({ length: 32 }, (_, k) => k))))],
  ];

  for (const [name, derivedIds] of SCHEMES) {
    it(`${name}: every field's extent is the closed form, and propagation settles within the plan's pass bound`, () => {
      expect(new Set(derivedIds.slice(1)).size, "31 distinct derived ids").toBe(31);
      const schema = deepest(derivedIds);
      const observations = deepestObservations(derivedIds);
      expect(schema.fields).toHaveLength(MAX_FIELDS);
      expect(observations).toHaveLength(MAX_OBSERVATIONS);
      const r = ground(schema, observations);
      if (!r.ok) throw new Error(JSON.stringify(r.failure));
      expect(r.rejected).toEqual([]);
      expect(r.grounding.observations).toHaveLength(MAX_OBSERVATIONS);
      expect(r.grounding.trees.map((t) => t.fields.length).sort((a, b) => a - b)).toEqual([1, 63]);

      for (let i = 0; i < 32; i++) expect(extentOf(r.grounding, fieldId(`b${pad(i)}`)), `b${pad(i)}`).toMatchObject({ ok: true, extent: { lo: i, hi: i + 1 } });
      for (let k = 1; k <= 31; k++) expect(extentOf(r.grounding, fieldId(derivedIds[k] as string)), `D${k}`).toMatchObject({ ok: true, extent: closedForm(k) });
      expect(extentOf(r.grounding, fieldId("spare"))).toMatchObject({ ok: true, extent: { lo: 0, hi: 0 } });
      // the root's bounds need only the root's own observation: nothing under it is in the support
      expect(supportOf(r.grounding, fieldId(derivedIds[31] as string))).toStrictEqual({ ok: true, support: { lo: ["oroot"], hi: ["oroot"] } });

      // propagation, run directly so its pass count can be seen
      const schemaRead = readSchema(schema);
      if (!schemaRead.ok) throw new Error("unreachable");
      const structure = structureOf(schemaRead.schema);
      const big = treesOf(structure).find((c) => c.members.length === 63);
      if (big === undefined) throw new Error("no tree of 63");
      const solved = solve(structure, big.members, constraintsOf(r.grounding.observations.filter((o) => big.members.includes(o.field))));
      if (solved.kind !== "consistent") throw new Error("conflicted");
      const bound = 4 * (63 + 1) + 8;
      console.log(`deepest tree, ${name}: ${solved.passes} passes (the bound is ${bound})`);
      expect(solved.passes).toBeLessThanOrEqual(bound);
    });
  }

  it("the same schema one field longer, and one observation more, is refused at the door", () => {
    const derivedIds = ids((k) => `d${pad(k)}`);
    const longer = deepest(derivedIds);
    longer.fields.push(base("one-too-many"));
    expect(readSchema(longer)).toStrictEqual({ ok: false, fault: { kind: "too-many-fields", count: 65, max: 64 } });
    const more = [...deepestObservations(derivedIds), obs("one-too-many", "spare", 0, 0)];
    expect(ground(deepest(derivedIds), more)).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: 65, max: 64 } });
  });
});

describe("hand-worked at the widest sum: MAX_OPERANDS operands", () => {
  const names = Array.from({ length: MAX_OPERANDS }, (_, i) => `w${i}`);
  const schema = schemaOf(...names.map((n) => base(n)), derived("total", names));

  it("total = w0 + .. + w7: bounds worked out by arithmetic, in both directions", () => {
    const observations = [...names.map((n, i) => obs(`u${i}`, n, i, i + 3)), obs("t", "total", 30, 40)];
    const r = ground(schema, observations);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    // forward: [0+..+7, 3+..+10] = [28, 52]; the total's own [30, 40] narrows it to [30, 40]
    expect(extentOf(r.grounding, fieldId("total"))).toMatchObject({ ok: true, extent: { lo: 30, hi: 40 } });
    // backward: wi.hi <= 40 - (sum of the others' lo) = 40 - (28 - i) = 12 + i, never below the own hi i + 3 for i <= 4; for i >= 5 it is 12 + i > i + 3, so unchanged
    // wi.lo >= 30 - (sum of the others' hi) = 30 - (52 - (i + 3)) = i - 19, never above the own lo i
    for (let i = 0; i < MAX_OPERANDS; i++) expect(extentOf(r.grounding, fieldId(`w${i}`)), `w${i}`).toMatchObject({ ok: true, extent: { lo: i, hi: i + 3 } });
  });

  it("a total pinned above what the operands can reach is a conflict whose core is every observation that matters", () => {
    const observations = [...names.map((n, i) => obs(`u${i}`, n, i, i + 3)), obs("t", "total", 53, 60)];
    const r = ground(schema, observations);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    // sum of the operands' upper bounds is 52 < 53: all eight upper bounds and the total are needed
    expect(r.grounding.trees[0]!.state).toStrictEqual({ kind: "conflicted", core: ["t", ...names.map((_, i) => `u${i}`)].sort() });
  });
});

// ---------------------------------------------------------------------------------------------------------
// The canonical scenario of plan section 7, at this layer.
// ---------------------------------------------------------------------------------------------------------

describe("the canonical scenario of plan section 7: E, support, open ends and cores, as the plan's table says", () => {
  const run = (...ids: ("o1" | "o2" | "o3" | "o4")[]) => {
    const r = ground(ORDER_DESK, canon(...ids));
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    expect(r.rejected).toEqual([]);
    return r.grounding;
  };
  const f = fieldId;

  it("step 1 (o1 o2): delivery is at least 4, lo supported by o1 o2, hi by nothing; the open end is customs from above", () => {
    const g = run("o1", "o2");
    expect(extentOf(g, f("deliveryDay"))).toStrictEqual({ ok: true, extent: { lo: 4, hi: null }, baseline: { lo: 0, hi: null } });
    expect(supportOf(g, f("deliveryDay"))).toStrictEqual({ ok: true, support: { lo: ["o1", "o2"], hi: [] } });
    expect(openEndsOf(g, f("deliveryDay"), ["hi"])).toStrictEqual([{ field: "customsDays", side: "hi" }]);
    expect(extentOf(g, f("packDays"))).toMatchObject({ extent: { lo: 1, hi: 2 } });
    expect(extentOf(g, f("transitDays"))).toMatchObject({ extent: { lo: 3, hi: 5 } });
    // customs is untouched: both sides are open ends (the draft "customs = 2" would be ungrounded)
    expect(extentOf(g, f("customsDays"))).toMatchObject({ extent: { lo: 0, hi: null }, baseline: { lo: 0, hi: null } });
    expect(openEndsOf(g, f("customsDays"), ["lo", "hi"])).toStrictEqual([{ field: "customsDays", side: "lo" }, { field: "customsDays", side: "hi" }]);
  });

  it("step 4 (o1 o2 o3): delivery [4, 9], lo from o1 o2 and hi from o1 o2 o3; customs [0, 2] has a floor with no support", () => {
    const g = run("o1", "o2", "o3");
    expect(extentOf(g, f("deliveryDay"))).toMatchObject({ ok: true, extent: { lo: 4, hi: 9 } });
    expect(supportOf(g, f("deliveryDay"))).toStrictEqual({ ok: true, support: { lo: ["o1", "o2"], hi: ["o1", "o2", "o3"] } });
    expect(supportOf(g, f("customsDays"))).toStrictEqual({ ok: true, support: { lo: [], hi: ["o3"] } });
    expect(openEndsOf(g, f("deliveryDay"), ["lo", "hi"])).toStrictEqual([]);
    expect(openEndsOf(g, f("customsDays"), ["lo", "hi"])).toStrictEqual([{ field: "customsDays", side: "lo" }]);
  });

  it("step 5 (o1 o2 o3 o4): conflicted, the core is all four; every pair and every triple of them is consistent, by the oracle and by the engine", () => {
    const g = run("o1", "o2", "o3", "o4");
    expect(g.trees[0]!.state).toStrictEqual({ kind: "conflicted", core: ["o1", "o2", "o3", "o4"] });
    expect(extentOf(g, f("deliveryDay"))).toStrictEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
    expect(openEndsOf(g, f("deliveryDay"), ["lo", "hi"])).toStrictEqual([]);

    const ids = ["o1", "o2", "o3", "o4"] as const;
    const subsets = (size: number): (typeof ids[number])[][] => {
      const out: (typeof ids[number])[][] = [];
      for (let mask = 0; mask < 16; mask++) {
        const chosen = ids.filter((_, bit) => (mask & (1 << bit)) !== 0);
        if (chosen.length === size) out.push(chosen);
      }
      return out;
    };
    let pairs = 0;
    let triples = 0;
    for (const [size, label] of [[2, "pair"], [3, "triple"]] as const) {
      for (const subset of subsets(size)) {
        const trees = oracleTrees(oracleFields(ORDER_DESK), subset.map((id) => ({ id, field: CANON[id].field, extent: CANON[id].extent })));
        expect(trees.every((t) => t.exists), `oracle: ${subset.join(" ")} is consistent`).toBe(true);
        expect(run(...subset).trees.every((t) => t.state.kind === "consistent"), `engine: ${label} ${subset.join(" ")}`).toBe(true);
        if (size === 2) pairs += 1;
        else triples += 1;
      }
    }
    expect([pairs, triples]).toEqual([6, 4]);
    const all = oracleTrees(oracleFields(ORDER_DESK), ids.map((id) => ({ id, field: CANON[id].field, extent: CANON[id].extent })));
    expect(all.some((t) => !t.exists), "oracle: the four together have no world").toBe(true);
  });

  it("step 6 (o1 o2 o4): customs is [7, 10], derived from three documents and written in none of them; delivery is exactly 14 on o4's say-so", () => {
    const g = run("o1", "o2", "o4");
    expect(extentOf(g, f("customsDays"))).toMatchObject({ ok: true, extent: { lo: 7, hi: 10 } });
    expect(supportOf(g, f("customsDays"))).toStrictEqual({ ok: true, support: { lo: ["o1", "o2", "o4"], hi: ["o1", "o2", "o4"] } });
    expect(extentOf(g, f("deliveryDay"))).toMatchObject({ extent: { lo: 14, hi: 14 } });
    expect(supportOf(g, f("deliveryDay"))).toStrictEqual({ ok: true, support: { lo: ["o4"], hi: ["o4"] } });
    expect(extentOf(g, f("packDays"))).toMatchObject({ extent: { lo: 1, hi: 2 } });
    expect(CANON.o1.quote).not.toMatch(/7|10/);
    for (const id of ["o1", "o2", "o4"] as const) expect(CANON[id].quote).not.toMatch(/\b10\b|\b7\b/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The oracle's own detectors and the plan's table, shown able to fire.
// ---------------------------------------------------------------------------------------------------------

describe("the oracle's own checks can fail, so that 'no mismatch' and 'no hole' mean something", () => {
  const A: OField[] = [{ id: "a", baseline: { lo: 0, hi: null } }];
  it("hasHole is true exactly when an integer between the least and greatest value is missing", () => {
    expect(hasHole(2, 0, 2)).toBe(true); // {0, 2}
    expect(hasHole(3, 0, 2)).toBe(false); // {0, 1, 2}
    expect(hasHole(1, 5, 5)).toBe(false);
    expect(hasHole(2, 5, 5)).toBe(true); // an impossible count is also refused
    expect(hasHole(4, -2, 1)).toBe(false);
    expect(hasHole(3, -2, 1)).toBe(true);
  });

  it("a set of values with a hole makes oracleTrees say not contiguous, through the call site", () => {
    const realistic = oracleTrees(A, [{ id: "o", field: "a", extent: { lo: 1, hi: 3 } }]);
    expect(realistic[0]?.contiguous).toBe(true);
    const holey = (): Reach => ({ count: 2, min: new Float64Array([0]), max: new Float64Array([2]), distinct: new Int32Array([2]) });
    expect(oracleTrees(A, [], holey)[0]?.contiguous).toBe(false);
  });

  it("windows that disagree about whether a world exists make it throw instead of answer", () => {
    let call = 0;
    const disagree = (): Reach => ({ count: call++ === 0 ? 1 : 0, min: new Float64Array([0]), max: new Float64Array([0]), distinct: new Int32Array([1]) });
    expect(() => oracleTrees(A, [], disagree)).toThrow(/too small/);
  });

  it("a side is unbounded exactly when widening the window moves it: [0, inf) has hi null, [0, 3] has hi 3, and a sum of two unbounded fields is unbounded above", () => {
    const sum: OField[] = [{ id: "a", baseline: { lo: 0, hi: null } }, { id: "b", baseline: { lo: 0, hi: null } }, { id: "t", sum: ["a", "b"] }];
    const e = oracleTrees(sum, [])[0]?.extents;
    expect(e?.get("a")).toEqual({ lo: 0, hi: null });
    expect(e?.get("t")).toEqual({ lo: 0, hi: null });
    const finite = oracleTrees(sum, [{ id: "o", field: "t", extent: { lo: null, hi: 3 } }])[0]?.extents;
    expect(finite?.get("a")).toEqual({ lo: 0, hi: 3 });
    expect(finite?.get("t")).toEqual({ lo: 0, hi: 3 });
    // negative unbounded below: a and b free, t pinned: each is unbounded on both sides
    const free: OField[] = [{ id: "a", baseline: { lo: null, hi: null } }, { id: "b", baseline: { lo: null, hi: null } }, { id: "t", sum: ["a", "b"] }];
    const pinned = oracleTrees(free, [{ id: "o", field: "t", extent: { lo: 0, hi: 0 } }])[0]?.extents;
    expect(pinned?.get("a")).toEqual({ lo: null, hi: null });
    expect(pinned?.get("t")).toEqual({ lo: 0, hi: 0 });
  });
});

describe("the plan's table of five rulings, by hand (section 4.2), as `classify` applies it", () => {
  const B = { lo: 0, hi: null };
  const rows: readonly (readonly [string, Extent | undefined, Extent, Extent, Ruling])[] = [
    ["a claim that B already satisfies rules nothing out", { lo: 4, hi: 9 }, B, { lo: 0, hi: null }, "vacuous"],
    ["vacuous outranks conflicted", undefined, B, { lo: null, hi: null }, "vacuous"],
    ["an unsatisfiable tree", undefined, B, { lo: null, hi: 3 }, "conflicted"],
    ["E equals B: the evidence has not moved the quantity", B, B, { lo: null, hi: 3 }, "ungrounded"],
    ["E inside the claim", { lo: 1, hi: 2 }, B, { lo: null, hi: 3 }, "entailed"],
    ["E equal to the claim where it is bounded", { lo: 0, hi: 3 }, B, { lo: null, hi: 3 }, "entailed"],
    ["E overlaps the claim and is not inside it", { lo: 2, hi: 6 }, B, { lo: null, hi: 3 }, "weakened"],
    ["E touches the claim at one integer", { lo: 3, hi: 9 }, B, { lo: null, hi: 3 }, "weakened"],
    ["E one past the claim", { lo: 4, hi: 9 }, B, { lo: null, hi: 3 }, "contradicted"],
    ["the plan's step 4: E = [4, 9], claim at most 12", { lo: 4, hi: 9 }, B, { lo: null, hi: 12 }, "entailed"],
    ["the plan's step 1: E = [4, inf), claim at most 12", { lo: 4, hi: null }, B, { lo: null, hi: 12 }, "weakened"],
    ["the plan's step 3: E = [4, inf), claim at most 3", { lo: 4, hi: null }, B, { lo: null, hi: 3 }, "contradicted"],
    ["a finite B: E = B is ungrounded", { lo: 0, hi: 10 }, { lo: 0, hi: 10 }, { lo: 0, hi: 5 }, "ungrounded"],
    ["a finite B inside the claim is vacuous", { lo: 0, hi: 4 }, { lo: 0, hi: 10 }, { lo: -1, hi: 10 }, "vacuous"],
  ];
  for (const [name, e, b, claim, want] of rows) {
    it(`${name}: ${want}`, () => expect(classify(e, b, claim)).toBe(want));
  }
});
