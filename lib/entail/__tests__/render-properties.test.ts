import { describe, expect, it } from "vitest";
import { fieldId, obsId } from "../../contracts/index.js";
import type { Brief, Entailment, Extent, Schema } from "../../contracts/index.js";
import { answer, renderBrief, renderEntailment, rule } from "../index.js";
import { DESK, STEPS, base, canon, claim, derived, digitTokens, groundOf, obs, scenarioOf, schemaOf } from "./fixtures.js";

/**
 * RENDERING (plan section 6, M5, layer 3): a sentence is a one-way projection of a checked ruling (D1).
 *
 *  1. EXACT STRINGS for the plan's section 7: every ruling of its six steps, and the whole `renderBrief` of each, with
 *     the schema labels a reader would write. The plan's own sample sentences are illustrative; these are pinned.
 *  2. PROPERTIES on 600 generated scenarios (the rulings of the Brief `answer` makes: the question and the draft's
 *     claims), against a schema whose labels and units contain no digit, so a digit in the text came from somewhere
 *     else: for every ruling the text contains the formatted `tested` extent, for entailed, weakened and contradicted
 *     the formatted `established` extent and every id of its support, for weakened the cut named in the sides `unmet`
 *     has and the label of every open end with its direction, for ungrounded every open end, for conflicted every id
 *     of the core; and THE DIGIT TOKENS OF THE TEXT ARE A SUBSET of the digit tokens of the ruling's own numbers and
 *     the ids it names. A rendering may add words, never a number.
 *     The property restates the extent wording independently of `render.ts`, and has a control that fails it.
 *  3. WHAT IS NOT PRINTED: an observation's `quote` and `source`, and the text a refused draft claim carried.
 *  4. EDGES: a field the schema does not declare is printed by its id; a hand-built Brief is rendered as given.
 *  5. AT THE MAXIMUM the contracts allow: a support of 32 ids, rendered in full.
 */

// ---------------------------------------------------------------------------------------------------------
// 1. Exact strings.
// ---------------------------------------------------------------------------------------------------------

const PACK_WEAK =
  "Not established: packing exactly 1 days. What the evidence does establish: packing between 1 and 2 days (lower bound from o1; upper bound from o1). Withheld: the upper bound. No quantity is named as missing.";
const TRANSIT_WEAK =
  "Not established: transit exactly 4 days. What the evidence does establish: transit between 3 and 5 days (lower bound from o2; upper bound from o2). Withheld: the lower and upper bound. No quantity is named as missing.";
const CUSTOMS_UNGROUNDED =
  "Cannot answer: customs clearance exactly 2 days. The evidence does not move customs clearance from what the schema implies. Missing: no document bounds customs clearance from below; no document bounds customs clearance from above.";
const DELIVERY_7_WEAK =
  "Not established: delivery exactly 7 days. What the evidence does establish: delivery at least 4 days (lower bound from o1, o2; no upper bound). Withheld: the lower and upper bound. No document bounds customs clearance from above.";
const STEP1_DRAFT = [PACK_WEAK, TRANSIT_WEAK, CUSTOMS_UNGROUNDED, DELIVERY_7_WEAK];
const CONFLICT = "Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.";
const STEP6_CUSTOMS = "Ruled out: customs clearance exactly 2 days. The evidence gives customs clearance between 7 and 10 days (lower bound from o1, o2, o4; upper bound from o1, o2, o4).";

