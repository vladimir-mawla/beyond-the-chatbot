import { describe, expect, it } from "vitest";
import { fieldId } from "../../contracts/index.js";
import type { Side } from "../../contracts/index.js";
import { ground, openEndsOf, readSchema, supportOf } from "../index.js";
import type { Grounding } from "../index.js";
import { ORDER_DESK, base, derived, genInstance, mulberry32, obs, schemaOf, shuffled } from "./fixtures.js";
import type { Instance, RawObservation, RawSchema, Rng } from "./fixtures.js";

/**
 * ORDER INDEPENDENCE (plan section 6, M4, layer 3, and what it says must be refused, "a result that depends on the order of
 * observations, the order of fields, or the order of operands within a sum"; plan D7: support "depends on ids, not
 * on input order"). For every generated instance, the observations are reversed and shuffled, the fields of the
 * schema are shuffled, and the operands inside every sum are shuffled, and the grounding must be the same: the
 * accepted observations, the baseline, every tree with its extents or core, and, field by field, the support and
 * the open ends (the latter with its `sides` argument shuffled and repeated too).
 *
 * The two things that are allowed to move are named. `Grounding.schema` is the validated copy, in the order the
 * author wrote it, so it is compared as a set. `RejectedObservation.index` is a position in the input, so a
 * refused observation is compared by its fault and the refused observations as a multiset.
 *
 * And `localeCompare`: ids are ordered by UTF-16 code unit, which puts `B` before `a`, where a locale puts `a`
 * before `B`. The last tests build evidence whose core and support are different under the two orders, so
 * a switch to a locale-aware sort would be seen.
 */

const CHUNKS = 48;
const PER_CHUNK = 50;

function permuted(rng: Rng, inst: Instance, how: "reverse" | "shuffle"): { schema: RawSchema; observations: RawObservation[] } {
  const observations = how === "reverse" ? [...inst.observations].reverse() : shuffled(rng, inst.observations);
  const fields = how === "reverse" ? [...inst.schema.fields].reverse() : shuffled(rng, inst.schema.fields);
  const mixed = fields.map((f) => (f.kind === "derived" ? { ...f, sum: how === "reverse" ? [...f.sum].reverse() : shuffled(rng, f.sum) } : f));
  return { schema: { fields: mixed }, observations };
}

/** Everything order-free about a result: the schema as a set, the rest as it is, the refusals without their positions. */
function canonical(result: ReturnType<typeof ground>): string {
  if (!result.ok) return JSON.stringify(result);
  const g = result.grounding;
  const schema = [...g.schema.fields]
    .map((f) => (f.kind === "derived" ? { ...f, sum: [...f.sum].sort() } : f))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const refused = result.rejected.map((r) => JSON.stringify(r.fault)).sort();
  return JSON.stringify({ schema, observations: g.observations, baseline: g.baseline, trees: g.trees, refused });
}

/** The derived answers, per field, in a fixed order of fields. */
function answers(g: Grounding, sidesOrders: readonly (readonly Side[])[]): string {
  const out: unknown[] = [];
  for (const entry of g.baseline) {
    const f = fieldId(entry.field);
    out.push(entry.field, supportOf(g, f), ...sidesOrders.map((sides) => openEndsOf(g, f, sides)));
  }
  return JSON.stringify(out);
}

const SIDES_ORDERS: readonly (readonly Side[])[] = [["lo", "hi"], ["hi", "lo"], ["lo"], ["hi"], ["lo", "lo", "hi", "hi", "lo"], []];
let conflictedChecked = 0;
let supportsChecked = 0;
let nonEmptySupports = 0;
let instances = 0;
let openEndsListed = 0;

