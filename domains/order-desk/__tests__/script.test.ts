import { describe, expect, it } from "vitest";
import { ground } from "../../../lib/ground/index.js";
import type { Grounding } from "../../../lib/ground/index.js";
import { answer, recheck } from "../../../lib/entail/index.js";
import { CANON_SCRIPT, MODEL_PRIORS, OBSERVATIONS, ORDER_DESK_SCHEMA, QUESTIONS, SNAPSHOTS, claimsOf, fluentDraft, observationsOf, runScript } from "../index.js";
import type { ScriptStep, StepRun } from "../index.js";
import { isDeepFrozen } from "./fixtures.js";

/**
 * THE SCRIPT THROUGH THE REAL ENGINE (plan section 7). `runScript` composes `ground`, `answer`, `renderBrief` and `recheck`;
 * these tests pin what comes out. Two kinds of expectation are kept apart on purpose:
 *  - `KINDS`, the kind of every ruling of every step, written from the plan's section 7 table;
 *  - `RULINGS`, the whole ruling (extents, supports, cuts, open ends, cores), which was read off the first run and then
 *    checked by hand against the same table, so it pins today's output; the independent check of the extents and kinds is
 *    the demo's enumeration oracle (`demo.test.ts`), not this file.
 */

const run = (script?: readonly ScriptStep[]): readonly StepRun[] => {
  const result = runScript(script);
  if (!result.ok) throw new Error(`runScript failed: ${JSON.stringify(result.failure)}`);
  return result.steps;
};

/** The question's kind, then the four draft claims' kinds, per plan section 7. */
const KINDS: readonly (readonly string[])[] = [
  ["weakened", "weakened", "weakened", "ungrounded", "weakened"], // step 1
  ["entailed", "weakened", "weakened", "ungrounded", "weakened"], // step 2
  ["contradicted", "weakened", "weakened", "ungrounded", "weakened"], // step 3
  ["entailed", "weakened", "weakened", "weakened", "weakened"], // step 4
  ["conflicted", "conflicted", "conflicted", "conflicted", "conflicted"], // step 5
  ["contradicted", "weakened", "weakened", "contradicted", "entailed"], // step 6
];