/** Per step: the exact text of the question's ruling, then of each draft claim's. */
const EXPECTED: readonly (readonly [string, readonly string[]])[] = [
  [
    "Not established: delivery at most 12 days. What the evidence does establish: delivery at least 4 days (lower bound from o1, o2; no upper bound). Withheld: the upper bound. No document bounds customs clearance from above.",
    STEP1_DRAFT,
  ],
  ["Established: delivery at least 4 days. The evidence gives delivery at least 4 days (lower bound from o1, o2; no upper bound).", STEP1_DRAFT],
  ["Ruled out: delivery at most 3 days. The evidence gives delivery at least 4 days (lower bound from o1, o2; no upper bound).", STEP1_DRAFT],
  [
    "Established: delivery at most 12 days. The evidence gives delivery between 4 and 9 days (lower bound from o1, o2; upper bound from o1, o2, o3).",
    [
      PACK_WEAK,
      TRANSIT_WEAK,
      "Not established: customs clearance exactly 1 days. What the evidence does establish: customs clearance between 0 and 2 days (lower bound from the schema only; upper bound from o3). Withheld: the lower and upper bound. No document bounds customs clearance from below.",
      "Not established: delivery exactly 6 days. What the evidence does establish: delivery between 4 and 9 days (lower bound from o1, o2; upper bound from o1, o2, o3). Withheld: the lower and upper bound. No quantity is named as missing.",
    ],
  ],
  [
    `Refused: delivery at most 12 days. ${CONFLICT}`,
    [`Refused: packing exactly 1 days. ${CONFLICT}`, `Refused: transit exactly 4 days. ${CONFLICT}`, `Refused: customs clearance exactly 1 days. ${CONFLICT}`, `Refused: delivery exactly 6 days. ${CONFLICT}`],
  ],
  [
    "Ruled out: customs clearance at most 3 days. The evidence gives customs clearance between 7 and 10 days (lower bound from o1, o2, o4; upper bound from o1, o2, o4).",
    [PACK_WEAK, TRANSIT_WEAK, STEP6_CUSTOMS, "Established: delivery exactly 14 days. The evidence gives delivery exactly 14 days (lower bound from o4; upper bound from o4)."],
  ],
];

describe("the plan's section 7: the exact text of every ruling of its six steps, and of each Brief", () => {
  for (const step of STEPS) {
    const [questionText, draftTexts] = EXPECTED[step.number - 1] as readonly [string, readonly string[]];
    it(`step ${step.number}: the question and its ${draftTexts.length} draft claims, one by one`, () => {
      const g = groundOf(DESK, canon(...step.ids));
      const made = answer(g, step.question, step.draft);
      if (!made.ok) throw new Error("fixture");
      expect(renderEntailment(g.schema, made.brief.answer)).toBe(questionText);
      expect(made.brief.claims).toHaveLength(draftTexts.length);
      made.brief.claims.forEach((ruling, i) => expect(renderEntailment(g.schema, ruling), `claims[${i}]`).toBe(draftTexts[i]));
    });
    it(`step ${step.number}: the whole Brief is the question, then the draft claims as a list`, () => {
      const g = groundOf(DESK, canon(...step.ids));
      const made = answer(g, step.question, step.draft);
      if (!made.ok) throw new Error("fixture");
      expect(renderBrief(g.schema, made.brief)).toBe(["Question: " + questionText, "Draft claims:", ...draftTexts.map((t) => `- ${t}`)].join("\n"));
    });
  }

  it("a Brief with no draft claims says so, and one with refusals lists each by position without echoing the draft", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const empty = answer(g, claim("deliveryDay", 4, null), []);
    if (!empty.ok) throw new Error("fixture");
    expect(renderBrief(g.schema, empty.brief)).toBe(
      "Question: Established: delivery at least 4 days. The evidence gives delivery at least 4 days (lower bound from o1, o2; no upper bound).\nNo draft claims were ruled.",
    );
    const mixed = answer(g, claim("deliveryDay", 4, null), [
      { field: "SECRET-9999", extent: { lo: 1, hi: 2 } },
      null,
      { field: "packDays", extent: { lo: 5, hi: 1 } },
      claim("packDays", 0, null),
      { field: "packDays", get extent() { throw new Error("TOKEN-31337"); } },
    ]);
    if (!mixed.ok) throw new Error("fixture");
    const text = renderBrief(g.schema, mixed.brief);
    expect(text.split("\n").slice(1)).toStrictEqual([
      "No draft claims were ruled.",
      "Refused before ruling:",
      "- draft position 0: the claim names a quantity the schema does not declare",
      "- draft position 1: the claim is not well formed (extent, field)",
      "- draft position 2: the claim is not well formed (extent)",
      "- draft position 3: the claim rules nothing out about packing, which the schema already implies",
      "- draft position 4: the claim could not be read safely",
    ]);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("9999");
    expect(text).not.toContain("TOKEN");
    expect(text).not.toContain("31337");
  });
});

// ---------------------------------------------------------------------------------------------------------
// 2. Properties on generated scenarios.
// ---------------------------------------------------------------------------------------------------------

