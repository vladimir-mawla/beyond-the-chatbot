import { describe, expect, it } from "vitest";
import { fieldId } from "../../contracts/index.js";
import type { Extent } from "../../contracts/index.js";
import { gridExtents, GRID_VALUES, oracleIsSubset } from "../../extent/__tests__/fixtures.js";
import { extentOf, ground } from "../index.js";
import { CANON, ORDER_DESK, canon, genClaims, genInstance, mulberry32, obs, oracleFields } from "./fixtures.js";
import { classify, oracleBaselines } from "./oracle.js";
import type { Ruling } from "./oracle.js";

/**
 * MONOTONICITY (plan section 6, M4, layer 3): adding an observation either leaves `E` inside the old `E` or makes
 * the tree conflicted, and never un-conflicts it; `entailed` and `contradicted` rulings never move to a
 * non-conflicted different kind.
 *
 * How it is checked: each generated snapshot is grounded as a growing prefix, one observation at a time, and every
 * step is compared with the one before. An observation intake refuses leaves the grounding unchanged, which is
 * checked too. The rulings are the plan's table applied to the extents (`classify` in `oracle.ts`), for four
 * claims per instance.
 *
 * THE PROPERTY IS ABOUT OBSERVATIONS WITH A FRESH ID. Adding an observation whose id is already on an earlier one
 * does NOT narrow anything: intake refuses EVERY occurrence of a repeated id (so that input order cannot choose a
 * winner), which takes the earlier observation out of the snapshot and can widen `E` or turn a conflicted tree consistent. The plan states
 * monotonicity without that exception (section 2.3: "more observations only narrow `established`, or turn the
 * tree `conflicted` -- never widen it"); the first run of this file found it, on a generated instance (the generator
 * has changed since, so no seed number is quoted). Those steps are counted, not compared, and the last describe block
 * below pins one by hand.
 *
 * What is not shown: monotonicity over every order of adding (a prefix chain is one order per instance, and
 * `order-independence.test.ts` shows the final answer does not depend on the order).
 */

/** `a` is inside `b`, written out here independently of `lib/extent` and cross-checked against M3's brute-force oracle below. */
const inside = (a: Extent, b: Extent): boolean => (b.lo === null || (a.lo !== null && a.lo >= b.lo)) && (b.hi === null || (a.hi !== null && a.hi <= b.hi));

describe("the inline `inside` is right (it is what the property below leans on)", () => {
  it("it agrees with M3's brute-force test oracle on all 34 x 34 pairs of the grid", () => {
    const grid = gridExtents(GRID_VALUES);
    let checked = 0;
    for (const a of grid) {
      for (const b of grid) {
        expect(inside(a, b), `${JSON.stringify(a)} in ${JSON.stringify(b)}`).toBe(oracleIsSubset(a, b));
        checked += 1;
      }
    }
    expect(checked).toBe(34 * 34);
  });
});

const ALLOWED: Readonly<Record<string, readonly Ruling[]>> = {
  entailed: ["entailed", "conflicted"],
  contradicted: ["contradicted", "conflicted"],
  conflicted: ["conflicted"],
};

interface Seen {
  steps: number;
  repeatedIdSteps: number;
  accepted: number;
  refusedSteps: number;
  narrowed: number;
  intoConflict: number;
  transitions: Map<string, number>;
}
const seen: Seen = { steps: 0, repeatedIdSteps: 0, accepted: 0, refusedSteps: 0, narrowed: 0, intoConflict: 0, transitions: new Map() };
const CHUNKS = 50;
const PER_CHUNK = 80;