/** The rulings in full, as JSON: the question's, then the four claims'. */
const RULINGS: readonly (readonly string[])[] = [
  [
    '{"kind":"weakened","field":"deliveryDay","tested":{"lo":null,"hi":12},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]},"unmet":["hi"],"openEnds":[{"field":"customsDays","side":"hi"}]}',
    '{"kind":"weakened","field":"packDays","tested":{"lo":1,"hi":1},"established":{"lo":1,"hi":2},"support":{"lo":["o1"],"hi":["o1"]},"unmet":["hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"transitDays","tested":{"lo":4,"hi":4},"established":{"lo":3,"hi":5},"support":{"lo":["o2"],"hi":["o2"]},"unmet":["lo","hi"],"openEnds":[]}',
    '{"kind":"ungrounded","field":"customsDays","tested":{"lo":2,"hi":2},"openEnds":[{"field":"customsDays","side":"lo"},{"field":"customsDays","side":"hi"}]}',
    '{"kind":"weakened","field":"deliveryDay","tested":{"lo":7,"hi":7},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]},"unmet":["lo","hi"],"openEnds":[{"field":"customsDays","side":"hi"}]}',
  ],
  [
    '{"kind":"entailed","field":"deliveryDay","tested":{"lo":4,"hi":null},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]}}',
    '{"kind":"weakened","field":"packDays","tested":{"lo":1,"hi":1},"established":{"lo":1,"hi":2},"support":{"lo":["o1"],"hi":["o1"]},"unmet":["hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"transitDays","tested":{"lo":4,"hi":4},"established":{"lo":3,"hi":5},"support":{"lo":["o2"],"hi":["o2"]},"unmet":["lo","hi"],"openEnds":[]}',
    '{"kind":"ungrounded","field":"customsDays","tested":{"lo":2,"hi":2},"openEnds":[{"field":"customsDays","side":"lo"},{"field":"customsDays","side":"hi"}]}',
    '{"kind":"weakened","field":"deliveryDay","tested":{"lo":7,"hi":7},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]},"unmet":["lo","hi"],"openEnds":[{"field":"customsDays","side":"hi"}]}',
  ],
  [
    '{"kind":"contradicted","field":"deliveryDay","tested":{"lo":null,"hi":3},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]}}',
    '{"kind":"weakened","field":"packDays","tested":{"lo":1,"hi":1},"established":{"lo":1,"hi":2},"support":{"lo":["o1"],"hi":["o1"]},"unmet":["hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"transitDays","tested":{"lo":4,"hi":4},"established":{"lo":3,"hi":5},"support":{"lo":["o2"],"hi":["o2"]},"unmet":["lo","hi"],"openEnds":[]}',
    '{"kind":"ungrounded","field":"customsDays","tested":{"lo":2,"hi":2},"openEnds":[{"field":"customsDays","side":"lo"},{"field":"customsDays","side":"hi"}]}',
    '{"kind":"weakened","field":"deliveryDay","tested":{"lo":7,"hi":7},"established":{"lo":4,"hi":null},"support":{"lo":["o1","o2"],"hi":[]},"unmet":["lo","hi"],"openEnds":[{"field":"customsDays","side":"hi"}]}',
  ],
  [
    '{"kind":"entailed","field":"deliveryDay","tested":{"lo":null,"hi":12},"established":{"lo":4,"hi":9},"support":{"lo":["o1","o2"],"hi":["o1","o2","o3"]}}',
    '{"kind":"weakened","field":"packDays","tested":{"lo":1,"hi":1},"established":{"lo":1,"hi":2},"support":{"lo":["o1"],"hi":["o1"]},"unmet":["hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"transitDays","tested":{"lo":4,"hi":4},"established":{"lo":3,"hi":5},"support":{"lo":["o2"],"hi":["o2"]},"unmet":["lo","hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"customsDays","tested":{"lo":1,"hi":1},"established":{"lo":0,"hi":2},"support":{"lo":[],"hi":["o3"]},"unmet":["lo","hi"],"openEnds":[{"field":"customsDays","side":"lo"}]}',
    '{"kind":"weakened","field":"deliveryDay","tested":{"lo":6,"hi":6},"established":{"lo":4,"hi":9},"support":{"lo":["o1","o2"],"hi":["o1","o2","o3"]},"unmet":["lo","hi"],"openEnds":[]}',
  ],
  [
    '{"kind":"conflicted","field":"deliveryDay","tested":{"lo":null,"hi":12},"core":["o1","o2","o3","o4"]}',
    '{"kind":"conflicted","field":"packDays","tested":{"lo":1,"hi":1},"core":["o1","o2","o3","o4"]}',
    '{"kind":"conflicted","field":"transitDays","tested":{"lo":4,"hi":4},"core":["o1","o2","o3","o4"]}',
    '{"kind":"conflicted","field":"customsDays","tested":{"lo":1,"hi":1},"core":["o1","o2","o3","o4"]}',
    '{"kind":"conflicted","field":"deliveryDay","tested":{"lo":14,"hi":14},"core":["o1","o2","o3","o4"]}',
  ],
  [
    '{"kind":"contradicted","field":"customsDays","tested":{"lo":null,"hi":3},"established":{"lo":7,"hi":10},"support":{"lo":["o1","o2","o4"],"hi":["o1","o2","o4"]}}',
    '{"kind":"weakened","field":"packDays","tested":{"lo":1,"hi":1},"established":{"lo":1,"hi":2},"support":{"lo":["o1"],"hi":["o1"]},"unmet":["hi"],"openEnds":[]}',
    '{"kind":"weakened","field":"transitDays","tested":{"lo":4,"hi":4},"established":{"lo":3,"hi":5},"support":{"lo":["o2"],"hi":["o2"]},"unmet":["lo","hi"],"openEnds":[]}',
    '{"kind":"contradicted","field":"customsDays","tested":{"lo":2,"hi":2},"established":{"lo":7,"hi":10},"support":{"lo":["o1","o2","o4"],"hi":["o1","o2","o4"]}}',
    '{"kind":"entailed","field":"deliveryDay","tested":{"lo":14,"hi":14},"established":{"lo":14,"hi":14},"support":{"lo":["o4"],"hi":["o4"]}}',
  ],
];

const rulingsOf = (step: StepRun): unknown[] => [step.brief.answer, ...step.brief.claims];

