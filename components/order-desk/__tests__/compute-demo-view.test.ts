import { describe, expect, it } from "vitest";
import { obsId } from "../../../lib/contracts/index.js";
import type { Brief, Claim, Entailment, Observation, ObsId } from "../../../lib/contracts/index.js";
import { ground } from "../../../lib/ground/index.js";
import { answer, recheck, renderBrief, renderEntailment } from "../../../lib/entail/index.js";
import { CANON_SCRIPT, FIELDS, OBSERVATIONS, ORDER_DESK_SCHEMA, QUESTIONS, SNAPSHOTS, claimsOf, fluentDraft, renderFluent, runScript } from "../../../domains/order-desk/index.js";
import type { StepRun } from "../../../domains/order-desk/index.js";
import {
  CUSTOM_QUESTION,
  DOCUMENT_IDS,
  INITIAL_CUSTOM,
  INITIAL_STATE,
  PRESETS,
  computeDemoView,
  demoReducer,
  forgeTarget,
  pairwiseOf,
  subsetsOfSize,
} from "../compute-demo-view.js";
import type { CardView, CustomQuestion, DemoState, DemoView } from "../compute-demo-view.js";
import { oracleExtents, oracleKind } from "./support/oracle.js";
import type { ODoc, OExtents } from "./support/oracle.js";

/**
 * THE BRIDGE, CHECKED AGAINST AN ORACLE AND AGAINST THE DEMO. `plan section 6, M8`, checks (1) and (2), exhaustive because the
 * state space is finite: all 16 subsets of {o1..o4} x the 5 menu questions = 80 states. The oracle (`support/oracle.ts`)
 * lists every integer world and shares no code with the engine.
 */

const IDS = ["o1", "o2", "o3", "o4"] as const;

/** The 16 subsets of the four documents, in a fixed order (by bitmask). */
const SUBSETS: readonly (readonly ObsId[])[] = Array.from({ length: 16 }, (_, mask) => IDS.filter((_, bit) => (mask & (1 << bit)) !== 0).map((id) => obsId(id)));

const state = (included: readonly ObsId[], question: number, forge: DemoState["forge"] = null, custom: CustomQuestion = INITIAL_CUSTOM): DemoState => ({ included, question, forge, custom });

const ALL_80: readonly { readonly included: readonly ObsId[]; readonly question: number }[] = SUBSETS.flatMap((included) => QUESTIONS.map((_, question) => ({ included, question })));

