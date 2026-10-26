import type { Bound, Extent } from "../../contracts/index.js";
import { oracleIsSubset, oracleMeet } from "../../extent/__tests__/fixtures.js";

/**
 * THE BRUTE-FORCE ORACLE for `lib/ground` (plan section 6, M4: "per tree, `E(f)` and `B(f)` equal a brute-force
 * enumeration of the tree's worlds for every field, including `conflicted` iff no world").
 *
 * It imports nothing from `lib/ground` and nothing from `lib/extent` except M3's own test oracle for set
 * relations between two extents (`oracleMeet`, `oracleIsSubset`, which list integers and call no library code). So an
 * answer here is never produced by the code it checks. It works on the plain shapes below, not on `Schema` or
 * `Observation`, so no brand, no `Grounding` and no engine type is needed to ask it a question.
 *
 * A WORLD is an integer for every base field of a tree, each inside the field's baseline and inside every
 * observation about it; the derived fields are then the sums of their operands, and each must lie inside every
 * observation about it. `E(f)` is the set of values `f` takes over all worlds, read as an extent. Nothing is
 * propagated: this is enumeration.
 *
 * AN UNBOUNDED SIDE cannot be listed whole, so base fields are listed inside a window `[-cap, cap]`, and a side
 * is `null` exactly when WIDENING the window moves the bound (the rule of `lib/extent/__tests__/fixtures.ts`, and
 * plan section 8 defect 9: "the oracle reaches its cap" misreports a finite bound that happens to equal the cap).
 * That rule is only right if the small window is wider than every finite bound that can occur, so `cap` is one
 * more than the SUM, over every (field, side), of the absolute value of the tightest finite constant among the
 * baseline and the observations. A finite bound found by propagation along a path of a read-once tree uses each
 * of those constants at most once, so it cannot exceed that sum. If this ever failed, a world would exist in the
 * large window and not in the small one (or the reverse) and `oracleTrees` THROWS rather than answer, so a
 * too-small window is loud and never a quiet wrong answer.
 */

/** A field as the oracle sees it: a base field has a `baseline`, a derived one a `sum`. */
export interface OField {
  readonly id: string;
  readonly baseline?: Extent;
  readonly sum?: readonly string[];
}

/** An observation as the oracle sees it. No id matters to a world; the id is only carried for reports. */
export interface OObs {
  readonly id: string;
  readonly field: string;
  readonly extent: Extent;
}

export interface OracleTree {
  /** The tree's field ids, ascending in code-unit order. */
  readonly fields: readonly string[];
  /** Some world satisfies everything. `false` is the oracle's meaning of "conflicted". */
  readonly exists: boolean;
  /** `E` per field; `undefined` when no world exists. */
  readonly extents: ReadonlyMap<string, Extent> | undefined;
  /** For every field, the values it takes over all worlds are every integer between the least and the greatest. */
  readonly contiguous: boolean;
  /** The small window's half-width. */
  readonly cap: number;
  /** Worlds listed in the large window: a measure of what asking cost. */
  readonly worlds: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The connected components of the sum rules, each ascending, ordered by smallest member. */
export function oracleComponents(fields: readonly OField[]): string[][] {
  const link = new Map<string, string>();
  const find = (x: string): string => {
    let at = x;
    for (let next = link.get(at); next !== undefined && next !== at; next = link.get(at)) at = next;
    return at;
  };
  for (const f of fields) link.set(f.id, f.id);
  for (const f of fields) for (const operand of f.sum ?? []) link.set(find(operand), find(f.id));
  const groups = new Map<string, string[]>();
  for (const f of fields) {
    const key = find(f.id);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [f.id]);
    else list.push(f.id);
  }
  return [...groups.values()].map((g) => g.sort(cmp)).sort((a, b) => cmp(a[0] as string, b[0] as string));
}

/** `1 +` the sum of |tightest finite constant| per (field, side): see the file header. */
function windowCap(defs: readonly OField[], observations: readonly OObs[]): number {
  let total = 1;
  for (const def of defs) {
    const lows: number[] = [];
    const highs: number[] = [];
    if (def.baseline !== undefined) {
      if (def.baseline.lo !== null) lows.push(def.baseline.lo);
      if (def.baseline.hi !== null) highs.push(def.baseline.hi);
    }
    for (const o of observations) {
      if (o.field !== def.id) continue;
      if (o.extent.lo !== null) lows.push(o.extent.lo);
      if (o.extent.hi !== null) highs.push(o.extent.hi);
    }
    if (lows.length > 0) total += Math.abs(Math.max(...lows));
    if (highs.length > 0) total += Math.abs(Math.min(...highs));
  }
  return total;
}

