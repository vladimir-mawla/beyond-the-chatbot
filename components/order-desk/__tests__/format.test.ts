import { describe, expect, it } from "vitest";
import { KINDS, KIND_GLOSS, basisText, cutText, daysPhrase, openEndText, reproductionText, sideText } from "../format-entailment.js";
import { citedByText, countWord, intervalText, pairwiseLine } from "../format-evidence.js";

/** The formatters are small and pure; each expected string is a literal, not rebuilt from the function under test. */

describe("format-entailment", () => {
  it("daysPhrase: one day, and days", () => {
    expect(daysPhrase(1)).toBe("1 day");
    expect(daysPhrase(0)).toBe("0 days");
    expect(daysPhrase(14)).toBe("14 days");
    expect(daysPhrase(-1)).toBe("-1 days");
  });

  it("every kind has a gloss, and the glosses are distinct", () => {
    expect(KINDS).toEqual(["entailed", "weakened", "contradicted", "ungrounded", "conflicted"]);
    expect(new Set(KINDS.map((kind) => KIND_GLOSS[kind])).size).toBe(5);
  });

  it("basisText names the drafter's three bases, and passes an unknown word through", () => {
    expect(basisText("observed")).toBe("read from the documents");
    expect(basisText("prior")).toBe("a typical figure, not from any document");
    expect(basisText("sum")).toBe("the sum of its own three figures");
    expect(basisText("other")).toBe("other");
  });

  it("sideText, cutText and openEndText", () => {
    expect(sideText("lo")).toBe("lower bound");
    expect(sideText("hi")).toBe("upper bound");
    expect(cutText(["hi"])).toBe("cut: upper bound");
    expect(cutText(["lo", "hi"])).toBe("cut: lower bound and upper bound");
    expect(cutText([])).toBe("nothing cut");
    expect(openEndText("customs clearance", "hi")).toBe("customs clearance: nothing bounds it from above");
    expect(openEndText("customs clearance", "lo")).toBe("customs clearance: nothing bounds it from below");
  });

  it("reproductionText: each finding the engine can give", () => {
    expect(reproductionText({ kind: "reproduced", silentSides: [] })).toBe("re-derived from the carried evidence");
    expect(reproductionText({ kind: "reproduced", silentSides: ["lo"] })).toBe("re-derived; lower bound rests on the schema alone");
    expect(reproductionText({ kind: "reproduced" })).toBe("re-derived from the carried evidence");
    expect(reproductionText({ kind: "uncertifiable-silence" })).toBe("not certifiable: an absence cannot be checked from a subset of the evidence");
    expect(reproductionText({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "hi", carried: 10, rederived: 9 } })).toBe(
      "not re-derived: the upper bound says 10 but its own support gives 9",
    );
    expect(reproductionText({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "lo", carried: null, rederived: 4 } })).toBe(
      "not re-derived: the lower bound says none but its own support gives 4",
    );
    expect(reproductionText({ kind: "not-reproduced", reason: { kind: "unmet-differs" } })).toBe("not re-derived (unmet-differs)");
    expect(reproductionText({ kind: "not-reproduced" })).toBe("not re-derived");
  });
});

describe("format-evidence", () => {
  it("intervalText: closed, half-open and unbounded", () => {
    expect(intervalText(1, 2)).toBe("[1, 2]");
    expect(intervalText(14, 14)).toBe("[14, 14]");
    expect(intervalText(0, null)).toBe("[0, ∞)");
    expect(intervalText(null, 12)).toBe("(−∞, 12]");
    expect(intervalText(null, null)).toBe("(−∞, ∞)");
  });

  it("citedByText", () => {
    expect(citedByText([])).toBe("cited by no ruling");
    expect(citedByText(["question", "claim 1"])).toBe("cited by question, claim 1");
  });

  it("countWord: words for small counts, digits beyond", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(countWord)).toEqual(["no", "one", "two", "three", "four", "five", "six", "7"]);
  });

  it("pairwiseLine: the headline of step 5, and the variants", () => {
    expect(
      pairwiseLine(
        [
          { size: 2, total: 6, consistent: 6 },
          { size: 3, total: 4, consistent: 4 },
        ],
        4,
        false,
      ),
    ).toBe("6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted");
    expect(pairwiseLine([{ size: 2, total: 3, consistent: 2 }], 3, true)).toBe("2 of 3 pairs consistent · all three: consistent");
    expect(pairwiseLine([], 2, false)).toBe("all two: conflicted");
    expect(pairwiseLine([{ size: 4, total: 5, consistent: 5 }], 5, false)).toBe("5 of 5 four-document sets consistent · all five: conflicted");
  });
});
