import { describe, expect, it } from "vitest";
import { fieldId } from "../../contracts/index.js";
import { declOf, extentOf, ground, openEndsOf, readSchema, supportOf } from "../index.js";
import type { Grounding } from "../index.js";
import { CANON, ORDER_DESK, canon, genInstance, jsonCopy, mulberry32, nonPlainPaths, obs, unfrozenPaths } from "./fixtures.js";

/**
 * IMMUTABILITY (plan section 6, M4: "output is deep-frozen, recursively (adaptive-agent has a failure case named
 * `14-freeze-is-one-level-deep`; the builder tests nested arrays, not only the top object)").
 *
 * Four things, over 600 generated instances and some hand-built ones:
 *  1. DEEPLY FROZEN: no object or array reachable from anything a public function returns is unfrozen, by
 *     `Object.isFrozen` at every node AND by trying to write at every node (an own property, a new key, an array
 *     `push`): each attempt must throw, so a node that merely LOOKS frozen is not enough. This covers refusals as
 *     well as results (`malformed.fields`, a core, `rejected[i].fault.fields`).
 *  2. NO ALIASING OF INPUT: the engine accepts a deeply frozen input (it writes nothing to it) and what it returns
 *     shares no object with it, so changing the input afterwards changes nothing in the output.
 *  3. PLAIN DATA: the grounding survives JSON unchanged (no `Map`, no function, no `undefined` property, no class
 *     instance), and a grounding that went through JSON gives the same answers from `extentOf`, `supportOf` and
 *     `openEndsOf`: they are computed from the data alone, with no hidden state.
 *  4. NO ALIASING OF THE GROUNDING: what `extentOf` returns is a fresh frozen copy, not an object inside the grounding.
 */

/** Every place under `value` where a write is accepted, as paths. Empty when nothing can be written. */
function writableNodes(value: unknown, path = "$"): string[] {
  if (typeof value !== "object" || value === null) return [];
  const out: string[] = [];
  const attempt = (what: string, write: () => void): void => {
    try {
      write();
      out.push(`${path} (${what})`);
    } catch (error) {
      if (!(error instanceof TypeError)) out.push(`${path} (${what}: threw ${String(error)})`);
    }
  };
  const node = value as Record<string, unknown>;
  attempt("new key", () => void (node["__probe"] = 1));
  for (const key of Object.keys(node)) attempt(`overwrite ${key}`, () => void (node[key] = "overwritten"));
  if (Array.isArray(value)) attempt("push", () => void value.push(1));
  for (const key of Object.keys(node)) out.push(...writableNodes(node[key], `${path}.${key}`));
  return out;
}

/** A deep copy of `value` in which every object and array is frozen. */
function frozenCopy<T>(value: T): T {
  const copy = jsonCopy(value);
  const freeze = (x: unknown): void => {
    if (typeof x === "object" && x !== null) {
      for (const key of Object.keys(x)) freeze((x as Record<string, unknown>)[key]);
      Object.freeze(x);
    }
  };
  freeze(copy);
  return copy;
}

const FROZEN_CHUNKS = 6;
const FROZEN_PER_CHUNK = 100;
const frozenSeen = { instances: 0, nodes: 0, conflicted: 0, refused: 0 };