/** The values of a field take `distinct` different integers between `min` and `max`: some integer in between is missing. */
export function hasHole(distinct: number, min: number, max: number): boolean {
  return distinct !== max - min + 1;
}

export interface Reach {
  readonly count: number;
  readonly min: Float64Array;
  readonly max: Float64Array;
  readonly distinct: Int32Array;
}

/** Every world of one tree inside the window `[-cap, cap]` for base fields, with the least, greatest and number of distinct values of every field. */
function reach(bases: readonly OField[], derived: readonly OField[], order: readonly OField[], observations: readonly OObs[], cap: number): Reach {
  const total = bases.length + derived.length;
  const index = new Map<string, number>();
  order.forEach((f, i) => index.set(f.id, i));
  const min = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const max = new Float64Array(total).fill(Number.NEGATIVE_INFINITY);
  const distinct = new Int32Array(total);

  const lows = new Int32Array(bases.length);
  const highs = new Int32Array(bases.length);
  bases.forEach((f, j) => {
    let lo = -cap;
    let hi = cap;
    const b = f.baseline as Extent;
    if (b.lo !== null) lo = Math.max(lo, b.lo);
    if (b.hi !== null) hi = Math.min(hi, b.hi);
    for (const o of observations) {
      if (o.field !== f.id) continue;
      if (o.extent.lo !== null) lo = Math.max(lo, o.extent.lo);
      if (o.extent.hi !== null) hi = Math.min(hi, o.extent.hi);
    }
    lows[j] = lo;
    highs[j] = hi;
  });
  for (let j = 0; j < bases.length; j++) if ((lows[j] as number) > (highs[j] as number)) return { count: 0, min, max, distinct };

  const dlo = new Float64Array(derived.length).fill(Number.NEGATIVE_INFINITY);
  const dhi = new Float64Array(derived.length).fill(Number.POSITIVE_INFINITY);
  const operands: number[][] = derived.map((f, k) => {
    for (const o of observations) {
      if (o.field !== f.id) continue;
      if (o.extent.lo !== null) dlo[k] = Math.max(dlo[k] as number, o.extent.lo);
      if (o.extent.hi !== null) dhi[k] = Math.min(dhi[k] as number, o.extent.hi);
    }
    return (f.sum as readonly string[]).map((id) => index.get(id) as number);
  });

  const offset = bases.length * cap;
  const seen = order.map(() => new Uint8Array(2 * offset + 1));
  const vals = new Int32Array(total);
  for (let j = 0; j < bases.length; j++) vals[j] = lows[j] as number;
  let count = 0;
  for (;;) {
    let ok = true;
    for (let k = 0; k < derived.length; k++) {
      let sum = 0;
      for (const at of operands[k] as number[]) sum += vals[at] as number;
      if (sum < (dlo[k] as number) || sum > (dhi[k] as number)) {
        ok = false;
        break;
      }
      vals[bases.length + k] = sum;
    }
    if (ok) {
      count += 1;
      for (let f = 0; f < total; f++) {
        const v = vals[f] as number;
        if (v < (min[f] as number)) min[f] = v;
        if (v > (max[f] as number)) max[f] = v;
        const marks = seen[f] as Uint8Array;
        if (marks[v + offset] === 0) {
          marks[v + offset] = 1;
          distinct[f] = (distinct[f] as number) + 1;
        }
      }
    }
    let j = bases.length - 1;
    while (j >= 0) {
      if ((vals[j] as number) < (highs[j] as number)) {
        vals[j] = (vals[j] as number) + 1;
        break;
      }
      vals[j] = lows[j] as number;
      j--;
    }
    if (j < 0) break;
  }
  return { count, min, max, distinct };
}

/**
 * Answer for one tree (a connected component), given every field of the schema and every observation. `enumerate` is the
 * enumeration, and is a parameter only so that a test can hand the oracle a set with a hole and two windows that
 * disagree (no real input makes either happen), which is the only way to see those two checks fire through here.
 */
