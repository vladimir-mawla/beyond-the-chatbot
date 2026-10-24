import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROOF_CONFIGS, checkProofSource, compileAsWritten, type ProofReport } from "./support/proof-harness.js";

/**
 * SELF-TEST OF THE PROOF HARNESS (`support/proof-harness.ts`). A harness that has never been shown to fail
 * proves nothing, so each case below feeds it a deliberately bad proof file and asserts the SPECIFIC
 * failure it reports (kind, line, config), not merely "something was reported".
 *
 * The five ways a proof can be false, each with its own fixture and each shown red:
 *   1. the expected diagnostic is MISSING          (`no-diagnostic`)
 *   2. the diagnostic has the WRONG CODE           (`wrong-diagnostic`)
 *   3. the diagnostic has the WRONG MESSAGE        (`wrong-diagnostic`)
 *   4. the error is on the WRONG LINE              (`no-diagnostic` + `stray-diagnostic`)
 *   5. the expected diagnostic comes with an ADDITIONAL one (`extra-diagnostic`), both when the extra has a
 *      different code and when it has the SAME code (the hole the sibling project's verifier found).
 * The rest cover the ways a directive itself can be malformed, the two-config claim, and the report of a
 * diagnostic in an imported file. `checkProofSource` compiles a scratch copy, so nothing is written under `lib/`.
 *
 * WHAT THIS DOES NOT PROVE: that the real proof files under `proofs/` are the right proofs. That is
 * `type-proofs.test.ts` (each one passes the harness) and the sabotage test (each is red when its field is gone).
 */
const HERE = import.meta.dirname;
const check = (source: string): ProofReport => checkProofSource(source, HERE);

/** `[config, line, kind]`, sorted, so an assertion states exactly what was reported and where. */
const summary = (report: ProofReport): string[] =>
  report.failures.map((f) => `${f.config}:${f.line}:${f.kind}`).sort();

const BOTH = (line: number, kind: string): string[] =>
  PROOF_CONFIGS.map((config) => `${config}:${line}:${kind}`).sort();

describe("proof harness: accepts a sound proof", () => {
  it("passes a line that fails for exactly the stated code and message under both configs", () => {
    const report = check(
      [
        "const a: number = 1;",
        "// @ts-expect-error TS2322 is not assignable to type 'number'",
        'const b: number = "x";',
        "export const used = [a, b];",
      ].join("\n"),
    );
    expect(report.problems).toEqual([]);
    expect(report.directives).toBe(1);
  });

  it("accepts a code alternative: `TS2322|TS2741` is satisfied by either", () => {
    const report = check(
      ["// @ts-expect-error TS2741|TS2322 is not assignable to type 'number'", 'export const b: number = "x";'].join("\n"),
    );
    expect(report.problems).toEqual([]);
  });

  it("runs under both of the repo's tsconfigs", () => {
    expect(PROOF_CONFIGS).toEqual(["tsconfig.lib.json", "tsconfig.json"]);
  });
});

