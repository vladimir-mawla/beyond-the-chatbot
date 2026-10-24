import { afterAll, describe, expect, it } from "vitest";
import {
  ROUTES,
  allGroups,
  deleteNever,
  formatMatrix,
  outcomeProblems,
  probeCodes,
  runSabotage,
  type Mutation,
  type SabotageOutcome,
} from "./support/sabotage.js";

/**
 * THE 17-OF-17 SABOTAGE (`.genesis/PLAN.md` section 6 M1 and section 8 defect 7), run for real on every `npm test`.
 *
 * For each of the 17 `?: never` fields, a COPY of `lib/contracts` has that one line deleted, and every proof file
 * is run against the copy. The claim, checked mechanically: exactly that field's own proofs go red, every one
 * of its eight routes, and no proof of any other field goes red. A proof that stayed green when its field was
 * deleted would be vacuous; none does.
 *
 * Two views of "red", both asserted (see `support/sabotage.ts`):
 *   STRICT       - the proof harness: the line no longer has exactly the stated diagnostic.
 *   AS WRITTEN   - what `npm run typecheck` reports: TS2578, an unused `@ts-expect-error`.
 *
 * And a LITERAL PROBE per field, which is the plan's defect 7 measured on the real code: a fresh literal that
 * carries the forbidden field FAILS TO COMPILE WHETHER OR NOT the `?: never` is there (the control and every
 * deletion each report exactly one error under each config), so a proof written that way is vacuous and the
 * proof files deliberately have no literal route.
 *
 * A CONTROL runs first: the unmutated copy must produce no failure in either view, so the machinery is not
 * simply red.
 *
 * WHAT THIS DOES NOT PROVE: that the 17 are the right 17, or that a type-level proof is the only guard. The
 * runtime table (`integrity.test.ts`) is separate; and what the types cannot refuse at all is
 * `residual-routes.test.ts`.
 */
interface NeverField {
  readonly iface: string;
  readonly field: string;
  readonly file: string;
  readonly group: string;
  /** The sample the literal probe spreads, and the value it adds under the forbidden field. */
  readonly sample: string;
  readonly value: string;
}
const E = (variant: string): string => `ENTAILMENT_SAMPLES.${variant}`;
const NEVER_FIELDS: readonly NeverField[] = [
  { iface: "BaseField", field: "sum", file: "schema.ts", group: "base_sum", sample: "BASE_FIELD", value: "[PACK, CUSTOMS] as Operands" },
  { iface: "DerivedField", field: "baseline", file: "schema.ts", group: "derived_baseline", sample: "DERIVED_FIELD", value: "SOME_EXTENT" },
  { iface: "Entailed", field: "unmet", file: "entailment.ts", group: "entailed_unmet", sample: E("entailed"), value: "SOME_UNMET" },
  { iface: "Entailed", field: "openEnds", file: "entailment.ts", group: "entailed_openEnds", sample: E("entailed"), value: "SOME_OPEN_ENDS" },
  { iface: "Entailed", field: "core", file: "entailment.ts", group: "entailed_core", sample: E("entailed"), value: "SOME_CORE" },
  { iface: "Weakened", field: "core", file: "entailment.ts", group: "weakened_core", sample: E("weakened"), value: "SOME_CORE" },
  { iface: "Contradicted", field: "unmet", file: "entailment.ts", group: "contradicted_unmet", sample: E("contradicted"), value: "SOME_UNMET" },
  { iface: "Contradicted", field: "openEnds", file: "entailment.ts", group: "contradicted_openEnds", sample: E("contradicted"), value: "SOME_OPEN_ENDS" },
  { iface: "Contradicted", field: "core", file: "entailment.ts", group: "contradicted_core", sample: E("contradicted"), value: "SOME_CORE" },
  { iface: "Ungrounded", field: "established", file: "entailment.ts", group: "ungrounded_established", sample: E("ungrounded"), value: "SOME_EXTENT" },
  { iface: "Ungrounded", field: "support", file: "entailment.ts", group: "ungrounded_support", sample: E("ungrounded"), value: "SOME_SUPPORT" },
  { iface: "Ungrounded", field: "unmet", file: "entailment.ts", group: "ungrounded_unmet", sample: E("ungrounded"), value: "SOME_UNMET" },
  { iface: "Ungrounded", field: "core", file: "entailment.ts", group: "ungrounded_core", sample: E("ungrounded"), value: "SOME_CORE" },
  { iface: "Conflicted", field: "established", file: "entailment.ts", group: "conflicted_established", sample: E("conflicted"), value: "SOME_EXTENT" },
  { iface: "Conflicted", field: "support", file: "entailment.ts", group: "conflicted_support", sample: E("conflicted"), value: "SOME_SUPPORT" },
  { iface: "Conflicted", field: "unmet", file: "entailment.ts", group: "conflicted_unmet", sample: E("conflicted"), value: "SOME_UNMET" },
  { iface: "Conflicted", field: "openEnds", file: "entailment.ts", group: "conflicted_openEnds", sample: E("conflicted"), value: "SOME_OPEN_ENDS" },
];

