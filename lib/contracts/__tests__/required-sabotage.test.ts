import { afterAll, describe, expect, it } from "vitest";
import {
  allGroups,
  formatMatrix,
  loosenOperands,
  makeOptional,
  outcomeProblems,
  retype,
  runSabotage,
  type Mutation,
  type SabotageOutcome,
} from "./support/sabotage.js";

/**
 * THE SAME SABOTAGE FOR WHAT EACH VARIANT REQUIRES (`proofs/required.proofs.ts`), which the plan does not ask
 * for by name but which has the same failure mode: a "this must not compile" proof is only worth having if it
 * goes red when the thing it guards is loosened. Each row loosens ONE declaration in a COPY of `lib/contracts`
 * and requires that exactly the listed proof groups go red, every route, strict and as written
 * (`support/sabotage.ts`), and no other proof of any file.
 *
 *   MISSING  - a required field made optional (`established: Extent` -> `established?: Extent`). 12 rows.
 *   EMPTY    - a non-empty tuple loosened to an array that may be empty (`NonEmptyReadonlyArray<Side>` ->
 *              `readonly Side[]`, and the `Operands` tuple). 4 rows, each failing the empty / empty-tuple /
 *              maybe-empty (and, for the sum, one-operand) groups of its cell, and NOT the `_missing` group
 *              of the same field, which guards something else.
 *
 * WHAT THIS DOES NOT PROVE: that these are all the declarations a reader might want pinned (the base fields
 * `field` and `tested`, the `kind` discriminants and the `Support`/`OpenEnd` shapes have no proof here), or
 * anything the types cannot say at all (see the honest limits).
 */
interface Row {
  readonly id: string;
  readonly file: string;
  readonly apply: (source: string) => string;
  readonly groups: readonly string[];
}

const MISSING: readonly Row[] = [
  ["Entailed", "established", "entailed"],
  ["Entailed", "support", "entailed"],
  ["Weakened", "established", "weakened"],
  ["Weakened", "support", "weakened"],
  ["Weakened", "unmet", "weakened"],
  ["Weakened", "openEnds", "weakened"],
  ["Contradicted", "established", "contradicted"],
  ["Contradicted", "support", "contradicted"],
  ["Ungrounded", "openEnds", "ungrounded"],
  ["Conflicted", "core", "conflicted"],
].map(([iface, field, variant]) => ({
  id: `${iface}.${field} made optional`,
  file: "entailment.ts",
  apply: makeOptional(iface as string, field as string),
  groups: [`${variant}_${field}_missing`],
}));

const SCHEMA_MISSING: readonly Row[] = [
  { id: "BaseField.baseline made optional", file: "schema.ts", apply: makeOptional("BaseField", "baseline"), groups: ["base_baseline_missing"] },
  { id: "DerivedField.sum made optional", file: "schema.ts", apply: makeOptional("DerivedField", "sum"), groups: ["derived_sum_missing"] },
];

const EMPTY: readonly Row[] = [
  {
    id: "Weakened.unmet allowed to be empty",
    file: "entailment.ts",
    apply: retype("Weakened", "unmet", "NonEmptyReadonlyArray<Side>", "readonly Side[]"),
    groups: ["weakened_unmet_empty", "weakened_unmet_emptytuple", "weakened_unmet_maybeempty"],
  },
  {
    id: "Ungrounded.openEnds allowed to be empty",
    file: "entailment.ts",
    apply: retype("Ungrounded", "openEnds", "NonEmptyReadonlyArray<OpenEnd>", "readonly OpenEnd[]"),
    groups: ["ungrounded_openEnds_empty", "ungrounded_openEnds_emptytuple", "ungrounded_openEnds_maybeempty"],
  },
  {
    id: "Conflicted.core allowed to be empty",
    file: "entailment.ts",
    apply: retype("Conflicted", "core", "NonEmptyReadonlyArray<ObsId>", "readonly ObsId[]"),
    groups: ["conflicted_core_empty", "conflicted_core_emptytuple", "conflicted_core_maybeempty"],
  },
  {
    id: "Operands allowed to have fewer than two",
    file: "schema.ts",
    apply: loosenOperands,
    groups: ["derived_sum_empty", "derived_sum_emptytuple", "derived_sum_short", "derived_sum_maybeempty"],
  },
];

const ROWS: readonly Row[] = [...MISSING, ...SCHEMA_MISSING, ...EMPTY];
const MUTATIONS: readonly Mutation[] = ROWS.map((r) => ({
  id: r.id,
  file: r.file,
  apply: r.apply,
  groups: r.groups,
  // `integrity.ts` ties its table to the `Entailment` variants only, so a change to a `FieldDecl` must not move it.
  integrityTable: r.file === "entailment.ts",
}));

const results: { id: string; outcome: SabotageOutcome }[] = [];
afterAll(() => {
  // Printed only on request: `BTC_REPORT=1 npm test -- required-sabotage`. Where vitest 5 detects an AI agent (for
  // example `AI_AGENT` or `CLAUDECODE` set) it defaults to its `minimal` reporter, which shows no console output;
  // add `--reporter=verbose` there.
  if (process.env["BTC_REPORT"] === "1") {
    console.log(formatMatrix("required: rows = the declaration loosened, columns = proof group, cell = routes (of 7) that went red", results, ROWS.flatMap((r) => r.groups)));
  }
});

describe("what each variant requires, loosened one declaration at a time in a copy of lib/contracts", () => {
  it("covers 16 declarations and 25 groups, and every group exists in the proof files", () => {
    expect(ROWS).toHaveLength(16);
    const named = ROWS.flatMap((r) => r.groups);
    expect(new Set(named).size).toBe(named.length);
    expect(named).toHaveLength(12 + 3 * 3 + 4);
    const groups = allGroups();
    for (const g of named) expect(groups, g).toContain(g);
    // Every `required` group in the proof file is covered by some row (none is an orphan nobody sabotages).
    expect(groups.filter((g) => /_(missing|empty|emptytuple|maybeempty|short)$/.test(g)).sort()).toEqual([...named].sort());
  });

  for (const mutation of MUTATIONS) {
    it(`${mutation.id}: exactly its own proofs go red and no other`, { timeout: 120_000 }, () => {
      const outcome = runSabotage(mutation);
      results.push({ id: mutation.id, outcome });
      expect(outcomeProblems(mutation, outcome)).toEqual([]);
    });
  }
});
