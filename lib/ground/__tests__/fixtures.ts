import { MAX_ID_LENGTH, MAX_MAGNITUDE, MAX_QUOTE_LENGTH, MAX_SOURCE_LENGTH } from "../../contracts/index.js";
import type { Bound, Extent } from "../../contracts/index.js";
import { oracleBaselines } from "./oracle.js";
import type { OField, OObs } from "./oracle.js";

/**
 * Shared test support for `lib/ground`: builders for the RAW (untrusted) shapes the engine reads, the canonical
 * order-desk scenario of plan section 7, the seeded generator the oracle and property tests run over, an
 * independent reference for observation intake, and small structural walkers (deep-frozen, every number).
 *
 * Nothing here imports `lib/ground`. The builders produce plain objects typed loosely on purpose: the engine takes
 * `unknown`, and a fixture that is a little wrong is the point of most of the tests.
 */

// ---------------------------------------------------------------------------------------------------------
// Seeded randomness (no new dependency: `mulberry32` is hand-rolled, as the plan says).
// ---------------------------------------------------------------------------------------------------------

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in `[lo, hi]`. */
export const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
export const chance = (rng: Rng, p: number): boolean => rng() < p;
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
/** A weighted choice: `weights[i]` is the weight of `i`. */
export function weighted(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let at = rng() * total;
  for (const [i, w] of weights.entries()) {
    at -= w;
    if (at < 0) return i;
  }
  return weights.length - 1;
}

// ---------------------------------------------------------------------------------------------------------
// Raw shapes and builders.
// ---------------------------------------------------------------------------------------------------------

export interface RawExtent {
  lo: Bound;
  hi: Bound;
}
export interface RawBase {
  kind: "base";
  id: string;
  label: string;
  unit: string;
  baseline: RawExtent;
}
export interface RawDerived {
  kind: "derived";
  id: string;
  label: string;
  unit: string;
  sum: string[];
}
export type RawField = RawBase | RawDerived;
export interface RawSchema {
  fields: RawField[];
}
export interface RawObservation {
  id: string;
  field: string;
  extent: RawExtent;
  quote: string;
  source: string;
}

export const base = (id: string, lo: Bound = 0, hi: Bound = null, unit = "days"): RawBase => ({ kind: "base", id, label: `${id} label`, unit, baseline: { lo, hi } });
export const derived = (id: string, sum: readonly string[], unit = "days"): RawDerived => ({ kind: "derived", id, label: `${id} label`, unit, sum: [...sum] });
export const schemaOf = (...fields: RawField[]): RawSchema => ({ fields });

/** A quote that contains every finite bound of the extent as a digit run, and nothing else numeric. */
export function quoteFor(lo: Bound, hi: Bound): string {
  if (lo !== null && hi !== null) return lo === hi ? `exactly ${Math.abs(lo)} days` : `between ${Math.abs(lo)} and ${Math.abs(hi)} days`;
  if (lo !== null) return `at least ${Math.abs(lo)} days`;
  if (hi !== null) return `at most ${Math.abs(hi)} days`;
  return "no figure given";
}

export function obs(id: string, field: string, lo: Bound, hi: Bound, quote: string = quoteFor(lo, hi), source = `source of ${id}`): RawObservation {
  return { id, field, extent: { lo, hi }, quote, source };
}

/** The oracle's view of a raw schema (which must be well-formed). */
export function oracleFields(schema: RawSchema): OField[] {
  return schema.fields.map((f) => (f.kind === "base" ? { id: f.id, baseline: { lo: f.baseline.lo, hi: f.baseline.hi } } : { id: f.id, sum: [...f.sum] }));
}

// ---------------------------------------------------------------------------------------------------------
// The canonical scenario of plan section 7.
// ---------------------------------------------------------------------------------------------------------

export const ORDER_DESK: RawSchema = schemaOf(base("packDays"), base("transitDays"), base("customsDays"), derived("deliveryDay", ["packDays", "transitDays", "customsDays"]));

