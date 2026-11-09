import { describe, expect, it } from "vitest";
import { assertEntailmentWellFormed } from "../../contracts/index.js";
import type { Entailment, Extent } from "../../contracts/index.js";
import { oracleIsSubset, oracleMeet, oracleUnmetSides } from "../../extent/__tests__/fixtures.js";
import { classify, oracleBaselines, oracleBounds, oracleCost, oracleTrees, oracleWorstCost } from "../../ground/__tests__/oracle.js";
import type { Ruling } from "../../ground/__tests__/oracle.js";
import { refIntake } from "../../ground/__tests__/fixtures.js";
import { rule } from "../index.js";
import { base, derived, genClaims, genInstance, groundOf, mulberry32, obs, oracleFields, schemaOf } from "./fixtures.js";
import type { Instance, RawField, RawObservation, RawSchema } from "./fixtures.js";

/**
 * THE PARTITION PROPERTY AGAINST THE BRUTE-FORCE ORACLE (plan section 6, M5, layer 2): for every generated
 * (schema, snapshot, claim) the engine's kind equals the kind the oracle's set relations give, with the same generator
 * as M4's (`genInstance`, `genClaims`, 8 000 instances, four claims each, the oracle of `lib/ground/__tests__/oracle.ts`,
 * which lists worlds and calls no engine code) and a coverage test that says what was reached.
 *
 * For each claim, in addition to the kind:
 *  - THE PARTITION ITSELF, without the engine: the five rows of plan section 4.2 are evaluated from the oracle's E, B
 *    and C as predicates (`entailed`: E inside C; `weakened`: E and C overlap, E not inside C, E not B; `contradicted`:
 *    no integer in both; `ungrounded`: E = B; `conflicted`: no world) and EXACTLY ONE holds for every claim that is
 *    not vacuous, which is what "mutually exclusive and exhaustive" means; the engine's kind is that one.
 *  - `tested` is the claim, `established` is the oracle's E, `unmet` is the oracle's unmet sides, the support of each
 *    side re-derives that side's bound by the oracle (and is sorted, without repeats), a core is unsatisfiable and
 *    every strict subset of it is satisfiable by the oracle, and the open ends are the definition computed from the
 *    oracle's E and B (a bound has empty support exactly when E and B agree on it).
 *  - every ruling passes `assertEntailmentWellFormed` as returned.
 * Then two metamorphic checks (relabelling every `source`, and reversing the snapshot, change no ruling) and one
 * hand-worked case at the largest size the contracts allow.
 */

const CHUNKS = 320;
const PER_CHUNK = 25;
const TOTAL = CHUNKS * PER_CHUNK;
/** As in `lib/ground`'s oracle-exactness: an instance whose worlds the oracle would have to list more than this many times is not asked. */
const ORACLE_BUDGET = 200_000;
/** The support and core checks ask the oracle about many subsets; an instance whose worst subset costs more than this is skipped (and counted). */
const SUBSET_BUDGET = 60_000;

interface Tally {
  instances: number;
  claims: number;
  skippedForCost: number;
  skippedForSubsets: number;
  rulings: Map<Ruling, number>;
  levels: Map<number, number>;
  cores: Map<number, number>;
  weakenedNoGap: number;
  weakenedWithGap: number;
  weakenedUnmet: Map<string, number>;
  ungroundedEnds: Map<number, number>;
  withSupport: number;
  supportsChecked: number;
  coresChecked: number;
  openEndChecks: number;
  multiTree: number;
  ungroundedAndContradicted: number;
}
const tally: Tally = {
  instances: 0,
  claims: 0,
  skippedForCost: 0,
  skippedForSubsets: 0,
  rulings: new Map(),
  levels: new Map(),
  cores: new Map(),
  weakenedNoGap: 0,
  weakenedWithGap: 0,
  weakenedUnmet: new Map(),
  ungroundedEnds: new Map(),
  withSupport: 0,
  supportsChecked: 0,
  coresChecked: 0,
  openEndChecks: 0,
  multiTree: 0,
  ungroundedAndContradicted: 0,
};
const bump = <K>(map: Map<K, number>, key: K): void => void map.set(key, (map.get(key) ?? 0) + 1);
const same = (a: Extent, b: Extent): boolean => a.lo === b.lo && a.hi === b.hi;
const show = (e: Extent | undefined): string => (e === undefined ? "none" : `[${e.lo ?? "-inf"}, ${e.hi ?? "+inf"}]`);

