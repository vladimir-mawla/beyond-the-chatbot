import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  isAsExpression,
  isBindingElement,
  isElementAccessExpression,
  isIdentifier,
  isImportDeclaration,
  isNamedExports,
  isNamedImports,
  isNoSubstitutionTemplateLiteral,
  isNonNullExpression,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isExportDeclaration,
  isStringLiteral,
  isVariableStatement,
  SyntaxKind,
} from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";
import { parseFile, withProject } from "../../../lib/contracts/__tests__/support/ast.js";
import { scanDeterminism, summariseDeterminism } from "../../../lib/contracts/__tests__/support/determinism.js";
import { TREE_TSCONFIG, tree, useTrees } from "../../../lib/contracts/__tests__/support/fixtures.js";
import { referencesIn, scanInventory, scanModuleGraph, summarise } from "../../../lib/contracts/__tests__/support/module-graph.js";
import * as desk from "../index.js";

/**
 * WHAT `domains/order-desk` IS ALLOWED TO BE (`.genesis/PLAN.md` section 5: a domain imports only the layers' `index` files, and its
 * drafter imports nothing from `lib/` but the `Claim`/`FieldId` types and `fieldId`; section 6, M6, "Must refuse": contribute any entailment
 * rule, construct an `Entailment`, compute a bound, import below a layer's `index`). Six kinds of test:
 *  1. The file inventory and the public surface (the plan's eight names, and the extras, listed).
 *  2. The import closure of the SOURCES: only a sibling, or `lib/contracts|ground|entail/index.js`; the value names each file may
 *     take from a layer; the sibling graph. The DRAFTER takes from `lib/` only the two type names `Claim` and `FieldId`, and
 *     no value at all (stricter than the plan, which also allows `fieldId`: the drafter does not use it).
 *  3. No source builds an `Entailment`: no object literal with a `kind` property set to one of the five variant names.
 *  4. No source but the drafter reads a bound (`.lo` / `.hi`), so the domain computes no extent.
 *  5. No top-level `let` or `var` (a domain constant is `const`, and `canon.test.ts` pins that each is frozen).
 *  6. M1's closed-module-graph scan and determinism guard see these files, so their silence is not an empty scan.
 * Each scan runs on a synthetic tree with one violation per file (they must be reported), and on a second set of files that
 * evade it on purpose (they are NOT reported, and the tests say so: "what the scan does not see").
 * Synthetic trees live under the OS temp directory.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");
const DESK_DIR = join(REPO_ROOT, "domains", "order-desk");

const SOURCES = ["drafter.ts", "freeze.ts", "index.ts", "observations.ts", "questions.ts", "schema.ts", "script.ts"];
const TESTS = ["architecture.test.ts", "canon.test.ts", "demo.test.ts", "drafter.test.ts", "fixtures.ts", "script-failures.test.ts", "script.test.ts"];
const PLAN_NAMES = ["CANON_SCRIPT", "ORDER_DESK_SCHEMA", "OBSERVATIONS", "QUESTIONS", "SNAPSHOTS", "fluentDraft", "renderFluent", "runScript"];
const EXTRA_NAMES = ["FIELDS", "MODEL_PRIORS", "PRIOR_CUSTOMS_DAYS", "PRIOR_PACK_DAYS", "PRIOR_TRANSIT_DAYS", "claimsOf", "observationsOf"];
const TYPE_NAMES = ["Basis", "DrafterObservation", "FieldName", "FluentDraft", "MenuQuestion", "ObservationName", "Priors", "ScriptFailure", "ScriptRun", "ScriptStep", "Statement", "StepRun"];

describe("the file inventory and the public surface", () => {
  it("seven sources (the plan's six and freeze.ts), and the test files", () => {
    expect(readdirSync(DESK_DIR).sort()).toEqual(["__tests__", ...SOURCES].sort());
    expect(readdirSync(join(DESK_DIR, "__tests__")).sort()).toEqual([...TESTS].sort());
  });

  it("the plan's list is what this test says it is (six sources, read from the plan), and it does not name freeze.ts", () => {
    const plan = readFileSync(join(REPO_ROOT, ".genesis", "PLAN.md"), "utf8");
    const line = /\*\*Owns:\*\* `domains\/order-desk\/\*\*` — ([^\n]+)/.exec(plan)?.[1] ?? "";
    expect(line.length).toBeGreaterThan(0);
    for (const name of ["schema.ts", "observations.ts", "questions.ts", "drafter.ts", "script.ts", "index.ts"]) expect(line, name).toContain(name);
    expect(line).not.toContain("freeze");
    expect(line).toContain("scripts/demo-order-desk.ts");
  });

  it("run time: the plan's eight names are exported, and the other seven values are exactly the ones listed here", () => {
    const keys = Object.keys(desk).sort();
    expect(keys).toEqual([...PLAN_NAMES, ...EXTRA_NAMES].sort());
    for (const name of PLAN_NAMES) expect(Object.hasOwn(desk, name), name).toBe(true);
  });

  it("as the parser reads it: those values and these types, no `export *`, only this directory's modules", () => {
    const exported = withProject(REPO_TSCONFIG, (project) => {
      const sf = parseFile(project, join(DESK_DIR, "index.ts"));
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
    expect([...exported.values].sort()).toEqual([...PLAN_NAMES, ...EXTRA_NAMES].sort());
    expect([...exported.types].sort()).toEqual([...TYPE_NAMES].sort());
    expect([...exported.sources].sort()).toEqual(["./drafter.js", "./observations.js", "./questions.js", "./schema.js", "./script.js"]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The scan, as a function that can be pointed at a synthetic tree.
// ---------------------------------------------------------------------------------------------------------

type Rule =
  | "import-not-allowed"
  | "value-import-not-allowed"
  | "drafter-lib-import"
  | "sibling-not-allowed"
  | "entailment-literal"
  | "bound-access"
  | "top-level-mutable"
  | "unparseable";
interface Finding {
  readonly file: string;
  readonly rule: Rule;
}

const LAYER_SPECIFIERS = { "../../lib/contracts/index.js": "contracts", "../../lib/ground/index.js": "ground", "../../lib/entail/index.js": "entail" } as const;
type LayerName = (typeof LAYER_SPECIFIERS)[keyof typeof LAYER_SPECIFIERS];

/** The values each file may take from each lib layer. A file or layer not listed may take none. Every entry is used by the real sources (checked below). */
const VALUE_ALLOWANCE: Readonly<Record<string, Partial<Record<LayerName, readonly string[]>>>> = {
  "observations.ts": { contracts: ["obsId"] },
  "schema.ts": { contracts: ["fieldId"] },
  "script.ts": { entail: ["answer", "recheck", "renderBrief"], ground: ["ground"] },
};