export const CANON: Readonly<Record<"o1" | "o2" | "o3" | "o4", RawObservation>> = {
  o1: obs("o1", "packDays", 1, 2, "Packed and dispatched within 1 to 2 days of the order", "Warehouse system"),
  o2: obs("o2", "transitDays", 3, 5, "Standard international transit takes 3 to 5 days", "Carrier SLA sheet"),
  o3: obs("o3", "customsDays", 0, 2, "Customs clearance takes 0 to 2 days", "Customs bulletin"),
  o4: obs("o4", "deliveryDay", 14, 14, "Courier tracking estimates delivery on day 14", "Courier tracking page"),
};

export const canon = (...ids: ("o1" | "o2" | "o3" | "o4")[]): RawObservation[] => ids.map((id) => structuredClone(CANON[id]));

// ---------------------------------------------------------------------------------------------------------
// The generator: valid read-once schemas with observations, some of them deliberately faulty.
// ---------------------------------------------------------------------------------------------------------

const FIELD_NAMES = ["alpha", "bravo", "Charlie", "delta", "echo", "Foxtrot", "golf", "hotel", "_india", "juliet"];
const OBS_IDS = ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "a1", "z1", "0-direct", "z-direct", "Obs", "_k", "m9", "n10"];
/** Baselines the generator draws from: mostly `[0, inf)` (the plan's own), some finite, one point, one unbounded. */
const BASELINES: readonly RawExtent[] = [
  { lo: 0, hi: null },
  { lo: 0, hi: null },
  { lo: 0, hi: null },
  { lo: 0, hi: null },
  { lo: -2, hi: null },
  { lo: 0, hi: 6 },
  { lo: -3, hi: 3 },
  { lo: null, hi: 5 },
  { lo: 1, hi: 1 },
  { lo: null, hi: null },
];

export interface Instance {
  readonly schema: RawSchema;
  readonly observations: RawObservation[];
  /** Indexes of observations given a getter that throws (the generator's `hostile-input`). */
  readonly hostile: ReadonlySet<number>;
  readonly shape: { readonly bases: number; readonly rules: number; readonly levels: number; readonly trees: number };
}

function genExtent(rng: Rng, scale: number): RawExtent {
  const lo = int(rng, -1, scale);
  const hi = lo + int(rng, 0, scale);
  switch (weighted(rng, [14, 38, 18, 18, 4])) {
    case 0:
      return { lo, hi: lo };
    case 1:
      return { lo, hi };
    case 2:
      return { lo, hi: null };
    case 3:
      return { lo: null, hi };
    default:
      return { lo: null, hi: null };
  }
}

/**
 * One random instance: 2 to 4 base fields, 0 to 3 sum rules built read-once, 0 to 7 observations about any field, with 20% of instances seeded to
 * conflict (so cores of size 3 and 4 are not left to chance) and about 5% of observations corrupted in one way.
 * Field and observation ids come from pools in a random order, so id order and structure order are unrelated.
 */