/** The base fields at or below `field` in a raw (valid) schema, ascending. */
function leavesUnder(schema: RawSchema, field: string): string[] {
  const found: string[] = [];
  const visit = (id: string): void => {
    const f = schema.fields.find((candidate) => candidate.id === id) as RawField;
    if (f.kind === "base") found.push(id);
    else for (const operand of f.sum) visit(operand);
  };
  visit(field);
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const ROW_ORDER = ["conflicted", "ungrounded", "entailed", "contradicted", "weakened"] as const;

/**
 * The plan's section 4.2 "holds when" column, as predicates over the oracle's sets. For a non-vacuous claim at least one
 * is true, and exactly one is true EXCEPT when E = B and C shares no integer with B, where `ungrounded` and `contradicted`
 * both are: the table is a partition only in the plan's precedence order, which is what `rule` applies (ADR 0005, "Plan wording").
 */
function holds(e: Extent | undefined, b: Extent, c: Extent): Record<Exclude<Ruling, "vacuous">, boolean> {
  if (e === undefined) return { conflicted: true, ungrounded: false, entailed: false, contradicted: false, weakened: false };
  const overlap = oracleMeet(e, c) !== undefined;
  const inside = oracleIsSubset(e, c);
  const isB = same(e, b);
  return { conflicted: false, ungrounded: isB, entailed: inside, contradicted: !overlap, weakened: overlap && !inside && !isB };
}

function checkInstance(seed: number): string[] {
  const rng = mulberry32(seed);
  const inst: Instance = genInstance(rng);
  const problems: string[] = [];
  const result = groundOfInstance(inst);
  if (result === undefined) return [`seed ${seed}: ground failed`];
  const g = result;
  const ref = refIntake(inst.schema, inst.observations, inst.hostile);
  const fields = oracleFields(inst.schema);
  tally.instances += 1;
  if (oracleCost(fields, ref.accepted) > ORACLE_BUDGET) {
    tally.skippedForCost += 1;
    return problems;
  }
  const baselines = oracleBaselines(fields);
  const oracle = oracleTrees(fields, ref.accepted);
  if (oracle.length > 1) tally.multiTree += 1;
  bump(tally.levels, inst.shape.levels);
  const extents = new Map<string, Extent | undefined>();
  for (const tree of oracle) for (const f of tree.fields) extents.set(f, tree.extents?.get(f));

  const subsetsAffordable = oracleWorstCost(fields, ref.accepted) <= SUBSET_BUDGET;
  if (!subsetsAffordable) tally.skippedForSubsets += 1;
  const bound = oracleBounds(fields, ref.accepted);
  const acceptedIds = ref.accepted.map((o) => o.id);

  for (const claim of genClaims(rng, fields.map((f) => f.id), extents)) {
    const b = baselines.get(claim.field) as Extent;
    const e = extents.get(claim.field);
    const want = classify(e, b, claim.extent);
    tally.claims += 1;
    bump(tally.rulings, want);
    const label = `seed ${seed}: ${claim.field} ${show(claim.extent)} (E ${show(e)}, B ${show(b)})`;
    const got = rule(g, claim);

    if (want === "vacuous") {
      if (got.ok || got.fault.kind !== "vacuous-claim") problems.push(`${label}: should be a vacuous-claim fault, got ${JSON.stringify(got)}`);
      continue;
    }
    // the partition, from the oracle alone: some row holds, and the only two that ever hold together are ungrounded and
    // contradicted (E = B and C shares no integer with B); the plan's precedence picks the first of the rows that hold
    const rows = holds(e, b, claim.extent);
    const true_ = ROW_ORDER.filter((kind) => rows[kind]);
    if (true_.length === 2 && true_[0] === "ungrounded" && true_[1] === "contradicted") tally.ungroundedAndContradicted += 1;
    else if (true_.length !== 1) problems.push(`${label}: the plan's rows that hold are ${true_.join("+")}`);
    if (true_[0] !== want) problems.push(`${label}: the first row that holds, in the plan's precedence, is ${String(true_[0])}, classify says ${want}`);
    if (!got.ok) {
      problems.push(`${label}: a fault ${JSON.stringify(got.fault)}, the oracle says ${want}`);
      continue;
    }
    const ruling: Entailment = got.entailment;
    if (ruling.kind !== want) {
      problems.push(`${label}: ruled ${ruling.kind}, the oracle says ${want}`);
      continue;
    }
    if (!assertEntailmentWellFormed(ruling).ok) problems.push(`${label}: fails assertEntailmentWellFormed`);
    if (ruling.field !== claim.field || !same(ruling.tested, claim.extent)) problems.push(`${label}: field or tested differs from the claim`);

    switch (ruling.kind) {
      case "conflicted": {
        if (e !== undefined) problems.push(`${label}: conflicted but the oracle has a world`);
        bump(tally.cores, ruling.core.length);
        if (subsetsAffordable) {
          tally.coresChecked += 1;
          const tree = oracle.find((t) => t.fields.includes(claim.field));
          const inTree = ref.accepted.filter((o) => tree?.fields.includes(o.field));
          if (!ruling.core.every((id) => inTree.some((o) => o.id === id))) problems.push(`${label}: a core id is not an observation of the tree`);
          if (bound(ruling.core, claim.field, "lo") !== "conflict") problems.push(`${label}: the core is satisfiable by the oracle`);
          for (const id of ruling.core) if (bound(ruling.core.filter((x) => x !== id), claim.field, "lo") === "conflict") problems.push(`${label}: dropping ${id} from the core still conflicts, so it is not irreducible`);
        }
        break;
      }
      case "ungrounded": {
        bump(tally.ungroundedEnds, Math.min(ruling.openEnds.length, 4));
        if (!same(e as Extent, b)) problems.push(`${label}: ungrounded but E is not B`);
        checkOpenEnds(inst, claim.field, e as Extent, claim.extent, ruling.openEnds, extents, baselines, label, problems);
        break;
      }
      default: {
        // entailed, weakened, contradicted
        if (!same(ruling.established, e as Extent)) problems.push(`${label}: established ${show(ruling.established)} is not the oracle's E`);
        if (ruling.kind === "weakened") {
          if (same(ruling.established, claim.extent)) problems.push(`${label}: weakened emits E equal to the tested extent`);
          const unmet = oracleUnmetSides(e as Extent, claim.extent);
          if (JSON.stringify(ruling.unmet) !== JSON.stringify(unmet)) problems.push(`${label}: unmet ${JSON.stringify(ruling.unmet)}, the oracle says ${JSON.stringify(unmet)}`);
          bump(tally.weakenedUnmet, unmet.join("+"));
          if (ruling.openEnds.length === 0) tally.weakenedNoGap += 1;
          else tally.weakenedWithGap += 1;
          checkOpenEnds(inst, claim.field, e as Extent, claim.extent, ruling.openEnds, extents, baselines, label, problems);
        }
        if (ruling.kind === "entailed" && !oracleIsSubset(e as Extent, claim.extent)) problems.push(`${label}: entailed but E is not inside C`);
        if (ruling.kind === "contradicted" && oracleMeet(e as Extent, claim.extent) !== undefined) problems.push(`${label}: contradicted but E and C overlap`);
        for (const side of ["lo", "hi"] as const) {
          const ids = ruling.support[side];
          if (ids.length > 0) tally.withSupport += 1;
          if (JSON.stringify(ids) !== JSON.stringify([...new Set(ids)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))) problems.push(`${label}: support.${side} is not sorted without repeats`);
          if (!ids.every((id) => acceptedIds.includes(id))) problems.push(`${label}: support.${side} names an observation that was not accepted`);
          if (!subsetsAffordable) continue;
          tally.supportsChecked += 1;
          const rederived = bound(ids, claim.field, side);
          if (rederived !== (e as Extent)[side]) problems.push(`${label}: only support.${side} gives ${String(rederived)} on ${side}, E has ${String((e as Extent)[side])}`);
          if (ids.length === 0 && (e as Extent)[side] !== b[side]) problems.push(`${label}: support.${side} is empty and E differs from B there`);
          for (const id of ids) if (bound(ids.filter((x) => x !== id), claim.field, side) === (e as Extent)[side]) problems.push(`${label}: support.${side} is not irreducible: ${id} is not needed`);
        }
      }
    }
  }
  return problems;
}

/** Open ends by their definition, from the oracle's E and B: a bound has empty support exactly when E and B agree on that side. */
function checkOpenEnds(inst: Instance, field: string, e: Extent, c: Extent, listed: readonly { field: string; side: "lo" | "hi" }[], extents: ReadonlyMap<string, Extent | undefined>, baselines: ReadonlyMap<string, Extent>, label: string, problems: string[]): void {
  tally.openEndChecks += 1;
  const expected: { field: string; side: "lo" | "hi" }[] = [];
  for (const side of oracleUnmetSides(e, c)) {
    if (e[side] !== (baselines.get(field) as Extent)[side]) continue; // the field's own bound has a support: no gap on this side
    for (const leaf of leavesUnder(inst.schema, field)) {
      const el = extents.get(leaf) as Extent;
      if (el[side] === (baselines.get(leaf) as Extent)[side]) expected.push({ field: leaf, side });
    }
  }
  expected.sort((x, y) => (x.field < y.field ? -1 : x.field > y.field ? 1 : x.side === y.side ? 0 : x.side === "lo" ? -1 : 1));
  if (JSON.stringify(listed) !== JSON.stringify(expected)) problems.push(`${label}: open ends ${JSON.stringify(listed)}, the definition from the oracle gives ${JSON.stringify(expected)}`);
}

function groundOfInstance(inst: Instance) {
  try {
    return groundOf(inst.schema, inst.observations);
  } catch {
    return undefined;
  }
}

describe("the engine's ruling equals the oracle's on generated instances, and every field of it is checked", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: kind, tested, established, unmet, supports, cores and open ends of four claims each`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) problems.push(...checkInstance(seed));
      if (problems.length > 0) throw new Error(`${problems.length} problems, the first five:\n${problems.slice(0, 5).join("\n")}`);
    });
  }

  it("the generator reached what it is said to reach (needs every chunk above to have run)", () => {
    expect(tally.instances, "all chunks ran: do not filter this file with -t").toBe(TOTAL);
    const count = <K>(map: Map<K, number>, key: K): number => map.get(key) ?? 0;
    const deepest = Math.max(...tally.levels.keys());
    console.log(
      [
        `partition: ${tally.instances} instances (${tally.skippedForCost} not given to the oracle for cost, ${tally.skippedForSubsets} given to it but not for the subset checks), ${tally.claims} claims, ${tally.multiTree} instances with more than one tree`,
        `rulings by the oracle: ${[...tally.rulings].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`,
        `levels (instances): ${[...tally.levels].sort(([a], [b]) => a - b).map(([k, v]) => `${k}: ${v}`).join(", ")}; deepest ${deepest}`,
        `cores checked ${tally.coresChecked}, sizes: ${[...tally.cores].sort(([a], [b]) => a - b).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
        `supports checked ${tally.supportsChecked} (${tally.withSupport} sides with a non-empty support)`,
        `weakened: ${tally.weakenedNoGap} with no open end, ${tally.weakenedWithGap} with some; unmet ${[...tally.weakenedUnmet].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`,
        `claims on which two of the plan's rows hold (ungrounded and contradicted, ruled ungrounded by precedence): ${tally.ungroundedAndContradicted}`,
        `ungrounded by number of open ends (4 = four or more): ${[...tally.ungroundedEnds].sort(([a], [b]) => a - b).map(([k, v]) => `${k}: ${v}`).join(", ")}; open-end checks ${tally.openEndChecks}`,
      ].join("\n"),
    );
    expect(tally.skippedForCost, "instances too costly for the oracle").toBeLessThanOrEqual(TOTAL * 0.01);
    expect(tally.skippedForSubsets, "instances too costly for the subset checks").toBeLessThanOrEqual(TOTAL * 0.08);
    for (const kind of ["entailed", "weakened", "contradicted", "ungrounded", "conflicted", "vacuous"] as const) expect(count(tally.rulings, kind), `claims the oracle classifies ${kind}`).toBeGreaterThanOrEqual(500);
    expect(deepest).toBe(3);
    for (const levels of [0, 1, 2, 3]) expect(count(tally.levels, levels), `instances of ${levels} levels`).toBeGreaterThanOrEqual(100);
    for (const size of [2, 3, 4]) expect(count(tally.cores, size), `conflicted rulings with a core of ${size}`).toBeGreaterThanOrEqual(20);
    expect(tally.coresChecked).toBeGreaterThanOrEqual(1500);
    expect(tally.supportsChecked).toBeGreaterThanOrEqual(8000);
    expect(tally.withSupport).toBeGreaterThanOrEqual(5000);
    expect(tally.weakenedNoGap, "weakened rulings that name no gap").toBeGreaterThanOrEqual(200);
    expect(tally.weakenedWithGap, "weakened rulings that name a gap").toBeGreaterThanOrEqual(200);
    for (const unmet of ["lo", "hi", "lo+hi"]) expect(count(tally.weakenedUnmet, unmet), `weakened with unmet ${unmet}`).toBeGreaterThanOrEqual(100);
    expect(count(tally.ungroundedEnds, 1), "ungrounded with one open end").toBeGreaterThanOrEqual(100);
    expect(count(tally.ungroundedEnds, 2), "ungrounded with two open ends").toBeGreaterThanOrEqual(100);
    expect([...tally.ungroundedEnds.keys()].some((n) => n >= 3), "ungrounded with three or more open ends").toBe(true);
    expect(tally.multiTree).toBeGreaterThanOrEqual(1500);
    expect(tally.ungroundedAndContradicted, "claims on which two rows hold and precedence decides").toBeGreaterThanOrEqual(20);
  });
});