describe("the grounding does not depend on the order of observations, fields, or operands", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: reversed, and shuffled twice`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const rng = mulberry32(seed);
        const inst = genInstance(rng);
        const first = ground(inst.schema, inst.observations);
        const want = canonical(first);
        instances += 1;
        const wantAnswers = first.ok ? answers(first.grounding, SIDES_ORDERS) : "";
        if (first.ok) {
          conflictedChecked += first.grounding.trees.filter((t) => t.state.kind === "conflicted").length;
          for (const entry of first.grounding.baseline) {
            const s = supportOf(first.grounding, fieldId(entry.field));
            if (s.ok) {
              supportsChecked += 1;
              if (s.support.lo.length + s.support.hi.length > 0) nonEmptySupports += 1;
            }
            openEndsListed += openEndsOf(first.grounding, fieldId(entry.field), ["lo", "hi"]).length;
          }
        }
        for (const how of ["reverse", "shuffle", "shuffle"] as const) {
          const mixed = permuted(rng, inst, how);
          const again = ground(mixed.schema, mixed.observations);
          if (canonical(again) !== want) problems.push(`seed ${seed} (${how}): the grounding differs`);
          if (first.ok && again.ok && answers(again.grounding, SIDES_ORDERS) !== wantAnswers) problems.push(`seed ${seed} (${how}): a support or an open-ends answer differs`);
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("the property was exercised on conflicts, on non-empty supports and on open ends (needs every chunk above to have run)", () => {
    console.log(`order independence: ${instances} instances, ${conflictedChecked} conflicted trees, ${supportsChecked} supports of which ${nonEmptySupports} non-empty, ${openEndsListed} open ends listed`);
    expect(instances, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    expect(conflictedChecked).toBeGreaterThanOrEqual(500);
    expect(nonEmptySupports).toBeGreaterThanOrEqual(3000);
    expect(openEndsListed).toBeGreaterThanOrEqual(1000);
  });

  it("the accepted observations come out sorted by id, whatever order they went in", () => {
    const list = [obs("c", "packDays", 1, 2), obs("a", "transitDays", 3, 5), obs("b", "customsDays", 0, 2)];
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0], [1, 0, 2]]) {
      const r = ground(ORDER_DESK, order.map((i) => list[i]));
      expect(r.ok && r.grounding.observations.map((o) => o.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("an accepted schema keeps the author's order of fields and of operands, and nothing else about the result does", () => {
    const a = schemaOf(base("x"), base("y"), derived("t", ["x", "y"]));
    const b = schemaOf(derived("t", ["y", "x"]), base("y"), base("x"));
    const ra = readSchema(a);
    const rb = readSchema(b);
    expect(ra.ok && ra.schema.fields.map((f) => f.id)).toEqual(["x", "y", "t"]);
    expect(rb.ok && rb.schema.fields.map((f) => f.id)).toEqual(["t", "y", "x"]);
    const ga = ground(a, [obs("p", "t", 3, 9)]);
    const gb = ground(b, [obs("p", "t", 3, 9)]);
    if (!ga.ok || !gb.ok) throw new Error("failed");
    expect(JSON.stringify(ga.grounding.trees)).toBe(JSON.stringify(gb.grounding.trees));
    expect(JSON.stringify(ga.grounding.baseline)).toBe(JSON.stringify(gb.grounding.baseline));
  });
});

describe("`source` is a display label: relabelling every valid source moves no answer (plan D6)", () => {
  it("on 600 generated instances, every source replaced by another valid string: the same trees, baseline, support and open ends, and the same refusals", () => {
    let compared = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const inst = genInstance(mulberry32(seed));
      const relabelled = inst.observations.map((o, i) => {
        // only a source that was valid is relabelled: a corrupted one (a number, "") is that observation's defect, not a label
        if (inst.hostile.has(i) || typeof o !== "object" || o === null || typeof o.source !== "string" || o.source.length < 1) return o;
        return { ...o, source: i % 2 === 0 ? "a forum post" : "the most authoritative registry there is" };
      });
      const a = ground(inst.schema, inst.observations);
      const b = ground(inst.schema, relabelled);
      if (!a.ok || !b.ok) throw new Error("failed");
      const strip = (r: typeof a) => JSON.stringify(r.ok ? { trees: r.grounding.trees, baseline: r.grounding.baseline, ids: r.grounding.observations.map((o) => [o.id, o.field, o.extent, o.quote]), rejected: r.rejected.map((x) => [x.index, x.fault]) } : r);
      if (strip(a) !== strip(b)) throw new Error(`seed ${seed}: relabelling the sources changed an answer`);
      for (const entry of a.grounding.baseline) {
        const f = fieldId(entry.field);
        if (JSON.stringify([supportOf(a.grounding, f), openEndsOf(a.grounding, f, ["lo", "hi"])]) !== JSON.stringify([supportOf(b.grounding, f), openEndsOf(b.grounding, f, ["lo", "hi"])])) throw new Error(`seed ${seed}: relabelling changed ${entry.field}`);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(2000);
  });
});

describe("the orders that are fixed (observations and baseline by id, trees by root, fields and extents by field id, refusals by position), and what a root is", () => {
  const ascending = (xs: readonly string[]): boolean => xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
  it("on 800 generated instances every list the grounding keeps is in its stated order (code-unit order, strictly, so no repeats)", () => {
    let trees = 0;
    let multi = 0;
    for (let seed = 1; seed <= 800; seed++) {
      const inst = genInstance(mulberry32(seed));
      const r = ground(inst.schema, inst.observations);
      if (!r.ok) throw new Error("failed");
      const g = r.grounding;
      expect(ascending(g.observations.map((o) => o.id)), `seed ${seed}: observations`).toBe(true);
      expect(ascending(g.baseline.map((b) => b.field)), `seed ${seed}: baseline`).toBe(true);
      expect(ascending(g.trees.map((t) => t.root)), `seed ${seed}: trees by root`).toBe(true);
      expect(g.baseline.map((b) => b.field).sort(), `seed ${seed}: the baseline has every field`).toEqual(inst.schema.fields.map((f) => f.id).sort());
      for (const tree of g.trees) {
        trees += 1;
        expect(ascending(tree.fields), `seed ${seed}: a tree's fields`).toBe(true);
        expect(tree.fields.includes(tree.root), `seed ${seed}: the root is one of the fields`).toBe(true);
        // the root is the one field of the tree that is an operand of nothing, read off the raw schema
        const operands = new Set(inst.schema.fields.flatMap((f) => (f.kind === "derived" ? f.sum : [])));
        expect(tree.fields.filter((f) => !operands.has(f)), `seed ${seed}: the root`).toEqual([tree.root]);
        if (tree.state.kind === "consistent") expect(tree.state.extents.map((e) => e.field), `seed ${seed}: extents`).toEqual([...tree.fields]);
        else expect(ascending(tree.state.core), `seed ${seed}: a core`).toBe(true);
      }
      if (g.trees.length > 1) multi += 1;
      expect(r.rejected.map((x) => x.index), `seed ${seed}: refusals`).toEqual([...r.rejected.map((x) => x.index)].sort((a, b) => a - b));
    }
    expect(trees).toBeGreaterThanOrEqual(1200);
    expect(multi).toBeGreaterThanOrEqual(250);
  });
});