/** The wording of an extent, restated here and not imported: the property's own reference. */
function phrase(extent: Extent, unit: string): string {
  const suffix = unit === "" ? "" : ` ${unit}`;
  const { lo, hi } = extent;
  if (lo !== null && hi !== null) return lo === hi ? `exactly ${lo}${suffix}` : `between ${lo} and ${hi}${suffix}`;
  if (lo !== null) return `at least ${lo}${suffix}`;
  if (hi !== null) return `at most ${hi}${suffix}`;
  return "any value";
}

/** Every digit token the ruling itself can account for: its bounds, and the ids it names. Labels and units of the generated schemas have none. */
function allowedDigits(e: Entailment): Set<string> {
  const allowed = new Set<string>();
  const addNumber = (n: number | null): void => void (n !== null && allowed.add(String(Math.abs(n))));
  addNumber(e.tested.lo);
  addNumber(e.tested.hi);
  if (e.kind === "entailed" || e.kind === "weakened" || e.kind === "contradicted") {
    addNumber(e.established.lo);
    addNumber(e.established.hi);
    for (const id of [...e.support.lo, ...e.support.hi]) for (const token of digitTokens(id)) allowed.add(token);
  }
  if (e.kind === "conflicted") for (const id of e.core) for (const token of digitTokens(id)) allowed.add(token);
  for (const token of digitTokens(e.field)) allowed.add(token);
  return allowed;
}

/** The problems with one rendered ruling, as strings; empty when it passes. `labels` maps a field id to its label. */
function problemsWith(text: string, e: Entailment, schema: Schema): string[] {
  const out: string[] = [];
  const decl = (id: string) => schema.fields.find((f) => f.id === id);
  const unit = decl(e.field)?.unit ?? "";
  const label = (id: string): string => decl(id)?.label ?? id;
  const gap = (end: { readonly field: string; readonly side: "lo" | "hi" }): string => `no document bounds ${label(end.field)} ${end.side === "lo" ? "from below" : "from above"}`;
  if (!text.includes(phrase(e.tested, unit))) out.push(`tested "${phrase(e.tested, unit)}" is missing`);
  if (e.kind === "entailed" || e.kind === "weakened" || e.kind === "contradicted") {
    if (!text.includes(phrase(e.established, unit))) out.push(`established "${phrase(e.established, unit)}" is missing`);
    for (const id of [...e.support.lo, ...e.support.hi]) if (!text.includes(id)) out.push(`support id ${id} is missing`);
  }
  if (e.kind === "weakened") {
    const cut = e.unmet.map((side) => (side === "lo" ? "lower" : "upper")).join(" and ");
    if (!text.includes(`Withheld: the ${cut} bound.`)) out.push(`the cut "${cut}" is not named as withheld`);
    // a weakened ruling's gaps open the sentence after "Withheld", so the first is capitalised
    for (const end of e.openEnds) if (!text.toLowerCase().includes(gap(end).toLowerCase())) out.push(`open end ${end.field}/${end.side} is missing`);
    if (e.openEnds.length === 0 && !text.includes("No quantity is named as missing.")) out.push("an empty open-end list is not said");
  }
  if (e.kind === "ungrounded") {
    for (const end of e.openEnds) if (!text.includes(gap(end))) out.push(`open end ${end.field}/${end.side} is missing`);
  }
  if (e.kind === "conflicted") {
    for (const id of e.core) if (!text.includes(id)) out.push(`core id ${id} is missing`);
    if (!text.includes("cannot all be true")) out.push("the conflict is not stated");
  }
  const allowed = allowedDigits(e);
  for (const token of digitTokens(text)) if (!allowed.has(token)) out.push(`digit token ${token} is in no field of the ruling`);
  return out;
}

const CHUNKS = 24;
const PER_CHUNK = 25;
const seen = { scenarios: 0, rulings: 0, byKind: new Map<string, number>(), digitTokens: 0, maxSupportIds: 0, maxOpenEnds: 0, maxBriefRulings: 0, negativeBounds: 0 };
const bump = (map: Map<string, number>, key: string): void => void map.set(key, (map.get(key) ?? 0) + 1);

