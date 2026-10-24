import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Entailment } from "../entailment.js";
import { assertEntailmentWellFormed, type EntailmentIntegrity } from "../integrity.js";
import { RESIDUALS } from "./proofs/residuals.proofs.js";
import { checkProofSource } from "./support/proof-harness.js";
import { ENTAILMENT_SAMPLES } from "./support/samples.js";

/**
 * THE `?: never` RESIDUALS, each shown twice: it COMPILES (a directive-free line in `proofs/residuals.proofs.ts`,
 * which the proof harness requires to compile under both tsconfigs, so the type system really does let it
 * through) and `assertEntailmentWellFormed` says what it makes of the value that came out. Nothing in the
 * types stops these routes; this test is where the plan's "must refuse via every non-literal route" is
 * answered for the ones the type system does NOT refuse: by the run-time guard, or, for the last, not at all.
 *
 * Routes the type system DOES refuse (intermediate binding, spread, function return, `satisfies`, a generic
 * helper, `Object.assign` of a value whose type already carries the field, an array element) are
 * `proofs/entailment-forbidden.proofs.ts`, and each is shown to go red when its `?: never` is deleted by
 * `never-sabotage.test.ts`. The routes it does NOT refuse are below, with where each is caught.
 */
const HERE = import.meta.dirname;

const UNGROUNDED_ESTABLISHED: EntailmentIntegrity = { ok: false, error: { kind: "unexpected-field", variant: "ungrounded", field: "established" } };

/** What `assertEntailmentWellFormed` reports for each route's value. `{ ok: true }` means the guard does NOT see it. */
const EXPECTED: Readonly<Record<string, EntailmentIntegrity>> = {
  viaCast: UNGROUNDED_ESTABLISHED,
  viaAny: UNGROUNDED_ESTABLISHED,
  viaSupertype: UNGROUNDED_ESTABLISHED,
  viaFunction: UNGROUNDED_ESTABLISHED,
  viaConditional: UNGROUNDED_ESTABLISHED,
  viaArray: UNGROUNDED_ESTABLISHED,
  viaTypeGuard: UNGROUNDED_ESTABLISHED,
  viaAssignStatement: UNGROUNDED_ESTABLISHED,
  viaAssignExpression: UNGROUNDED_ESTABLISHED,
  viaDefineProperty: UNGROUNDED_ESTABLISHED,
  viaWritableAlias: UNGROUNDED_ESTABLISHED,
  viaCastMissingCore: { ok: false, error: { kind: "missing-field", variant: "conflicted", field: "core" } },
  viaAnyEmptyUnmet: { ok: false, error: { kind: "empty-array", variant: "weakened", field: "unmet" } },
  // NOT CAUGHT. An unrelated extra key is not a field of any variant, so neither `?: never` nor the guard's table names it.
  viaUnrelatedKey: { ok: true },
};

describe("every route the type system leaves open reaches the run-time guard", () => {
  it("the table names exactly the routes the proof file exports, so a route cannot be added without saying where it is caught", () => {
    expect(RESIDUALS.map((r) => r.route).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(RESIDUALS).toHaveLength(14);
  });

  for (const { route, value } of RESIDUALS) {
    const expected = EXPECTED[route] as EntailmentIntegrity;
    it(`${route}: ${expected.ok ? "NOT caught by the guard" : `caught as ${expected.error.kind}`}`, () => {
      expect(assertEntailmentWellFormed(value)).toEqual(expected);
    });
  }

  it("the contaminated value really is contaminated: the field is on the object, whatever its static type says", () => {
    const viaCast = RESIDUALS.find((r) => r.route === "viaCast")?.value as unknown as Record<string, unknown>;
    expect("established" in viaCast).toBe(true);
    expect(viaCast["kind"]).toBe("ungrounded");
  });

  it("no route mutated a shared sample: the samples are still well formed afterwards", () => {
    for (const sample of Object.values(ENTAILMENT_SAMPLES)) {
      expect(assertEntailmentWellFormed(sample)).toEqual({ ok: true });
    }
    expect("established" in ENTAILMENT_SAMPLES.ungrounded).toBe(false);
  });
});

describe("two residuals that hold under ONE tsconfig only, pinned with the harness itself", () => {
  const PROOFS = join(HERE, "proofs");
  const TYPE_IMPORT = 'import type { Entailment } from "../../entailment.js";';
  const summary = (source: string): string[] =>
    checkProofSource(source, PROOFS).failures.map((f) => `${f.config}:${f.line}:${f.kind}`).sort();

  it("a plain `x as Entailment` (no `unknown`) compiles under tsconfig.lib.json and is refused under tsconfig.json", () => {
    // The directive claims an error; the harness reports a `no-diagnostic` failure under the config that has none.
    const source = [
      TYPE_IMPORT,
      'import { ENTAILMENT_SAMPLES, SOME_EXTENT } from "../support/samples.js";',
      "const contaminated = { ...ENTAILMENT_SAMPLES.ungrounded, established: SOME_EXTENT };",
      "// @ts-expect-error TS2352 Conversion of type",
      "export const plainCast: Entailment = contaminated as Entailment;",
    ].join("\n");
    expect(summary(source)).toEqual(["tsconfig.lib.json:5:no-diagnostic"]);
  });

  it("an explicit `established: undefined` compiles under tsconfig.json (no exactOptionalPropertyTypes) and is refused under tsconfig.lib.json", () => {
    const source = [
      TYPE_IMPORT,
      'import { ENTAILMENT_SAMPLES } from "../support/samples.js";',
      "const withUndefined = { ...ENTAILMENT_SAMPLES.ungrounded, established: undefined };",
      "// @ts-expect-error TS2322|TS2375 Types of property 'established' are incompatible",
      "export const explicitUndefined: Entailment = withUndefined;",
    ].join("\n");
    expect(summary(source)).toEqual(["tsconfig.json:5:no-diagnostic"]);
  });

  it("and the guard flags that value at run time: the key being present is enough", () => {
    const withUndefined = { ...ENTAILMENT_SAMPLES.ungrounded, established: undefined } as unknown as Entailment;
    expect(assertEntailmentWellFormed(withUndefined)).toEqual(UNGROUNDED_ESTABLISHED);
  });
});
