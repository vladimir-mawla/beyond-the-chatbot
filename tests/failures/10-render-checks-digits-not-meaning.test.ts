import { describe, expect, it } from "vitest";
import type { Brief, Entailment } from "../../lib/contracts/index.js";
import { answer, renderBrief, renderEntailment } from "../../lib/entail/index.js";
import { QUESTIONS, claimsOf, fluentDraft, observationsOf } from "../../domains/order-desk/index.js";
import type { ObservationName } from "../../domains/order-desk/index.js";
import { CUSTOMS, DELIVERY, ORDER_DESK_SCHEMA, PACK, answerOk, claim, digitTokens, groundOk, lazy } from "./helpers.js";

/**
 * KIND: PROVES A PROPERTY, DISCLOSES ITS LIMIT (plan section 11, case 10).
 * TRACES TO: D1 (a claim is an extent, not a sentence: prose is `render(brief)`, one-way, and may contain no number the
 * entailment does not).
 *
 * WHAT IS PROVED. Over every ruling and every Brief of the demo's whole state space (80 states: the 16 subsets of `o1..o4`, each
 * asked each of the five menu questions, with the chatbot stand-in's draft claims), plus a Brief that carries refused claims,
 * the digit tokens of the rendering are a subset of the digits in the entailment's own fields and the ids it references. The
 * property is checked per ruling (`renderEntailment` against that ruling alone: the tight form) and per Brief (`renderBrief`
 * against everything the Brief carries, plus the positions of its refusals). A template that adds "typically 2 days" fails it.
 * WHAT IT DOES NOT SEE. The check reads DIGITS, not meaning: a template that wrote "a couple of days" has no new digit and
 * passes it. A SECOND, SEPARATE assertion checks the rendered words of every fixture against a DENYLIST of number words
 * ("one" to "twenty", "couple", "few", "several", "dozen"). A denylist is only as good as its list: "a handful of days",
 * "about a fortnight" and "thirty days" pass it. Neither assertion is claimed to cover the other, and the tests below pin each
 * blind spot on literal strings.
 *
 * SCALE AND LAYER (M5's `render-properties.test.ts` pins the digit property on 600 generated scenarios and on the plan's six
 * steps): here it is the domain's whole finite state space as the user would see it, plus the denylist, which M5 does not have.
 *
 * WHAT WOULD MAKE THIS FAIL: a template that adds a number (the digit property goes red; the denylist stays green); a template
 * that adds a number WORD from the list (the denylist goes red; the digit property stays green); a template that adds a
 * number word NOT on the list (neither goes red: the limit, pinned). Dropping a variant from the fixtures makes the coverage
 * assertion red.
 */

const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "couple", "few", "several", "dozen",
] as const;

/** The number words of `text`, by whole word, case-insensitively. */
function numberWordsIn(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter((word) => (NUMBER_WORDS as readonly string[]).includes(word));
}

/** The digit tokens of `text` that are not digit tokens of `allowedFrom` (the JSON of what the text is allowed to say). */
function foreignDigits(text: string, allowedFrom: unknown): string[] {
  const allowed = new Set(digitTokens(JSON.stringify(allowedFrom)));
  return digitTokens(text).filter((token) => !allowed.has(token));
}

const NAMES: readonly ObservationName[] = ["o1", "o2", "o3", "o4"];

interface Fixture {
  readonly where: string;
  readonly brief: Brief;
}

function demoBriefs(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let mask = 0; mask < 16; mask += 1) {
    const documents = observationsOf(NAMES.filter((_, i) => (mask & (1 << i)) !== 0));
    const g = groundOk(ORDER_DESK_SCHEMA, documents);
    QUESTIONS.forEach((question, q) => {
      fixtures.push({ where: `subset ${mask}, question ${q}`, brief: answerOk(g, question.claim, claimsOf(fluentDraft(documents, question.claim))) });
    });
  }
  return fixtures;
}

/** A Brief with one refusal of each kind a draft claim can get: unknown field, malformed, vacuous, and one that could not be read. */
function briefWithRefusals(): Fixture {
  const g = groundOk(ORDER_DESK_SCHEMA, observationsOf(["o1", "o2"]));
  const hostile = { field: PACK, get extent(): never { throw new Error("no"); } };
  const result = answer(g, claim(DELIVERY, null, 12), [{ field: "nope", extent: { lo: 1, hi: 2 } }, null, claim(PACK, 0, null), hostile, claim(CUSTOMS, 2, 2)]);
  if (!result.ok) throw new Error("fixture");
  return { where: "a Brief with refusals", brief: result.brief };
}

const rulingsOf = (brief: Brief): readonly Entailment[] => [brief.answer, ...brief.claims];

