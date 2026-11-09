import { describe, expect, it } from "vitest";
import { MAX_DRAFT_CLAIMS } from "../../contracts/index.js";
import type { ClaimRejection, Entailment } from "../../contracts/index.js";
import { answer, rule } from "../index.js";
import { DESK, FIRST_VALUES, STEPS, base, canon, claim, counted, defineCounted, genInstance, groundOf, logged, mulberry32, obs, schemaOf, shuffled } from "./fixtures.js";
import type { Brief } from "./fixtures.js";

/**
 * `answer` (plan section 6, M5): "rules the question first, then each draft claim; draft faults go to `Brief.rejected`;
 * `Brief.evidence` is exactly the observations some support or core names, sorted by id". Five groups:
 *  1. THE PLAN'S SECTION 7: each of the six steps' whole `Brief`, with the evidence named by hand.
 *  2. THE STRUCTURE OF A BRIEF over 1 000 generated instances with faulty drafts: every draft position is in `claims` or in
 *     `rejected` exactly once, in draft order; each ruling equals `rule` on that element; the evidence is exactly the union
 *     of the ids the rulings name, sorted, as copies.
 *  3. THE QUESTION COMES FIRST: a rejected question fails the call with the draft unread.
 *  4. THE DRAFT AS AN UNTRUSTED ARRAY: not an array, too long (N accepted, N + 1 refused), a length that is not a count, a
 *     revoked Proxy, an element whose read throws; each with its exact reads.
 *  5. READ-ONCE: the draft's `length` and every element are read once, whatever they answer the second time.
 */

const ok = (g: ReturnType<typeof groundOf>, question: unknown, draft: unknown): Brief => {
  const r = answer(g, question, draft);
  if (!r.ok) throw new Error(`expected a brief, got ${JSON.stringify(r.failure)}`);
  return r.brief;
};
const kindsOf = (b: Brief): string[] => [b.answer.kind, ...b.claims.map((c) => c.kind)];
const evidenceIds = (b: Brief): string[] => b.evidence.map((o) => o.id);

describe("the plan's section 7: the whole Brief of each of the six steps", () => {
  const expected: readonly (readonly [number, readonly string[]])[] = [
    [1, ["o1", "o2"]], // customs = 2 is ungrounded and names nothing
    [2, ["o1", "o2"]],
    [3, ["o1", "o2"]],
    [4, ["o1", "o2", "o3"]],
    [5, ["o1", "o2", "o3", "o4"]], // the four-document core, once, though five rulings name it
    [6, ["o1", "o2", "o4"]],
  ];
  for (const step of STEPS) {
    it(`step ${step.number}: the kinds are the plan's table, draft order is kept, nothing is rejected, and the evidence is exactly ${(expected[step.number - 1] as readonly [number, readonly string[]])[1].join(" ")}`, () => {
      const g = groundOf(DESK, canon(...step.ids));
      const brief = ok(g, step.question, step.draft);
      expect(kindsOf(brief)).toStrictEqual([step.questionKind, ...step.draftKinds]);
      expect(brief.rejected).toStrictEqual([]);
      expect(evidenceIds(brief)).toStrictEqual((expected[step.number - 1] as readonly [number, readonly string[]])[1]);
      brief.claims.forEach((c, i) => expect(c.field, `claim ${i}`).toBe(step.draft[i]?.field));
    });
  }

  it("the evidence is a copy of the grounding's observations, with quote and source, so the Brief is self-contained", () => {
    const g = groundOf(DESK, canon("o1", "o2", "o3"));
    const brief = ok(g, claim("deliveryDay", null, 12), []);
    expect(brief.evidence).toStrictEqual([
      { id: "o1", field: "packDays", extent: { lo: 1, hi: 2 }, quote: "Packed and dispatched within 1 to 2 days of the order", source: "Warehouse system" },
      { id: "o2", field: "transitDays", extent: { lo: 3, hi: 5 }, quote: "Standard international transit takes 3 to 5 days", source: "Carrier SLA sheet" },
      { id: "o3", field: "customsDays", extent: { lo: 0, hi: 2 }, quote: "Customs clearance takes 0 to 2 days", source: "Customs bulletin" },
    ]);
    for (const e of brief.evidence) expect(g.observations.some((o) => o === e || o.extent === e.extent)).toBe(false);
  });

  it("an empty draft is a Brief with the question's ruling alone", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = ok(g, claim("deliveryDay", 4, null), []);
    expect(brief.claims).toStrictEqual([]);
    expect(brief.rejected).toStrictEqual([]);
    expect(brief.answer.kind).toBe("entailed");
    expect(evidenceIds(brief)).toStrictEqual(["o1", "o2"]);
  });

  it("an ungrounded question and an empty draft carry no evidence at all", () => {
    const g = groundOf(DESK, []);
    const brief = ok(g, claim("deliveryDay", null, 12), []);
    expect(brief.answer.kind).toBe("ungrounded");
    expect(brief.evidence).toStrictEqual([]);
  });
});