/** The one file that may name only two types from lib, and no value. */
const DRAFTER = "drafter.ts";
const DRAFTER_TYPES: readonly string[] = ["Claim", "FieldId"];

const ALLOWED_SIBLINGS: Readonly<Record<string, readonly string[]>> = {
  "drafter.ts": ["schema.ts"],
  "freeze.ts": [],
  "index.ts": ["drafter.ts", "observations.ts", "questions.ts", "schema.ts", "script.ts"],
  "observations.ts": ["freeze.ts", "schema.ts"],
  "questions.ts": ["freeze.ts", "schema.ts"],
  "schema.ts": ["freeze.ts"],
  "script.ts": ["drafter.ts", "freeze.ts", "observations.ts", "questions.ts", "schema.ts"],
};

const VARIANTS: ReadonlySet<string> = new Set(["entailed", "weakened", "contradicted", "ungrounded", "conflicted"]);

/** Parentheses, `as`, `satisfies` and `!` are looked through: `("entailed" as const)` is still the string. */
function unwrap(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at) || isNonNullExpression(at)) at = at.expression;
  return at;
}

function propertyKeyText(name: Node): string | undefined {
  return isIdentifier(name) || isStringLiteral(name) ? name.text : undefined;
}

interface Scan {
  readonly findings: Finding[];
  readonly scanned: string[];
  readonly values: Record<string, Set<string>>;
  readonly siblingEdges: Set<string>;
  readonly drafterLibNames: Set<string>;
}