describe("everything the public functions return is deeply frozen", () => {
  for (let chunk = 0; chunk < FROZEN_CHUNKS; chunk++) {
    const from = chunk * FROZEN_PER_CHUNK + 1;
    it(`seeds ${from} to ${from + FROZEN_PER_CHUNK - 1}: ground, readSchema, and extentOf, supportOf, openEndsOf for every field, by isFrozen and by trying to write`, () => {
      frozenCheck(from, from + FROZEN_PER_CHUNK - 1);
    });
  }

  it("the generated instances included conflicts and refusals (needs every chunk above to have run)", () => {
    expect(frozenSeen.instances, "all chunks ran: do not filter this file with -t").toBe(FROZEN_CHUNKS * FROZEN_PER_CHUNK);
    expect(frozenSeen.conflicted).toBeGreaterThanOrEqual(100);
    expect(frozenSeen.refused).toBeGreaterThanOrEqual(100);
    expect(frozenSeen.nodes).toBeGreaterThanOrEqual(4000);
  });

  function frozenCheck(first: number, last: number): void {
    let nodes = 0;
    let conflicted = 0;
    let refused = 0;
    for (let seed = first; seed <= last; seed++) {
      const inst = genInstance(mulberry32(seed));
      const r = ground(inst.schema, inst.observations);
      const outputs: unknown[] = [r, readSchema(inst.schema)];
      if (r.ok) {
        if (r.rejected.length > 0) refused += 1;
        for (const entry of r.grounding.baseline) {
          const f = fieldId(entry.field);
          outputs.push(extentOf(r.grounding, f), supportOf(r.grounding, f), openEndsOf(r.grounding, f, ["lo", "hi"]));
        }
        if (r.grounding.trees.some((t) => t.state.kind === "conflicted")) conflicted += 1;
      }
      for (const out of outputs) {
        nodes += unfrozenPaths(out).length + 1;
        expect(unfrozenPaths(out), `seed ${seed}`).toEqual([]);
        expect(writableNodes(out), `seed ${seed}`).toEqual([]);
      }
    }
    frozenSeen.instances += last - first + 1;
    frozenSeen.nodes += nodes;
    frozenSeen.conflicted += conflicted;
    frozenSeen.refused += refused;
  }

  it("the nested arrays the plan names, one by one, each refuses a write", () => {
    const r = ground(ORDER_DESK, [...canon("o1", "o2", "o3"), obs("bad", "ghost", 0, 1)]);
    if (!r.ok) throw new Error("failed");
    const g = r.grounding;
    const tree = g.trees[0]!;
    const consistent = tree.state;
    if (consistent.kind !== "consistent") throw new Error("expected consistent");
    expect(() => (consistent.extents as unknown as unknown[]).push(1)).toThrow(TypeError);
    expect(() => ((consistent.extents[0] as { extent: { lo: number } }).extent.lo = 9)).toThrow(TypeError);
    expect(() => ((tree.fields as unknown as string[])[0] = "x")).toThrow(TypeError);
    expect(() => ((g.observations as unknown as unknown[]).length = 0)).toThrow(TypeError);
    expect(() => ((g.observations[0] as { extent: { hi: number } }).extent.hi = 9)).toThrow(TypeError);
    expect(() => ((g.baseline[0] as { extent: { lo: number } }).extent.lo = 9)).toThrow(TypeError);
    expect(() => ((g.schema.fields as unknown as unknown[]).pop())).toThrow(TypeError);
    const total = g.schema.fields.find((f) => f.kind === "derived");
    expect(() => ((total as unknown as { sum: string[] }).sum.push("x"))).toThrow(TypeError);
    expect(() => ((g.schema.fields[0] as { baseline: { lo: number } }).baseline.lo = 9)).toThrow(TypeError);
    expect(() => ((r.rejected as unknown as unknown[]).push(1))).toThrow(TypeError);
    expect(() => ((r.rejected[0] as { fault: { field: string } }).fault.field = "x")).toThrow(TypeError);

    const conflict = ground(ORDER_DESK, canon("o1", "o2", "o3", "o4"));
    if (!conflict.ok) throw new Error("failed");
    const state = conflict.grounding.trees[0]!.state;
    if (state.kind !== "conflicted") throw new Error("expected conflicted");
    expect(() => (state.core as unknown as string[]).push("x")).toThrow(TypeError);
    expect(() => ((state.core as unknown as string[])[0] = "x")).toThrow(TypeError);

    const refusal = readSchema({ fields: [] });
    if (refusal.ok) throw new Error("expected a refusal");
    const fault = refusal.fault as unknown as { fields: string[] };
    expect(() => fault.fields.push("x")).toThrow(TypeError);
    expect(() => ((refusal.fault as { kind: string }).kind = "x")).toThrow(TypeError);
    const failure = ground(ORDER_DESK, "nope");
    expect(Object.isFrozen(failure) && Object.isFrozen((failure as { failure: object }).failure)).toBe(true);

    const support = supportOf(g, fieldId("deliveryDay"));
    if (!support.ok) throw new Error("failed");
    expect(() => (support.support.lo as unknown as string[]).push("x")).toThrow(TypeError);
    expect(() => ((support.support as { hi: unknown }).hi = [])).toThrow(TypeError);
    const ends = openEndsOf(ground(ORDER_DESK, canon("o1", "o2")).ok ? (ground(ORDER_DESK, canon("o1", "o2")) as { grounding: Grounding }).grounding : g, fieldId("customsDays"), ["lo", "hi"]);
    expect(ends.length).toBeGreaterThan(0);
    expect(() => (ends as unknown as unknown[]).push(1)).toThrow(TypeError);
    expect(() => ((ends[0] as { side: string }).side = "x")).toThrow(TypeError);
    const e = extentOf(g, fieldId("deliveryDay"));
    if (!e.ok) throw new Error("failed");
    expect(() => ((e.extent as { lo: number }).lo = 9)).toThrow(TypeError);
    expect(() => ((e.baseline as { hi: number }).hi = 9)).toThrow(TypeError);
  });

  it("the detector can fail: a one-level freeze and an unfrozen nested array are both reported", () => {
    const shallow = Object.freeze({ items: [1, 2], inner: { lo: 1 } });
    expect(unfrozenPaths(shallow).sort()).toEqual(["$.inner", "$.items"]);
    expect(writableNodes(shallow).length).toBeGreaterThan(0);
    expect(unfrozenPaths(Object.freeze({ a: Object.freeze([Object.freeze({ b: 1 })]) }))).toEqual([]);
  });
});

