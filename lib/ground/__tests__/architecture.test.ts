import { cpSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isBinaryExpression,
  isExportDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedExports,
  isNamedImports,
  isPropertyAccessExpression,
  isTypeAliasDeclaration,
  SyntaxKind,
} from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";
import type { Extent, FieldDecl, FieldId, NonEmptyReadonlyArray, Observation, ObsId, OpenEnd, RejectedObservation, Schema, SchemaFault, Side, Support } from "../../contracts/index.js";
import { parseFile, withProject } from "../../contracts/__tests__/support/ast.js";
import type { Assert, Equal } from "../../contracts/__tests__/support/type-equal.js";
import { scanDeterminism, summariseDeterminism } from "../../contracts/__tests__/support/determinism.js";
import { TREE_TSCONFIG, tree, useTrees } from "../../contracts/__tests__/support/fixtures.js";
import { referencesIn, scanInventory, scanModuleGraph, summarise } from "../../contracts/__tests__/support/module-graph.js";
import * as ground from "../index.js";
import type { ExtentFailure, ExtentRead, FieldExtent, GroundFailure, GroundResult, Grounding, SchemaRead, SupportRead, Tree, TreeState } from "../index.js";
import { rootOf } from "../decl.js";
import { solve, structureOf, treesOf } from "../solve.js";
import { base, derived, obs, ORDER_DESK } from "./fixtures.js";

