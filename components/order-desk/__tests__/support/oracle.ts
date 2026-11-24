/**
 * A brute-force oracle for the order desk, in plain data, importing nothing from `lib/` or `domains/` (so it cannot share a
 * bug with the engine). A WORLD is an integer for each of packDays, transitDays and customsDays in [0, CAP] (the schema's
 * baseline is >= 0), with deliveryDay their sum; it must lie inside every document's extent. The extent of a field is the
 * least and greatest value it takes over all worlds; an upper end is unbounded exactly when widening the window by one
 * moves it (the rule of `scripts/demo-order-desk.ts` and plan section 8, defect 9). The ruling table is the plan's, in its
 * precedence, from sets alone.
 */

export interface OExtent {
  readonly lo: number | null;
  readonly hi: number | null;
}
export interface ODoc extends OExtent {
  readonly field: string;
}

export const ORACLE_FIELDS: readonly string[] = ["packDays", "transitDays", "customsDays", "deliveryDay"];
/** Larger than every finite number any test here uses (the largest is 14, and the custom sweeps stay at or under 20). */
const CAP = 40;

function window(docs: readonly ODoc[], cap: number): { readonly min: number[]; readonly max: number[] } | undefined {
  const min = [Infinity, Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity, -Infinity];
  let any = false;
  for (let p = 0; p <= cap; p++) {
    for (let t = 0; t <= cap; t++) {
      for (let c = 0; c <= cap; c++) {
        const world = [p, t, c, p + t + c];
        const fits = docs.every((doc) => {
          const v = world[ORACLE_FIELDS.indexOf(doc.field)] as number;
          return (doc.lo === null || v >= doc.lo) && (doc.hi === null || v <= doc.hi);
        });
        if (!fits) continue;
        any = true;
        world.forEach((v, i) => {
          min[i] = Math.min(min[i] as number, v);
          max[i] = Math.max(max[i] as number, v);
        });
      }
    }
  }
  return any ? { min, max } : undefined;
}

export type OExtents = Record<string, OExtent>;

/** The extent of every field over all worlds, or `undefined` when there is no world (the documents conflict). */
export function oracleExtents(docs: readonly ODoc[]): OExtents | undefined {
  const small = window(docs, CAP);
  const large = window(docs, CAP + 1);
  if (small === undefined || large === undefined) {
    if (small !== large) throw new Error("oracle window too small: a world exists in one window only");
    return undefined;
  }
  const out: OExtents = {};
  ORACLE_FIELDS.forEach((field, i) => {
    out[field] = { lo: small.min[i] as number, hi: small.max[i] === large.max[i] ? (small.max[i] as number) : null };
  });
  return out;
}

const within = (inner: OExtent, outer: OExtent): boolean => (outer.lo === null || (inner.lo !== null && inner.lo >= outer.lo)) && (outer.hi === null || (inner.hi !== null && inner.hi <= outer.hi));
const disjoint = (a: OExtent, b: OExtent): boolean => (a.hi !== null && b.lo !== null && a.hi < b.lo) || (b.hi !== null && a.lo !== null && b.hi < a.lo);

export const BASELINE: OExtents = oracleExtents([]) as OExtents;

/** The plan's table from sets alone: vacuous (the baseline already satisfies the claim, even if the documents conflict); conflicted; ungrounded (E = B); entailed (E in C); contradicted; else weakened. */
export function oracleKind(extents: OExtents | undefined, field: string, claim: OExtent): string {
  const baseline = BASELINE[field] as OExtent;
  // A claim the schema alone already satisfies is refused before any ruling, whatever the evidence is (`readClaim`: it is judged for a conflicted tree too).
  if (within(baseline, claim)) return "vacuous";
  if (extents === undefined) return "conflicted";
  const e = extents[field] as OExtent;
  if (e.lo === baseline.lo && e.hi === baseline.hi) return "ungrounded";
  if (within(e, claim)) return "entailed";
  return disjoint(e, claim) ? "contradicted" : "weakened";
}
