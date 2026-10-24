import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNeverEntailment, type Entailment } from "../entailment.js";
import { checkProofSource, checkProofSources } from "./support/proof-harness.js";
import { ENTAILMENT_KINDS, ENTAILMENT_SAMPLES } from "./support/samples.js";
import { withCopy } from "./support/sabotage.js";

/**
 * `Entailment` is a closed union, and `assertNeverEntailment` is the gate that keeps every consumer of it honest.
 *  - RUN TIME: it throws on a value the type does not describe (a cast, parsed JSON).
 *  - COMPILE TIME: it is the `default` of a switch over `kind`, which compiles only while every variant has a
 *    case. `proofs/exhaustiveness.proofs.ts` proves that on a LOCAL STAND-IN union (a proof cannot edit the real
 *    one) and on the real union with each variant left out in turn; the tests below then make the real union
 *    GROW, in a copy, and require those same lines to react. `npm test` strips types, so a switch that stops
 *    compiling is caught by `npm run typecheck` and by these harness runs, not by an ordinary assertion.
 */
const PROOFS = join(import.meta.dirname, "proofs");
const EXHAUSTIVENESS = join(PROOFS, "exhaustiveness.proofs.ts");

/** A consumer switch over the real union: every variant handled, ending in the gate. A sixth variant breaks its compilation. */
function describeEntailment(e: Entailment): string {
  switch (e.kind) {
    case "entailed":
      return `entailed ${e.established.lo}..${e.established.hi}`;
    case "weakened":
      return `weakened to ${e.established.lo}..${e.established.hi}, cut ${e.unmet.join("+")}`;
    case "contradicted":
      return `contradicted by ${e.established.lo}..${e.established.hi}`;
    case "ungrounded":
      return `ungrounded, ${e.openEnds.length} open end(s)`;
    case "conflicted":
      return `conflicted, core ${e.core.join(",")}`;
    default:
      return assertNeverEntailment(e);
  }
}

describe("assertNeverEntailment at run time", () => {
  it("throws on a value no variant describes, and names it", () => {
    expect(() => assertNeverEntailment({ kind: "refuted" } as never)).toThrow('unreachable Entailment variant: {"kind":"refuted"}');
  });

  it("throws whatever it is given, including values JSON cannot print", () => {
    expect(() => assertNeverEntailment(undefined as never)).toThrow("unreachable Entailment variant: undefined");
    expect(() => assertNeverEntailment(10n as never)).toThrow("[a value JSON.stringify cannot print]");
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => assertNeverEntailment(circular as never)).toThrow("[a value JSON.stringify cannot print]");
  });

  it("is reached by a consumer switch only for a value that is not an Entailment", () => {
    expect(ENTAILMENT_KINDS.map((k) => describeEntailment(ENTAILMENT_SAMPLES[k]).split(/[ ,]/)[0])).toEqual([
      "entailed",
      "weakened",
      "contradicted",
      "ungrounded",
      "conflicted",
    ]);
    expect(() => describeEntailment({ kind: "refuted" } as unknown as Entailment)).toThrow("unreachable Entailment variant");
  });
});

/** The declaration (`export function <name>`) at or above a 1-based line. */
function declarationAt(source: string, line: number): string {
  const lines = source.split("\n");
  for (let i = line - 1; i >= 0; i--) {
    const match = /^export function (\w+)/.exec(lines[i] as string);
    if (match !== null) return match[1] as string;
  }
  return "?";
}

describe("the exhaustiveness proofs react when a union grows, and only the right lines do", () => {
  const source = readFileSync(EXHAUSTIVENESS, "utf8");

  it("CONTROL: as written, no line of the exhaustiveness proofs fails", () => {
    expect(checkProofSource(source, PROOFS).problems).toEqual([]);
  });

  it("a sixth variant on the LOCAL STAND-IN breaks the stand-in's handles-all switch", () => {
    const grown = source.replace(
      "export type StandIn = StandInEntailed | StandInWeakened | StandInContradicted | StandInUngrounded | StandInConflicted;",
      "export type StandIn = StandInEntailed | StandInWeakened | StandInContradicted | StandInUngrounded | StandInConflicted | StandInRefuted;",
    );
    expect(grown).not.toBe(source);
    const report = checkProofSource(grown, PROOFS);
    const names = [...new Set(report.failures.map((f) => declarationAt(grown, f.line)))];
    expect(names).toEqual(["standInHandlesAll"]);
    expect(report.failures.every((f) => f.kind === "stray-diagnostic")).toBe(true);
  });

  it("a sixth variant on the REAL union breaks the real handles-all switch and every real 'missing' proof, and not the stand-in's", () => {
    const grown = {
      id: "add a sixth variant `Refuted` to the real Entailment union",
      file: "entailment.ts",
      apply: (text: string): string => {
        const declaration = "export type Entailment = Entailed | Weakened | Contradicted | Ungrounded | Conflicted;";
        if (!text.includes(declaration)) throw new Error("sabotage: the Entailment union declaration was not found");
        return text.replace(
          declaration,
          `export interface Refuted extends EntailmentBase { readonly kind: "refuted" }\nexport type Entailment = Entailed | Weakened | Contradicted | Ungrounded | Conflicted | Refuted;`,
        );
      },
      groups: [],
      integrityTable: false,
    };
    const report = withCopy(grown, (copy) => {
      const copied = join(copy, "__tests__", "proofs");
      const text = readFileSync(join(copied, "exhaustiveness.proofs.ts"), "utf8");
      return { text, report: checkProofSources([{ name: "p", source: text }], copied).get("p") };
    });
    const failures = report.report?.failures ?? [];
    const names = [...new Set(failures.map((f) => declarationAt(report.text, f.line)))].sort();
    expect(names).toEqual(
      ["realHandlesAll", "realMissingConflicted", "realMissingContradicted", "realMissingEntailed", "realMissingUngrounded", "realMissingWeakened"].sort(),
    );
    // The control now fails because a diagnostic appears where there was none; each "missing" proof fails because
    // the left-over type is `Refuted | <variant>`, not the stated variant alone.
    expect(failures.filter((f) => declarationAt(report.text, f.line) === "realHandlesAll").every((f) => f.kind === "stray-diagnostic")).toBe(true);
    expect(failures.filter((f) => declarationAt(report.text, f.line) !== "realHandlesAll").every((f) => f.kind === "wrong-diagnostic")).toBe(true);
  });
});