/**
 * WHAT `lib/ground` IS ALLOWED TO BE (`.genesis/PLAN.md` section 5: `lib/ground` imports `contracts` and `extent`; section
 * 6, M4: "reads each untrusted input exactly once into plain data", "the walk is bounded by the field count"). Eight
 * kinds of test:
 *  1. The file inventory: `lib/ground` holds the files the plan's M4 lists, and one more, `plain.ts` (see ADR 0004).
 *  2. The public surface: the six functions and the ten types of the plan's block, read at run time and by the parser;
 *     `solve` and `shrink`, which the plan calls internal, are not on it.
 *  3. The import closure of the SOURCES, stricter than M1's layer table: only `../contracts/index.js`, only
 *     `../extent/index.js` (never a file inside either) and this directory's own sources, and only the values named
 *     below. Each allowed value is used by some source, so no allowance is speculative.
 *  4. No module-level state: a source holds only imports, re-exports, function declarations and types. There is no hidden
 *     state for `supportOf` and `openEndsOf` to keep, and the plan says there is none.
 *  5. M4 composes M3's algebra and does not re-implement it: no source applies a relational or an additive operator
 *     directly to a property called `lo` or `hi`. That is what a hand-rolled `meet`, `isSubset` or `sumForward` would
 *     do. It does not see an extent compared through a local variable.
 *  6. The types are the plan's: the ten declarations of section 4.1's `lib/ground` block are copied below, the copy is
 *     compared with the plan's text, and the engine's types and function signatures are proved identical to it at
 *     compile time (`npm run typecheck`; a mismatch is a compile error, not a failed test).
 *  7. M1's closed-module-graph scan, determinism guard and file inventory see these files, so their silence is not an empty scan.
 *  8. The walks and the pass count are bounded, on structures `readSchema` refuses.
 * Synthetic trees live under the OS temp directory.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");
const GROUND_DIR = join(REPO_ROOT, "lib", "ground");

const SOURCES = ["decl.ts", "ground.ts", "index.ts", "open-ends.ts", "plain.ts", "read-observation.ts", "read-schema.ts", "shrink.ts", "solve.ts", "support.ts"];
const TESTS = [
  "architecture.test.ts",
  "core.test.ts",
  "fixtures.ts",
  "hostile-input.test.ts",
  "immutability.test.ts",
  "integer-only.test.ts",
  "locality.test.ts",
  "monotonicity.test.ts",
  "observation-faults.test.ts",
  "open-ends.test.ts",
  "oracle-exactness.test.ts",
  "oracle.ts",
  "order-independence.test.ts",
  "schema-faults.test.ts",
  "single-observation.test.ts",
  "support-certificate.test.ts",
];
const FUNCTIONS = ["declOf", "extentOf", "ground", "openEndsOf", "readSchema", "supportOf"];
const TYPES = ["ExtentFailure", "ExtentRead", "FieldExtent", "GroundFailure", "GroundResult", "Grounding", "SchemaRead", "SupportRead", "Tree", "TreeState"];

describe("the file inventory: the plan's M4 list, and plain.ts", () => {
  it("ten sources, and in __tests__ the fourteen test files the plan names plus fixtures.ts and oracle.ts", () => {
    expect(readdirSync(GROUND_DIR).sort()).toEqual(["__tests__", ...SOURCES].sort());
    expect(readdirSync(join(GROUND_DIR, "__tests__")).sort()).toEqual([...TESTS].sort());
    expect(TESTS.filter((name) => name.endsWith(".test.ts"))).toHaveLength(14);
  });

  it("the plan's list is what this test says it is (nine sources and the fourteen tests, read from the plan)", () => {
    const plan = readFileSync(join(REPO_ROOT, ".genesis", "PLAN.md"), "utf8");
    const line = /\*\*Owns:\*\* `lib\/ground\/\*\*` — ([^\n]+)/.exec(plan)?.[1] ?? "";
    for (const name of ["read-schema.ts", "read-observation.ts", "solve.ts", "shrink.ts", "support.ts", "open-ends.ts", "decl.ts", "ground.ts", "index.ts"]) expect(line, name).toContain(name);
    for (const name of TESTS.filter((n) => n.endsWith(".test.ts"))) expect(line, name).toContain(name.replace(".test.ts", ""));
    expect(line).toContain("fixtures.ts");
    expect(line).toContain("oracle.ts");
    expect(line).not.toContain("plain");
  });
});

describe("the public surface of index.ts: the six functions and the plan's ten types", () => {
  it("run time: exactly the six functions (solve, shrink and the helpers stay internal)", () => {
    expect(Object.keys(ground).sort()).toEqual([...FUNCTIONS].sort());
    for (const name of FUNCTIONS) expect(typeof (ground as Record<string, unknown>)[name], name).toBe("function");
  });

  it("as the parser reads it: those six values, those ten types, no `export *`, only this directory's modules", () => {
    const exported = withProject(REPO_TSCONFIG, (project) => {
      const sf = parseFile(project, join(GROUND_DIR, "index.ts"));
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
        for (const element of node.exportClause.elements) (node.isTypeOnly || element.isTypeOnly ? types : values).push(element.name.text);
      });
      return { values, types, stars, sources };
    });
    expect(exported.stars).toEqual([]);
    expect([...exported.values].sort()).toEqual([...FUNCTIONS].sort());
    expect([...exported.types].sort()).toEqual([...TYPES].sort());
    expect([...exported.sources].sort()).toEqual(["./decl.js", "./ground.js", "./open-ends.js", "./read-schema.js", "./support.js"]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The import closure, the no-module-state rule and "does not re-implement the algebra", as a scan that can be
// pointed at a synthetic tree.
// ---------------------------------------------------------------------------------------------------------

type Rule = "import-not-allowed" | "contracts-value-import" | "extent-value-import" | "top-level-statement" | "extent-operator" | "unparseable";
interface Finding {
  readonly file: string;
  readonly rule: Rule;
}

const ALLOWED_CONTRACT_VALUES: ReadonlySet<string> = new Set([
  "MAX_FIELDS",
  "MAX_ID_LENGTH",
  "MAX_LABEL_LENGTH",
  "MAX_MAGNITUDE",
  "MAX_OBSERVATIONS",
  "MAX_OPERANDS",
  "MAX_QUOTE_LENGTH",
  "MAX_SOURCE_LENGTH",
  "MAX_UNIT_LENGTH",
  "compareIds",
  "fieldId",
  "isNonEmptyArray",
  "obsId",
]);
const ALLOWED_EXTENT_VALUES: ReadonlySet<string> = new Set(["checkExtent", "isSameExtent", "isSubset", "meet", "sumBackward", "sumForward"]);
/** Operators that compare or add: applied to `.lo` or `.hi` they would be the extent algebra written again. */
const ALGEBRA_OPERATORS = new Set([SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken, SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken, SyntaxKind.PlusToken, SyntaxKind.MinusToken]);

function isBoundAccess(node: Node): boolean {
  return isPropertyAccessExpression(node) && (node.name.text === "lo" || node.name.text === "hi");
}