describe("the input is neither written nor kept", () => {
  it("a deeply frozen schema and observations are accepted, and the answers are the same as for unfrozen ones", () => {
    const schema = frozenCopy(ORDER_DESK);
    const list = frozenCopy(canon("o1", "o2", "o3"));
    const r = ground(schema, list);
    const plain = ground(jsonCopy(ORDER_DESK), canon("o1", "o2", "o3"));
    expect(JSON.stringify(r)).toBe(JSON.stringify(plain));
    expect(r.ok).toBe(true);
  });

  it("nothing in the output is an object of the input, and editing the input afterwards changes nothing", () => {
    const schema = jsonCopy(ORDER_DESK);
    const list = canon("o1", "o2", "o3");
    const r = ground(schema, list);
    if (!r.ok) throw new Error("failed");
    const before = JSON.stringify(r);
    const objectsOfInput = new Set<unknown>();
    const collect = (x: unknown): void => {
      if (typeof x === "object" && x !== null) {
        objectsOfInput.add(x);
        for (const key of Object.keys(x)) collect((x as Record<string, unknown>)[key]);
      }
    };
    collect(schema);
    collect(list);
    const shared: string[] = [];
    const visit = (x: unknown, path: string): void => {
      if (typeof x === "object" && x !== null) {
        if (objectsOfInput.has(x)) shared.push(path);
        for (const key of Object.keys(x)) visit((x as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    visit(r, "$");
    expect(shared).toEqual([]);

    // edit the input at every depth
    (schema.fields[0] as { baseline: { lo: number } }).baseline.lo = 99;
    (schema.fields[3] as { sum: string[] }).sum.push("x");
    (schema.fields as unknown[]).length = 1;
    for (const o of list) {
      o.extent.lo = 77;
      o.quote = "changed";
    }
    list.length = 0;
    expect(JSON.stringify(r)).toBe(before);
  });

  it("readSchema's copy likewise", () => {
    const schema = jsonCopy(ORDER_DESK);
    const r = readSchema(schema);
    if (!r.ok) throw new Error("failed");
    expect(r.schema.fields[0]).not.toBe(schema.fields[0]);
    expect(r.schema.fields[3]).not.toBe(schema.fields[3]);
    expect((r.schema.fields[3] as { sum: unknown }).sum).not.toBe(schema.fields[3] && (schema.fields[3] as { sum: unknown }).sum);
  });
});

describe("the grounding is plain data, and its answers come from the data alone", () => {
  it("it survives JSON unchanged: no Map, no function, no undefined, no class instance, no non-finite number", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = ground(...asArgs(genInstance(mulberry32(seed))));
      if (!r.ok) continue;
      expect(nonPlainPaths(r.grounding), `seed ${seed}`).toEqual([]);
      expect(jsonCopy(r.grounding)).toStrictEqual(r.grounding);
      expect(jsonCopy(r.rejected)).toStrictEqual(r.rejected);
    }
  });

  it("a grounding that went through JSON (so unfrozen, with no hidden state) gives identical answers, and is not changed by being asked", () => {
    let asked = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const r = ground(...asArgs(genInstance(mulberry32(seed))));
      if (!r.ok) continue;
      const copy = jsonCopy(r.grounding) as Grounding;
      const before = JSON.stringify(copy);
      for (const entry of r.grounding.baseline) {
        const f = fieldId(entry.field);
        expect(JSON.stringify(extentOf(copy, f))).toBe(JSON.stringify(extentOf(r.grounding, f)));
        expect(JSON.stringify(supportOf(copy, f))).toBe(JSON.stringify(supportOf(r.grounding, f)));
        expect(JSON.stringify(openEndsOf(copy, f, ["lo", "hi"]))).toBe(JSON.stringify(openEndsOf(r.grounding, f, ["lo", "hi"])));
        asked += 1;
      }
      expect(JSON.stringify(copy), `seed ${seed}`).toBe(before);
    }
    expect(asked).toBeGreaterThanOrEqual(1500);
  });

  it("extentOf returns a copy, not an object inside the grounding, and a second call returns another one", () => {
    const r = ground(ORDER_DESK, canon("o1", "o2"));
    if (!r.ok) throw new Error("failed");
    const tree = r.grounding.trees[0]!;
    if (tree.state.kind !== "consistent") throw new Error("expected consistent");
    const stored = tree.state.extents.find((x) => x.field === "deliveryDay")!.extent;
    const a = extentOf(r.grounding, fieldId("deliveryDay"));
    const b = extentOf(r.grounding, fieldId("deliveryDay"));
    if (!a.ok || !b.ok) throw new Error("failed");
    expect(a.extent).toStrictEqual(stored);
    expect(a.extent).not.toBe(stored);
    expect(a.extent).not.toBe(b.extent);
    expect(a).not.toBe(b);
    expect(a.baseline).not.toBe(r.grounding.baseline.find((x) => x.field === "deliveryDay")!.extent);
  });

  it("declOf is a lookup that returns the declaration in the schema it was given", () => {
    const r = ground(ORDER_DESK, []);
    if (!r.ok) throw new Error("failed");
    const found = declOf(r.grounding.schema, fieldId("deliveryDay"));
    expect(found).toBe(r.grounding.schema.fields[3]);
    expect(declOf(r.grounding.schema, fieldId("ghost"))).toBeUndefined();
    expect(declOf(r.grounding.schema, fieldId("constructor"))).toBeUndefined();
    expect(CANON.o1.field).toBe("packDays");
  });
});

function asArgs(inst: ReturnType<typeof genInstance>): [unknown, unknown] {
  return [inst.schema, inst.observations];
}