describe("CANON_SCRIPT", () => {
  it("is the plan's six steps: (snapshot, question) = (0,0) (0,1) (0,2) (1,0) (2,0) (3,3), frozen", () => {
    expect(CANON_SCRIPT.map((s) => [s.step, s.snapshot, s.question])).toEqual([
      [1, 0, 0],
      [2, 0, 1],
      [3, 0, 2],
      [4, 1, 0],
      [5, 2, 0],
      [6, 3, 3],
    ]);
    expect(isDeepFrozen(CANON_SCRIPT)).toBe(true);
  });

  it("every index it holds is inside SNAPSHOTS and QUESTIONS (so runScript has no failure to report on it)", () => {
    for (const s of CANON_SCRIPT) {
      expect(SNAPSHOTS[s.snapshot]).toBeDefined();
      expect(QUESTIONS[s.question]).toBeDefined();
    }
  });
});

describe("runScript on CANON_SCRIPT: the plan's section 7 table", () => {
  const steps = run();

  it("runs six steps, numbered 1 to 6, over the plan's snapshots and questions", () => {
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.map((s) => s.snapshot.join(" "))).toEqual(["o1 o2", "o1 o2", "o1 o2", "o1 o2 o3", "o1 o2 o3 o4", "o1 o2 o4"]);
    expect(steps.map((s) => s.questionLabel)).toEqual(["delivery ≤ 12", "delivery ≥ 4", "delivery ≤ 3", "delivery ≤ 12", "delivery ≤ 12", "customs ≤ 3"]);
  });

  it("every step's kinds, the question's and then the four claims', are the table's", () => {
    expect(steps.map((s) => rulingsOf(s).map((r) => (r as { kind: string }).kind))).toEqual(KINDS);
  });

  it("the five kinds appear 3, 16, 3, 3 and 5 times (entailed, weakened, contradicted, ungrounded, conflicted) over the 30 rulings", () => {
    const tally: Record<string, number> = {};
    for (const s of steps) for (const r of rulingsOf(s)) tally[(r as { kind: string }).kind] = (tally[(r as { kind: string }).kind] ?? 0) + 1;
    expect(tally).toEqual({ entailed: 3, weakened: 16, contradicted: 3, ungrounded: 3, conflicted: 5 });
  });

  it("every ruling in full, exactly (the rulings of steps 1 to 3 are the same four claims, as the plan says)", () => {
    expect(steps.map((s) => rulingsOf(s).map((r) => JSON.stringify(r)))).toEqual(RULINGS);
  });

  it("the headline: step 5 refuses all five rulings with the same four-document core, and no ruling there carries an extent", () => {
    for (const r of rulingsOf(steps[4]!) as { kind: string; core: string[]; established?: unknown }[]) {
      expect(r.kind).toBe("conflicted");
      expect(r.core).toEqual(["o1", "o2", "o3", "o4"]);
      expect(r.established).toBeUndefined();
    }
  });

  it("step 6's [7, 10] is derived: no document says 7 to 10, and no observation's extent is that", () => {
    const answered = steps[5]!.brief.answer as { established: { lo: number; hi: number } };
    expect(answered.established).toEqual({ lo: 7, hi: 10 });
    for (const o of OBSERVATIONS) expect(o.extent).not.toEqual({ lo: 7, hi: 10 });
  });

  it("Brief.evidence is exactly the documents the rulings name, as copies of the constants, in id order", () => {
    expect(steps.map((s) => s.brief.evidence.map((e) => e.id))).toEqual([["o1", "o2"], ["o1", "o2"], ["o1", "o2"], ["o1", "o2", "o3"], ["o1", "o2", "o3", "o4"], ["o1", "o2", "o4"]]);
    for (const s of steps)
      for (const e of s.brief.evidence) {
        const original = OBSERVATIONS.find((o) => o.id === e.id)!;
        expect(e).toEqual(original);
        expect(e).not.toBe(original);
      }
    expect(steps.every((s) => s.brief.rejected.length === 0)).toBe(true);
  });

  it("recheck is intact on every Brief; every ungrounded ruling is uncertifiable-silence, and the silent sides are the ones the table leaves unbounded", () => {
    expect(steps.every((s) => s.intact)).toBe(true);
    expect(steps.map((s) => JSON.stringify(s.findings))).toEqual([
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":["hi"]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"uncertifiable-silence"}},{"position":3,"result":{"kind":"reproduced","silentSides":["hi"]}}]',
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":["hi"]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"uncertifiable-silence"}},{"position":3,"result":{"kind":"reproduced","silentSides":["hi"]}}]',
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":["hi"]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"uncertifiable-silence"}},{"position":3,"result":{"kind":"reproduced","silentSides":["hi"]}}]',
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":[]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"reproduced","silentSides":["lo"]}},{"position":3,"result":{"kind":"reproduced","silentSides":[]}}]',
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":[]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"reproduced","silentSides":[]}},{"position":3,"result":{"kind":"reproduced","silentSides":[]}}]',
      '[{"position":"answer","result":{"kind":"reproduced","silentSides":[]}},{"position":0,"result":{"kind":"reproduced","silentSides":[]}},{"position":1,"result":{"kind":"reproduced","silentSides":[]}},{"position":2,"result":{"kind":"reproduced","silentSides":[]}},{"position":3,"result":{"kind":"reproduced","silentSides":[]}}]',
    ]);
  });
});