/** Scan the non-test sources directly inside `<root>/domains/order-desk`. */
function scanSources(rootDir: string, tsconfig: string): Scan {
  const root = realpathSync(rootDir);
  const dir = join(root, "domains", "order-desk");
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();
  const siblings = new Set(names);
  const findings: Finding[] = [];
  const scanned: string[] = [];
  const values: Record<string, Set<string>> = {};
  const siblingEdges = new Set<string>();
  const drafterLibNames = new Set<string>();
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
      const mayImport = ALLOWED_SIBLINGS[name] ?? [];

      for (const ref of referencesIn(sf)) {
        const sibling = ref.specifier !== null ? /^\.\/([a-z-]+)\.js$/.exec(ref.specifier) : null;
        if (sibling !== null && siblings.has(`${sibling[1]}.ts`)) {
          siblingEdges.add(`${name}>${sibling[1]}.ts`);
          if (!mayImport.includes(`${sibling[1]}.ts`)) report("sibling-not-allowed");
        } else if (ref.specifier === null || !Object.hasOwn(LAYER_SPECIFIERS, ref.specifier)) report("import-not-allowed");
        else if (name === DRAFTER) report("drafter-lib-import"); // refined below: only a type-only import of the two names is let off
      }
      // The drafter's lib imports: remove the "drafter-lib-import" findings the loop raised, then raise one per import that is not
      // type-only, not from contracts, or that names anything but the two types.
      if (name === DRAFTER) {
        for (let i = findings.length - 1; i >= 0; i--) if (findings[i]?.file === name && findings[i]?.rule === "drafter-lib-import") findings.splice(i, 1);
      }

      for (const node of sf.statements) {
        if (isImportDeclaration(node)) {
          const specifier = (node.moduleSpecifier as unknown as { text: string }).text;
          const layer = Object.hasOwn(LAYER_SPECIFIERS, specifier) ? LAYER_SPECIFIERS[specifier as keyof typeof LAYER_SPECIFIERS] : undefined;
          const clause = node.importClause;
          if (layer === undefined || clause === undefined) continue;
          const wholeClauseIsType = clause.phaseModifier === SyntaxKind.TypeKeyword;
          const bindings = clause.namedBindings;
          const imported: { name: string; isType: boolean }[] = [];
          if (clause.name !== undefined) imported.push({ name: "default", isType: wholeClauseIsType });
          if (bindings !== undefined && !isNamedImports(bindings)) imported.push({ name: "*", isType: wholeClauseIsType });
          if (bindings !== undefined && isNamedImports(bindings)) for (const element of bindings.elements) imported.push({ name: (element.propertyName ?? element.name).text, isType: wholeClauseIsType || element.isTypeOnly });
          if (name === DRAFTER) {
            for (const item of imported) drafterLibNames.add(`${layer}:${item.name}`);
            if (layer !== "contracts" || imported.some((item) => !item.isType || !DRAFTER_TYPES.includes(item.name))) report("drafter-lib-import");
            continue;
          }
          for (const item of imported.filter((i) => !i.isType)) {
            (values[`${name}:${layer}`] ??= new Set()).add(item.name);
            if (!(VALUE_ALLOWANCE[name]?.[layer] ?? []).includes(item.name)) report("value-import-not-allowed");
          }
        } else if (isVariableStatement(node)) {
          if ((node.declarationList.flags & 2) === 0) report("top-level-mutable"); // not `const`: `let` or `var`
        }
      }

      const visit = (node: Node): void => {
        if (isObjectLiteralExpression(node)) {
          for (const property of node.properties) {
            if (!isPropertyAssignment(property)) continue;
            const key = propertyKeyText(property.name);
            const value = unwrap(property.initializer);
            if (key === "kind" && (isStringLiteral(value) || isNoSubstitutionTemplateLiteral(value)) && VARIANTS.has(value.text)) report("entailment-literal");
          }
        }
        if (name !== DRAFTER) {
          if (isPropertyAccessExpression(node) && (node.name.text === "lo" || node.name.text === "hi")) report("bound-access");
          if (isElementAccessExpression(node)) {
            const arg = unwrap(node.argumentExpression);
            if ((isStringLiteral(arg) || isNoSubstitutionTemplateLiteral(arg)) && (arg.text === "lo" || arg.text === "hi")) report("bound-access");
          }
          if (isBindingElement(node) && isObjectBindingPattern(node.parent)) {
            const property = node.propertyName ?? node.name;
            if (property !== undefined && (isIdentifier(property) || isStringLiteral(property)) && (property.text === "lo" || property.text === "hi")) report("bound-access");
          }
        }
        node.forEachChild(visit);
      };
      visit(sf);
    }
  });
  return { findings, scanned, values, siblingEdges, drafterLibNames };
}

