import { describe, expect, it } from "vitest";
import type { Brief, Entailment } from "../../contracts/index.js";
import { answer, readClaim, recheck, renderBrief, renderEntailment, rule } from "../index.js";
import { DESK, STEPS, canon, claim, genInstance, groundOf, jsonCopy, mulberry32, nonPlainPaths, unfrozenPaths } from "./fixtures.js";

/**
 * IMMUTABILITY AND ALIASING (plan section 6, M5 inherits M4's discipline: outputs are plain data, deep-frozen, and
 * share nothing with what came in).
 *
 * On 600 generated instances (24 chunks of 25 seeds, the generator `lib/ground`'s tests use), each with a question,
 * a draft of up to eight claims (some refused) and the claims `genClaims` makes, for what `readClaim`, `rule`,
 * `answer` and `recheck` return:
 *  1. DEEPLY FROZEN: `Object.isFrozen` at every node AND a write attempt at every node (a new key, an overwrite, a
 *     `push`) that must throw, so a node that only looks frozen is not enough. Refusals count as outputs.
 *  2. PLAIN DATA: the output survives JSON unchanged (no `Map`, function, `undefined` property or class instance).
 *  3. NO ALIASING: the outputs share no object with the `Grounding` (which is frozen as `ground` returns it) and
 *     none with the raw input, which is itself deeply frozen so that any write the engine made would throw.
 *  4. THE INPUT IS NEVER WRITTEN: a deeply frozen question, draft, `Grounding` and `Brief` are accepted, and the answers
 *     are what the unfrozen ones give.
 * Strings are not objects: `renderEntailment` and `renderBrief` return strings, which cannot alias anything.
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

/** Every object and array reachable from `value`. */
function objectsIn(value: unknown, into: Set<unknown> = new Set()): Set<unknown> {
  if (typeof value === "object" && value !== null) {
    into.add(value);
    for (const key of Object.keys(value)) objectsIn((value as Record<string, unknown>)[key], into);
  }
  return into;
}

const sharedWith = (output: unknown, inputs: ReadonlySet<unknown>): number => [...objectsIn(output)].filter((node) => inputs.has(node)).length;

const CHUNKS = 60;
const PER_CHUNK = 10;
const seen = { instances: 0, outputs: 0, nodes: 0, briefs: 0, refusals: 0, conflicted: 0, rechecked: 0, frozenInputs: 0, deepest: 0 };

/** The depth of the deepest object or array in a value. */
const depthOf = (value: unknown): number => (typeof value !== "object" || value === null ? 0 : 1 + Math.max(0, ...Object.keys(value).map((k) => depthOf((value as Record<string, unknown>)[k]))));

function checkInstance(seed: number): void {
  const rng = mulberry32(seed);
  const inst = genInstance(rng);
  const accepted = inst.observations.filter((_, i) => !inst.hostile.has(i));
  const g = groundOf(inst.schema, accepted);
  const names = inst.schema.fields.map((f) => f.id);
  const draft: unknown[] = [];
  const size = Math.floor(rng() * 9);
  for (let i = 0; i < size; i++) {
    const roll = rng();
    const field = names[Math.floor(rng() * names.length)] as string;
    const lo = rng() < 0.3 ? null : Math.floor(rng() * 9) - 1;
    const hi = rng() < 0.3 ? null : (lo ?? 0) + Math.floor(rng() * 6);
    if (roll < 0.1) draft.push(null);
    else if (roll < 0.2) draft.push({ field: "ghost", extent: { lo, hi } });
    else draft.push({ field, extent: { lo, hi } });
  }
  const question = { field: names[Math.floor(rng() * names.length)], extent: { lo: Math.floor(rng() * 5), hi: null } };
  // the inputs, deeply frozen: a write by the engine would throw
  const frozenQuestion = frozenCopy(question);
  const frozenDraft = frozenCopy(draft);
  const inputs = new Set<unknown>();
  objectsIn(g, inputs);
  objectsIn(frozenQuestion, inputs);
  objectsIn(frozenDraft, inputs);

  const outputs: unknown[] = [];
  for (const element of [question, ...draft]) outputs.push(readClaim(g, frozenCopy(element)), rule(g, frozenCopy(element)));
  const made = answer(g, frozenQuestion, frozenDraft);
  outputs.push(made);
  if (made.ok) {
    seen.briefs += 1;
    seen.refusals += made.brief.rejected.length;
    if ([made.brief.answer, ...made.brief.claims].some((e) => e.kind === "conflicted")) seen.conflicted += 1;
    // the same answers from unfrozen inputs
    expect(JSON.stringify(answer(g, jsonCopy(question), jsonCopy(draft))), `seed ${seed}: frozen and unfrozen inputs`).toBe(JSON.stringify(made));
    // recheck takes a frozen schema and a frozen Brief and writes to neither
    const frozenBrief = frozenCopy(made.brief);
    const checked = recheck(frozenCopy(g.schema), frozenBrief);
    outputs.push(checked);
    objectsIn(frozenBrief, inputs);
    seen.rechecked += 1;
    expect(JSON.stringify(checked), `seed ${seed}: recheck of a frozen and an unfrozen Brief`).toBe(JSON.stringify(recheck(g.schema, jsonCopy(made.brief))));
    seen.frozenInputs += 1;
  }

  for (const output of outputs) {
    seen.outputs += 1;
    seen.nodes += objectsIn(output).size;
    seen.deepest = Math.max(seen.deepest, depthOf(output));
    expect(unfrozenPaths(output), `seed ${seed}: unfrozen`).toEqual([]);
    expect(writableNodes(output), `seed ${seed}: writable`).toEqual([]);
    expect(nonPlainPaths(output), `seed ${seed}: not plain data`).toEqual([]);
    expect(JSON.parse(JSON.stringify(output)), `seed ${seed}: JSON round trip`).toStrictEqual(output);
    expect(sharedWith(output, inputs), `seed ${seed}: objects shared with an input`).toBe(0);
  }
  seen.instances += 1;
}