describe("two metamorphic checks on 300 generated instances: relabelling every source and reversing the snapshot change no ruling", () => {
  const rulingsFor = (schema: unknown, observations: unknown, claims: readonly { field: string; extent: Extent }[]): unknown[] => {
    const g = groundOf(schema, observations);
    return claims.map((c) => rule(g, c));
  };
  const seen = { instances: 0, rulings: 0 };
  for (let chunk = 0; chunk < 6; chunk++) {
    it(`seeds ${chunk * 50 + 1} to ${chunk * 50 + 50}`, () => {
      for (let seed = chunk * 50 + 1; seed < chunk * 50 + 51; seed++) {
        const rng = mulberry32(seed);
        const inst = genInstance(rng);
        const claims = genClaims(rng, inst.schema.fields.map((f) => f.id), new Map());
        const plain = inst.observations.filter((_, i) => !inst.hostile.has(i));
        // only a source that is already a valid string is renamed (to another valid string): an invalid source is refused at intake, which is not a ruling depending on a label
        const relabelled = plain.map((o, i): RawObservation => (typeof o.source === "string" && o.source.length >= 1 && o.source.length <= 64 ? { ...o, source: `relabelled ${i}` } : o));
        const want = rulingsFor(inst.schema, plain, claims);
        expect(rulingsFor(inst.schema, relabelled, claims), `seed ${seed} relabelled`).toStrictEqual(want);
        expect(rulingsFor(inst.schema, [...plain].reverse(), claims), `seed ${seed} reversed`).toStrictEqual(want);
        seen.instances += 1;
        seen.rulings += want.length * 3;
      }
    });
  }
  it("they ran on 300 instances (needs every chunk above to have run)", () => {
    expect(seen.instances, "all chunks ran: do not filter this file with -t").toBe(300);
  });
});

