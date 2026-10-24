import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isExportDeclaration, isNamedExports } from "typescript/unstable/ast";
import * as contracts from "../index.js";
import { parseFile, withProject } from "./support/ast.js";

/**
 * THE PUBLIC SURFACE OF `lib/contracts/index.ts`: exactly the names `.genesis/PLAN.md` section 4.1 and the
 * ownership table of section 5 give M1, and nothing else. The lists below are the PLAN's, written out here; a
 * name added to or dropped from the barrel must be a deliberate edit of this test.
 *
 * Two readings of the same fact, so neither can drift alone:
 *  - the RUN-TIME export object (`Object.keys` of the module), which sees values only;
 *  - the TypeScript PARSER over `index.ts`, which sees every re-exported name, types included, and refuses an
 *    `export *` (which would make the list unreadable).
 * The type names are also imported by `proofs/public-surface.proofs.ts`, which would stop compiling if one
 * went missing, and which shows three internal names are not importable.
 */
const PLAN_VALUES = [
  "MAX_MAGNITUDE",
  "MAX_FIELDS",
  "MAX_OPERANDS",
  "MAX_OBSERVATIONS",
  "MAX_DRAFT_CLAIMS",
  "MAX_ID_LENGTH",
  "MAX_LABEL_LENGTH",
  "MAX_UNIT_LENGTH",
  "MAX_SOURCE_LENGTH",
  "MAX_QUOTE_LENGTH",
  "fieldId",
  "obsId",
  "compareIds",
  "isNonEmptyArray",
  "assertNeverEntailment",
  "assertEntailmentWellFormed",
] as const;

const PLAN_TYPES = [
  "FieldId",
  "ObsId",
  "Bound",
  "Extent",
  "Side",
  "NonEmptyReadonlyArray",
  "Operands",
  "BaseField",
  "DerivedField",
  "FieldDecl",
  "Schema",
  "Observation",
  "Claim",
  "Support",
  "OpenEnd",
  "Entailed",
  "Weakened",
  "Contradicted",
  "Ungrounded",
  "Conflicted",
  "Entailment",
  "SchemaFault",
  "ObservationFault",
  "ClaimFault",
  "RejectedObservation",
  "ClaimRejection",
  "Brief",
  "EntailmentIntegrityError",
  "EntailmentIntegrity",
] as const;

describe("the barrel's run-time names", () => {
  it("are exactly the 16 the plan gives M1: ten constants, three mint/order functions, isNonEmptyArray and the two guards", () => {
    expect(Object.keys(contracts).sort()).toEqual([...PLAN_VALUES].sort());
    expect(PLAN_VALUES).toHaveLength(16);
  });

  it("do not leak an internal helper or a compile-time assertion", () => {
    for (const internal of ["describe", "Brand", "EntailmentBase", "EntailmentTableMatchesTypes", "isKind", "isPresent"]) {
      expect(internal in contracts, internal).toBe(false);
    }
  });

  it("the ten constants are numbers and the six functions are functions", () => {
    for (const name of PLAN_VALUES) {
      expect(typeof contracts[name], name).toBe(name.startsWith("MAX_") ? "number" : "function");
    }
  });
});

describe("the barrel's names as the TypeScript parser reads them from index.ts", () => {
  const exported = withProject(join(import.meta.dirname, "..", "..", "..", "tsconfig.lib.json"), (project) => {
    const sf = parseFile(project, join(import.meta.dirname, "..", "index.ts"));
    if (sf === undefined) throw new Error("index.ts did not parse");
    const values: string[] = [];
    const types: string[] = [];
    const stars: string[] = [];
    const sources = new Set<string>();
    sf.forEachChild((node) => {
      if (!isExportDeclaration(node)) return;
      const specifier = node.moduleSpecifier === undefined ? "" : (node.moduleSpecifier as unknown as { text: string }).text;
      sources.add(specifier);
      if (node.exportClause === undefined || !isNamedExports(node.exportClause)) {
        stars.push(specifier);
        return;
      }
      for (const element of node.exportClause.elements) {
        (node.isTypeOnly || element.isTypeOnly ? types : values).push(element.name.text);
      }
    });
    return { values, types, stars, sources };
  });

  it("re-export no `export *`: every name is written out", () => {
    expect(exported.stars).toEqual([]);
  });

  it("export exactly the plan's 16 value names", () => {
    expect([...exported.values].sort()).toEqual([...PLAN_VALUES].sort());
  });

  it("export exactly the plan's 29 type names", () => {
    expect([...exported.types].sort()).toEqual([...PLAN_TYPES].sort());
    expect(PLAN_TYPES).toHaveLength(29);
  });

  it("re-export only from this directory's own modules, with the NodeNext `.js` suffix", () => {
    expect([...exported.sources].every((s) => /^\.\/[a-z-]+\.js$/.test(s))).toBe(true);
    expect([...exported.sources].sort()).toEqual(
      ["./bounds.js", "./brief.js", "./claim.js", "./entailment.js", "./faults.js", "./ids.js", "./integrity.js", "./limits.js", "./non-empty-array.js", "./observation.js", "./schema.js"].sort(),
    );
  });
});