/** Scan the non-test sources directly inside `<root>/lib/ground`. */
function scanSources(rootDir: string, tsconfig: string): { findings: Finding[]; scanned: string[]; contractValues: Set<string>; extentValues: Set<string> } {
  const root = realpathSync(rootDir);
  const dir = join(root, "lib", "ground");
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();
  const siblings = new Set(names);
  const findings: Finding[] = [];
  const scanned: string[] = [];
  const contractValues = new Set<string>();
  const extentValues = new Set<string>();
  withProject(tsconfig, (project) => {
    for (const name of names) {
      const sf = parseFile(project, join(dir, name));
      if (sf === undefined) {
        findings.push({ file: name, rule: "unparseable" });
        continue;
      }
      scanned.push(name);
      const report = (rule: Rule): void => {
        findings.push({ file: name, rule });
      };

      for (const ref of referencesIn(sf)) {
        const sibling = ref.specifier !== null ? /^\.\/([a-z-]+)\.js$/.exec(ref.specifier) : null;
        const isSibling = sibling !== null && siblings.has(`${sibling[1]}.ts`);
        if (!isSibling && ref.specifier !== "../contracts/index.js" && ref.specifier !== "../extent/index.js") report("import-not-allowed");
      }

      for (const node of sf.statements) {
        if (isImportDeclaration(node)) {
          const specifier = (node.moduleSpecifier as unknown as { text: string }).text;
          const clause = node.importClause;
          const layer = specifier === "../contracts/index.js" ? "contracts" : specifier === "../extent/index.js" ? "extent" : undefined;
          if (layer !== undefined && clause !== undefined && clause.phaseModifier !== SyntaxKind.TypeKeyword) {
            const bindings = clause.namedBindings;
            const valueNames: string[] = [];
            if (clause.name !== undefined) valueNames.push("default");
            if (bindings !== undefined && !isNamedImports(bindings)) valueNames.push("*");
            if (bindings !== undefined && isNamedImports(bindings)) {
              for (const element of bindings.elements) if (!element.isTypeOnly) valueNames.push((element.propertyName ?? element.name).text);
            }
            const allowed = layer === "contracts" ? ALLOWED_CONTRACT_VALUES : ALLOWED_EXTENT_VALUES;
            const used = layer === "contracts" ? contractValues : extentValues;
            for (const value of valueNames) used.add(value);
            if (valueNames.some((n) => !allowed.has(n))) report(layer === "contracts" ? "contracts-value-import" : "extent-value-import");
          }
        } else if (!(isExportDeclaration(node) || isFunctionDeclaration(node) || isTypeAliasDeclaration(node) || isInterfaceDeclaration(node))) {
          report("top-level-statement");
        }
      }

      const visit = (node: Node): void => {
        if (isBinaryExpression(node) && ALGEBRA_OPERATORS.has(node.operatorToken.kind) && (isBoundAccess(node.left) || isBoundAccess(node.right))) report("extent-operator");
        node.forEachChild(visit);
      };
      visit(sf);
    }
  });
  return { findings, scanned, contractValues, extentValues };
}