export function genInstance(rng: Rng): Instance {
  const names = shuffled(rng, FIELD_NAMES);
  const ids = shuffled(rng, OBS_IDS);
  const nBases = pick(rng, [2, 2, 3, 3, 3, 4, 4]);
  const baseNames = names.slice(0, nBases);
  const derivedNames = names.slice(nBases);
  const fields: RawField[] = baseNames.map((id) => ({ ...base(id), baseline: { ...pick(rng, BASELINES) } }));

  const depth = new Map<string, number>(baseNames.map((id) => [id, 0]));
  let available = [...baseNames];
  let recent: string | undefined;
  const rules = nBases === 4 ? pick(rng, [0, 1, 1, 2, 2, 2, 3, 3]) : pick(rng, [0, 1, 1, 2, 2]);
  let made = 0;
  for (let r = 0; r < rules; r++) {
    if (available.length < 2) break;
    const want = Math.min(available.length, chance(rng, 0.3) ? 3 : 2);
    let chosen: string[];
    if (recent !== undefined && chance(rng, 0.75)) {
      const others = shuffled(rng, available.filter((id) => id !== recent)).slice(0, want - 1);
      chosen = [recent, ...others];
    } else chosen = shuffled(rng, available).slice(0, want);
    const name = derivedNames[made] as string;
    made += 1;
    fields.push({ ...derived(name, shuffled(rng, chosen)) });
    depth.set(name, 1 + Math.max(...chosen.map((id) => depth.get(id) as number)));
    available = available.filter((id) => !chosen.includes(id));
    available.push(name);
    recent = name;
  }
  const unitFor = (): string => (chance(rng, 0.85) ? "days" : "items");
  // one unit per tree, so every sum is within a unit
  const parentOf = new Map<string, string>();
  for (const f of fields) if (f.kind === "derived") for (const operand of f.sum) parentOf.set(operand, f.id);
  const rootOf = (id: string): string => {
    let at = id;
    for (let next = parentOf.get(at); next !== undefined; next = parentOf.get(at)) at = next;
    return at;
  };
  const unitByRoot = new Map<string, string>();
  for (const f of fields) {
    const root = rootOf(f.id);
    if (!unitByRoot.has(root)) unitByRoot.set(root, unitFor());
    f.unit = unitByRoot.get(root) as string;
  }
  const schema: RawSchema = { fields };

  const n = weighted(rng, [8, 12, 15, 17, 17, 13, 10, 8]);
  const observations: RawObservation[] = [];
  const allNames = fields.map((f) => f.id);
  let next = 0;
  for (let i = 0; i < n; i++) {
    const field = pick(rng, allNames);
    const isDerived = fields.find((f) => f.id === field)?.kind === "derived";
    const e = genExtent(rng, isDerived ? 9 : 5);
    observations.push(obs(ids[next++] as string, field, e.lo, e.hi));
  }
  if (chance(rng, 0.15)) {
    // Evidence-rich: every base field is observed on both sides, so supports of three and four observations are common.
    for (const name of baseNames) {
      if (next >= ids.length) break;
      const lo = int(rng, 0, 3);
      observations.push(obs(ids[next++] as string, name, lo, lo + int(rng, 0, 3)));
    }
  }
  if (chance(rng, 0.2)) {
    // Conflict seeding: pin a derived root high and every base leaf under it low, so the leaves cannot reach it.
    const roots = fields.filter((f) => f.kind === "derived" && !parentOf.has(f.id));
    if (roots.length > 0) {
      const root = pick(rng, roots);
      const leaves = fields.filter((f) => f.kind === "base" && rootOf(f.id) === root.id);
      const cap = int(rng, 0, 1);
      if (next + leaves.length + 1 <= ids.length) {
        observations.push(obs(ids[next++] as string, root.id, leaves.length * (cap + 1) + 3, null));
        for (const leaf of leaves) observations.push(obs(ids[next++] as string, leaf.id, null, cap));
      }
    }
  }

  const hostile = new Set<number>();
  observations.forEach((o, index) => {
    if (!chance(rng, 0.05)) return;
    switch (int(rng, 0, 7)) {
      case 0:
        if (observations.length > 1) o.id = (observations[(index + 1) % observations.length] as RawObservation).id;
        break;
      case 1:
        o.id = "";
        break;
      case 2:
        o.extent = { lo: 4, hi: 1 };
        break;
      case 3:
        o.field = "ghost";
        break;
      case 4:
        o.quote = "no figure here";
        break;
      case 5:
        o.quote = quoteFor(9, null);
        break;
      case 6:
        Object.defineProperty(o, "quote", {
          enumerable: true,
          get() {
            throw new Error("hostile getter");
          },
        });
        hostile.add(index);
        break;
      default:
        (o as unknown as { source: unknown }).source = 5;
        break;
    }
  });

  const trees = new Set(allNames.map(rootOf)).size;
  return { schema, observations, hostile, shape: { bases: nBases, rules: made, levels: Math.max(0, ...fields.map((f) => depth.get(f.id) ?? 0)), trees } };
}