describe("on generated scenarios every rendering holds the ruling's extents, ids and cut, and no digit the ruling lacks", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const s = scenarioOf(seed);
        const made = answer(s.grounding, s.question, s.draft);
        seen.scenarios += 1;
        if (!made.ok) continue;
        const brief = made.brief;
        const schema = s.grounding.schema;
        const rulings = [brief.answer, ...brief.claims];
        seen.maxBriefRulings = Math.max(seen.maxBriefRulings, rulings.length);
        for (const ruling of rulings) {
          const text = renderEntailment(schema, ruling);
          seen.rulings += 1;
          bump(seen.byKind, ruling.kind);
          seen.digitTokens += digitTokens(text).length;
          if (ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted") seen.maxSupportIds = Math.max(seen.maxSupportIds, ruling.support.lo.length, ruling.support.hi.length);
          if (ruling.kind === "weakened" || ruling.kind === "ungrounded") seen.maxOpenEnds = Math.max(seen.maxOpenEnds, ruling.openEnds.length);
          if ((ruling.tested.lo ?? 0) < 0 || (ruling.tested.hi ?? 0) < 0) seen.negativeBounds += 1;
          for (const problem of problemsWith(text, ruling, schema)) problems.push(`seed ${seed} ${ruling.kind}: ${problem}`);
          // a rendering is a function of the ruling and the schema: twice is the same
          if (renderEntailment(schema, ruling) !== text) problems.push(`seed ${seed}: two renderings differ`);
        }
        const whole = renderBrief(schema, brief);
        for (const ruling of rulings) if (!whole.includes(renderEntailment(schema, ruling))) problems.push(`seed ${seed}: the Brief's text lacks a ruling's text`);
        for (const refusal of brief.rejected) if (!whole.includes(`draft position ${refusal.index}:`)) problems.push(`seed ${seed}: the refusal at ${refusal.index} is not listed`);
        const allowed = new Set<string>();
        for (const ruling of rulings) for (const token of allowedDigits(ruling)) allowed.add(token);
        for (const refusal of brief.rejected) allowed.add(String(refusal.index));
        for (const token of digitTokens(whole)) if (!allowed.has(token)) problems.push(`seed ${seed}: the Brief's text has digit token ${token}, in no ruling and no refusal position`);
      }
      if (problems.length > 0) throw new Error(`${problems.length} problems, the first five:\n${problems.slice(0, 5).join("\n")}`);
    });
  }

  it("the generator reached every kind, supports, open ends and refusals (needs every chunk above to have run)", () => {
    expect(seen.scenarios, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK);
    console.log(
      `render: ${seen.scenarios} scenarios, ${seen.rulings} rulings (${[...seen.byKind].sort().map(([k, v]) => `${k} ${v}`).join(", ")}), ${seen.digitTokens} digit tokens checked, ` +
        `most ids in one support ${seen.maxSupportIds}, most open ends ${seen.maxOpenEnds}, most rulings in a Brief ${seen.maxBriefRulings}, ${seen.negativeBounds} rulings with a negative tested bound`,
    );
    for (const kind of ["entailed", "weakened", "contradicted", "ungrounded", "conflicted"]) expect(seen.byKind.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(100);
    expect(seen.maxSupportIds).toBeGreaterThanOrEqual(2);
    expect(seen.maxOpenEnds).toBeGreaterThanOrEqual(2);
    expect(seen.digitTokens).toBeGreaterThanOrEqual(5000);
  });
});