const summariseFindings = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.file}:${f.rule}`).sort();

describe("the import closure, the no-module-state rule and the no-new-algebra rule hold on the real sources", () => {
  const result = scanSources(REPO_ROOT, REPO_TSCONFIG);

  it("really scanned the ten sources (an empty scan passing proves nothing)", () => {
    expect(result.scanned).toEqual(SOURCES);
  });

  it("has no finding", () => {
    expect(summariseFindings(result.findings)).toEqual([]);
  });

  it("every allowed value is imported by some source, so no allowance is speculative", () => {
    expect([...result.contractValues].sort()).toEqual([...ALLOWED_CONTRACT_VALUES].sort());
    expect([...result.extentValues].sort()).toEqual([...ALLOWED_EXTENT_VALUES].sort());
  });

  it("the real sources import from each layer only through its index.js", () => {
    const text = SOURCES.map((name) => readFileSync(join(GROUND_DIR, name), "utf8")).join("\n");
    const layerImports = [...text.matchAll(/from "(\.\.\/[^"]+)"/g)].map((m) => m[1]);
    expect(layerImports.length).toBeGreaterThan(0);
    expect(new Set(layerImports)).toEqual(new Set(["../contracts/index.js", "../extent/index.js"]));
  });
});

describe("a synthetic tree with one violation per file: each is reported, and the valid files beside them are not", () => {
  const files: Record<string, string> = {
    // ---- valid: the scan has something to wrongly flag ----
    "lib/contracts/index.ts": "export const MAX_FIELDS = 1;\n",
    "lib/extent/index.ts": "export const meet = 1;\n",
    "lib/ground/ok-a.ts": 'import type { Extent } from "../contracts/index.js";\nimport { MAX_FIELDS, compareIds } from "../contracts/index.js";\nimport { meet } from "../extent/index.js";\nimport { b } from "./ok-b.js";\nexport function a(e: Extent | null): number {\n  return MAX_FIELDS + b(e) + (compareIds("a", "b") + (meet === undefined ? 0 : 1));\n}\n',
    "lib/ground/ok-b.ts": "export function b(e: unknown): number {\n  return e === null ? 0 : 1;\n}\nexport type Alias = number;\nexport interface Shape {\n  readonly n: number;\n}\n",
    "lib/ground/ok-inline-type.ts": 'import { type Extent, MAX_FIELDS } from "../contracts/index.js";\nexport function c(e: Extent): number {\n  return MAX_FIELDS + (e.lo === null ? 0 : 1) + (e.hi === e.lo ? 1 : 0);\n}\n',
    "lib/ground/ok-reexport.ts": 'export { b } from "./ok-b.js";\nexport type { Alias } from "./ok-b.js";\n',
    "lib/ground/ok-copy.ts": "export function copy(e: { readonly lo: number | null; readonly hi: number | null }): { lo: number | null; hi: number | null } {\n  return { lo: e.lo, hi: e.hi };\n}\n",
    "lib/ground/__tests__/helper.ts": 'import "node:fs";\nexport const helper = 1;\n',
    "lib/ground/thing.test.ts": 'import "node:fs";\nexport const t = 1;\n',
    // ---- one violation each ----
    "lib/ground/bad-external.ts": 'import "node:fs";\n',
    "lib/ground/bad-package.ts": 'import "react";\n',
    "lib/ground/bad-other-layer.ts": 'import { g } from "../entail/index.js";\nexport function f(): unknown {\n  return g;\n}\n',
    "lib/ground/bad-deep-contracts.ts": 'import type { Brief } from "../contracts/brief.js";\nexport type T = Brief;\n',
    "lib/ground/bad-deep-extent.ts": 'import type { ExtentCheck } from "../extent/check-extent.js";\nexport type T2 = ExtentCheck;\n',
    "lib/ground/bad-test-import.ts": 'import "./__tests__/helper.js";\n',
    "lib/ground/bad-export-from.ts": 'export { x } from "../entail/index.js";\n',
    "lib/ground/bad-dynamic.ts": 'export function f(): Promise<unknown> {\n  return import("node:os");\n}\n',
    "lib/ground/bad-contracts-value.ts": 'import { MAX_DRAFT_CLAIMS } from "../contracts/index.js";\nexport function f(): number {\n  return MAX_DRAFT_CLAIMS;\n}\n',
    "lib/ground/bad-contracts-renamed.ts": 'import { MAX_DRAFT_CLAIMS as M } from "../contracts/index.js";\nexport function f(): number {\n  return M;\n}\n',
    "lib/ground/bad-contracts-namespace.ts": 'import * as c from "../contracts/index.js";\nexport function f(): unknown {\n  return c;\n}\n',
    "lib/ground/bad-extent-value.ts": 'import { unmetSides } from "../extent/index.js";\nexport function f(): unknown {\n  return unmetSides;\n}\n',
    "lib/ground/bad-extent-namespace.ts": 'import * as e from "../extent/index.js";\nexport function f(): unknown {\n  return e;\n}\n',
    "lib/ground/bad-let.ts": "let n = 0;\nexport function f(): number {\n  n += 1;\n  return n;\n}\n",
    "lib/ground/bad-const.ts": "const SHARED = { lo: null, hi: null };\nexport function f(): unknown {\n  return SHARED;\n}\n",
    "lib/ground/bad-exported-const.ts": "export const NONE = [];\n",
    "lib/ground/bad-call.ts": 'console.log("loaded");\n',
    "lib/ground/bad-class.ts": "export class Box {\n  value = 0;\n}\n",
    "lib/ground/bad-syntax.ts": "export function = ;\n",
    "lib/ground/bad-less-than.ts": "export function f(a: { lo: number }, b: number): boolean {\n  return a.lo < b;\n}\n",
    "lib/ground/bad-greater-equal.ts": "export function f(a: { hi: number }, b: { hi: number }): boolean {\n  return a.hi >= b.hi;\n}\n",
    "lib/ground/bad-plus.ts": "export function f(a: { lo: number }, b: { lo: number }): number {\n  return a.lo + b.lo;\n}\n",
    "lib/ground/bad-minus.ts": "export function f(a: { hi: number }, b: number): number {\n  return b - a.hi;\n}\n",
  };
  const root = tree(files);
  const result = scanSources(root, join(root, "tsconfig.json"));

  it("reports exactly these file:rule pairs", () => {
    expect(summariseFindings(result.findings)).toEqual(
      [
        "bad-external.ts:import-not-allowed",
        "bad-package.ts:import-not-allowed",
        "bad-other-layer.ts:import-not-allowed",
        "bad-deep-contracts.ts:import-not-allowed",
        "bad-deep-extent.ts:import-not-allowed",
        "bad-test-import.ts:import-not-allowed",
        "bad-export-from.ts:import-not-allowed",
        "bad-dynamic.ts:import-not-allowed",
        "bad-contracts-value.ts:contracts-value-import",
        "bad-contracts-renamed.ts:contracts-value-import",
        "bad-contracts-namespace.ts:contracts-value-import",
        "bad-extent-value.ts:extent-value-import",
        "bad-extent-namespace.ts:extent-value-import",
        "bad-let.ts:top-level-statement",
        "bad-const.ts:top-level-statement",
        "bad-exported-const.ts:top-level-statement",
        "bad-call.ts:top-level-statement",
        "bad-class.ts:top-level-statement",
        "bad-syntax.ts:unparseable",
        "bad-less-than.ts:extent-operator",
        "bad-greater-equal.ts:extent-operator",
        "bad-plus.ts:extent-operator",
        "bad-minus.ts:extent-operator",
      ].sort(),
    );
  });

  it("does not flag the valid files (including an equality test on lo and hi and a copy of both), a test file, or the helper under __tests__", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    for (const clean of ["ok-a.ts", "ok-b.ts", "ok-inline-type.ts", "ok-reexport.ts", "ok-copy.ts", "thing.test.ts", "helper.ts"]) expect(flagged.has(clean), clean).toBe(false);
    expect(result.scanned).toContain("ok-a.ts");
    expect(result.scanned).not.toContain("thing.test.ts");
  });
});

describe("the real lib/ copied and sabotaged: the rules fire on the real sources and name the file", () => {
  function sabotaged(file: string, extra: string): string {
    const root = tree({});
    cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), TREE_TSCONFIG);
    const target = join(root, "lib", "ground", file);
    writeFileSync(target, `${extra}\n${readFileSync(target, "utf8")}`);
    return root;
  }
  const scan = (root: string): string[] => summariseFindings(scanSources(root, join(root, "tsconfig.json")).findings);

  it("CONTROL: an unmodified copy is clean", () => {
    expect(scan(sabotaged("solve.ts", ""))).toEqual([]);
  });

  it("an import of a Node built-in into shrink.ts", () => {
    expect(scan(sabotaged("shrink.ts", 'import "node:fs";'))).toEqual(["shrink.ts:import-not-allowed"]);
  });

  it("a module-level cache in support.ts, the hidden state the plan says there is none of", () => {
    expect(scan(sabotaged("support.ts", "const cache = new Map();"))).toEqual(["support.ts:top-level-statement"]);
  });

  it("an import of another milestone's value in ground.ts", () => {
    expect(scan(sabotaged("ground.ts", 'import { MAX_DRAFT_CLAIMS } from "../contracts/index.js";'))).toEqual(["ground.ts:contracts-value-import"]);
  });

  it("an import of an extent function M4 does not use, in open-ends.ts", () => {
    expect(scan(sabotaged("open-ends.ts", 'import { unmetSides } from "../extent/index.js";'))).toEqual(["open-ends.ts:extent-value-import"]);
  });

  it("a hand-rolled comparison of extent bounds in solve.ts", () => {
    expect(scan(sabotaged("solve.ts", "export function tighter(a: { lo: number }, b: { lo: number }): boolean {\n  return a.lo > b.lo;\n}"))).toEqual(["solve.ts:extent-operator"]);
  });
});

describe("behaviour that follows: no state is shared between calls", () => {
  it("the same call twice gives equal but distinct objects, in any order of calls, and nothing carries over", () => {
    const list = [obs("a1", "packDays", 1, 2), obs("a2", "transitDays", 3, 5)];
    const first = ground.ground(ORDER_DESK, list);
    ground.ground(ORDER_DESK, [obs("zz", "customsDays", 0, 1)]); // a call in between about other evidence
    const second = ground.ground(ORDER_DESK, list);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
    if (first.ok && second.ok) expect(second.grounding.trees[0]).not.toBe(first.grounding.trees[0]);
  });
});

describe("M1's scans see these files, so their silence is not an empty scan", () => {
  it("the closed-module-graph scan parsed every ground source and test, and reports nothing under lib/ground", () => {
    const result = scanModuleGraph({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/ground/${name}`);
    for (const name of TESTS) expect(result.scanned, name).toContain(`lib/ground/__tests__/${name}`);
    expect(summarise(result.violations.filter((v) => v.file.startsWith("lib/ground/")))).toEqual([]);
  });

  it("the determinism guard parsed the ten ground sources and reports nothing under lib/ground (so no Date, no Math.random, no localeCompare)", () => {
    const result = scanDeterminism({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/ground/${name}`);
    expect(result.scanned.some((file) => file.startsWith("lib/ground/__tests__/"))).toBe(false);
    expect(summariseDeterminism(result.violations.filter((v) => v.file.startsWith("lib/ground/")))).toEqual([]);
  });

  it("the file inventory (no non-.ts file, no symlink) reports nothing under lib/ground", () => {
    expect(summarise(scanInventory(REPO_ROOT).filter((v) => v.file.startsWith("lib/ground/")))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The types are the plan's.
// ---------------------------------------------------------------------------------------------------------

// BEGIN PLAN COPY (section 4.1, the lib/ground block; every name that block defines is prefixed Plan)
export interface PlanFieldExtent { readonly field: FieldId; readonly extent: Extent }
export type PlanTreeState =
  | { readonly kind: "consistent"; readonly extents: NonEmptyReadonlyArray<PlanFieldExtent> }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };
export interface PlanTree { readonly root: FieldId; readonly fields: NonEmptyReadonlyArray<FieldId>; readonly state: PlanTreeState }
export interface PlanGrounding {                                       // plain data, deep-frozen; no closure, no Map
  readonly schema: Schema;                                         // the validated copy
  readonly observations: readonly Observation[];                   // the ACCEPTED ones, sorted by id
  readonly baseline: NonEmptyReadonlyArray<PlanFieldExtent>;           // B(f) for every field: the schema alone, no observation
  readonly trees: NonEmptyReadonlyArray<PlanTree>;                     // the connected components of the sum rules
}
export type PlanGroundFailure =
  | { readonly kind: "invalid-schema"; readonly fault: SchemaFault }
  | { readonly kind: "too-many-observations"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };
export type PlanGroundResult =
  | { readonly ok: true; readonly grounding: PlanGrounding; readonly rejected: readonly RejectedObservation[] }
  | { readonly ok: false; readonly failure: PlanGroundFailure };
export type PlanSchemaRead = { readonly ok: true; readonly schema: Schema } | { readonly ok: false; readonly fault: SchemaFault };
export type PlanExtentFailure =
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };
export type PlanExtentRead = { readonly ok: true; readonly extent: Extent; readonly baseline: Extent } | { readonly ok: false; readonly failure: PlanExtentFailure };
export type PlanSupportRead = { readonly ok: true; readonly support: Support } | { readonly ok: false; readonly failure: PlanExtentFailure };
// END PLAN COPY

type _FieldExtent = Assert<Equal<FieldExtent, PlanFieldExtent>>;
type _TreeState = Assert<Equal<TreeState, PlanTreeState>>;
type _Tree = Assert<Equal<Tree, PlanTree>>;
type _Grounding = Assert<Equal<Grounding, PlanGrounding>>;
type _GroundFailure = Assert<Equal<GroundFailure, PlanGroundFailure>>;
type _GroundResult = Assert<Equal<GroundResult, PlanGroundResult>>;
type _SchemaRead = Assert<Equal<SchemaRead, PlanSchemaRead>>;
type _ExtentFailure = Assert<Equal<ExtentFailure, PlanExtentFailure>>;
type _ExtentRead = Assert<Equal<ExtentRead, PlanExtentRead>>;
type _SupportRead = Assert<Equal<SupportRead, PlanSupportRead>>;
// the six function signatures, as the plan declares them (the plan's lines are checked verbatim below)
type _ReadSchema = Assert<Equal<typeof ground.readSchema, (raw: unknown) => PlanSchemaRead>>;
type _Ground = Assert<Equal<typeof ground.ground, (rawSchema: unknown, rawObservations: unknown) => PlanGroundResult>>;
type _ExtentOf = Assert<Equal<typeof ground.extentOf, (g: PlanGrounding, field: FieldId) => PlanExtentRead>>;
type _SupportOf = Assert<Equal<typeof ground.supportOf, (g: PlanGrounding, field: FieldId) => PlanSupportRead>>;
type _OpenEndsOf = Assert<Equal<typeof ground.openEndsOf, (g: PlanGrounding, field: FieldId, sides: readonly Side[]) => readonly OpenEnd[]>>;
type _DeclOf = Assert<Equal<typeof ground.declOf, (schema: Schema, field: FieldId) => FieldDecl | undefined>>;
export type Proofs = [_FieldExtent, _TreeState, _Tree, _Grounding, _GroundFailure, _GroundResult, _SchemaRead, _ExtentFailure, _ExtentRead, _SupportRead, _ReadSchema, _Ground, _ExtentOf, _SupportOf, _OpenEndsOf, _DeclOf];
export type Unused = [Extent, NonEmptyReadonlyArray<string>, Observation, ObsId, RejectedObservation, SchemaFault, Support];

describe("the types are the plan's", () => {
  const plan = readFileSync(join(REPO_ROOT, ".genesis", "PLAN.md"), "utf8");
  const start = plan.indexOf("// FILE: lib/ground/index.ts   (M4)");
  const planBlock = plan.slice(start, plan.indexOf("```", start));
  const normalise = (text: string): string => text.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
  /** name -> normalised declaration, for every exported interface and type in `text` (functions are checked as lines). */
  function declarations(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const starts = [...text.matchAll(/^export (?:interface|type|declare function) (\w+)/gm)];
    starts.forEach((match, i) => {
      if (match[0].startsWith("export declare function")) return;
      const end = i + 1 < starts.length ? (starts[i + 1] as RegExpMatchArray).index : text.length;
      out.set(match[1] as string, normalise(text.slice(match.index, end)));
    });
    return out;
  }

  it("the plan block was found, and declares the ten types and six functions this test lists", () => {
    expect(start).toBeGreaterThan(0);
    expect([...declarations(planBlock).keys()].sort()).toEqual([...TYPES].sort());
    for (const line of [
      "export declare function readSchema(raw: unknown): SchemaRead;",
      "export declare function ground(rawSchema: unknown, rawObservations: unknown): GroundResult;",
      "export declare function extentOf(g: Grounding, field: FieldId): ExtentRead;",
      "export declare function supportOf(g: Grounding, field: FieldId): SupportRead;",
      "export declare function openEndsOf(g: Grounding, field: FieldId, sides: readonly Side[]): readonly OpenEnd[];",
      "export declare function declOf(schema: Schema, field: FieldId): FieldDecl | undefined;",
    ]) expect(planBlock, line).toContain(line);
  });

  it("the copy in this file is the plan's text: each declaration equals the plan's, ignoring comments, spacing and the Plan prefix", () => {
    const self = readFileSync(import.meta.filename, "utf8");
    const copy = self.slice(self.indexOf("// BEGIN PLAN COPY"), self.indexOf("// END PLAN COPY")).split("\n").slice(1).join("\n");
    const mine = new Map([...declarations(copy)].map(([name, text]) => [name.replace(/^Plan/, ""), text.replace(/\bPlan(?=[A-Z])/g, "")] as const));
    const theirs = declarations(planBlock);
    expect([...mine.keys()].sort()).toEqual([...theirs.keys()].sort());
    for (const [name, text] of theirs) expect(mine.get(name), name).toBe(text);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The walks and the pass count are bounded.
// ---------------------------------------------------------------------------------------------------------

describe("the walk is bounded by the field count, and so is the number of passes", () => {
  it("rootOf finds the root of a chain of any length up to the field count, and gives up on a cycle instead of looping", () => {
    const chain = new Map<string, string>(Array.from({ length: 63 }, (_, i) => [`f${i}`, `f${i + 1}`] as const)); // f0 -> f1 -> .. -> f63
    expect(rootOf(chain, "f0", 64)).toBe("f63");
    expect(rootOf(chain, "f63", 64)).toBe("f63");
    // one field short of the limit: the same chain is taken for a cycle, which is what the bound means
    expect(rootOf(chain, "f0", 63)).toBeUndefined();
    const self = new Map([["x", "x"]]);
    const mutual = new Map([["x", "y"], ["y", "x"]]);
    const ring = new Map(Array.from({ length: 64 }, (_, i) => [`r${i}`, `r${(i + 1) % 64}`] as const));
    const tail = new Map([["t", "x"], ["x", "y"], ["y", "x"]]);
    for (const [name, parent, start, limit] of [["self", self, "x", 1], ["mutual", mutual, "x", 2], ["ring of 64", ring, "r0", 64], ["tail into a cycle", tail, "t", 3]] as const) {
      expect(rootOf(parent, start, limit), name).toBeUndefined();
    }
  }, 2000);

  it("treesOf throws, and does not loop, on a structure with a cycle (one readSchema would have refused)", () => {
    const cyclic = { fields: [base("a"), derived("x", ["y", "a"]), derived("y", ["x", "a"])] } as unknown as Schema;
    expect(() => treesOf(structureOf(cyclic))).toThrow(/internal invariant/);
  }, 2000);

  it("solve stops after the plan's bound on a cycle that never settles, and throws instead of returning", () => {
    // x = x + y with y fixed at 1 and x at least 0: every pass raises x's lower bound by one, forever
    const diverging = { fields: [base("y", 1, 1), derived("x", ["x", "y"])] } as unknown as Schema;
    const structure = structureOf(diverging);
    expect(() => solve(structure, ["x", "y"], [{ field: "x", extent: { lo: 0, hi: null } }])).toThrow(/did not settle in 20 passes/);
  }, 2000);

  it("the bound is 4 * (fields + 1) + 8 for the tree being solved: 20 passes for two fields, 264 for a tree of 63", () => {
    const two = structureOf({ fields: [base("y", 1, 1), derived("x", ["x", "y"])] } as unknown as Schema);
    expect(() => solve(two, ["x", "y"], [{ field: "x", extent: { lo: 0, hi: null } }])).toThrow(/over 2 fields did not settle in 20 passes/);
    const bases = Array.from({ length: 62 }, (_, i) => base(`b${String(i).padStart(2, "0")}`, i === 0 ? 1 : 0, i === 0 ? 1 : null));
    const many = structureOf({ fields: [...bases, derived("loop", ["loop", "b00"])] } as unknown as Schema);
    const members = [...bases.map((b) => b.id), "loop"];
    expect(members).toHaveLength(63);
    expect(() => solve(many, members, [{ field: "loop", extent: { lo: 0, hi: null } }])).toThrow(/over 63 fields did not settle in 264 passes/);
  }, 2000);

  it("the last pass the plan allows is run: a conflict found on pass 20 of 20 is returned, and one that needs a 21st pass throws", () => {
    // x = x + y with y fixed at 1 and x at least 0: every pass raises x's lower bound by one, and x <= K turns that into a conflict
    // once the bound passes K. Measured on the code as shipped: K = 36 and 37 conflict on pass 19, K = 38 and 39 on pass 20, K = 40 does not settle.
    const two = structureOf({ fields: [base("y", 1, 1), derived("x", ["x", "y"])] } as unknown as Schema);
    const constraint = (hi: number) => [{ field: "x", extent: { lo: 0, hi } }];
    for (const hi of [36, 37]) expect(solve(two, ["x", "y"], constraint(hi)), `hi ${hi}`).toStrictEqual({ kind: "conflicted", passes: 19 });
    for (const hi of [38, 39]) expect(solve(two, ["x", "y"], constraint(hi)), `hi ${hi}`).toStrictEqual({ kind: "conflicted", passes: 20 });
    for (const hi of [40, 41]) expect(() => solve(two, ["x", "y"], constraint(hi)), `hi ${hi}`).toThrow(/over 2 fields did not settle in 20 passes/);
  }, 2000);

  it("a hand-built Grounding with a cyclic schema, given to extentOf, supportOf and openEndsOf, ends the call promptly (a value or a throw, never a loop)", () => {
    const cyclic = { fields: [base("a"), derived("x", ["y", "a"]), derived("y", ["x", "a"])] } as unknown as Schema;
    const zero = { lo: 0, hi: null };
    const g = {
      schema: cyclic,
      observations: [{ id: "k", field: "a", extent: { lo: 1, hi: 1 }, quote: "1", source: "s" }],
      baseline: [{ field: "a", extent: zero }, { field: "x", extent: zero }, { field: "y", extent: zero }],
      trees: [{ root: "x", fields: ["a", "x", "y"], state: { kind: "consistent", extents: [{ field: "a", extent: zero }, { field: "x", extent: zero }, { field: "y", extent: zero }] } }],
    } as unknown as Grounding;
    const outcomes: string[] = [];
    for (const call of [() => ground.extentOf(g, "x" as FieldId), () => ground.supportOf(g, "x" as FieldId), () => ground.openEndsOf(g, "x" as FieldId, ["lo", "hi"])]) {
      try {
        call();
        outcomes.push("returned");
      } catch (error) {
        outcomes.push(error instanceof Error && /internal invariant/.test(error.message) ? "threw an internal invariant" : `threw ${String(error)}`);
      }
    }
    expect(outcomes.every((o) => o === "returned" || o === "threw an internal invariant"), outcomes.join("; ")).toBe(true);
  }, 2000);
});