describe("hand-worked at the largest size the contracts allow: 64 fields, 64 observations, a tree of 63 fields 31 levels deep", () => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fields: RawField[] = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), base("spare")];
  for (let k = 1; k <= 31; k++) fields.push(derived(`d${pad(k)}`, [k === 1 ? "b00" : `d${pad(k - 1)}`, `b${pad(k)}`]));
  const schema: RawSchema = schemaOf(...fields);
  // bi in [i, i+1] for 32 bases; D1..D30 loosely in [0, 1000] (they move nothing); the spare in [0, 0]: 32 + 30 + 1 = 63 observations, plus one more loose one on D31
  const observations: RawObservation[] = [];
  for (let i = 0; i < 32; i++) observations.push(obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1));
  for (let k = 1; k <= 30; k++) observations.push(obs(`ol${pad(k)}`, `d${pad(k)}`, 0, 1000));
  observations.push(obs("ospare", "spare", 0, 0));
  observations.push(obs("oroot", "d31", 0, 1000));
  const g = groundOf(schema, observations);
  const every = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `ob${pad(from + i)}`);

  it("the instance is at the maximum: 64 fields and 64 observations, all accepted", () => {
    expect(schema.fields).toHaveLength(64);
    expect(observations).toHaveLength(64);
    expect(g.observations).toHaveLength(64);
    expect(g.trees).toHaveLength(2);
  });

  // by arithmetic: D31 = b00 + .. + b31, each bi in [i, i + 1], so D31 in [0 + 1 + .. + 31, 1 + 2 + .. + 32] = [496, 528]
  it("D31 is [496, 528] by arithmetic; the upper bound needs all 32 base observations and the lower needs 31, since b00's lower bound is the floor", () => {
    expect(rule(g, { field: "d31", extent: { lo: null, hi: 528 } })).toStrictEqual({
      ok: true,
      entailment: { kind: "entailed", field: "d31", tested: { lo: null, hi: 528 }, established: { lo: 496, hi: 528 }, support: { lo: every(1, 31), hi: every(0, 31) } },
    });
  });
  it("one past each bound at the maximum: 'D31 <= 527' and 'D31 >= 497' are weakened with the cut named, '<= 495' and '>= 529' are contradicted", () => {
    const kinds = [
      [{ lo: null, hi: 527 }, "weakened"],
      [{ lo: 497, hi: null }, "weakened"],
      [{ lo: null, hi: 495 }, "contradicted"],
      [{ lo: 529, hi: null }, "contradicted"],
      [{ lo: null, hi: 528 }, "entailed"],
      [{ lo: 496, hi: null }, "entailed"],
    ] as const;
    for (const [extent, kind] of kinds) {
      const r = rule(g, { field: "d31", extent });
      expect(r.ok && r.entailment.kind, JSON.stringify(extent)).toBe(kind);
    }
    const weak = rule(g, { field: "d31", extent: { lo: null, hi: 527 } });
    expect(weak.ok && weak.entailment.kind === "weakened" && weak.entailment.unmet).toStrictEqual(["hi"]);
    expect(weak.ok && weak.entailment.kind === "weakened" && weak.entailment.openEnds).toStrictEqual([]);
  });
  it("an intermediate field: D16 is [136, 153] (b00 to b16 sum to 0 + 1 + .. + 16 = 136 at the floor, and one more per operand at the ceiling, 17), and the spare field is its own tree", () => {
    const r = rule(g, { field: "d16", extent: { lo: 137, hi: null } });
    expect(r.ok && r.entailment.kind === "weakened" && r.entailment.established).toStrictEqual({ lo: 136, hi: 153 });
    const spare = rule(g, { field: "spare", extent: { lo: 1, hi: null } });
    expect(spare.ok && spare.entailment.kind).toBe("contradicted");
  });
  it("the same instance with the root's observation made a conflict: every field of the tree is conflicted, the spare is not", () => {
    const squeezed = groundOf(schema, [...observations.filter((o) => o.id !== "oroot"), obs("oroot", "d31", 600, null)]);
    const r = rule(squeezed, { field: "d31", extent: { lo: null, hi: 700 } });
    expect(r.ok && r.entailment.kind).toBe("conflicted");
    const core = r.ok && r.entailment.kind === "conflicted" ? r.entailment.core : [];
    expect(core.length).toBeGreaterThan(1);
    const spare = rule(squeezed, { field: "spare", extent: { lo: 1, hi: null } });
    expect(spare.ok && spare.entailment.kind).toBe("contradicted");
  });
});