describe("the property can fail: each of these renderings is reported", () => {
  const g = groundOf(DESK, canon("o1", "o2"));
  const ruled = (raw: unknown): { e: Entailment; text: string } => {
    const r = rule(g, raw);
    if (!r.ok) throw new Error("fixture");
    return { e: r.entailment, text: renderEntailment(g.schema, r.entailment) };
  };
  const weakened = ruled(claim("deliveryDay", null, 12));
  const entailed = ruled(claim("deliveryDay", 4, null));
  const conflicted = rule(groundOf(DESK, canon("o1", "o2", "o3", "o4")), claim("deliveryDay", null, 12));

  it("the honest renderings pass", () => {
    expect(problemsWith(weakened.text, weakened.e, g.schema)).toEqual([]);
    expect(problemsWith(entailed.text, entailed.e, g.schema)).toEqual([]);
    if (!conflicted.ok) throw new Error("fixture");
    expect(problemsWith(renderEntailment(g.schema, conflicted.entailment), conflicted.entailment, g.schema)).toEqual([]);
  });
  it("a constant sentence with a number in it ('typically 2 days') is a digit token in no field", () => {
    expect(problemsWith(`${weakened.text} Delivery is typically 8 days.`, weakened.e, g.schema)).toContain("digit token 8 is in no field of the ruling");
    expect(problemsWith(`${entailed.text} Typically 7 days.`, entailed.e, g.schema)).toContain("digit token 7 is in no field of the ruling");
  });
  it("a rendering that drops the cut, the established extent, an id or the tested extent is reported", () => {
    expect(problemsWith(weakened.text.replace("Withheld: the upper bound.", ""), weakened.e, g.schema)).toContain('the cut "upper" is not named as withheld');
    expect(problemsWith(weakened.text.replace("at least 4 days", "something"), weakened.e, g.schema).some((p) => p.startsWith("established"))).toBe(true);
    expect(problemsWith(entailed.text.replaceAll("o2", "xx"), entailed.e, g.schema)).toContain("support id o2 is missing");
    expect(problemsWith(weakened.text.replace("at most 12 days", "something"), weakened.e, g.schema).some((p) => p.startsWith("tested"))).toBe(true);
  });
  it("a rendering that drops the open end, or a core id, is reported", () => {
    expect(problemsWith(weakened.text.replace("No document bounds customs clearance from above.", ""), weakened.e, g.schema).some((p) => p.startsWith("open end"))).toBe(true);
    if (!conflicted.ok) throw new Error("fixture");
    const text = renderEntailment(g.schema, conflicted.entailment).replace("o3, ", "");
    expect(problemsWith(text, conflicted.entailment, g.schema)).toContain("core id o3 is missing");
  });
});

// ---------------------------------------------------------------------------------------------------------
// 4. Edges.
// ---------------------------------------------------------------------------------------------------------