const summariseFindings = (findings: readonly Finding[]): string[] => [...new Set(findings.map((f) => `${f.file}:${f.rule}`))].sort();

describe("the real sources", () => {
  const result = scanSources(REPO_ROOT, REPO_TSCONFIG);

  it("really scanned the seven sources (an empty scan passing proves nothing)", () => {
    expect(result.scanned).toEqual(SOURCES);
  });

  it("have no finding: only siblings and lib/contracts|ground|entail/index.js, no Entailment literal, no bound read outside the drafter, no top-level let or var", () => {
    expect(summariseFindings(result.findings)).toEqual([]);
  });

  it("the drafter's whole lib import is the two types Claim and FieldId from contracts (no value, so no engine function), and its only sibling is schema.ts", () => {
    expect([...result.drafterLibNames].sort()).toEqual(["contracts:Claim", "contracts:FieldId"]);
    expect([...result.siblingEdges].filter((edge) => edge.startsWith("drafter.ts>"))).toEqual(["drafter.ts>schema.ts"]);
  });

  it("every value allowance is used by some source, so none is speculative, and the sibling table is exactly what the sources do", () => {
    const used: Record<string, string[]> = {};
    for (const [key, names] of Object.entries(result.values)) used[key] = [...names].sort();
    const allowed: Record<string, string[]> = {};
    for (const [file, layers] of Object.entries(VALUE_ALLOWANCE)) for (const [layer, list] of Object.entries(layers)) allowed[`${file}:${layer}`] = [...list].sort();
    expect(used).toEqual(allowed);
    const table = new Set(Object.entries(ALLOWED_SIBLINGS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)));
    expect([...result.siblingEdges].sort()).toEqual([...table].sort());
  });

  it("the sources reach lib only through an index.js (the textual check, as a second route to the same fact)", () => {
    const text = SOURCES.map((name) => readFileSync(join(DESK_DIR, name), "utf8")).join("\n");
    const targets = [...text.matchAll(/from "(\.\.\/\.\.\/lib\/[^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(Object.keys(LAYER_SPECIFIERS)));
  });

  it("the domain never imports lib/extent, and script.ts is the only source that imports lib/ground or lib/entail", () => {
    const importers = (layer: string): string[] => SOURCES.filter((name) => readFileSync(join(DESK_DIR, name), "utf8").includes(`lib/${layer}/index.js`));
    expect(importers("extent")).toEqual([]);
    expect(importers("ground")).toEqual(["script.ts"]);
    expect(importers("entail")).toEqual(["script.ts"]);
  });
});

describe("a synthetic tree with one violation per file: each is reported, and the valid files beside them are not", () => {
  const D = "domains/order-desk";
  const files: Record<string, string> = {
    // ---- valid: the scan has something to wrongly flag ----
    "lib/contracts/index.ts": "export const fieldId = (s: string): string => s;\nexport type Claim = { f: string };\nexport type FieldId = string;\nexport const obsId = fieldId;\nexport type Other = number;\n",
    "lib/ground/index.ts": "export const ground = 1;\nexport const readSchema = 2;\n",
    "lib/entail/index.ts": "export const answer = 1;\nexport const recheck = 2;\nexport const renderBrief = 3;\nexport const rule = 4;\n",
    [`${D}/schema.ts`]: 'import { fieldId } from "../../lib/contracts/index.js";\nimport { freeze } from "./freeze.js";\nexport const F = freeze(fieldId("x"));\n',
    [`${D}/freeze.ts`]: "export function freeze<T>(v: T): T {\n  return v;\n}\n",
    [`${D}/drafter.ts`]: 'import type { Claim, FieldId } from "../../lib/contracts/index.js";\nimport { F } from "./schema.js";\nexport function d(a: { lo: number; hi: number }): [Claim, FieldId, string] {\n  const lo = a.lo;\n  return [{ f: String(lo + a.hi) }, F as FieldId, "entailed"];\n}\n',
    [`${D}/script.ts`]: 'import { ground } from "../../lib/ground/index.js";\nimport { answer, recheck, renderBrief } from "../../lib/entail/index.js";\nimport { d } from "./drafter.js";\nexport const r = [ground, answer, recheck, renderBrief, d];\nexport const label = { kind: "other" };\n',
    [`${D}/observations.ts`]: 'import { obsId } from "../../lib/contracts/index.js";\nexport const O = obsId("o1");\nexport const state = { lo: 1, hi: 2 };\n',
    [`${D}/questions.ts`]: "export const Q = [{ label: 'q', claim: { lo: null, hi: 3 } }];\n",
    [`${D}/index.ts`]: 'export { F } from "./schema.js";\nexport { d } from "./drafter.js";\n',
    [`${D}/__tests__/helper.ts`]: 'import "node:fs";\nexport const helper = 1;\n',
    [`${D}/thing.test.ts`]: 'import "node:fs";\nexport const t = 1;\n',
    // ---- one violation each ----
    [`${D}/bad-external.ts`]: 'import "node:fs";\n',
    [`${D}/bad-package.ts`]: 'import "react";\n',
    [`${D}/bad-deep-lib.ts`]: 'import type { Brief } from "../../lib/contracts/brief.js";\nexport type T = Brief;\n',
    [`${D}/bad-extent.ts`]: 'import { meet } from "../../lib/extent/index.js";\nexport const m = meet;\n',
    [`${D}/bad-ground-internal.ts`]: 'import { solve } from "../../lib/ground/solve.js";\nexport const s = solve;\n',
    [`${D}/bad-up.ts`]: 'import { x } from "../../app/x.js";\nexport const u = x;\n',
    [`${D}/bad-test-import.ts`]: 'import "./__tests__/helper.js";\n',
    [`${D}/bad-dynamic.ts`]: 'export function f(): Promise<unknown> {\n  return import("node:os");\n}\n',
    [`${D}/bad-export-from.ts`]: 'export { x } from "../../app/x.js";\n',
    [`${D}/bad-value.ts`]: 'import { rule } from "../../lib/entail/index.js";\nexport const r2 = rule;\n',
    [`${D}/bad-renamed-value.ts`]: 'import { readSchema as rs } from "../../lib/ground/index.js";\nexport const r3 = rs;\n',
    [`${D}/bad-namespace.ts`]: 'import * as g from "../../lib/ground/index.js";\nexport const r4 = g;\n',
    [`${D}/bad-default.ts`]: 'import d from "../../lib/ground/index.js";\nexport const r5 = d;\n',
    [`${D}/bad-sibling.ts`]: 'import { Q } from "./questions.js";\nexport const r6 = Q;\n',
    [`${D}/bad-literal.ts`]: 'export const e = { kind: "entailed", field: "x" };\n',
    [`${D}/bad-literal-string-key.ts`]: 'export const e2 = { "kind": "conflicted" };\n',
    [`${D}/bad-literal-template.ts`]: "export const e3 = { kind: `weakened` };\n",
    [`${D}/bad-literal-cast.ts`]: 'export const e4 = { kind: ("ungrounded" as const) };\n',
    [`${D}/bad-literal-satisfies.ts`]: 'export const e5 = { kind: "contradicted" satisfies string };\n',
    [`${D}/bad-literal-nested.ts`]: 'export function f() {\n  return [{ inner: { kind: "weakened" } }];\n}\n',
    [`${D}/bad-access-lo.ts`]: "export function f(e: { lo: number }): number {\n  return e.lo;\n}\n",
    [`${D}/bad-access-hi.ts`]: "export function f(e: { hi: number }): number {\n  return e.hi;\n}\n",
    [`${D}/bad-element.ts`]: 'export function f(e: { lo: number }): number {\n  return e["lo"];\n}\n',
    [`${D}/bad-element-template.ts`]: "export function f(e: { hi: number }): number {\n  return e[`hi`];\n}\n",
    [`${D}/bad-destructure.ts`]: "export function f(e: { lo: number }): number {\n  const { lo } = e;\n  return lo;\n}\n",
    [`${D}/bad-destructure-renamed.ts`]: "export function f(e: { hi: number }): number {\n  const { hi: top } = e;\n  return top;\n}\n",
    [`${D}/bad-let.ts`]: "let n = 0;\nexport function f(): number {\n  n += 1;\n  return n;\n}\n",
    [`${D}/bad-var.ts`]: "var v = 0;\nexport const g = () => v;\n",
    [`${D}/bad-syntax.ts`]: "export function = ;\n",
    // ---- the drafter, held to a stricter rule ----
    [`${D}/drafter-value.ts`]: 'import { fieldId } from "../../lib/contracts/index.js";\nexport const x = fieldId("a");\n',
  };
  // `drafter-*.ts` fixtures are renamed to drafter.ts in their own trees below, since the strict rule is keyed on that name.
  const root = tree(Object.fromEntries(Object.entries(files).filter(([path]) => !path.endsWith("/drafter-value.ts"))));
  const result = scanSources(root, join(root, "tsconfig.json"));

  it("reports exactly the planted violations, one rule per file", () => {
    expect(summariseFindings(result.findings)).toEqual(
      [
        "bad-access-hi.ts:bound-access",
        "bad-access-lo.ts:bound-access",
        "bad-default.ts:value-import-not-allowed",
        "bad-deep-lib.ts:import-not-allowed",
        "bad-destructure-renamed.ts:bound-access",
        "bad-destructure.ts:bound-access",
        "bad-dynamic.ts:import-not-allowed",
        "bad-element-template.ts:bound-access",
        "bad-element.ts:bound-access",
        "bad-export-from.ts:import-not-allowed",
        "bad-extent.ts:import-not-allowed",
        "bad-external.ts:import-not-allowed",
        "bad-ground-internal.ts:import-not-allowed",
        "bad-let.ts:top-level-mutable",
        "bad-literal-cast.ts:entailment-literal",
        "bad-literal-nested.ts:entailment-literal",
        "bad-literal-satisfies.ts:entailment-literal",
        "bad-literal-string-key.ts:entailment-literal",
        "bad-literal-template.ts:entailment-literal",
        "bad-literal.ts:entailment-literal",
        "bad-namespace.ts:value-import-not-allowed",
        "bad-package.ts:import-not-allowed",
        "bad-renamed-value.ts:value-import-not-allowed",
        "bad-sibling.ts:sibling-not-allowed",
        "bad-syntax.ts:unparseable",
        "bad-test-import.ts:import-not-allowed",
        "bad-up.ts:import-not-allowed",
        "bad-value.ts:value-import-not-allowed",
        "bad-var.ts:top-level-mutable",
      ].sort(),
    );
  });

  it("the valid files, including the drafter reading `.lo` and `.hi`, a literal whose kind is not a variant name, and tests, are not reported", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    for (const name of ["schema.ts", "freeze.ts", "drafter.ts", "script.ts", "observations.ts", "questions.ts", "index.ts"]) expect(flagged.has(name), name).toBe(false);
    expect(result.scanned).toContain("drafter.ts");
    expect(result.scanned).not.toContain("thing.test.ts");
  });

  it("the drafter's stricter rule: a VALUE from contracts (even fieldId), a type other than Claim and FieldId, another layer, and a type from ground are each reported", () => {
    const variants: Record<string, string> = {
      value: 'import { fieldId } from "../../lib/contracts/index.js";\nexport const x = fieldId("a");\n',
      "other-type": 'import type { Observation } from "../../lib/contracts/index.js";\nexport type T = Observation;\n',
      "mixed-type-and-value": 'import { type Claim, fieldId } from "../../lib/contracts/index.js";\nexport const x = (c: Claim) => fieldId("a") && c;\n',
      "ground-type": 'import type { Grounding } from "../../lib/ground/index.js";\nexport type T = Grounding;\n',
      "entail-type": 'import type { RuleResult } from "../../lib/entail/index.js";\nexport type T = RuleResult;\n',
      namespace: 'import type * as c from "../../lib/contracts/index.js";\nexport type T = c.Claim;\n',
      extent: 'import type { Extent } from "../../lib/extent/index.js";\nexport type T = Extent;\n',
    };
    for (const [label, body] of Object.entries(variants)) {
      const base: Record<string, string> = {
        "lib/contracts/index.ts": "export const fieldId = (s: string): string => s;\nexport type Claim = { f: string };\nexport type FieldId = string;\nexport type Observation = { o: number };\n",
        "lib/ground/index.ts": "export type Grounding = { g: number };\n",
        "lib/entail/index.ts": "export type RuleResult = { r: number };\n",
        "lib/extent/index.ts": "export type Extent = { e: number };\n",
        [`${D}/drafter.ts`]: body,
      };
      const t = tree(base);
      const out = scanSources(t, join(t, "tsconfig.json"));
      const expected = label === "extent" ? ["drafter.ts:import-not-allowed"] : ["drafter.ts:drafter-lib-import"];
      expect(summariseFindings(out.findings), label).toEqual(expected);
    }
  });

  it("control for the stricter rule: the drafter importing exactly `type { Claim, FieldId }` from contracts has no finding", () => {
    const t = tree({
      "lib/contracts/index.ts": "export type Claim = { f: string };\nexport type FieldId = string;\n",
      [`${D}/drafter.ts`]: 'import type { Claim, FieldId } from "../../lib/contracts/index.js";\nexport type T = [Claim, FieldId];\n',
    });
    expect(summariseFindings(scanSources(t, join(t, "tsconfig.json")).findings)).toEqual([]);
    const t2 = tree({
      "lib/contracts/index.ts": "export type Claim = { f: string };\nexport type FieldId = string;\n",
      [`${D}/drafter.ts`]: 'import { type Claim, type FieldId } from "../../lib/contracts/index.js";\nexport type T = [Claim, FieldId];\n',
    });
    expect(summariseFindings(scanSources(t2, join(t2, "tsconfig.json")).findings)).toEqual([]);
  });
});