describe("on the generated instances, everything the public functions return is deeply frozen, plain, and shares nothing with its inputs", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: readClaim, rule, answer and recheck, by isFrozen, by trying to write, by JSON, and by identity`, () => {
      for (let seed = from; seed < from + PER_CHUNK; seed++) checkInstance(seed);
    });
  }
  it("the generated instances reached refusals, conflicts and rechecked Briefs (needs every chunk above to have run)", () => {
    expect(seen.instances, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    console.log(`immutability: ${seen.instances} instances, ${seen.outputs} outputs, ${seen.nodes} nodes, ${seen.briefs} briefs (${seen.refusals} refused draft claims, ${seen.conflicted} with a conflicted ruling), ${seen.rechecked} rechecked, deepest output ${seen.deepest} levels`);
    expect(seen.briefs).toBeGreaterThanOrEqual(500);
    expect(seen.refusals).toBeGreaterThanOrEqual(100);
    expect(seen.conflicted).toBeGreaterThanOrEqual(100);
    expect(seen.nodes).toBeGreaterThanOrEqual(20000);
    expect(seen.deepest, "a Brief is Brief > claims > ruling > support > list: five levels with the Brief itself").toBeGreaterThanOrEqual(5);
  });
});

describe("the detectors can fail", () => {
  it("a one-level freeze, an unfrozen nested array and a shared object are all reported", () => {
    const shallow = Object.freeze({ items: [1, 2], inner: { lo: 1 } });
    expect(unfrozenPaths(shallow).sort()).toEqual(["$.inner", "$.items"]);
    expect(writableNodes(shallow).length).toBeGreaterThan(0);
    const shared = { a: 1 };
    expect(sharedWith({ wrapped: shared }, objectsIn({ held: shared }))).toBe(1);
    expect(sharedWith({ wrapped: { a: 1 } }, objectsIn({ held: shared }))).toBe(0);
  });
});

describe("hand-built instances: the plan's six steps, each output node by node", () => {
  for (const step of STEPS) {
    it(`step ${step.number}: the Brief, every ruling and the recheck refuse every write, and nothing in them is an input object`, () => {
      const g = groundOf(DESK, canon(...step.ids));
      const question = frozenCopy(step.question);
      const draft = frozenCopy(step.draft);
      const made = answer(g, question, draft);
      if (!made.ok) throw new Error("fixture");
      const brief: Brief = made.brief;
      const checked = recheck(g.schema, brief);
      const inputs = objectsIn({ g, question, draft });
      for (const output of [made, checked, ...[brief.answer, ...brief.claims].map((ruling) => rule(g, { field: ruling.field, extent: ruling.tested }))]) {
        expect(unfrozenPaths(output)).toEqual([]);
        expect(writableNodes(output)).toEqual([]);
        expect(sharedWith(output, inputs)).toBe(0);
      }
      // the evidence is a copy of the grounding's observations, node by node
      for (const carried of brief.evidence) {
        const original = g.observations.find((o) => o.id === carried.id);
        expect(original).toStrictEqual(carried);
        expect(original).not.toBe(carried);
        expect(original?.extent).not.toBe(carried.extent);
      }
    });
  }

  it("the nested arrays and objects of one Brief, one by one, each refuse a write", () => {
    const g = groundOf(DESK, canon("o1", "o2", "o3"));
    const made = answer(g, claim("deliveryDay", null, 12), [claim("deliveryDay", 5, 5), { field: "ghost", extent: { lo: 1, hi: 2 } }]);
    if (!made.ok) throw new Error("fixture");
    const b = made.brief;
    const ruling = b.answer;
    if (ruling.kind !== "entailed") throw new Error("expected entailed");
    expect(() => (ruling.support.lo as unknown as string[]).push("x")).toThrow(TypeError);
    expect(() => ((ruling.support as { hi: unknown }).hi = [])).toThrow(TypeError);
    expect(() => ((ruling.established as { lo: number }).lo = 9)).toThrow(TypeError);
    expect(() => ((ruling.tested as { hi: number }).hi = 9)).toThrow(TypeError);
    expect(() => ((b.claims as unknown as unknown[]).push(1))).toThrow(TypeError);
    expect(() => ((b.rejected as unknown as unknown[]).push(1))).toThrow(TypeError);
    expect(() => ((b.rejected[0] as { fault: { kind: string } }).fault.kind = "x")).toThrow(TypeError);
    expect(() => ((b.evidence as unknown as unknown[]).pop())).toThrow(TypeError);
    expect(() => ((b.evidence[0] as { extent: { lo: number } }).extent.lo = 9)).toThrow(TypeError);
    expect(() => ((b as { answer: unknown }).answer = null)).toThrow(TypeError);
    const refusal = readClaim(g, { field: 1, extent: 2 });
    if (refusal.ok || refusal.fault.kind !== "malformed") throw new Error("expected malformed");
    const places: unknown = refusal.fault.fields;
    expect(() => (places as string[]).push("x")).toThrow(TypeError);
    const conflict = rule(groundOf(DESK, canon("o1", "o2", "o3", "o4")), claim("deliveryDay", null, 12));
    if (!conflict.ok || conflict.entailment.kind !== "conflicted") throw new Error("expected conflicted");
    expect(() => (conflict.entailment.core as unknown as string[]).push("x")).toThrow(TypeError);
    const checked = recheck(g.schema, b);
    if (!checked.ok) throw new Error("fixture");
    expect(() => (checked.findings as unknown as unknown[]).push(1)).toThrow(TypeError);
    expect(() => ((checked.findings[0] as { result: unknown }).result = null)).toThrow(TypeError);
  });

  it("an output is not changed by editing a copy of the input afterwards, and two calls give equal results that are different objects", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const question = jsonCopy(claim("deliveryDay", null, 12));
    const draft = jsonCopy([claim("packDays", 1, 1)]);
    const first = answer(g, question, draft);
    const before = JSON.stringify(first);
    (question.extent as { hi: number }).hi = 99;
    draft.push(claim("transitDays", 1, 1));
    (draft[0] as { extent: { lo: number } }).extent.lo = 7;
    expect(JSON.stringify(first)).toBe(before);
    const second = answer(g, claim("deliveryDay", null, 12), [claim("packDays", 1, 1)]);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
    if (first.ok && second.ok) {
      expect(second.brief.answer).not.toBe(first.brief.answer);
      expect(second.brief.evidence[0]).not.toBe(first.brief.evidence[0]);
    }
  });

  it("rendering returns strings, and rendering a frozen Brief leaves it as it was", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const made = answer(g, claim("deliveryDay", null, 12), [claim("customsDays", 2, 2)]);
    if (!made.ok) throw new Error("fixture");
    const before = JSON.stringify(made.brief);
    expect(typeof renderBrief(g.schema, made.brief)).toBe("string");
    for (const ruling of [made.brief.answer, ...made.brief.claims] as Entailment[]) expect(typeof renderEntailment(g.schema, ruling)).toBe("string");
    expect(JSON.stringify(made.brief)).toBe(before);
  });
});