describe("edges: a field the schema does not declare, a hand-built Brief, and every wording of an extent", () => {
  const g = groundOf(DESK, canon("o1", "o2"));

  it("a ruling about a field the schema does not declare is printed by its id, with no unit, and does not throw", () => {
    const e: Entailment = { kind: "entailed", field: fieldId("elsewhere"), tested: { lo: 2, hi: null }, established: { lo: 3, hi: null }, support: { lo: [obsId("o9")], hi: [] } };
    expect(renderEntailment(g.schema, e)).toBe("Established: elsewhere at least 2. The evidence gives elsewhere at least 3 (lower bound from o9; no upper bound).");
  });
  it("every wording of an extent, on the unit of the field", () => {
    const wording = (extent: Extent): string => {
      const e: Entailment = { kind: "contradicted", field: fieldId("packDays"), tested: extent, established: { lo: 1, hi: 2 }, support: { lo: [], hi: [] } };
      return renderEntailment(g.schema, e);
    };
    expect(wording({ lo: 3, hi: null })).toContain("Ruled out: packing at least 3 days.");
    expect(wording({ lo: null, hi: 3 })).toContain("Ruled out: packing at most 3 days.");
    expect(wording({ lo: 3, hi: 7 })).toContain("Ruled out: packing between 3 and 7 days.");
    expect(wording({ lo: 3, hi: 3 })).toContain("Ruled out: packing exactly 3 days.");
    expect(wording({ lo: -4, hi: -2 })).toContain("Ruled out: packing between -4 and -2 days.");
    expect(wording({ lo: null, hi: null })).toContain("Ruled out: packing any value.");
    expect(wording({ lo: 0, hi: 0 })).toContain("Ruled out: packing exactly 0 days.");
  });
  it("an empty support on a side says whether the bound is the schema's or there is none", () => {
    const schema = schemaOf(base("a", 0, 10), base("b", 0, null), derived("c", ["a", "b"]));
    const gg = groundOf(schema, [obs("oa", "a", 2, 6)]);
    const r = rule(gg, { field: "a", extent: { lo: 3, hi: null } });
    expect(r.ok && renderEntailment(gg.schema, r.entailment)).toBe("Not established: a label at least 3 days. What the evidence does establish: a label between 2 and 6 days (lower bound from oa; upper bound from oa). Withheld: the lower bound. No quantity is named as missing.");
    const free = rule(groundOf(schema, [obs("ob", "b", 4, null)]), { field: "b", extent: { lo: 5, hi: null } });
    expect(free.ok && renderEntailment(gg.schema, free.entailment)).toBe("Not established: b label at least 5 days. What the evidence does establish: b label at least 4 days (lower bound from ob; no upper bound). Withheld: the lower bound. No quantity is named as missing.");
    const floor = rule(groundOf(schema, [obs("ob", "b", null, 9)]), { field: "b", extent: { lo: 1, hi: 8 } });
    expect(floor.ok && renderEntailment(gg.schema, floor.entailment)).toBe("Not established: b label between 1 and 8 days. What the evidence does establish: b label between 0 and 9 days (lower bound from the schema only; upper bound from ob). Withheld: the lower and upper bound. No document bounds b label from below.");
  });
  it("what an observation said is never printed: the quote and the source of every observation of the six steps are absent from every text", () => {
    const g6 = groundOf(DESK, canon("o1", "o2", "o3", "o4"));
    expect(g6.observations).toHaveLength(4);
    let checked = 0;
    for (const step of STEPS) {
      const gs = groundOf(DESK, canon(...step.ids));
      const made = answer(gs, step.question, step.draft);
      if (!made.ok) throw new Error("fixture");
      const text = renderBrief(gs.schema, made.brief);
      for (const o of g6.observations) {
        expect(o.quote.length).toBeGreaterThan(20);
        expect(text).not.toContain(o.quote);
        expect(text).not.toContain(o.source);
        checked += 2;
      }
    }
    expect(checked).toBe(48);
  });
  it("a Brief assembled by hand is rendered as given: nothing is checked, and a label that is the schema's text is printed as it is", () => {
    const e: Entailment = { kind: "ungrounded", field: fieldId("customsDays"), tested: { lo: 1, hi: 1 }, openEnds: [{ field: fieldId("customsDays"), side: "hi" }] };
    const brief: Brief = { answer: e, claims: [], rejected: [], evidence: [] };
    expect(renderBrief(g.schema, brief)).toBe(
      "Question: Cannot answer: customs clearance exactly 1 days. The evidence does not move customs clearance from what the schema implies. Missing: no document bounds customs clearance from above.\nNo draft claims were ruled.",
    );
  });
});

// ---------------------------------------------------------------------------------------------------------
// 5. At the maximum.
// ---------------------------------------------------------------------------------------------------------

describe("hand-worked at the maximum: a support of 32 ids, a field 31 levels up", () => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fields = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), ...Array.from({ length: 31 }, (_, i) => derived(`d${pad(i + 1)}`, [i === 0 ? "b00" : `d${pad(i)}`, `b${pad(i + 1)}`]))];
  const observations = Array.from({ length: 32 }, (_, i) => obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1));
  const g = groundOf(schemaOf(...fields), observations);
  const ids = (from: number, to: number): string => Array.from({ length: to - from + 1 }, (_, i) => `ob${pad(from + i)}`).join(", ");

  it("D31 is [496, 528] and its sentence names all 32 observations of the upper support and 31 of the lower, in order", () => {
    const r = rule(g, { field: "d31", extent: { lo: null, hi: 528 } });
    expect(r.ok && renderEntailment(g.schema, r.entailment)).toBe(
      `Established: d31 label at most 528 days. The evidence gives d31 label between 496 and 528 days (lower bound from ${ids(1, 31)}; upper bound from ${ids(0, 31)}).`,
    );
    expect(r.ok && r.entailment.kind === "entailed" && r.entailment.support.hi).toHaveLength(32);
  });
  it("one past it, weakened: the sentence carries the established extent and never the tested one", () => {
    const r = rule(g, { field: "d31", extent: { lo: null, hi: 527 } });
    const text = r.ok ? renderEntailment(g.schema, r.entailment) : "";
    expect(text).toBe(
      `Not established: d31 label at most 527 days. What the evidence does establish: d31 label between 496 and 528 days (lower bound from ${ids(1, 31)}; upper bound from ${ids(0, 31)}). Withheld: the upper bound. No quantity is named as missing.`,
    );
  });
});