describe("the two columns of the table: what the chatbot says, and what the system says", () => {
  const steps = run();

  it("step 1's chatbot paragraph and rendered Brief, exactly", () => {
    expect(steps[0]!.paragraph).toBe(
      "Yes: delivery is around day 7. Packing takes about 1 day, transit about 4 days and customs clearance about 2 days (typical). Figures marked as typical are a model prior, not taken from any document.",
    );
    expect(steps[0]!.rendered).toBe(
      [
        "Question: Not established: delivery (days from order) at most 12 days. What the evidence does establish: delivery (days from order) at least 4 days (lower bound from o1, o2; no upper bound). Withheld: the upper bound. No document bounds customs clearance from above.",
        "Draft claims:",
        "- Not established: packing time exactly 1 days. What the evidence does establish: packing time between 1 and 2 days (lower bound from o1; upper bound from o1). Withheld: the upper bound. No quantity is named as missing.",
        "- Not established: transit time exactly 4 days. What the evidence does establish: transit time between 3 and 5 days (lower bound from o2; upper bound from o2). Withheld: the lower and upper bound. No quantity is named as missing.",
        "- Cannot answer: customs clearance exactly 2 days. The evidence does not move customs clearance from what the schema implies. Missing: no document bounds customs clearance from below; no document bounds customs clearance from above.",
        "- Not established: delivery (days from order) exactly 7 days. What the evidence does establish: delivery (days from order) at least 4 days (lower bound from o1, o2; no upper bound). Withheld: the lower and upper bound. No document bounds customs clearance from above.",
      ].join("\n"),
    );
  });

  it("step 5's rendered Brief, exactly: the conflict names the four documents and trusts none", () => {
    expect(steps[4]!.rendered).toBe(
      [
        "Question: Refused: delivery (days from order) at most 12 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
        "Draft claims:",
        "- Refused: packing time exactly 1 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
        "- Refused: transit time exactly 4 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
        "- Refused: customs clearance exactly 1 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
        "- Refused: delivery (days from order) exactly 14 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
      ].join("\n"),
    );
    expect(steps[4]!.paragraph).toBe("No: delivery is around day 14. Packing takes about 1 day, transit about 4 days and customs clearance about 1 day.");
  });

  it("step 6: the chatbot says yes and the system says it is ruled out, derived from three documents", () => {
    expect(steps[5]!.paragraph.startsWith("Yes: customs clearance takes about 2 days.")).toBe(true);
    expect(steps[5]!.rendered.split("\n")[0]).toBe(
      "Question: Ruled out: customs clearance at most 3 days. The evidence gives customs clearance between 7 and 10 days (lower bound from o1, o2, o4; upper bound from o1, o2, o4).",
    );
  });

  it("the question lines of steps 2, 3 and 4", () => {
    expect(steps.map((s) => s.rendered.split("\n")[0])).toEqual([
      "Question: Not established: delivery (days from order) at most 12 days. What the evidence does establish: delivery (days from order) at least 4 days (lower bound from o1, o2; no upper bound). Withheld: the upper bound. No document bounds customs clearance from above.",
      "Question: Established: delivery (days from order) at least 4 days. The evidence gives delivery (days from order) at least 4 days (lower bound from o1, o2; no upper bound).",
      "Question: Ruled out: delivery (days from order) at most 3 days. The evidence gives delivery (days from order) at least 4 days (lower bound from o1, o2; no upper bound).",
      "Question: Established: delivery (days from order) at most 12 days. The evidence gives delivery (days from order) between 4 and 9 days (lower bound from o1, o2; upper bound from o1, o2, o3).",
      "Question: Refused: delivery (days from order) at most 12 days. Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another.",
      "Question: Ruled out: customs clearance at most 3 days. The evidence gives customs clearance between 7 and 10 days (lower bound from o1, o2, o4; upper bound from o1, o2, o4).",
    ]);
  });

  it("the paragraph is the chatbot's alone: it never says 'not established', 'conflict' or 'withheld', in any of the six steps", () => {
    for (const s of steps) expect(s.paragraph).not.toMatch(/not established|conflict|withheld|ruled out|cannot answer/i);
  });
});