function oracleTree(all: readonly OField[], ids: readonly string[], observations: readonly OObs[], enumerate: typeof reach = reach): OracleTree {
  const defs = ids.map((id) => all.find((f) => f.id === id) as OField);
  const mine = observations.filter((o) => ids.includes(o.field));
  const bases = defs.filter((f) => f.baseline !== undefined);
  const derivedDefs = defs.filter((f) => f.sum !== undefined);
  // children before parents, so one pass computes every sum
  const derived: OField[] = [];
  const placed = new Set<string>();
  const place = (f: OField): void => {
    if (placed.has(f.id)) return;
    placed.add(f.id);
    for (const operand of f.sum ?? []) {
      const child = derivedDefs.find((d) => d.id === operand);
      if (child !== undefined) place(child);
    }
    derived.push(f);
  };
  for (const f of derivedDefs) place(f);
  const order = [...bases, ...derived];

  const cap = windowCap(defs, mine);
  const small = enumerate(bases, derived, order, mine, cap);
  const large = enumerate(bases, derived, order, mine, cap + 2);
  if ((small.count === 0) !== (large.count === 0)) {
    throw new Error(`the oracle's window ${cap} is too small: ${small.count} worlds inside it and ${large.count} inside the next one`);
  }
  const worldsInLarge = large.count;
  if (small.count === 0) return { fields: ids, exists: false, extents: undefined, contiguous: true, cap, worlds: worldsInLarge };

  const extents = new Map<string, Extent>();
  let contiguous = true;
  order.forEach((f, i) => {
    const lo: Bound = small.min[i] === large.min[i] ? (small.min[i] as number) : null;
    const hi: Bound = small.max[i] === large.max[i] ? (small.max[i] as number) : null;
    extents.set(f.id, { lo, hi });
    if (hasHole(small.distinct[i] as number, small.min[i] as number, small.max[i] as number)) contiguous = false;
  });
  return { fields: ids, exists: true, extents, contiguous, cap, worlds: worldsInLarge };
}

/** Every tree of the schema, by enumeration. `observations` may name fields of any tree. `enumerate` is for the oracle's own tests only. */
export function oracleTrees(fields: readonly OField[], observations: readonly OObs[], enumerate: typeof reach = reach): OracleTree[] {
  return oracleComponents(fields).map((ids) => oracleTree(fields, ids, observations, enumerate));
}

/** Only the tree that holds `field`. */
export function oracleTreeOf(fields: readonly OField[], observations: readonly OObs[], field: string): OracleTree {
  const ids = oracleComponents(fields).find((component) => component.includes(field));
  if (ids === undefined) throw new Error(`the oracle has no field ${field}`);
  return oracleTree(fields, ids, observations);
}

/** The schema-only extent `B` of every field: the oracle with no observation. */
export function oracleBaselines(fields: readonly OField[]): ReadonlyMap<string, Extent> {
  const out = new Map<string, Extent>();
  for (const tree of oracleTrees(fields, [])) for (const [id, extent] of tree.extents ?? []) out.set(id, extent);
  return out;
}

/**
 * A cheap upper bound on what asking costs, before asking: the number of worlds the large window would list for
 * the tree holding `field`, ignoring the derived constraints. Used to skip an instance a heavy property cannot afford.
 */
export function oracleCost(fields: readonly OField[], observations: readonly OObs[]): number {
  let worst = 0;
  for (const ids of oracleComponents(fields)) {
    const defs = ids.map((id) => fields.find((f) => f.id === id) as OField);
    const mine = observations.filter((o) => ids.includes(o.field));
    const cap = windowCap(defs, mine) + 2;
    let worlds = 1;
    for (const f of defs) {
      if (f.baseline === undefined) continue;
      let lo = -cap;
      let hi = cap;
      if (f.baseline.lo !== null) lo = Math.max(lo, f.baseline.lo);
      if (f.baseline.hi !== null) hi = Math.min(hi, f.baseline.hi);
      for (const o of mine) {
        if (o.field !== f.id) continue;
        if (o.extent.lo !== null) lo = Math.max(lo, o.extent.lo);
        if (o.extent.hi !== null) hi = Math.min(hi, o.extent.hi);
      }
      worlds *= Math.max(0, hi - lo + 1);
    }
    worst = Math.max(worst, worlds);
  }
  return worst;
}

/**
 * An upper bound on the worlds ANY subset of the observations makes the oracle list, before asking: every base field at
 * the widest its baseline allows inside the widest window any subset can have (the full set's). A subset can be far
 * costlier than the whole set, because dropping an upper bound on a field widens it to the window's edge while the
 * window stays wide, so `oracleCost` of the whole set says little about the support and core tests, which ask about
 * many subsets. The product is over the base fields of the most expensive tree.
 */