function viewOf(s: DemoState): DemoView {
  const result = computeDemoView(s);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}: ${result.error.message}`);
  return result.view;
}

const docsOf = (included: readonly ObsId[]): ODoc[] => OBSERVATIONS.filter((o) => included.includes(o.id)).map((o) => ({ field: o.field, lo: o.extent.lo, hi: o.extent.hi }));
const oracleCache = new Map<string, OExtents | undefined>();
function oracleOf(included: readonly ObsId[]): OExtents | undefined {
  const key = included.join(",");
  if (!oracleCache.has(key)) oracleCache.set(key, oracleExtents(docsOf(included)));
  return oracleCache.get(key);
}

/** What the engine produces for a snapshot and a claim, through its public functions, without the bridge. */
function engineBrief(included: readonly ObsId[], claim: Claim): { readonly brief: Brief; readonly schema: typeof ORDER_DESK_SCHEMA } {
  const observations = OBSERVATIONS.filter((o) => included.includes(o.id));
  const grounded = ground(ORDER_DESK_SCHEMA, observations);
  if (!grounded.ok) throw new Error("ground failed");
  const answered = answer(grounded.grounding, claim, claimsOf(fluentDraft(observations, claim)));
  if (!answered.ok) throw new Error("answer failed");
  return { brief: answered.brief, schema: grounded.grounding.schema };
}

describe("plan check (1): all 16 subsets x all 5 menu questions = 80 states, against the oracle", () => {
  it("there are 80 states, each ok, with recheck intact, and the question's kind equals the oracle's", () => {
    expect(ALL_80).toHaveLength(80);
    const answerKinds = new Set<string>();
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      const claim = QUESTIONS[question]!.claim;
      const expected = oracleKind(oracleOf(included), claim.field, claim.extent);
      expect(view.intact, `intact for ${included.join(" ")} / ${question}`).toBe(true);
      expect(view.answer.kind, `question kind for ${included.join(" ")} / ${QUESTIONS[question]!.label}`).toBe(expected);
      answerKinds.add(view.answer.kind);
    }
    // every kind appears as a question's ruling somewhere in the 80
    expect([...answerKinds].sort()).toEqual(["conflicted", "contradicted", "entailed", "ungrounded", "weakened"]);
  });

  it("every draft claim's kind, in all 80 states, equals the oracle's too (4 x 80 = 320 more rulings)", () => {
    let rulings = 0;
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      expect(view.claims).toHaveLength(4);
      const draft = fluentDraft(OBSERVATIONS.filter((o) => included.includes(o.id)), QUESTIONS[question]!.claim);
      view.claims.forEach((card, index) => {
        const claim = draft.statements[index]!.claim;
        expect(card.kind, `${included.join(" ")} claim ${String(index + 1)}`).toBe(oracleKind(oracleOf(included), claim.field, claim.extent));
        rulings++;
      });
    }
    expect(rulings).toBe(320);
  });

  it("the pairwise table appears exactly when the question is conflicted, and only the four-document state is (in the menu)", () => {
    const conflicted: string[] = [];
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      expect(view.pairwise !== null).toBe(view.answer.kind === "conflicted");
      if (view.answer.kind === "conflicted") conflicted.push(`${included.join("+")}/${QUESTIONS[question]!.label}`);
    }
    // 5 menu questions, all conflicted when o1..o4 are all included
    expect(conflicted).toEqual(QUESTIONS.map((q) => `o1+o2+o3+o4/${q.label}`));
  });
});

describe("plan check (2): the forge, and the ungrounded cards", () => {
  it("in every state where the control is enabled, forging makes recheck report bound-differs for that ruling; elsewhere it is disabled", () => {
    let enabled = 0;
    let disabled = 0;
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      const { brief } = engineBrief(included, QUESTIONS[question]!.claim);
      // The expectation, by re-reading the engine's own Brief (not the bridge's forgeTarget): the first ruling in the order
      // answer, claim 1.. whose established upper bound is finite and cites support.
      const rulings: Entailment[] = [brief.answer, ...brief.claims];
      const expectedIndex = rulings.findIndex((r) => (r.kind === "entailed" || r.kind === "weakened" || r.kind === "contradicted") && r.established.hi !== null && r.support.hi.length > 0);
      expect(view.forge.available).toBe(expectedIndex !== -1);
      if (expectedIndex === -1) {
        disabled++;
        expect(view.forge.target).toBeNull();
        expect(view.forge.result).toBeNull();
        // asking for the forge in a state that cannot have one changes nothing and does not throw
        expect(viewOf(state(included, question, "raise-upper-bound")).forge.result).toBeNull();
        continue;
      }
      enabled++;
      const forgedView = viewOf(state(included, question, "raise-upper-bound"));
      const expectedName = expectedIndex === 0 ? "question" : `claim ${String(expectedIndex)}`;
      const honest = (rulings[expectedIndex] as Extract<Entailment, { established: unknown }>).established.hi as number;
      expect(forgedView.forge.target).toEqual({ name: expectedName, honest, forged: honest + 1 });
      const result = forgedView.forge.result;
      expect(result).not.toBeNull();
      expect(result!.intact).toBe(false);
      const finding = result!.findings.find((f) => f.name === expectedName)!;
      expect(finding.recheck.verdict).toBe("not-reproduced");
      expect(finding.recheck.reasonKind).toBe("bound-differs");
      expect(finding.recheck.text).toBe(`not re-derived: the upper bound says ${String(honest + 1)} but its own support gives ${String(honest)}`);
      // every other ruling still re-derives or is an absence
      for (const other of result!.findings.filter((f) => f.name !== expectedName)) expect(other.recheck.verdict).not.toBe("not-reproduced");
      // the sentence shown for the forged ruling is the engine's rendering of the forged ruling, with the raised bound
      expect(result!.sentence).toContain(String(honest + 1));
    }
    expect(enabled + disabled).toBe(80);
    expect(enabled).toBeGreaterThan(0);
    expect(disabled).toBeGreaterThan(0);
  });

  it("forging does not touch the honest Brief on screen: with the forge on or off, everything but forge.result is the same", () => {
    for (const { included, question } of ALL_80) {
      const off = viewOf(state(included, question));
      const on = viewOf(state(included, question, "raise-upper-bound"));
      expect({ ...on, forge: { ...on.forge, result: null } }).toEqual(off);
    }
  });

  it("in every state, every ungrounded card (question or claim) is uncertifiable-silence under recheck, and nothing is not-reproduced", () => {
    let ungrounded = 0;
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      for (const card of [view.answer, ...view.claims]) {
        if (card.kind === "ungrounded") {
          ungrounded++;
          expect(card.recheck.verdict).toBe("uncertifiable-silence");
        } else {
          expect(card.recheck.verdict).toBe("reproduced");
        }
      }
    }
    expect(ungrounded).toBeGreaterThan(0);
  });

  it("forgeTarget on a hand-built Brief: the answer first, else the first claim; a bound that is infinite or cites nothing is skipped", () => {
    const f = FIELDS.deliveryDay;
    const cites = { lo: [obsId("o1")], hi: [obsId("o2")] };
    const weakened = (hi: number | null, hiSupport: readonly ObsId[]): Entailment => ({ kind: "weakened", field: f, tested: { lo: null, hi: 12 }, established: { lo: 4, hi }, support: { lo: [obsId("o1")], hi: hiSupport }, unmet: ["hi"], openEnds: [] });
    const entailed = (hi: number | null, hiSupport: readonly ObsId[]): Entailment => ({ kind: "entailed", field: f, tested: { lo: null, hi: 12 }, established: { lo: 4, hi }, support: { lo: [obsId("o1")], hi: hiSupport } });
    const none: Entailment = { kind: "ungrounded", field: f, tested: { lo: null, hi: 12 }, openEnds: [{ field: f, side: "hi" }] };
    const brief = (answerRuling: Entailment, claims: Entailment[]): Brief => ({ answer: answerRuling, claims, rejected: [], evidence: [] });
    expect(forgeTarget(brief(entailed(9, cites.hi), [entailed(7, cites.hi)]))).toEqual({ position: "answer", honest: 9 });
    expect(forgeTarget(brief(none, [entailed(7, cites.hi), entailed(8, cites.hi)]))).toEqual({ position: 0, honest: 7 });
    expect(forgeTarget(brief(weakened(null, []), [entailed(9, []), weakened(6, cites.hi)]))).toEqual({ position: 1, honest: 6 });
    expect(forgeTarget(brief(weakened(null, []), [entailed(9, []), none]))).toBeUndefined();
  });
});

describe("the bridge shows the engine's own Brief, in full, not a summary of it", () => {
  const run = runScript();
  if (!run.ok) throw new Error("the demo script did not run");
  const steps: readonly StepRun[] = run.steps;

  /** The differences between a card and the engine's ruling it claims to show: contents, not just kind and position. */
  function cardDifferences(card: CardView, ruling: Entailment, schema: typeof ORDER_DESK_SCHEMA): string[] {
    const problems: string[] = [];
    if (card.kind !== ruling.kind) problems.push("kind");
    if (card.sentence !== renderEntailment(schema, ruling)) problems.push("sentence");
    const support = ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted" ? { lo: [...ruling.support.lo], hi: [...ruling.support.hi] } : null;
    if (JSON.stringify(card.support === null ? null : { lo: [...card.support.lo], hi: [...card.support.hi] }) !== JSON.stringify(support)) problems.push("support");
    const core = ruling.kind === "conflicted" ? [...ruling.core] : null;
    if (JSON.stringify(card.core === null ? null : [...card.core]) !== JSON.stringify(core)) problems.push("core");
    const labelOf = (field: string): string => schema.fields.find((decl) => decl.id === field)?.label ?? field;
    const gaps = ruling.kind === "weakened" || ruling.kind === "ungrounded" ? ruling.openEnds.map((end) => `${labelOf(end.field)}: nothing bounds it from ${end.side === "lo" ? "below" : "above"}`) : [];
    if (JSON.stringify([...card.openEnds]) !== JSON.stringify(gaps)) problems.push("open ends");
    const cut = ruling.kind === "weakened" ? `cut: ${ruling.unmet.map((side) => (side === "lo" ? "lower bound" : "upper bound")).join(" and ")}` : "";
    if (card.cut !== cut) problems.push("cut");
    return problems;
  }

  it("for each of the six scripted steps: the preset state yields the demo's paragraph, rendered Brief, and every card equal to the demo's ruling in full", () => {
    expect(PRESETS).toHaveLength(6);
    steps.forEach((step, index) => {
      const preset = PRESETS[index]!;
      expect(preset.step).toBe(step.step);
      expect([...preset.included]).toEqual([...step.snapshot]);
      expect(QUESTIONS[preset.question]!.label).toBe(step.questionLabel);
      const view = viewOf(demoReducer(INITIAL_STATE, { type: "preset", step: preset.step }));
      expect(view.paragraph).toBe(step.paragraph);
      expect(view.rendered).toBe(step.rendered);
      expect(view.intact).toBe(step.intact);
      expect(cardDifferences(view.answer, step.brief.answer, run.schema)).toEqual([]);
      expect(view.claims).toHaveLength(step.brief.claims.length);
      step.brief.claims.forEach((ruling, i) => expect(cardDifferences(view.claims[i]!, ruling, run.schema)).toEqual([]));
      // the recheck verdicts are the demo's findings, position by position
      step.findings.forEach((finding) => {
        const card = finding.position === "answer" ? view.answer : view.claims[finding.position]!;
        expect(card.recheck.verdict).toBe(finding.result.kind);
      });
    });
  });

  it("the demo's step 5 (all four documents, delivery <= 12) is the page's conflict block: core o1 o2 o3 o4, and the rendered Brief verbatim", () => {
    const step5 = steps[4]!;
    const view = viewOf(state(DOCUMENT_IDS, 0));
    expect(view.answer.kind).toBe("conflicted");
    expect(view.answer.core).toEqual(["o1", "o2", "o3", "o4"]);
    expect(view.rendered).toBe(step5.rendered);
    expect(view.rendered).toContain("Refused: delivery (days from order) at most 12 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.");
    view.claims.forEach((card) => expect(card.core).toEqual(["o1", "o2", "o3", "o4"]));
  });

  it("TEETH: a card with the same kind and the same position but different contents is reported (the comparison is not on seq or kind alone)", () => {
    const step5 = steps[4]!;
    const view = viewOf(demoReducer(INITIAL_STATE, { type: "preset", step: 5 }));
    expect(cardDifferences(view.answer, step5.brief.answer, run.schema)).toEqual([]);
    // same kind ("conflicted"), same position, a different core
    const otherCore: CardView = { ...view.answer, core: ["o1", "o2", "o3"] };
    expect(cardDifferences(otherCore, step5.brief.answer, run.schema)).toEqual(["core"]);
    // same kind ("weakened"), same position, a different support
    const step1 = steps[0]!;
    const v1 = viewOf(demoReducer(INITIAL_STATE, { type: "preset", step: 1 }));
    expect(cardDifferences(v1.answer, step1.brief.answer, run.schema)).toEqual([]);
    const shifted: CardView = { ...v1.answer, support: { lo: ["o1"], hi: ["o2"] } };
    expect(cardDifferences(shifted, step1.brief.answer, run.schema)).toEqual(["support"]);
    // same kind, the same number of open ends, a different side; and a different cut
    const flipped: CardView = { ...v1.answer, openEnds: v1.answer.openEnds.map((end) => end.replace("above", "below")) };
    expect(v1.answer.openEnds.length).toBeGreaterThan(0);
    expect(cardDifferences(flipped, step1.brief.answer, run.schema)).toEqual(["open ends"]);
    expect(cardDifferences({ ...v1.answer, cut: "" }, step1.brief.answer, run.schema)).toEqual(["cut"]);
    // same kind, a different sentence
    expect(cardDifferences({ ...v1.answer, sentence: v1.answer.sentence.replace("4", "5") }, step1.brief.answer, run.schema)).toEqual(["sentence"]);
  });

  it("the bridge's composition equals the engine's, called directly, in all 80 states: the rendered Brief and the paragraph", () => {
    for (const { included, question } of ALL_80) {
      const claim = QUESTIONS[question]!.claim;
      const { brief, schema } = engineBrief(included, claim);
      const view = viewOf(state(included, question));
      expect(view.rendered).toBe(renderBrief(schema, brief));
      expect(view.paragraph).toBe(renderFluent(fluentDraft(OBSERVATIONS.filter((o) => included.includes(o.id)), claim)));
      expect(cardDifferences(view.answer, brief.answer, schema)).toEqual([]);
      brief.claims.forEach((ruling, i) => expect(cardDifferences(view.claims[i]!, ruling, schema)).toEqual([]));
      const rechecked = recheck(schema, brief);
      expect(rechecked.ok && rechecked.intact).toBe(view.intact);
    }
  });

  it("the documents each ruling cites are highlighted on the evidence list: a document's citedBy is exactly the cards whose support or core name it", () => {
    for (const { included, question } of ALL_80) {
      const view = viewOf(state(included, question));
      const cards = [view.answer, ...view.claims];
      for (const doc of view.documents) {
        const named = cards.filter((card) => [...(card.support?.lo ?? []), ...(card.support?.hi ?? []), ...(card.core ?? [])].includes(doc.id)).map((card) => card.name);
        expect(doc.citedBy).toEqual(named);
        expect(doc.included).toBe(included.includes(doc.id));
        // a document that is not included is never cited
        if (!doc.included) expect(doc.citedBy).toEqual([]);
      }
    }
  });
});

describe("the pairwise table is computed by ground, on every pair, triple and the whole set", () => {
  it("with all four documents: 6 of 6 pairs consistent, 4 of 4 triples consistent, all four conflicted; 11 rows, each agreeing with ground", () => {
    const view = viewOf(state(DOCUMENT_IDS, 0));
    expect(view.pairwise?.line).toBe("6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted");
    const rows = view.pairwise!.rows;
    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.members.length).sort()).toEqual([2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4]);
    for (const row of rows) {
      const grounded = ground(ORDER_DESK_SCHEMA, OBSERVATIONS.filter((o) => row.members.includes(o.id)));
      expect(grounded.ok).toBe(true);
      if (grounded.ok) expect(row.consistent).toBe(grounded.grounding.trees.every((tree) => tree.state.kind === "consistent"));
      // and by the oracle, which shares nothing with ground
      expect(row.consistent).toBe(oracleExtents(docsOf(row.members.map((m) => obsId(m)))) !== undefined);
    }
    expect(rows.filter((row) => !row.consistent).map((row) => row.members.join(" "))).toEqual(["o1 o2 o3 o4"]);
  });

  it("subsetsOfSize enumerates each subset once", () => {
    expect(subsetsOfSize([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(subsetsOfSize([1, 2, 3, 4], 3)).toHaveLength(4);
    expect(subsetsOfSize([1, 2, 3, 4], 4)).toEqual([[1, 2, 3, 4]]);
    expect(subsetsOfSize([1, 2, 3, 4], 5)).toEqual([]);
    expect(new Set(subsetsOfSize([1, 2, 3, 4], 2).map((s) => s.join())).size).toBe(6);
  });

  it("pairwiseOf on hand-built observations that are not step 5: two documents that disagree; and one inconsistent pair inside a larger set", () => {
    const doc = (id: string, field: Observation["field"], n: number, quote: string): Observation => ({ id: obsId(id), field, extent: { lo: n, hi: n }, quote, source: "a test" });
    const packOne = doc("p1", FIELDS.packDays, 1, "Packed in 1 day");
    const packTwo = doc("p2", FIELDS.packDays, 2, "Packed in 2 days");
    const transit = doc("t3", FIELDS.transitDays, 3, "Transit takes 3 days");
    const two = pairwiseOf([packOne, packTwo]);
    expect(two?.line).toBe("all two: conflicted");
    expect(two?.rows).toEqual([{ members: ["p1", "p2"], consistent: false }]);
    const three = pairwiseOf([packOne, packTwo, transit]);
    expect(three?.line).toBe("2 of 3 pairs consistent · all three: conflicted");
    expect(three?.rows).toEqual([
      { members: ["p1", "p2"], consistent: false },
      { members: ["p1", "t3"], consistent: true },
      { members: ["p2", "t3"], consistent: true },
      { members: ["p1", "p2", "t3"], consistent: false },
    ]);
    // a consistent whole is reported as such
    expect(pairwiseOf([packOne, transit])?.line).toBe("all two: consistent");
    // observations the engine refuses at intake (a bound whose digits are not in the quote) give no table, not a wrong one
    expect(pairwiseOf([{ ...packOne, quote: "Packed quickly" }, packTwo])).toBeUndefined();
  });

  it("three documents have no conflict, so there is no table", () => {
    expect(viewOf(state([obsId("o1"), obsId("o2"), obsId("o3")], 0)).pairwise).toBeNull();
  });
});

describe("the custom builder: a quantity, an operator and a number, ruled by the same engine", () => {
  const custom = (field: CustomQuestion["field"], op: CustomQuestion["op"], a: string, b = ""): CustomQuestion => ({ field, op, a, b });
  const ask = (included: readonly ObsId[], c: CustomQuestion) => computeDemoView(state(included, CUSTOM_QUESTION, null, c));

  it("a sweep of valid questions over all 16 subsets: every ruling's kind equals the oracle's (and vacuous ones are refused, not ruled)", () => {
    const fields = ["packDays", "transitDays", "customsDays", "deliveryDay"] as const;
    const numbers = ["0", "1", "3", "9", "12"];
    let ruled = 0;
    let refused = 0;
    const kinds = new Set<string>();
    for (const included of SUBSETS) {
      for (const field of fields) {
        const questions: CustomQuestion[] = [
          ...numbers.map((n) => custom(field, "at-most", n)),
          ...numbers.map((n) => custom(field, "at-least", n)),
          ...numbers.map((n) => custom(field, "exactly", n)),
          custom(field, "between", "2", "6"),
          custom(field, "between", "4", "9"),
        ];
        for (const c of questions) {
          const result = ask(included, c);
          const lo = c.op === "at-most" ? null : Number(c.a);
          const hi = c.op === "at-least" ? null : c.op === "between" ? Number(c.b) : Number(c.a);
          const expected = oracleKind(oracleOf(included), field, { lo, hi });
          if (expected === "vacuous") {
            refused++;
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.error.kind).toBe("question-rejected");
              // the chatbot column is not hidden when the system refuses
              expect(result.paragraph).not.toBeNull();
            }
          } else {
            ruled++;
            expect(result.ok, `${included.join(" ")} ${JSON.stringify(c)} ${JSON.stringify(result)}`).toBe(true);
            if (result.ok) {
              expect(result.view.answer.kind).toBe(expected);
              expect(result.view.intact).toBe(true);
              kinds.add(result.view.answer.kind);
            }
          }
        }
      }
    }
    expect(ruled).toBeGreaterThan(500);
    expect(refused).toBeGreaterThan(0);
    expect([...kinds].sort()).toEqual(["conflicted", "contradicted", "entailed", "ungrounded", "weakened"]);
  });

  it("the labels the builder gives its questions", () => {
    expect(viewOf(state(DOCUMENT_IDS.slice(0, 2), CUSTOM_QUESTION, null, custom("customsDays", "at-most", "3"))).questionLabel).toBe("customs ≤ 3");
    expect(viewOf(state(DOCUMENT_IDS.slice(0, 2), CUSTOM_QUESTION, null, custom("deliveryDay", "at-least", "4"))).questionLabel).toBe("delivery ≥ 4");
    expect(viewOf(state(DOCUMENT_IDS.slice(0, 2), CUSTOM_QUESTION, null, custom("deliveryDay", "exactly", "14"))).questionLabel).toBe("delivery = 14");
    expect(viewOf(state(DOCUMENT_IDS.slice(0, 2), CUSTOM_QUESTION, null, custom("packDays", "between", "1", "2"))).questionLabel).toBe("packing between 1 and 2");
  });

  it("the builder's menu twins give the same Brief as the menu: delivery <= 12 built by hand equals menu question 0", () => {
    for (const included of SUBSETS) {
      const built = viewOf(state(included, CUSTOM_QUESTION, null, custom("deliveryDay", "at-most", "12")));
      const menu = viewOf(state(included, 0));
      expect(built.rendered).toBe(menu.rendered);
      expect(built.paragraph).toBe(menu.paragraph);
    }
  });

  it.each([
    ["empty", ""],
    ["letters", "abc"],
    ["a decimal", "1.5"],
    ["an exponent", "1e3"],
    ["a leading space", " 5"],
    ["a trailing space", "5 "],
    ["a bare minus", "-"],
    ["a plus sign", "+3"],
    ["arabic-indic digits", "٣"],
    ["thirteen digits", "1000000000000"],
    ["a hex literal", "0x10"],
  ])("custom text that is not an integer is refused as custom-invalid, with no paragraph: %s", (_label, text) => {
    const result = ask(DOCUMENT_IDS.slice(0, 2), custom("deliveryDay", "at-most", text));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("custom-invalid");
      expect(result.paragraph).toBeNull();
      expect(result.documents).toHaveLength(4);
    }
  });

  it("a range with no second number is custom-invalid; an inverted range, and a question the schema already implies, are refused by the engine with the chatbot's paragraph kept", () => {
    const missing = ask(DOCUMENT_IDS, custom("deliveryDay", "between", "3", ""));
    expect(missing.ok === false && missing.error.kind).toBe("custom-invalid");
    const inverted = ask(DOCUMENT_IDS, custom("deliveryDay", "between", "9", "3"));
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) {
      expect(inverted.error.kind).toBe("question-rejected");
      expect(inverted.error.message).toContain("not a well-formed range");
      expect(inverted.paragraph).not.toBeNull();
    }
    const vacuous = ask(DOCUMENT_IDS, custom("customsDays", "at-least", "0"));
    expect(vacuous.ok).toBe(false);
    if (!vacuous.ok) {
      expect(vacuous.error.kind).toBe("question-rejected");
      expect(vacuous.error.message).toContain("already implies");
      expect(vacuous.paragraph).toBe(renderFluent(fluentDraft(OBSERVATIONS, { field: FIELDS.customsDays, extent: { lo: 0, hi: null } })));
    }
  });

  it("negative numbers and twelve-digit numbers are read as integers and ruled or refused by the engine, never thrown on", () => {
    expect(ask(DOCUMENT_IDS, custom("deliveryDay", "at-most", "-5")).ok).toBe(true);
    expect(ask(DOCUMENT_IDS, custom("deliveryDay", "at-most", "999999999999")).ok).toBe(true);
    expect(ask(DOCUMENT_IDS, custom("deliveryDay", "at-least", "-999999999999")).ok).toBe(false);
  });
});

describe("computeDemoView never throws, and refuses a state it cannot read", () => {
  it("a state naming a document that is not one of the four, or naming one twice, is bad-state with no documents claimed", () => {
    for (const included of [[obsId("o9")], [obsId("o1"), obsId("o1")]]) {
      const result = computeDemoView(state(included, 0));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("bad-state");
    }
  });

  it.each([-1, 6, 1.5, Number.NaN, Infinity])("a question index %s is bad-state", (question) => {
    const result = computeDemoView(state(DOCUMENT_IDS, question));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("bad-state");
  });

  it("a state that is not an array of documents is bad-state", () => {
    const result = computeDemoView({ ...INITIAL_STATE, included: "o1" as unknown as readonly ObsId[] });
    expect(result.ok === false && result.error.kind).toBe("bad-state");
  });

  it("the second layer: a state whose getter throws is `internal`, and the thrown text is not echoed", () => {
    const hostile = {
      get included(): readonly ObsId[] {
        throw new Error("SECRET-THROWN-TEXT");
      },
      question: 0,
      forge: null,
      custom: INITIAL_CUSTOM,
    } as unknown as DemoState;
    const result = computeDemoView(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("internal");
      expect(JSON.stringify(result)).not.toContain("SECRET-THROWN-TEXT");
    }
  });

  it("the no-document state is a state like any other: ruled, with every claim ungrounded or contradicted by nothing, no conflict", () => {
    const view = viewOf(state([], 0));
    expect(view.documents.every((doc) => !doc.included)).toBe(true);
    expect(view.pairwise).toBeNull();
    expect(view.answer.kind).toBe("ungrounded");
  });

  it("computeDemoView does not change its input and gives the same answer twice (a deep-frozen state is accepted)", () => {
    const frozen = Object.freeze({ ...INITIAL_STATE, included: Object.freeze([...INITIAL_STATE.included]), custom: Object.freeze({ ...INITIAL_CUSTOM }) });
    const before = JSON.stringify(frozen);
    const a = computeDemoView(frozen);
    const b = computeDemoView(frozen);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("STATED, NOT PINNED BY A TEST: the engine itself throwing inside the try (an internal-invariant violation) and a draft claim refused before ruling are not reachable from any state this page can build, so their rendering paths are untested", () => {
    // This test only records the one thing that can be checked: with the drafter's four claims, no card is ever refused.
    for (const { included, question } of ALL_80) expect(viewOf(state(included, question)).refused).toEqual([]);
  });
});

describe("the reducer", () => {
  const o = (id: string): ObsId => obsId(id);

  it("starts at step 1 of the domain's script", () => {
    expect([...INITIAL_STATE.included]).toEqual(["o1", "o2"]);
    expect(INITIAL_STATE.question).toBe(0);
    expect(INITIAL_STATE.forge).toBeNull();
    expect(viewOf(INITIAL_STATE).answer.kind).toBe("weakened");
  });

  it("toggle adds and removes a document and keeps the domain's order, whatever order they were added in", () => {
    let s = INITIAL_STATE;
    s = demoReducer(s, { type: "toggle", id: o("o4") });
    s = demoReducer(s, { type: "toggle", id: o("o3") });
    expect([...s.included]).toEqual(["o1", "o2", "o3", "o4"]);
    s = demoReducer(s, { type: "toggle", id: o("o1") });
    expect([...s.included]).toEqual(["o2", "o3", "o4"]);
  });

  it("toggle, ask, custom edits and presets clear the forge; the forge action toggles it", () => {
    const forged = demoReducer(INITIAL_STATE, { type: "forge" });
    expect(forged.forge).toBe("raise-upper-bound");
    expect(demoReducer(forged, { type: "forge" }).forge).toBeNull();
    expect(demoReducer(forged, { type: "toggle", id: o("o3") }).forge).toBeNull();
    expect(demoReducer(forged, { type: "ask", question: 2 }).forge).toBeNull();
    expect(demoReducer(forged, { type: "custom", patch: { a: "7" } }).forge).toBeNull();
    expect(demoReducer(forged, { type: "preset", step: 4 }).forge).toBeNull();
  });

  it("editing the custom builder selects it, keeping the other fields; asking a menu question keeps the builder's text", () => {
    const edited = demoReducer(INITIAL_STATE, { type: "custom", patch: { a: "7", op: "at-least" } });
    expect(edited.question).toBe(CUSTOM_QUESTION);
    expect(edited.custom).toEqual({ field: "deliveryDay", op: "at-least", a: "7", b: "" });
    const back = demoReducer(edited, { type: "ask", question: 1 });
    expect(back.question).toBe(1);
    expect(back.custom).toEqual(edited.custom);
  });

  it("an id that is not a document, a question outside the menu and an unscripted step change nothing", () => {
    expect(demoReducer(INITIAL_STATE, { type: "toggle", id: o("o9") })).toBe(INITIAL_STATE);
    expect(demoReducer(INITIAL_STATE, { type: "ask", question: 7 })).toBe(INITIAL_STATE);
    expect(demoReducer(INITIAL_STATE, { type: "ask", question: -1 })).toBe(INITIAL_STATE);
    expect(demoReducer(INITIAL_STATE, { type: "ask", question: 0.5 })).toBe(INITIAL_STATE);
    expect(demoReducer(INITIAL_STATE, { type: "preset", step: 0 })).toBe(INITIAL_STATE);
    expect(demoReducer(INITIAL_STATE, { type: "preset", step: 7 })).toBe(INITIAL_STATE);
  });

  it("the presets are the domain's CANON_SCRIPT, step for step", () => {
    expect(PRESETS.map((p) => [p.step, [...p.included], p.question])).toEqual(CANON_SCRIPT.map((entry) => [entry.step, [...SNAPSHOTS[entry.snapshot]!], entry.question]));
  });

  it("every state the reducer can reach in a short walk is one computeDemoView can read", () => {
    const actions = [
      ...IDS.map((id) => ({ type: "toggle", id: o(id) }) as const),
      ...[0, 1, 2, 3, 4, 5].map((question) => ({ type: "ask", question }) as const),
      { type: "forge" } as const,
      ...[1, 2, 3, 4, 5, 6].map((step) => ({ type: "preset", step }) as const),
      { type: "custom", patch: { a: "3" } } as const,
    ];
    let reached = 0;
    for (const first of actions) {
      for (const second of actions) {
        const result = computeDemoView(demoReducer(demoReducer(INITIAL_STATE, first), second));
        expect(typeof result.ok).toBe("boolean");
        reached++;
      }
    }
    expect(reached).toBe(actions.length ** 2);
  });
});