describe("determinism, and no state kept between steps", () => {
  it("two runs are equal, byte for byte, in everything they return", () => {
    expect(JSON.stringify(runScript())).toBe(JSON.stringify(runScript()));
  });

  it("the steps in the reverse order give each step exactly the result it had in order (a run keeps nothing from the step before)", () => {
    const forward = run();
    const reversed = run([...CANON_SCRIPT].reverse());
    expect(reversed.map((s) => s.step)).toEqual([6, 5, 4, 3, 2, 1]);
    for (const s of reversed) expect(JSON.stringify(s)).toBe(JSON.stringify(forward[s.step - 1]));
  });

  it("the constants are the same after a run (nothing was written to them)", () => {
    const before = JSON.stringify([ORDER_DESK_SCHEMA, OBSERVATIONS, SNAPSHOTS, QUESTIONS, CANON_SCRIPT]);
    run();
    expect(JSON.stringify([ORDER_DESK_SCHEMA, OBSERVATIONS, SNAPSHOTS, QUESTIONS, CANON_SCRIPT])).toBe(before);
  });
});

describe("the engine does not read the prior (plan: changing PRIOR_CUSTOMS_DAYS moves only the drafter column)", () => {
  const groundOf = (snapshot: number): Grounding => {
    const g = ground(ORDER_DESK_SCHEMA, observationsOf(SNAPSHOTS[snapshot]!));
    if (!g.ok) throw new Error("did not ground");
    return g.grounding;
  };
  /** What the EVIDENCE says about a claim: the kind and the established extent, support and core. Not `tested`, and not `unmet` or `openEnds`, which are cuts of the claim. */
  const evidenceSays = (ruling: unknown): string => {
    const { kind, field, established, support, core } = ruling as Record<string, unknown>;
    return JSON.stringify({ kind, field, established, support, core });
  };

  it("with the customs prior anywhere from 1 to 6, every ruling keeps what the evidence says (kind, established, support, core) and the question's ruling is untouched, in all six steps", () => {
    let compared = 0;
    for (const step of CANON_SCRIPT) {
      const g = groundOf(step.snapshot);
      const q = QUESTIONS[step.question]!.claim;
      const draftFor = (customs: number) => claimsOf(fluentDraft(observationsOf(SNAPSHOTS[step.snapshot]!), q, { ...MODEL_PRIORS, customsDays: customs }));
      const reference = answer(g, q, draftFor(MODEL_PRIORS.customsDays));
      if (!reference.ok) throw new Error("no reference");
      for (let customs = 1; customs <= 6; customs++) {
        const result = answer(g, q, draftFor(customs));
        if (!result.ok) throw new Error("no result");
        expect(JSON.stringify(result.brief.answer)).toBe(JSON.stringify(reference.brief.answer));
        expect(result.brief.evidence).toEqual(reference.brief.evidence);
        result.brief.claims.forEach((ruling, i) => {
          expect(evidenceSays(ruling)).toBe(evidenceSays(reference.brief.claims[i]));
          expect(JSON.stringify({ ...ruling, tested: 0 })).toBe(JSON.stringify({ ...reference.brief.claims[i], tested: 0 }));
          compared++;
        });
      }
    }
    expect(compared).toBe(6 * 6 * 4);
  });

  it("a limit, pinned: a prior of 0 changes the CUT of step 1's customs ruling (its `openEnds` loses the lower side, because the claim 'exactly 0' already satisfies the floor), though not what the evidence says", () => {
    const g = groundOf(0);
    const q = QUESTIONS[0]!.claim;
    const customsRuling = (customs: number) => {
      const result = answer(g, q, claimsOf(fluentDraft(observationsOf(SNAPSHOTS[0]!), q, { ...MODEL_PRIORS, customsDays: customs })));
      if (!result.ok) throw new Error("no result");
      return result.brief.claims[2]!;
    };
    expect(JSON.stringify(customsRuling(2))).toBe('{"kind":"ungrounded","field":"customsDays","tested":{"lo":2,"hi":2},"openEnds":[{"field":"customsDays","side":"lo"},{"field":"customsDays","side":"hi"}]}');
    expect(JSON.stringify(customsRuling(0))).toBe('{"kind":"ungrounded","field":"customsDays","tested":{"lo":0,"hi":0},"openEnds":[{"field":"customsDays","side":"hi"}]}');
  });

  it("a limit, pinned: a prior of 7 to 10 puts the customs claim inside step 6's derived [7, 10], so THAT claim's kind moves (contradicted to weakened), and a prior of 6 or 11 does not", () => {
    const g = groundOf(3);
    const q = QUESTIONS[3]!.claim;
    const kindOfCustoms = (customs: number): string => {
      const result = answer(g, q, claimsOf(fluentDraft(observationsOf(SNAPSHOTS[3]!), q, { ...MODEL_PRIORS, customsDays: customs })));
      if (!result.ok) throw new Error("no result");
      return result.brief.claims[2]!.kind;
    };
    expect([6, 7, 10, 11].map(kindOfCustoms)).toEqual(["contradicted", "weakened", "weakened", "contradicted"]);
  });
});