function check(seed: number): string[] {
  const rng = mulberry32(seed);
  const inst = genInstance(rng);
  const problems: string[] = [];
  const fields = oracleFields(inst.schema).map((f) => f.id);
  const baselines = oracleBaselines(oracleFields(inst.schema));
  const claims = genClaims(rng, fields, new Map());

  const stateAt = (k: number) => {
    const r = ground(inst.schema, inst.observations.slice(0, k));
    if (!r.ok) throw new Error(`seed ${seed}: ground failed at ${k}`);
    return r;
  };
  const view = (k: number) => {
    const r = stateAt(k);
    return { r, extents: new Map(fields.map((f) => [f, extentOf(r.grounding, fieldId(f))] as const)) };
  };

  const idsBefore = (k: number): Set<string> => new Set(inst.observations.slice(0, k - 1).flatMap((o) => (typeof o.id === "string" ? [o.id] : [])));
  let before = view(0);
  for (let k = 1; k <= inst.observations.length; k++) {
    const after = view(k);
    seen.steps += 1;
    const added = inst.observations[k - 1]?.id;
    if (typeof added === "string" && idsBefore(k).has(added)) {
      seen.repeatedIdSteps += 1; // not monotone, by design: see the header
      before = after;
      continue;
    }
    const refused = after.r.rejected.length > before.r.rejected.length;
    if (refused) {
      seen.refusedSteps += 1;
      // a refused observation changes nothing in what the engine knows about the others
      if (JSON.stringify(after.r.grounding.trees) !== JSON.stringify(before.r.grounding.trees)) problems.push(`seed ${seed}, step ${k}: a refused observation changed a tree`);
    } else seen.accepted += 1;

    for (const f of fields) {
      const was = before.extents.get(f);
      const now = after.extents.get(f);
      if (was === undefined || now === undefined) continue;
      if (!was.ok && now.ok) problems.push(`seed ${seed}, step ${k}: ${f} was conflicted and is consistent again`);
      if (was.ok && now.ok) {
        if (!inside(now.extent, was.extent)) problems.push(`seed ${seed}, step ${k}: E(${f}) widened from ${JSON.stringify(was.extent)} to ${JSON.stringify(now.extent)}`);
        if (JSON.stringify(now.extent) !== JSON.stringify(was.extent)) seen.narrowed += 1;
        if (JSON.stringify(now.baseline) !== JSON.stringify(was.baseline)) problems.push(`seed ${seed}: B(${f}) moved when an observation was added`);
      }
      if (was.ok && !now.ok) seen.intoConflict += 1;
    }
    for (const claim of claims) {
      const was = before.extents.get(claim.field);
      const now = after.extents.get(claim.field);
      if (was === undefined || now === undefined) continue;
      const b = baselines.get(claim.field) as Extent;
      const rulingBefore = classify(was.ok ? was.extent : undefined, b, claim.extent);
      const rulingNow = classify(now.ok ? now.extent : undefined, b, claim.extent);
      const key = `${rulingBefore} -> ${rulingNow}`;
      seen.transitions.set(key, (seen.transitions.get(key) ?? 0) + 1);
      const allowed = ALLOWED[rulingBefore];
      if (allowed !== undefined && !allowed.includes(rulingNow)) problems.push(`seed ${seed}, step ${k}: a ${rulingBefore} claim on ${claim.field} became ${rulingNow}`);
      if (rulingBefore === "vacuous" && rulingNow !== "vacuous") problems.push(`seed ${seed}: a vacuous claim stopped being vacuous`);
    }
    before = after;
  }
  return problems;
}

describe("on the generated instances, adding an observation with a fresh id never widens E, never un-conflicts a tree, and never moves an entailed or contradicted ruling to a different consistent one", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) problems.push(...check(seed));
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("every branch of the property was reached (needs every chunk above to have run)", () => {
    const count = (key: string): number => seen.transitions.get(key) ?? 0;
    console.log(
      `monotonicity: ${seen.steps} steps (${seen.repeatedIdSteps} repeated an earlier id and were not compared; of the rest ${seen.accepted} added an accepted observation and ${seen.refusedSteps} a refused one), ${seen.narrowed} field-extents narrowed, ${seen.intoConflict} field-extents turned conflicted\n` +
        `ruling moves: ${[...seen.transitions].sort().map(([k, v]) => `${k}: ${v}`).join(", ")}`,
    );
    expect(seen.steps, "all chunks ran: do not filter this file with -t").toBeGreaterThanOrEqual(CHUNKS * PER_CHUNK * 2);
    expect(seen.repeatedIdSteps).toBeGreaterThanOrEqual(50);
    expect(seen.accepted).toBeGreaterThanOrEqual(8000);
    expect(seen.refusedSteps).toBeGreaterThanOrEqual(1000);
    expect(seen.narrowed).toBeGreaterThanOrEqual(5000);
    expect(seen.intoConflict).toBeGreaterThanOrEqual(1500);
    for (const key of ["entailed -> entailed", "entailed -> conflicted", "contradicted -> contradicted", "contradicted -> conflicted", "conflicted -> conflicted"]) {
      expect(count(key), key).toBeGreaterThanOrEqual(100);
    }
    // the moves the property rules out, which therefore must never have been counted
    for (const key of seen.transitions.keys()) {
      const [from, to] = key.split(" -> ") as [string, Ruling];
      expect(ALLOWED[from]?.includes(to) ?? true, key).toBe(true);
    }
  });
});