describe("what the scans do NOT see (stated, and pinned so that the statement stays true)", () => {
  const D = "domains/order-desk";
  const evasions: Record<string, string> = {
    // an Entailment built without a literal `kind: "<variant>"` property
    "evade-computed-key.ts": 'export const e = { ["kind"]: "entailed" };\n',
    "evade-alias.ts": 'const K = "entailed";\nexport const e = { kind: K };\n',
    "evade-shorthand.ts": 'const kind = "entailed";\nexport const e = { kind };\n',
    "evade-spread.ts": 'const base = { field: "x" };\nexport const e = { ...base, kind: ["entailed"].join("") };\n',
    "evade-assign.ts": 'export const e = Object.assign({}, { kind: "ent" + "ailed" });\n',
    "evade-parse.ts": 'export const e = JSON.parse(\'{"kind":"entailed"}\');\n',
    "evade-class.ts": 'export class E {\n  kind = "entailed";\n}\n',
    "evade-template-substitution.ts": 'const v = "entailed";\nexport const e = { kind: `${v}` };\n',
    "evade-conditional.ts": 'export const e = (c: boolean) => ({ kind: c ? "entailed" : "weakened" });\n',
    "evade-nullish.ts": 'export const e = (x?: string) => ({ kind: x ?? "entailed" });\n',
    "evade-or.ts": 'export const e = (x?: string) => ({ kind: x || "entailed" });\n',
    "evade-and.ts": 'export const e = (x: boolean) => ({ kind: x && "entailed" });\n',
    "evade-concat.ts": 'export const e = { kind: "ent" + "ailed" };\n',
    "evade-tagged-template.ts": 'export const e = { kind: String.raw`entailed` };\n',
    "evade-reflect.ts": 'export const read = (e: object): unknown => Reflect.get(e, "lo");\n',
    "evade-destructuring-assignment.ts": 'export function read(e: { lo: number }): number {\n  let lo = 0;\n  ({ lo } = e);\n  return lo;\n}\n',
    // a bound read without `.lo` / `.hi` / ["lo"] / { lo }
    "evade-key-variable.ts": 'const key = "lo";\nexport const read = (e: Record<string, number>): number | undefined => e[key];\n',
    "evade-entries.ts": "export const read = (e: object): unknown[] => Object.values(e);\n",
    "evade-param-destructure.ts": "export const read = ({ lo }: { lo: number }): number => lo;\n",
  };
  // The parameter-destructure form IS seen (a BindingElement in an object pattern): that file is therefore a control that is reported.
  const t = tree(Object.fromEntries(Object.entries(evasions).map(([name, body]) => [`${D}/${name}`, body])));
  const result = scanSources(t, join(t, "tsconfig.json"));

  it("a computed key, an alias, a shorthand, a spread, Object.assign, JSON.parse, a class field, a substituted template, a conditional, `??`, `||`, `&&`, a string concatenation and a tagged template build a variant name and are not reported", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    for (const name of ["evade-computed-key.ts", "evade-alias.ts", "evade-shorthand.ts", "evade-spread.ts", "evade-assign.ts", "evade-parse.ts", "evade-class.ts", "evade-template-substitution.ts", "evade-conditional.ts", "evade-nullish.ts", "evade-or.ts", "evade-and.ts", "evade-concat.ts", "evade-tagged-template.ts"]) {
      expect(flagged.has(name), name).toBe(false);
    }
  });

  it("a bound read through a variable key, Object.values, Reflect.get or a destructuring assignment is not reported either", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    expect(flagged.has("evade-key-variable.ts")).toBe(false);
    expect(flagged.has("evade-entries.ts")).toBe(false);
    expect(flagged.has("evade-reflect.ts")).toBe(false);
    expect(flagged.has("evade-destructuring-assignment.ts")).toBe(false);
  });

  it("control: a parameter destructuring `{ lo }` IS reported, so the silence above is the scan's, not the file's", () => {
    expect(summariseFindings(result.findings)).toEqual(["evade-param-destructure.ts:bound-access"]);
  });
});

describe("M1's whole-repository scans see the domain's files", () => {
  it("the closed module graph has no violation and parsed every source and test file of the domain", () => {
    const graph = scanModuleGraph({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    expect(summarise(graph.violations)).toEqual([]);
    for (const name of SOURCES) expect(graph.scanned, name).toContain(`domains/order-desk/${name}`);
    for (const name of TESTS.filter((n) => n.endsWith(".ts"))) expect(graph.scanned, name).toContain(`domains/order-desk/__tests__/${name}`);
  });

  it("the determinism guard has no violation and scanned every source (no clock, no randomness, no environment, no network)", () => {
    const result = scanDeterminism({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    expect(summariseDeterminism(result.violations)).toEqual([]);
    for (const name of SOURCES) expect(result.scanned, name).toContain(`domains/order-desk/${name}`);
  });

  it("the inventory scan (no symlink, no non-TypeScript file) is silent over the domain", () => {
    expect(summarise(scanInventory(join(REPO_ROOT, "domains")))).toEqual([]);
  });

  it("the synthetic tree config is the one the scan opens (a guard against editing it in one place only)", () => {
    expect(JSON.parse(TREE_TSCONFIG).include).toEqual(["lib/**/*.ts", "domains/**/*.ts"]);
  });
});