describe("ids are ordered by UTF-16 code unit, never by locale", () => {
  it("the fixture is one where the two orders differ", () => {
    const ids = ["B1", "B2", "a1", "a2", "_z", "Z"];
    expect([...ids].sort()).not.toEqual([...ids].sort((x, y) => x.localeCompare(y, "en")));
  });

  it("observations: B1 < B2 < a1 < a2 (code units), not a1 < a2 < B1 < B2 (a locale)", () => {
    const list = ["a2", "B2", "a1", "B1"].map((id) => obs(id, "packDays", 0, 5));
    const r = ground(ORDER_DESK, list);
    expect(r.ok && r.grounding.observations.map((o) => o.id)).toEqual(["B1", "B2", "a1", "a2"]);
  });

  it("a core: two conflicts in one tree, the later ids survive, and later means code-unit order", () => {
    // pack conflicts between B1 and B2; transit conflicts between a1 and a2. By code unit B1 < B2 < a1 < a2, so deleting
    // the smallest first removes B1 (and B2 only if it can go), and the survivors are a1 and a2. A locale puts a1 and a2 first.
    const list = [obs("B1", "packDays", 5, 5), obs("B2", "packDays", 0, 3), obs("a1", "transitDays", 9, 9), obs("a2", "transitDays", 0, 2)];
    const r = ground(ORDER_DESK, list);
    if (!r.ok) throw new Error("failed");
    expect(r.grounding.trees[0]!.state).toStrictEqual({ kind: "conflicted", core: ["a1", "a2"] });
  });

  it("a support: the one-observation route and the three-observation route, and which one survives depends on how the ids sort", () => {
    const schema = schemaOf(base("p"), base("q"), base("r"), derived("total", ["p", "q", "r"]));
    const route = (direct: string) => [obs(direct, "total", null, 9), obs("a1", "p", null, 2), obs("a2", "q", null, 5), obs("a3", "r", null, 2)];
    const hiSupport = (list: RawObservation[]) => {
      const r = ground(schema, list);
      if (!r.ok) throw new Error("failed");
      const s = supportOf(r.grounding, fieldId("total"));
      return s.ok ? s.support.hi : s;
    };
    // plan case 05: with the direct id sorting last the support is the direct observation
    expect(hiSupport(route("z-direct"))).toEqual(["z-direct"]);
    // renamed so it sorts first, the three-observation route survives: the same evidence, a different certificate
    expect(hiSupport(route("0-direct"))).toEqual(["a1", "a2", "a3"]);
    // input order changes nothing
    expect(hiSupport([...route("0-direct")].reverse())).toEqual(["a1", "a2", "a3"]);
    expect(hiSupport([...route("z-direct")].reverse())).toEqual(["z-direct"]);
    // and code unit, not locale: "B-direct" sorts before "a1" by code unit and after it by locale
    expect(["B-direct", "a1"].sort()).toEqual(["B-direct", "a1"]);
    expect(["B-direct", "a1"].sort((x, y) => x.localeCompare(y, "en"))).toEqual(["a1", "B-direct"]);
    expect(hiSupport(route("B-direct"))).toEqual(["a1", "a2", "a3"]);
  });
});