describe("hand-worked on the order desk: each added document narrows, then the fourth conflicts and nothing comes back", () => {
  const delivery = (...ids: ("o1" | "o2" | "o3" | "o4")[]) => {
    const r = ground(ORDER_DESK, canon(...ids));
    if (!r.ok) throw new Error("failed");
    return extentOf(r.grounding, fieldId("deliveryDay"));
  };
  it("delivery goes from [0, inf) to [4, inf) to [4, 9], then conflicts; o4 alone is [14, 14]", () => {
    expect(delivery()).toMatchObject({ ok: true, extent: { lo: 0, hi: null } });
    expect(delivery("o1")).toMatchObject({ ok: true, extent: { lo: 1, hi: null } });
    expect(delivery("o1", "o2")).toMatchObject({ ok: true, extent: { lo: 4, hi: null } });
    expect(delivery("o1", "o2", "o3")).toMatchObject({ ok: true, extent: { lo: 4, hi: 9 } });
    expect(delivery("o1", "o2", "o3", "o4")).toMatchObject({ ok: false, failure: { kind: "conflicted" } });
    expect(delivery("o4")).toMatchObject({ ok: true, extent: { lo: 14, hi: 14 } });
    expect(delivery("o2", "o4")).toMatchObject({ ok: true, extent: { lo: 14, hi: 14 } });
  });

  it("a claim ruled entailed stays entailed or becomes conflicted: 'delivery at most 12' under o1 o2 o3, then o4 is added", () => {
    const claim: Extent = { lo: null, hi: 12 };
    const rulingFor = (...ids: ("o1" | "o2" | "o3" | "o4")[]): Ruling => {
      const e = delivery(...ids);
      return classify(e.ok ? e.extent : undefined, { lo: 0, hi: null }, claim);
    };
    expect(rulingFor("o1", "o2")).toBe("weakened");
    expect(rulingFor("o1", "o2", "o3")).toBe("entailed");
    expect(rulingFor("o1", "o2", "o3", "o4")).toBe("conflicted");
    expect(CANON.o4.extent).toEqual({ lo: 14, hi: 14 });
  });
});

describe("the exception, pinned: an observation whose id repeats an earlier one takes the earlier one out, so E widens or a conflict goes", () => {
  it("o1 and o2 give delivery [4, inf); a second observation named o1 (about customs) refuses both, and delivery is [3, inf)", () => {
    const r = ground(ORDER_DESK, [...canon("o1", "o2"), { ...CANON.o3, id: "o1" }]);
    if (!r.ok) throw new Error("failed");
    expect(r.rejected.map((x) => [x.index, x.fault.kind])).toEqual([[0, "duplicate-id"], [2, "duplicate-id"]]);
    expect(extentOf(r.grounding, fieldId("packDays"))).toMatchObject({ ok: true, extent: { lo: 0, hi: null } });
    expect(extentOf(r.grounding, fieldId("deliveryDay"))).toMatchObject({ ok: true, extent: { lo: 3, hi: null } });
  });

  it("and it can un-conflict a tree: packDays in [3, 3] and [5, 5] conflict (core o1, o2); a second observation named o1 refuses both o1s and packDays is [5, 5]", () => {
    const first = ground(ORDER_DESK, [obs("o1", "packDays", 3, 3), obs("o2", "packDays", 5, 5)]);
    if (!first.ok) throw new Error("failed");
    expect(first.grounding.trees.find((t) => t.fields.includes(fieldId("packDays")))?.state).toStrictEqual({ kind: "conflicted", core: ["o1", "o2"] });

    const again = ground(ORDER_DESK, [obs("o1", "packDays", 3, 3), obs("o2", "packDays", 5, 5), obs("o1", "transitDays", 0, 9)]);
    if (!again.ok) throw new Error("failed");
    expect(again.rejected.map((x) => [x.index, x.fault.kind])).toEqual([[0, "duplicate-id"], [2, "duplicate-id"]]);
    expect(extentOf(again.grounding, fieldId("packDays"))).toMatchObject({ ok: true, extent: { lo: 5, hi: 5 } });
  });
});