const MUTATIONS: readonly Mutation[] = NEVER_FIELDS.map((n) => ({
  id: `delete ${n.iface}.${n.field}?: never`,
  file: n.file,
  apply: deleteNever(n.iface, n.field),
  groups: [n.group],
}));

/** A fresh-literal assignment carrying the forbidden field: the form that cannot tell the `?: never` from its absence. */
function literalProbe(n: NeverField): string {
  const target = n.iface === "BaseField" || n.iface === "DerivedField" ? "FieldDecl" : "Entailment";
  return [
    'import type { Entailment } from "../../entailment.js";',
    'import type { FieldDecl, Operands } from "../../schema.js";',
    'import { BASE_FIELD, CUSTOMS, DERIVED_FIELD, ENTAILMENT_SAMPLES, PACK, SOME_CORE, SOME_EXTENT, SOME_OPEN_ENDS, SOME_SUPPORT, SOME_UNMET } from "../support/samples.js";',
    `export const literalSite: ${target} = { ...${n.sample}, ${n.field}: ${n.value} };`,
    "export type Used = [Entailment, FieldDecl, Operands, typeof BASE_FIELD, typeof DERIVED_FIELD, typeof ENTAILMENT_SAMPLES, typeof PACK, typeof CUSTOMS];",
    "export const usedValues = [SOME_CORE, SOME_EXTENT, SOME_OPEN_ENDS, SOME_SUPPORT, SOME_UNMET];",
  ].join("\n");
}

/** What a fresh literal is refused with: an assignability error (TS2322, or TS2375 under exactOptionalPropertyTypes) or an excess-property error (TS2353). */
const LITERAL_CODES: readonly number[] = [2322, 2353, 2375];

const results: { id: string; outcome: SabotageOutcome }[] = [];
afterAll(() => {
  // Printed only on request, so a normal run stays quiet: `BTC_REPORT=1 npm test -- never-sabotage`.
  if (process.env["BTC_REPORT"] === "1") {
    console.log(formatMatrix("17x17: rows = the `?: never` deleted, columns = proof group, cell = routes (of 7) that went red", results, NEVER_FIELDS.map((n) => n.group)));
  }
});

describe("17 `?: never` fields, each deleted alone from a copy of lib/contracts", () => {
  it("lists 17 fields, one group each, and every group exists in the proof files", () => {
    expect(NEVER_FIELDS).toHaveLength(17);
    expect(new Set(NEVER_FIELDS.map((n) => n.group)).size).toBe(17);
    const groups = allGroups();
    for (const n of NEVER_FIELDS) expect(groups, n.group).toContain(n.group);
  });

  it("CONTROL: with nothing deleted no proof goes red, strict or as written", { timeout: 60_000 }, () => {
    const outcome = runSabotage(undefined);
    expect(outcome.unattributed).toEqual([]);
    expect([...outcome.strict.keys()]).toEqual([]);
    expect([...outcome.asWritten.keys()]).toEqual([]);
  });

  for (const [index, mutation] of MUTATIONS.entries()) {
    const n = NEVER_FIELDS[index] as NeverField;
    it(`${mutation.id}: exactly its own proofs go red (all ${ROUTES.length} routes) and no other`, { timeout: 120_000 }, () => {
      const outcome = runSabotage(mutation);
      results.push({ id: mutation.id.replace("delete ", "").replace("?: never", ""), outcome });
      expect(outcomeProblems(mutation, outcome)).toEqual([]);
      // The literal probe: ONE error per config with the `?: never` present AND with it deleted, so it cannot discriminate.
      for (const run of [probeCodes(undefined, literalProbe(n)), probeCodes(mutation, literalProbe(n))]) {
        expect(run.map((p) => p.config)).toEqual(["tsconfig.lib.json", "tsconfig.json"]);
        for (const p of run) {
          expect(p.codes, `${n.group} [${p.config}]`).toHaveLength(1);
          expect(LITERAL_CODES).toContain(p.codes[0]);
        }
      }
    });
  }
});