describe("10 render checks digits, not meaning", () => {
  const all = lazy(() => [...demoBriefs(), briefWithRefusals()]);

  it("the fixtures cover every variant, every kind of refusal, and the 400 rulings of the 80 states", () => {
    const kinds = new Set<string>();
    const faults = new Set<string>();
    let rulings = 0;
    for (const { brief } of all()) {
      for (const ruling of rulingsOf(brief)) kinds.add(ruling.kind);
      for (const refusal of brief.rejected) faults.add(refusal.fault.kind);
      rulings += rulingsOf(brief).length;
    }
    expect([...kinds].sort()).toEqual(["conflicted", "contradicted", "entailed", "ungrounded", "weakened"]);
    expect([...faults].sort()).toEqual(["hostile-input", "malformed", "unknown-field", "vacuous-claim"]);
    expect(rulings).toBe(80 * 5 + 2);
  });

  it("THE DIGIT PROPERTY, per ruling: every digit token of every rendered ruling is a digit of that ruling's own fields and ids", () => {
    let checked = 0;
    for (const { where, brief } of all()) {
      for (const ruling of rulingsOf(brief)) {
        expect(foreignDigits(renderEntailment(ORDER_DESK_SCHEMA, ruling), ruling), `${where}: ${ruling.kind} ${ruling.field}`).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBe(80 * 5 + 2);
  });

  it("THE DIGIT PROPERTY, per Brief: every digit token of every renderBrief is a digit of what the Brief carries or the position of a refusal", () => {
    for (const { where, brief } of all()) {
      const carried = [brief.answer, brief.claims, brief.rejected.map((r) => r.index)];
      expect(foreignDigits(renderBrief(ORDER_DESK_SCHEMA, brief), carried), where).toEqual([]);
    }
  });

  it("THE DENYLIST, separately: no rendered word of any ruling or Brief is a number word", () => {
    for (const { where, brief } of all()) {
      expect(numberWordsIn(renderBrief(ORDER_DESK_SCHEMA, brief)), where).toEqual([]);
      for (const ruling of rulingsOf(brief)) expect(numberWordsIn(renderEntailment(ORDER_DESK_SCHEMA, ruling)), `${where}: ${ruling.kind}`).toEqual([]);
    }
  });

  describe("what each assertion does not see, on literal strings (neither covers the other)", () => {
    // Step 1's customs claim, ungrounded: its own digits are 0 and 2.
    const ruling: Entailment = {
      kind: "ungrounded",
      field: CUSTOMS,
      tested: { lo: 2, hi: 2 },
      openEnds: [{ field: CUSTOMS, side: "lo" }, { field: CUSTOMS, side: "hi" }],
    };
    // A literal, not a call to the renderer: these tests are about what the two checks can and cannot see in a string.
    const honest =
      "Cannot answer: customs clearance exactly 2 days. The evidence does not move customs clearance from what the schema implies. Missing: no document bounds customs clearance from below; no document bounds customs clearance from above.";

    it("the honest sentence passes both, and is what the renderer says of that ruling", () => {
      expect(renderEntailment(ORDER_DESK_SCHEMA, ruling)).toBe(honest);
      expect([foreignDigits(honest, ruling), numberWordsIn(honest)]).toEqual([[], []]);
    });

    it("a number added as a digit ('typically 3 days') fails the digit check and passes the denylist", () => {
      const text = `${honest} Typically 3 days.`;
      expect([foreignDigits(text, ruling), numberWordsIn(text)]).toEqual([["3"], []]);
    });

    it("a number added as a listed word ('a couple of days') passes the digit check and fails the denylist", () => {
      const text = `${honest} It usually takes a couple of days.`;
      expect([foreignDigits(text, ruling), numberWordsIn(text)]).toEqual([[], ["couple"]]);
    });

    it("a number added as a word the list lacks ('a handful of days', 'about a fortnight', 'thirty days') passes BOTH: the limit of each", () => {
      for (const addition of [" It usually takes a handful of days.", " About a fortnight.", " Thirty days at most."]) {
        const text = honest + addition;
        expect([foreignDigits(text, ruling), numberWordsIn(text)], addition).toEqual([[], []]);
      }
    });

    it("the denylist matches whole words only, in any case and across a hyphen (not 'none', 'someone', 'fewer'), and the digit check names the foreign token", () => {
      expect(numberWordsIn("TWO or Several; twenty-one; none, someone, often, fewer, coupled")).toEqual(["two", "several", "twenty", "one"]);
      expect(foreignDigits(`${honest} Typically 3 days, a couple.`, ruling)).toEqual(["3"]);
    });
  });
});