describe("runScript on other scripts", () => {
  it("the menu's fifth question, delivery = 14, on each of the four snapshots: weakened, contradicted, conflicted, entailed (worked by hand from the sets)", () => {
    // snapshot 0: E = [4, inf), claim [14,14]: overlap, not contained -> weakened. snapshot 1: E = [4,9], disjoint -> contradicted.
    // snapshot 2: no world -> conflicted. snapshot 3: E = [14,14] -> entailed.
    const steps = run([0, 1, 2, 3].map((snapshot, i) => ({ step: i + 1, snapshot, question: 4 })));
    expect(steps.map((s) => s.brief.answer.kind)).toEqual(["weakened", "contradicted", "conflicted", "entailed"]);
  });

  it("an empty script runs no step and is ok", () => {
    const result = runScript([]);
    expect(result.ok && result.steps.length).toBe(0);
  });

  it("every state of the 16 snapshots by the 5 questions is answered and its Brief is intact (80 states)", () => {
    let states = 0;
    for (let mask = 0; mask < 16; mask++) {
      const subset = OBSERVATIONS.filter((_, i) => (mask & (1 << i)) !== 0);
      const g = ground(ORDER_DESK_SCHEMA, subset);
      if (!g.ok) throw new Error("did not ground");
      for (const q of QUESTIONS) {
        const result = answer(g.grounding, q.claim, claimsOf(fluentDraft(subset, q.claim)));
        expect(result.ok, `${mask} ${q.label}`).toBe(true);
        if (!result.ok) continue;
        expect(result.brief.rejected).toEqual([]);
        const checked = recheck(g.grounding.schema, result.brief);
        expect(checked.ok && checked.intact, `${mask} ${q.label}`).toBe(true);
        states++;
      }
    }
    expect(states).toBe(80);
  });

  it("a script step whose indexes are outside the menus fails with the step number, and does not throw", () => {
    const bad = (snapshot: number, question: number) => runScript([{ step: 7, snapshot, question }]);
    for (const snapshot of [4, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 40]) expect(bad(snapshot, 0), String(snapshot)).toEqual({ ok: false, failure: { kind: "snapshot-out-of-range", step: 7 } });
    for (const question of [5, -1, 0.5, Number.NaN, Number.NEGATIVE_INFINITY, 2 ** 40]) expect(bad(0, question), String(question)).toEqual({ ok: false, failure: { kind: "question-out-of-range", step: 7 } });
    // an earlier good step does not rescue a later bad one: the run stops at the first failure
    expect(runScript([{ step: 1, snapshot: 0, question: 0 }, { step: 2, snapshot: 9, question: 0 }])).toEqual({ ok: false, failure: { kind: "snapshot-out-of-range", step: 2 } });
  });

  it("an index that is not a number at all (a string, an inherited name) is out of range, not a lookup", () => {
    const hostile = (snapshot: unknown, question: unknown) => runScript([{ step: 1, snapshot, question } as unknown as ScriptStep]);
    for (const snapshot of ["0", "length", "constructor", null, undefined, {}, []]) expect(hostile(snapshot, 0).ok, String(snapshot)).toBe(false);
    for (const question of ["0", "length", null, undefined]) expect(hostile(0, question).ok, String(question)).toBe(false);
  });
});