describe("a draft that mixes rulings and faults: every position is in claims or in rejected once, in draft order", () => {
  const g = groundOf(DESK, canon("o1", "o2", "o3"));
  const draft: unknown[] = [
    claim("packDays", 1, 1), //                       0 ruled
    { field: "ghost", extent: { lo: 1, hi: 2 } }, //  1 unknown-field
    claim("customsDays", 1, 1), //                    2 ruled
    null, //                                          3 malformed (both)
    { field: "packDays", extent: { lo: null, hi: null } }, // 4 vacuous
    claim("deliveryDay", 6, 6), //                    5 ruled
    { field: "packDays", extent: { lo: 5, hi: 2 } }, // 6 malformed (extent)
  ];
  const brief = ok(g, claim("deliveryDay", null, 12), draft);

  it("the rulings are the ruled positions, in order, each equal to rule on that element", () => {
    expect(brief.claims).toHaveLength(3);
    [0, 2, 5].forEach((position, i) => {
      const direct = rule(g, draft[position]);
      expect(direct.ok && direct.entailment, `position ${position}`).toStrictEqual(brief.claims[i]);
    });
  });
  it("the refusals are the faulty positions, with their own index and the fault readClaim gives, in order", () => {
    expect(brief.rejected).toStrictEqual([
      { index: 1, fault: { kind: "unknown-field", field: "ghost" } },
      { index: 3, fault: { kind: "malformed", fields: ["extent", "field"] } },
      { index: 4, fault: { kind: "vacuous-claim", field: "packDays" } },
      { index: 6, fault: { kind: "malformed", fields: ["extent"] } },
    ]);
  });
  it("positions 0 to 6 are covered exactly once between the two lists", () => {
    const ruledPositions = [0, 2, 5];
    const covered = [...ruledPositions, ...brief.rejected.map((r) => r.index)].sort();
    expect(covered).toStrictEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("the structure of a Brief on generated instances with faulty drafts", () => {
  const CHUNKS = 20;
  const PER = 50;
  const seen = { instances: 0, briefs: 0, rejected: 0, claims: 0, evidenceIds: 0, conflicts: 0 };
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    it(`seeds ${chunk * PER + 1} to ${chunk * PER + PER}`, () => {
      const problems: string[] = [];
      for (let seed = chunk * PER + 1; seed < chunk * PER + PER + 1; seed++) {
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
        const r = answer(g, question, draft);
        seen.instances += 1;
        const asked = rule(g, question);
        if (!asked.ok) {
          if (r.ok || r.failure.kind !== "question-rejected") problems.push(`seed ${seed}: a rejected question should fail the call`);
          continue;
        }
        if (!r.ok) {
          problems.push(`seed ${seed}: ${JSON.stringify(r.failure)}`);
          continue;
        }
        seen.briefs += 1;
        const b = r.brief;
        if (JSON.stringify(b.answer) !== JSON.stringify(asked.entailment)) problems.push(`seed ${seed}: the answer is not rule(question)`);
        // every position once, in order
        const ruled: number[] = [];
        let next = 0;
        const rejectedAt = new Map(b.rejected.map((x: ClaimRejection) => [x.index, x]));
        draft.forEach((element, index) => {
          const direct = rule(g, element);
          const refusal = rejectedAt.get(index);
          if (direct.ok) {
            ruled.push(index);
            if (refusal !== undefined) problems.push(`seed ${seed}: position ${index} is ruled and also refused`);
            if (JSON.stringify(b.claims[next]) !== JSON.stringify(direct.entailment)) problems.push(`seed ${seed}: claims[${next}] is not rule(draft[${index}])`);
            next += 1;
          } else if (refusal === undefined || JSON.stringify(refusal.fault) !== JSON.stringify(direct.fault)) problems.push(`seed ${seed}: position ${index} should be refused with ${JSON.stringify(direct.fault)}`);
        });
        if (next !== b.claims.length) problems.push(`seed ${seed}: ${b.claims.length} claims for ${next} ruled positions`);
        if (b.rejected.length + b.claims.length !== draft.length) problems.push(`seed ${seed}: ${b.rejected.length} + ${b.claims.length} != ${draft.length}`);
        if (JSON.stringify(b.rejected.map((x: ClaimRejection) => x.index)) !== JSON.stringify([...b.rejected.map((x: ClaimRejection) => x.index)].sort((x, y) => x - y))) problems.push(`seed ${seed}: rejected is not in draft order`);
        // the evidence: the union of what the rulings name, sorted, as copies of the grounding's own
        const named = new Set<string>();
        for (const e of [b.answer, ...b.claims] as Entailment[]) {
          if (e.kind === "conflicted") for (const id of e.core) named.add(id);
          else if (e.kind !== "ungrounded") for (const id of [...e.support.lo, ...e.support.hi]) named.add(id);
          if (e.kind === "conflicted") seen.conflicts += 1;
        }
        const want = [...named].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
        if (JSON.stringify(evidenceIds(b)) !== JSON.stringify(want)) problems.push(`seed ${seed}: evidence ${JSON.stringify(evidenceIds(b))}, the rulings name ${JSON.stringify(want)}`);
        for (const e of b.evidence) {
          const original = g.observations.find((o) => o.id === e.id);
          if (original === undefined || JSON.stringify(original) !== JSON.stringify(e) || original === e || original.extent === e.extent) problems.push(`seed ${seed}: evidence ${e.id} is not a fresh copy of the grounding's observation`);
        }
        seen.rejected += b.rejected.length;
        seen.claims += b.claims.length;
        seen.evidenceIds += want.length;
      }
      if (problems.length > 0) throw new Error(`${problems.length} problems, the first five:\n${problems.slice(0, 5).join("\n")}`);
    });
  }
  it("the generated drafts reached rulings, refusals, conflicts and evidence (needs every chunk above to have run)", () => {
    expect(seen.instances, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER);
    console.log(`answer structure: ${seen.instances} instances, ${seen.briefs} briefs, ${seen.claims} ruled claims, ${seen.rejected} refused claims, ${seen.conflicts} conflicted rulings, ${seen.evidenceIds} evidence entries`);
    expect(seen.briefs).toBeGreaterThanOrEqual(700);
    expect(seen.claims).toBeGreaterThanOrEqual(1500);
    expect(seen.rejected).toBeGreaterThanOrEqual(300);
    expect(seen.conflicts).toBeGreaterThanOrEqual(200);
    expect(seen.evidenceIds).toBeGreaterThanOrEqual(1000);
  });
});

describe("the question comes first: a rejected question fails the whole call, with the draft unread", () => {
  const g = groundOf(DESK, canon("o1", "o2"));
  it("each of the readClaim faults of the question is question-rejected, and nothing is built", () => {
    expect(answer(g, null, [])).toStrictEqual({ ok: false, failure: { kind: "question-rejected", fault: { kind: "malformed", fields: ["extent", "field"] } } });
    expect(answer(g, claim("ghost", 1, 2), [])).toStrictEqual({ ok: false, failure: { kind: "question-rejected", fault: { kind: "unknown-field", field: "ghost" } } });
    expect(answer(g, claim("packDays", null, null), [])).toStrictEqual({ ok: false, failure: { kind: "question-rejected", fault: { kind: "vacuous-claim", field: "packDays" } } });
  });
  it("a rejected question with a draft that is not an array is question-rejected, not draft-not-an-array", () => {
    expect(answer(g, null, "not a draft")).toStrictEqual({ ok: false, failure: { kind: "question-rejected", fault: { kind: "malformed", fields: ["extent", "field"] } } });
  });
  it("the draft is not touched when the question is rejected: a Proxy over it sees no trap", () => {
    const log: string[] = [];
    const draft = logged([claim("packDays", 1, 1)], log);
    expect(answer(g, null, draft).ok).toBe(false);
    expect(log).toStrictEqual([]);
  });
  it("a draft that fails does not hide a question that is fine: the order is question, then draft shape", () => {
    expect(answer(g, claim("deliveryDay", 4, null), "x")).toStrictEqual({ ok: false, failure: { kind: "draft-not-an-array" } });
  });
});

describe("the draft as an untrusted array", () => {
  const g = groundOf(DESK, canon("o1", "o2"));
  const q = claim("deliveryDay", 4, null);
  const failure = (draft: unknown): unknown => {
    const r = answer(g, q, draft);
    return r.ok ? r : r.failure;
  };

  it("anything that is not an array is draft-not-an-array: null, undefined, a number, a string, an object, an array-like, a typed array, a Set, a function", () => {
    for (const draft of [null, undefined, 3, "draft", { 0: claim("packDays", 1, 1), length: 1 }, new Uint8Array(2), new Set([1]), () => [], true, 1n, Symbol("d")]) {
      expect(failure(draft), String(typeof draft)).toStrictEqual({ kind: "draft-not-an-array" });
    }
  });

  it(`${MAX_DRAFT_CLAIMS} claims are ruled; ${MAX_DRAFT_CLAIMS + 1} are draft-too-long, from the length alone`, () => {
    const claims = (n: number): unknown[] => Array.from({ length: n }, (_, i) => claim("packDays", 1, 1 + (i % 2)));
    expect(ok(g, q, claims(MAX_DRAFT_CLAIMS)).claims).toHaveLength(MAX_DRAFT_CLAIMS);
    expect(failure(claims(MAX_DRAFT_CLAIMS + 1))).toStrictEqual({ kind: "draft-too-long", count: MAX_DRAFT_CLAIMS + 1, max: MAX_DRAFT_CLAIMS });
    const log: string[] = [];
    expect(failure(logged(claims(MAX_DRAFT_CLAIMS + 1), log))).toStrictEqual({ kind: "draft-too-long", count: MAX_DRAFT_CLAIMS + 1, max: MAX_DRAFT_CLAIMS });
    expect(log, "length is read once and no element is read").toStrictEqual(["get:length"]);
  });

  it("a Proxy that claims 2**32 - 1 elements is draft-too-long and none of them is read", () => {
    const log: string[] = [];
    const huge = new Proxy([], {
      get: (t, key, receiver) => {
        log.push(`get:${String(key)}`);
        return key === "length" ? 2 ** 32 - 1 : Reflect.get(t, key, receiver);
      },
    });
    expect(failure(huge)).toStrictEqual({ kind: "draft-too-long", count: 2 ** 32 - 1, max: MAX_DRAFT_CLAIMS });
    expect(log).toStrictEqual(["get:length"]);
  });

  it("a length that is not a count is hostile-input: NaN, a negative, a fraction, Infinity, a string, null, undefined, an object", () => {
    for (const [name, length] of [["NaN", Number.NaN], ["negative", -1], ["fraction", 1.5], ["Infinity", Number.POSITIVE_INFINITY], ["string", "3"], ["null", null], ["undefined", undefined], ["object", {}], ["unsafe", 2 ** 53]] as const) {
      const lying = new Proxy([claim("packDays", 1, 1)], { get: (t, key, receiver) => (key === "length" ? length : Reflect.get(t, key, receiver)) });
      expect(failure(lying), name).toStrictEqual({ kind: "hostile-input", message: "the draft has no usable length" });
    }
  });

  it("a revoked Proxy as the draft, and a length that throws, are hostile-input, in this package's words", () => {
    const dead = Proxy.revocable([], {});
    dead.revoke();
    expect(failure(dead.proxy)).toStrictEqual({ kind: "hostile-input", message: "reading the draft threw" });
    const throwing = new Proxy([], { get: (t, key, receiver) => { if (key === "length") throw new Error("SECRET-DRAFT"); return Reflect.get(t, key, receiver); } });
    const r = failure(throwing);
    expect(r).toStrictEqual({ kind: "hostile-input", message: "reading draft.length threw" });
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("an element whose read throws is refused as a claim with hostile-input, and the others are ruled", () => {
    const draft: unknown[] = [claim("packDays", 1, 1), null, claim("transitDays", 4, 4)];
    Object.defineProperty(draft, 1, { enumerable: true, get: () => { throw new Error("SECRET-ELEMENT"); } });
    const brief = ok(g, q, draft);
    expect(brief.claims.map((c) => c.field)).toStrictEqual(["packDays", "transitDays"]);
    expect(brief.rejected).toStrictEqual([{ index: 1, fault: { kind: "hostile-input", message: "reading draft[1] threw" } }]);
    expect(JSON.stringify(brief)).not.toContain("SECRET");
  });

  it("holes in a sparse array are undefined elements: malformed, not skipped", () => {
    // eslint-disable-next-line no-sparse-arrays
    const brief = ok(g, q, [claim("packDays", 1, 1), , claim("transitDays", 4, 4)]);
    expect(brief.rejected).toStrictEqual([{ index: 1, fault: { kind: "malformed", fields: ["extent", "field"] } }]);
    expect(brief.claims).toHaveLength(2);
  });

  it("duplicate claims are ruled each: nothing deduplicates a draft", () => {
    const brief = ok(g, q, [claim("packDays", 1, 1), claim("packDays", 1, 1)]);
    expect(brief.claims).toHaveLength(2);
    expect(brief.claims[0]).toStrictEqual(brief.claims[1]);
  });

  it("a draft that is a subclass of Array (Array.isArray is true) is read as an array", () => {
    class Draft extends Array<unknown> {}
    const d = new Draft();
    d.push(claim("packDays", 1, 1));
    expect(ok(g, q, d).claims).toHaveLength(1);
  });
});

describe("read-once: the draft's length and each element are read once, whatever they say the second time", () => {
  const g = groundOf(DESK, canon("o1", "o2"));
  const q = claim("deliveryDay", 4, null);
  const THROW = Symbol.for("throw");
  const LATER: readonly unknown[] = [Number.NaN, null, "x", 99, undefined, THROW, { field: "deliveryDay", extent: { lo: 1, hi: 1 } }, -1];

  const lengths: readonly (readonly [string, unknown])[] = [
    ["zero", 0], ["one", 1], ["three", 3], ["the limit", MAX_DRAFT_CLAIMS], ["one past the limit", MAX_DRAFT_CLAIMS + 1], ["2**32 - 1", 2 ** 32 - 1],
    ["null", null], ["NaN", Number.NaN], ["negative", -3], ["fraction", 1.5], ["Infinity", Number.POSITIVE_INFINITY], ["string", "2"], ["undefined", undefined], ["negative zero", -0],
  ];
  for (const [name, first] of lengths) {
    it(`the length reads ${name} once and the answer equals the one for a draft whose length is that value alone`, () => {
      const items = [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2)];
      const make = (probe: { get: () => unknown }) => new Proxy(items, { get: (t, key, receiver) => (key === "length" ? probe.get() : Reflect.get(t, key, receiver)) });
      const plain = counted(first, first);
      const want = answer(g, q, make(plain));
      for (const later of LATER) {
        const probe = counted(first, later);
        const got = answer(g, q, make(probe));
        expect(probe.reads(), `length reads (later ${String(later)})`).toBe(1);
        expect(got).toStrictEqual(want);
      }
    });
  }

  it("each element is read once, in index order, and exactly the elements below the length are read", () => {
    const log: string[] = [];
    const items = [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2)];
    const brief = ok(g, q, logged(items, log));
    expect(brief.claims).toHaveLength(3);
    expect(log).toStrictEqual(["get:length", "get:0", "get:1", "get:2"]);
  });

  for (const [name, first] of FIRST_VALUES) {
    it(`an element whose first read is ${name} is read once and gives what a plain element holding it gives`, () => {
      const build = (put: (draft: unknown[]) => void): unknown[] => {
        const draft: unknown[] = [claim("packDays", 1, 1), null];
        put(draft);
        return draft;
      };
      const want = answer(g, q, build((d) => void (d[1] = first)));
      for (const later of LATER) {
        const probe = counted(first, later);
        const got = answer(g, q, build((d) => defineCounted(d, 1, probe)));
        expect(probe.reads(), `element reads (later ${String(later)})`).toBe(1);
        expect(got).toStrictEqual(want);
      }
    });
  }

  it("an element's own properties are read once each through the draft: field and extent once, lo and hi once", () => {
    const fieldProbe = counted("packDays", "transitDays");
    const extentProbe = counted({ lo: 1, hi: 2 }, { lo: 0, hi: 0 });
    const element = {};
    defineCounted(element, "field", fieldProbe);
    defineCounted(element, "extent", extentProbe);
    const brief = ok(g, q, [element]);
    expect(fieldProbe.reads()).toBe(1);
    expect(extentProbe.reads()).toBe(1);
    expect(brief.claims[0]?.field).toBe("packDays");
  });

  it("the question's own properties are read once each", () => {
    const fieldProbe = counted("deliveryDay", "packDays");
    const loProbe = counted(4, 0);
    const extent = {};
    defineCounted(extent, "lo", loProbe);
    Object.defineProperty(extent, "hi", { value: null, enumerable: true });
    const question = {};
    defineCounted(question, "field", fieldProbe);
    Object.defineProperty(question, "extent", { value: extent, enumerable: true });
    expect(answer(g, question, []).ok).toBe(true);
    expect(fieldProbe.reads()).toBe(1);
    expect(loProbe.reads()).toBe(1);
  });

  it("a shuffled draft gives the shuffled claims: order in, order out", () => {
    const items = [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2), claim("deliveryDay", 7, 7)];
    const order = shuffled(mulberry32(5), [0, 1, 2, 3]);
    const brief = ok(g, q, order.map((i) => items[i]));
    expect(brief.claims.map((c) => c.field)).toStrictEqual(order.map((i) => (items[i] as { field: string }).field));
  });
});

describe("a snapshot with nothing in it, and a schema of one field", () => {
  it("a grounding of no observations: every ruled claim is ungrounded, the evidence is empty", () => {
    const g = groundOf(schemaOf(base("x")), []);
    const brief = ok(g, claim("x", 3, null), [claim("x", 5, 6), claim("x", null, 9)]);
    expect(kindsOf(brief)).toStrictEqual(["ungrounded", "ungrounded", "ungrounded"]);
    expect(brief.evidence).toStrictEqual([]);
  });
  it("an observation nobody's ruling needs is not evidence", () => {
    const g = groundOf(schemaOf(base("x"), base("y")), [obs("ox", "x", 3, 5), obs("oy", "y", 1, 2)]);
    const brief = ok(g, claim("x", null, 9), []);
    expect(evidenceIds(brief)).toStrictEqual(["ox"]);
  });
});