/** Claims for the five-way coverage check: half random, half placed near the evidence-implied extent `e` (when there is one). */
export function genClaims(rng: Rng, fields: readonly string[], extents: ReadonlyMap<string, Extent | undefined>): { field: string; extent: Extent }[] {
  const out: { field: string; extent: Extent }[] = [];
  for (let i = 0; i < 4; i++) {
    const field = pick(rng, fields);
    const e = extents.get(field);
    if (e !== undefined && chance(rng, 0.6)) {
      const around = (b: Bound): Bound => (b === null ? (chance(rng, 0.6) ? null : int(rng, 0, 6)) : b + int(rng, -2, 2));
      let lo = chance(rng, 0.5) ? null : around(e.lo);
      let hi = chance(rng, 0.5) ? null : around(e.hi);
      if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
      out.push({ field, extent: { lo, hi } });
    } else {
      const x = genExtent(rng, 6);
      out.push({ field, extent: { lo: x.lo, hi: x.hi } });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// An independent reference for observation intake (plan section 4.1's precedence), for the table tests'
// "this fixture breaks only its own rule" check and for the generator's differential check.
// ---------------------------------------------------------------------------------------------------------

export type ObsRule = "duplicate-id" | "malformed" | "unknown-field" | "number-not-in-quote" | "outside-baseline";

const txt = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max;

/** An extent as a human would check it: an object whose sides are null or integers within the cap, `lo <= hi`. */
export function refExtent(v: unknown): Extent | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const { lo, hi } = v as { lo?: unknown; hi?: unknown };
  const side = (x: unknown): x is number | null => x === null || (typeof x === "number" && Number.isInteger(x) && Math.abs(x) <= MAX_MAGNITUDE);
  if (!side(lo) || !side(hi)) return undefined;
  if (lo !== null && hi !== null && lo > hi) return undefined;
  return { lo: lo === null ? null : lo + 0, hi: hi === null ? null : hi + 0 };
}

/** Every maximal ASCII-digit run in `quote`, as a `BigInt`. */
export function refDigitRuns(quote: string): bigint[] {
  return [...quote.matchAll(/[0-9]+/g)].map((m) => BigInt(m[0]));
}

/** The first finite bound (`lo` first) whose absolute value is no digit run of `quote`. */
export function refBoundNotInQuote(extent: Extent, quote: string): number | undefined {
  const runs = refDigitRuns(quote);
  for (const bound of [extent.lo, extent.hi]) {
    if (bound !== null && !runs.some((run) => run === BigInt(Math.abs(bound)))) return bound;
  }
  return undefined;
}

/** The shape problems of one raw observation, as property names, sorted. */
export function refMalformed(o: unknown): string[] {
  if (typeof o !== "object" || o === null || Array.isArray(o)) return ["extent", "field", "id", "quote", "source"];
  const r = o as Record<string, unknown>;
  const bad: string[] = [];
  if (!txt(r["id"], MAX_ID_LENGTH)) bad.push("id");
  if (!txt(r["field"], MAX_ID_LENGTH)) bad.push("field");
  if (refExtent(r["extent"]) === undefined) bad.push("extent");
  if (!txt(r["quote"], MAX_QUOTE_LENGTH)) bad.push("quote");
  if (!txt(r["source"], MAX_SOURCE_LENGTH)) bad.push("source");
  return bad.sort();
}

/**
 * Every rule this observation breaks, not only the first, given the ids that occur more than once and `B` of
 * every field. A rule whose precondition cannot be evaluated (the quote check on a malformed extent) is left out,
 * so a table row that breaks one rule has exactly that rule in this set.
 */
export function refViolations(o: unknown, repeated: ReadonlySet<string>, baseline: ReadonlyMap<string, Extent>): Set<ObsRule> {
  const out = new Set<ObsRule>();
  const bad = refMalformed(o);
  const r = typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  if (txt(r["id"], MAX_ID_LENGTH) && repeated.has(r["id"])) out.add("duplicate-id");
  if (bad.length > 0) out.add("malformed");
  const extent = refExtent(r["extent"]);
  if (txt(r["field"], MAX_ID_LENGTH) && !baseline.has(r["field"])) out.add("unknown-field");
  if (extent !== undefined && txt(r["quote"], MAX_QUOTE_LENGTH) && refBoundNotInQuote(extent, r["quote"]) !== undefined) out.add("number-not-in-quote");
  if (extent !== undefined && txt(r["field"], MAX_ID_LENGTH) && baseline.has(r["field"])) {
    const b = baseline.get(r["field"]) as Extent;
    const lo = Math.max(extent.lo ?? -Infinity, b.lo ?? -Infinity);
    const hi = Math.min(extent.hi ?? Infinity, b.hi ?? Infinity);
    if (lo > hi) out.add("outside-baseline");
  }
  return out;
}

export const OBS_RULE_ORDER: readonly ObsRule[] = ["duplicate-id", "malformed", "unknown-field", "number-not-in-quote", "outside-baseline"];

export interface RefVerdict {
  readonly index: number;
  /** `"accepted"`, the first rule broken, or `"hostile-input"`. */
  readonly verdict: "accepted" | ObsRule | "hostile-input";
}

/** The intake verdict of every observation, by the plan's precedence, from the oracle's own `B`. */
export function refIntake(schema: RawSchema, observations: readonly unknown[], hostile: ReadonlySet<number> = new Set()): { verdicts: RefVerdict[]; accepted: OObs[] } {
  const baseline = oracleBaselines(oracleFields(schema));
  const counts = new Map<string, number>();
  observations.forEach((o, index) => {
    if (hostile.has(index)) return;
    const id = (o as { id?: unknown } | null)?.id;
    if (txt(id, MAX_ID_LENGTH)) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const repeated = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  const verdicts: RefVerdict[] = [];
  const accepted: OObs[] = [];
  observations.forEach((o, index) => {
    if (hostile.has(index)) {
      verdicts.push({ index, verdict: "hostile-input" });
      return;
    }
    const broken = refViolations(o, repeated, baseline);
    const first = OBS_RULE_ORDER.find((rule) => broken.has(rule));
    verdicts.push({ index, verdict: first ?? "accepted" });
    if (first === undefined) {
      const r = o as RawObservation;
      accepted.push({ id: r.id, field: r.field, extent: refExtent(r.extent) as Extent });
    }
  });
  return { verdicts, accepted };
}

// ---------------------------------------------------------------------------------------------------------
// Structural walkers.
// ---------------------------------------------------------------------------------------------------------

/** Paths of every object or array reachable from `value` that is NOT frozen (empty when deeply frozen). */
export function unfrozenPaths(value: unknown, path = "$"): string[] {
  if (typeof value !== "object" || value === null) return [];
  const out = Object.isFrozen(value) ? [] : [path];
  for (const key of Object.keys(value)) out.push(...unfrozenPaths((value as Record<string, unknown>)[key], `${path}.${key}`));
  return out;
}

/** Every number reachable from `value`, with its path. */
export function numbersIn(value: unknown, path = "$"): { path: string; value: number }[] {
  if (typeof value === "number") return [{ path, value }];
  if (typeof value !== "object" || value === null) return [];
  return Object.keys(value).flatMap((key) => numbersIn((value as Record<string, unknown>)[key], `${path}.${key}`));
}

/** Every value reachable from `value` that is not plain data: a function, a Map, a Set, a symbol, `undefined`, a class instance. */
export function nonPlainPaths(value: unknown, path = "$"): string[] {
  if (value === null || typeof value === "string" || typeof value === "boolean") return [];
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (typeof value !== "object") return [path];
  const proto = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) ? proto === Array.prototype : proto === Object.prototype;
  const out = plain ? [] : [path];
  for (const key of Object.keys(value)) out.push(...nonPlainPaths((value as Record<string, unknown>)[key], `${path}.${key}`));
  return out;
}

/** A deep copy through JSON: plain data only, and a getter becomes a value. */
export const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isPlainRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** How many places differ between two values: a missing key counts one, extra array elements count one together, a different leaf counts one. */
export function leafDiff(a: unknown, b: unknown): number {
  if (Object.is(a, b)) return 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    // extra or missing trailing elements are one edit (an append or a truncation), the rest differ element by element
    let n = a.length === b.length ? 0 : 1;
    for (let i = 0; i < Math.min(a.length, b.length); i++) n += leafDiff(a[i], b[i]);
    return n;
  }
  if (isPlainRecord(a) && isPlainRecord(b)) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    let n = 0;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const inLeft = key in left;
      n += inLeft !== key in right ? 1 : leafDiff(left[key], right[key]);
    }
    return n;
  }
  return 1;
}