export function oracleWorstCost(fields: readonly OField[], observations: readonly OObs[]): number {
  let worst = 0;
  for (const ids of oracleComponents(fields)) {
    const defs = ids.map((id) => fields.find((f) => f.id === id) as OField);
    const mine = observations.filter((o) => ids.includes(o.field));
    const cap = windowCap(defs, mine) + 2;
    let worlds = 1;
    for (const f of defs) {
      if (f.baseline === undefined) continue;
      const lo = f.baseline.lo === null ? -cap : Math.max(-cap, f.baseline.lo);
      const hi = f.baseline.hi === null ? cap : Math.min(cap, f.baseline.hi);
      worlds *= Math.max(0, hi - lo + 1);
    }
    worst = Math.max(worst, worlds);
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------------------
// The five rulings of plan section 4.2, as set relations between E, B and C. Test-side only: M4 has no `rule`.
// ---------------------------------------------------------------------------------------------------------

export type Ruling = "entailed" | "weakened" | "contradicted" | "ungrounded" | "conflicted" | "vacuous";

/**
 * The plan's table for a claim `claim` about a field whose schema-only extent is `b` and whose evidence-implied
 * extent is `e` (`undefined` for a conflicted tree): `vacuous` when `b` is already inside `claim` (it rules
 * nothing out, so it never reaches the table); otherwise `conflicted`, `ungrounded` (`e = b`), `entailed` (`e`
 * inside `claim`), `contradicted` (no integer in both) or `weakened`, in the plan's precedence. The set relations
 * come from M3's brute-force test oracle, which lists integers.
 */
export function classify(e: Extent | undefined, b: Extent, claim: Extent): Ruling {
  if (oracleIsSubset(b, claim)) return "vacuous";
  if (e === undefined) return "conflicted";
  if (e.lo === b.lo && e.hi === b.hi) return "ungrounded";
  if (oracleIsSubset(e, claim)) return "entailed";
  if (oracleMeet(e, claim) === undefined) return "contradicted";
  return "weakened";
}

// ---------------------------------------------------------------------------------------------------------
// Support and core, restated with the oracle as the judge (plan D7), for the tests that check the engine's.
// ---------------------------------------------------------------------------------------------------------

/**
 * Deletion minimisation as plan D7 states it: try the smallest id first (code-unit order), keep a drop while
 * `holds` stays true of what is left. Written again here, so that the engine's `shrink` is compared with this
 * sentence and not with itself; `holds` is where the oracle comes in.
 */
export function oracleShrink(pool: readonly string[], holds: (subset: readonly string[]) => boolean): string[] {
  let kept = [...pool].sort(cmp);
  for (const id of [...kept]) {
    const without = kept.filter((other) => other !== id);
    if (holds(without)) kept = without;
  }
  return kept;
}

/** The observations that are about a field of the tree holding `field`. */
export function observationsInTreeOf(fields: readonly OField[], observations: readonly OObs[], field: string): OObs[] {
  const ids = oracleComponents(fields).find((component) => component.includes(field)) ?? [];
  return observations.filter((o) => ids.includes(o.field));
}

/** The oracle's bound on one side of `field`, using only the observations whose ids are in `keep`; `"conflict"` if none world. */
export function oracleBound(fields: readonly OField[], observations: readonly OObs[], keep: readonly string[], field: string, side: "lo" | "hi"): Bound | "conflict" {
  const tree = oracleTreeOf(fields, observations.filter((o) => keep.includes(o.id)), field);
  if (!tree.exists) return "conflict";
  return (tree.extents?.get(field) as Extent)[side];
}

/**
 * `oracleBound` with a memo: the oracle's answer for one tree under one set of kept observations is computed once and
 * serves every field and side of that tree. It is a pure speed-up; the answers are the same as asking each time.
 */
export function oracleBounds(fields: readonly OField[], observations: readonly OObs[]): (keep: readonly string[], field: string, side: "lo" | "hi") => Bound | "conflict" {
  const memo = new Map<string, OracleTree>();
  return (keep, field, side) => {
    const own = observationsInTreeOf(fields, observations, field).filter((o) => keep.includes(o.id));
    const root = (oracleComponents(fields).find((c) => c.includes(field)) as string[])[0];
    const key = `${root}|${own.map((o) => o.id).sort(cmp).join(",")}`;
    let tree = memo.get(key);
    if (tree === undefined) {
      tree = oracleTreeOf(fields, own, field);
      memo.set(key, tree);
    }
    if (!tree.exists) return "conflict";
    return (tree.extents?.get(field) as Extent)[side];
  };
}