describe("proof harness: each of the five ways a proof can be false goes red", () => {
  it("1. the expected diagnostic is missing: a directive over a line that compiles cleanly", () => {
    const report = check(
      ["// @ts-expect-error TS2322 is not assignable to type 'number'", "export const ok: number = 1;"].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(2, "no-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/no diagnostic at all/);
  });

  it("1b. ... including when the only error on the line is an unused local (noUnusedLocals), which a bare directive accepts", () => {
    // `ok` is legal and never read: tsc reports TS6133, which would satisfy a bare @ts-expect-error. The
    // trailing `export {}` makes the file a module under BOTH configs (tsconfig.json has no moduleDetection
    // "force", and a top-level local in a script file is a global, which noUnusedLocals does not flag).
    const report = check(["// @ts-expect-error TS2322 is not assignable", "const ok: number = 1;", "export {};"].join("\n"));
    expect(summary(report)).toEqual(BOTH(2, "wrong-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/expected TS2322 containing .* got TS6133/);
  });

  it("2. the diagnostic has the wrong code: the message contains the fragment, so only the code check can reject it", () => {
    const report = check(
      ["// @ts-expect-error TS2345 is not assignable to type 'number'", 'export const wrongCode: number = "x";'].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(2, "wrong-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/expected TS2345 containing .* got TS2322/);
  });

  it("3. the diagnostic has the right code but the wrong message: only the fragment check can reject it", () => {
    const report = check(
      [
        "// @ts-expect-error TS2322 Types of property 'established' are incompatible",
        'export const wrongField: number = "x";',
      ].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(2, "wrong-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/containing "Types of property 'established' are incompatible"/);
  });

  it("4. the error is on the wrong line: the directive points at a clean line and the error sits one line further down", () => {
    const report = check(
      [
        "// @ts-expect-error TS2322 is not assignable to type 'number'",
        "export const fine: number = 1;",
        'export const bad: number = "x";',
      ].join("\n"),
    );
    expect(summary(report)).toEqual([...BOTH(2, "no-diagnostic"), ...BOTH(3, "stray-diagnostic")].sort());
  });

  it("4b. an error on a line with no directive at all", () => {
    const report = check('export const stray: number = "x";');
    expect(summary(report)).toEqual(BOTH(1, "stray-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/unexpected diagnostic TS2322 outside any proof line/);
  });

  it("5a. the stated error plus an additional one of a DIFFERENT code on the same line (an unused local)", () => {
    const report = check(
      ["// @ts-expect-error TS2322 is not assignable", 'const unusedAndWrong: number = "x";', "export {};"].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(2, "extra-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/unexpected extra diagnostic TS6133/);
  });

  it("5b. the stated error plus an additional one of the SAME code on the same line: the hole a verifier found in the sibling's harness", () => {
    // Two declarators, two TS2322, one line. A harness that tolerates "another diagnostic with a code the
    // directive already lists" accepts this; this one must not.
    const report = check(
      ["// @ts-expect-error TS2322 is not assignable to type 'number'", 'export const p: number = "x", q: number = "y";'].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(2, "extra-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/unexpected extra diagnostic TS2322/);
  });

  it("5c. an additional diagnostic ELSEWHERE in the file, with every directive itself satisfied", () => {
    const report = check(
      [
        "// @ts-expect-error TS2322 is not assignable to type 'number'",
        'export const ok: number = "x";',
        "",
        'export const elsewhere: boolean = 1;',
      ].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(4, "stray-diagnostic"));
  });
});

describe("proof harness: a fresh-literal excess-property error cannot stand in for an assignability error", () => {
  it("reports TS2353 where the proof claims TS2322, which is what a deleted `?: never` turns a literal proof into", () => {
    const report = check(
      [
        "type A = { readonly a: number };",
        "// @ts-expect-error TS2322 is not assignable",
        "export const lit: A = { a: 1, b: 2 };",
      ].join("\n"),
    );
    expect(summary(report)).toEqual(BOTH(3, "wrong-diagnostic"));
    expect(report.problems.join("\n")).toMatch(/expected TS2322 containing .* got TS2353/);
  });
});

describe("proof harness: a suppression comment that is not in the accepted form is itself a failure", () => {
  const BAD = [
    "// @ts-ignore",
    "// @ts-expect-error",
    "// @ts-expect-error TS2322",
    "// @ts-nocheck",
    "/* @ts-expect-error TS2322 x */",
    "//@ts-expect-error TS2322 is not assignable",
  ];
  for (const comment of BAD) {
    it(`rejects ${JSON.stringify(comment)}`, () => {
      const report = check([comment, 'export const hidden: number = "x";'].join("\n"));
      expect(report.failures.some((f) => f.kind === "bad-directive" && f.line === 1), report.problems.join("\n")).toBe(true);
    });
  }

  it("rejects a suppression hidden behind code on the same line", () => {
    const report = check('export const hidden: number = "x"; // @ts-ignore');
    expect(report.failures.some((f) => f.kind === "bad-directive" && f.line === 1)).toBe(true);
  });

  it("does not mistake prose that merely mentions the marker for a directive", () => {
    const report = check(["// the directive @ts-expect-error is described in the harness header", "export const fine: number = 1;"].join("\n"));
    expect(report.problems).toEqual([]);
  });
});

describe("proof harness: the two configs really differ, and both are consulted", () => {
  it("reports a proof that only holds under exactOptionalPropertyTypes, naming the config where it does not", () => {
    // `{ a: undefined }` for `a?: number` is an error only under tsconfig.lib.json.
    const report = check(
      [
        "type O = { readonly a?: number };",
        "// @ts-expect-error TS2375 exactOptionalPropertyTypes",
        "export const o: O = { a: undefined };",
      ].join("\n"),
    );
    expect(summary(report)).toEqual(["tsconfig.json:3:no-diagnostic"]);
  });
});

describe("proof harness: a contract source that stops compiling is reported under its own file, not as a broken proof", () => {
  it("names the imported file and does not blame a proof line", () => {
    const dir = mkdtempSync(join(tmpdir(), "btc-proof-harness-import-"));
    try {
      writeFileSync(join(dir, "broken.ts"), 'export const broken: number = "not a number";\n');
      const report = checkProofSource(['import { broken } from "./broken.js";', "export const used = broken;"].join("\n"), dir);
      expect(report.problems.length).toBeGreaterThan(0);
      for (const problem of report.problems) {
        expect(problem).toMatch(/broken\.ts\(1\): TS2322 in a file the proof imports, not in the proof/);
      }
      expect(report.failures.every((f) => f.kind === "imported-file")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("compileAsWritten: what `npm run typecheck` sees of a proof file", () => {
  it("reports TS2578 for a directive that suppresses nothing, and nothing for one that does", () => {
    const unused = compileAsWritten(
      ["// @ts-expect-error TS2322 is not assignable", "export const ok: number = 1;"].join("\n"),
      HERE,
      "tsconfig.lib.json",
    );
    expect(unused.map((d) => `${d.line}:TS${d.code}`)).toEqual(["1:TS2578"]);

    const used = compileAsWritten(
      ["// @ts-expect-error TS2322 is not assignable", 'export const bad: number = "x";'].join("\n"),
      HERE,
      "tsconfig.lib.json",
    );
    expect(used).toEqual([]);
  });
});
