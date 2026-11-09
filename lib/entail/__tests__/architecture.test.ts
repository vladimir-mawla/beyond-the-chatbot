import { cpSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isArrowFunction,
  isBinaryExpression,
  isExportDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedExports,
  isNamedImports,
  isPropertyAccessExpression,
  isTypeAliasDeclaration,
  isVariableStatement,
  SyntaxKind,
} from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";
import type { Bound, Brief, Claim, ClaimFault, Entailment, FieldId, NonEmptyReadonlyArray, ObservationFault, ObsId, Schema, Side } from "../../contracts/index.js";
import { parseFile, withProject } from "../../contracts/__tests__/support/ast.js";
import type { Assert, Equal } from "../../contracts/__tests__/support/type-equal.js";
import { scanDeterminism, summariseDeterminism } from "../../contracts/__tests__/support/determinism.js";
import { TREE_TSCONFIG, tree, useTrees } from "../../contracts/__tests__/support/fixtures.js";
import { referencesIn, scanInventory, scanModuleGraph, summarise } from "../../contracts/__tests__/support/module-graph.js";
import type { GroundFailure, Grounding } from "../../ground/index.js";
import * as entail from "../index.js";
import type { AnswerFailure, AnswerResult, ClaimRead, NotReproduced, RecheckFinding, RecheckResult, Reproduction, RuleResult } from "../index.js";
import { DESK, base, canon, claim, derived, groundOf } from "./fixtures.js";

/**
 * WHAT `lib/entail` IS ALLOWED TO BE (`.genesis/PLAN.md` section 5: `lib/entail` imports `contracts`, `extent` and
 * `ground`; section 6, M5: `recheck` "never sees the snapshot", "only the carried evidence"). Nine kinds of test:
 *  1. The file inventory: `lib/entail` holds the files the plan's M5 lists, and one more, `plain.ts` (ADR 0005).
 *  2. The public surface: the six functions and the eight types of the plan's block, read at run time and by the parser.
 *  3. The import closure of the SOURCES, stricter than M1's layer table: only `../contracts/index.js`,
 *     `../extent/index.js` and `../ground/index.js` (never a file inside any of them), this directory's own sources, and
 *     only the values named below, each of which some source uses, so no allowance is speculative.
 *  4. The sibling graph: which source may import which. `recheck.ts` imports only `plain.ts` among its siblings, so the
 *     holder's checker shares no ruling code with the ruler, only `lib/ground`, whose public surface it reads; and no
 *     source but `index.ts` imports `render.ts` or `recheck.ts`.
 *  5. No module-level state: a source holds only imports, re-exports, function declarations, types, and constants whose
 *     value is an arrow function.
 *  6. M5 composes M3's algebra and does not write it again: no source applies a relational or additive operator
 *     directly to a property called `lo` or `hi`. (It does not see an extent compared through a local variable.)
 *  7. M1's closed-module-graph scan, determinism guard and file inventory see these files, so their silence is not an empty scan.
 *  8. The types and signatures are the plan's, proved identical at compile time (`npm run typecheck`).
 *  9. `recheck` has two parameters, a schema and a Brief, and nothing to read a snapshot from; `rule` and `answer` on a
 *     `Grounding` that disagrees with itself end promptly.
 * Synthetic trees live under the OS temp directory.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");
const ENTAIL_DIR = join(REPO_ROOT, "lib", "entail");

const SOURCES = ["answer.ts", "index.ts", "plain.ts", "read-claim.ts", "recheck.ts", "render.ts", "rule.ts"];
const TESTS = [
  "answer.test.ts",
  "architecture.test.ts",
  "claim-faults.test.ts",
  "fixtures.ts",
  "immutability.test.ts",
  "integrity.test.ts",
  "partition.test.ts",
  "recheck.test.ts",
  "render-properties.test.ts",
  "rule-table.test.ts",
];
const FUNCTIONS = ["answer", "readClaim", "recheck", "renderBrief", "renderEntailment", "rule"];
const TYPES = ["AnswerFailure", "AnswerResult", "ClaimRead", "NotReproduced", "RecheckFinding", "RecheckResult", "Reproduction", "RuleResult"];

describe("the file inventory: the plan's M5 list, and plain.ts", () => {
  it("seven sources, and in __tests__ the nine test files the plan names plus fixtures.ts", () => {
    expect(readdirSync(ENTAIL_DIR).sort()).toEqual(["__tests__", ...SOURCES].sort());
    expect(readdirSync(join(ENTAIL_DIR, "__tests__")).sort()).toEqual([...TESTS].sort());
    expect(TESTS.filter((name) => name.endsWith(".test.ts"))).toHaveLength(9);
  });

  it("the plan's list is what this test says it is (six sources, nine tests and fixtures.ts, read from the plan), and it does not name plain.ts", () => {
    const plan = readFileSync(join(REPO_ROOT, ".genesis", "PLAN.md"), "utf8");
    const line = /\*\*Owns:\*\* `lib\/entail\/\*\*` — ([^\n]+)/.exec(plan)?.[1] ?? "";
    expect(line.length).toBeGreaterThan(0);
    for (const name of ["read-claim.ts", "rule.ts", "answer.ts", "render.ts", "recheck.ts", "index.ts"]) expect(line, name).toContain(name);
    for (const name of TESTS.filter((n) => n.endsWith(".test.ts"))) expect(line, name).toContain(name.replace(".test.ts", ""));
    expect(line).toContain("fixtures.ts");
    expect(line).not.toContain("plain");
  });
});

describe("the public surface of index.ts: the six functions and the plan's eight types", () => {
  it("run time: exactly the six functions (plain.ts and every helper stay internal)", () => {
    expect(Object.keys(entail).sort()).toEqual([...FUNCTIONS].sort());
    for (const name of FUNCTIONS) expect(typeof (entail as Record<string, unknown>)[name], name).toBe("function");
  });

  it("as the parser reads it: those six values, those eight types, no `export *`, only this directory's modules", () => {
    const exported = withProject(REPO_TSCONFIG, (project) => {
      const sf = parseFile(project, join(ENTAIL_DIR, "index.ts"));
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
    expect([...exported.sources].sort()).toEqual(["./answer.js", "./read-claim.js", "./recheck.js", "./render.js", "./rule.js"]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The import closure, the sibling graph, the no-module-state rule and "does not re-implement the algebra", as a
// scan that can be pointed at a synthetic tree.
// ---------------------------------------------------------------------------------------------------------

type Rule = "import-not-allowed" | "contracts-value-import" | "extent-value-import" | "ground-value-import" | "sibling-not-allowed" | "top-level-statement" | "extent-operator" | "unparseable";
interface Finding {
  readonly file: string;
  readonly rule: Rule;
}

const ALLOWED_CONTRACT_VALUES: ReadonlySet<string> = new Set(["MAX_DRAFT_CLAIMS", "MAX_ID_LENGTH", "MAX_OBSERVATIONS", "assertEntailmentWellFormed", "assertNeverEntailment", "compareIds", "fieldId", "isNonEmptyArray", "obsId"]);
const ALLOWED_EXTENT_VALUES: ReadonlySet<string> = new Set(["checkExtent", "isSameExtent", "isSubset", "meet", "unmetSides"]);
const ALLOWED_GROUND_VALUES: ReadonlySet<string> = new Set(["declOf", "extentOf", "ground", "openEndsOf", "supportOf"]);
const LAYERS = {
  "../contracts/index.js": { rule: "contracts-value-import", allowed: ALLOWED_CONTRACT_VALUES },
  "../extent/index.js": { rule: "extent-value-import", allowed: ALLOWED_EXTENT_VALUES },
  "../ground/index.js": { rule: "ground-value-import", allowed: ALLOWED_GROUND_VALUES },
} as const satisfies Record<string, { rule: Rule; allowed: ReadonlySet<string> }>;

/**
 * Which sibling each source may import. `recheck.ts` reaches only `plain.ts`: the holder's checker must not share ruling
 * code (`read-claim`, `rule`, `answer`) with the ruler it checks. `render.ts` reaches none. Only `index.ts` reaches the
 * two that nothing else needs.
 */
const ALLOWED_SIBLINGS: Readonly<Record<string, readonly string[]>> = {
  "answer.ts": ["plain.ts", "rule.ts"],
  "index.ts": ["answer.ts", "read-claim.ts", "recheck.ts", "render.ts", "rule.ts"],
  "plain.ts": [],
  "read-claim.ts": ["plain.ts"],
  "recheck.ts": ["plain.ts"],
  "render.ts": [],
  "rule.ts": ["plain.ts", "read-claim.ts"],
};

/** Operators that compare or add: applied to `.lo` or `.hi` they would be the extent algebra written again. */
const ALGEBRA_OPERATORS = new Set([SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken, SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken, SyntaxKind.PlusToken, SyntaxKind.MinusToken]);

function isBoundAccess(node: Node): boolean {
  return isPropertyAccessExpression(node) && (node.name.text === "lo" || node.name.text === "hi");
}

interface Scan {
  readonly findings: Finding[];
  readonly scanned: string[];
  readonly values: Record<keyof typeof LAYERS, Set<string>>;
}

/** Scan the non-test sources directly inside `<root>/lib/entail`. */
function scanSources(rootDir: string, tsconfig: string): Scan {
  const root = realpathSync(rootDir);
  const dir = join(root, "lib", "entail");
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();
  const siblings = new Set(names);
  const findings: Finding[] = [];
  const scanned: string[] = [];
  const values: Scan["values"] = { "../contracts/index.js": new Set(), "../extent/index.js": new Set(), "../ground/index.js": new Set() };
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
      // a file the table does not list may import no sibling at all
      const mayImport = ALLOWED_SIBLINGS[name] ?? [];

      for (const ref of referencesIn(sf)) {
        const sibling = ref.specifier !== null ? /^\.\/([a-z-]+)\.js$/.exec(ref.specifier) : null;
        const isSibling = sibling !== null && siblings.has(`${sibling[1]}.ts`);
        if (isSibling) {
          if (!mayImport.includes(`${sibling[1]}.ts`)) report("sibling-not-allowed");
        } else if (ref.specifier === null || !(ref.specifier in LAYERS)) report("import-not-allowed");
      }

      for (const node of sf.statements) {
        if (isImportDeclaration(node)) {
          const specifier = (node.moduleSpecifier as unknown as { text: string }).text;
          const clause = node.importClause;
          const layer = Object.hasOwn(LAYERS, specifier) ? LAYERS[specifier as keyof typeof LAYERS] : undefined;
          if (layer !== undefined && clause !== undefined && clause.phaseModifier !== SyntaxKind.TypeKeyword) {
            const bindings = clause.namedBindings;
            const valueNames: string[] = [];
            if (clause.name !== undefined) valueNames.push("default");
            if (bindings !== undefined && !isNamedImports(bindings)) valueNames.push("*");
            if (bindings !== undefined && isNamedImports(bindings)) {
              for (const element of bindings.elements) if (!element.isTypeOnly) valueNames.push((element.propertyName ?? element.name).text);
            }
            for (const value of valueNames) values[specifier as keyof typeof LAYERS].add(value);
            if (valueNames.some((n) => !layer.allowed.has(n))) report(layer.rule);
          }
        } else if (isVariableStatement(node)) {
          // a constant whose value is an arrow function is a function written another way; any other value is state
          const list = node.declarationList;
          const isConst = (list.flags & 2) !== 0;
          if (!isConst || !list.declarations.every((declaration) => declaration.initializer !== undefined && isArrowFunction(declaration.initializer))) report("top-level-statement");
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
  return { findings, scanned, values };
}

const summariseFindings = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.file}:${f.rule}`).sort();

describe("the import closure, the sibling graph, the no-module-state rule and the no-new-algebra rule hold on the real sources", () => {
  const result = scanSources(REPO_ROOT, REPO_TSCONFIG);

  it("really scanned the seven sources (an empty scan passing proves nothing)", () => {
    expect(result.scanned).toEqual(SOURCES);
  });

  it("has no finding", () => {
    expect(summariseFindings(result.findings)).toEqual([]);
  });

  it("every allowed value is imported by some source, so no allowance is speculative", () => {
    expect([...result.values["../contracts/index.js"]].sort()).toEqual([...ALLOWED_CONTRACT_VALUES].sort());
    expect([...result.values["../extent/index.js"]].sort()).toEqual([...ALLOWED_EXTENT_VALUES].sort());
    expect([...result.values["../ground/index.js"]].sort()).toEqual([...ALLOWED_GROUND_VALUES].sort());
  });

  it("the real sources import from each layer only through its index.js", () => {
    const text = SOURCES.map((name) => readFileSync(join(ENTAIL_DIR, name), "utf8")).join("\n");
    const layerImports = [...text.matchAll(/from "(\.\.\/[^"]+)"/g)].map((m) => m[1]);
    expect(layerImports.length).toBeGreaterThan(0);
    expect(new Set(layerImports)).toEqual(new Set(["../contracts/index.js", "../extent/index.js", "../ground/index.js"]));
  });

  it("the sibling table is what the sources do: every allowed sibling edge is used by some source, so none is speculative", () => {
    const used = new Set<string>();
    for (const name of SOURCES) {
      const text = readFileSync(join(ENTAIL_DIR, name), "utf8");
      for (const m of text.matchAll(/from "\.\/([a-z-]+)\.js"/g)) used.add(`${name}>${m[1]}.ts`);
    }
    const allowed = new Set(Object.entries(ALLOWED_SIBLINGS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)));
    expect([...used].sort()).toEqual([...allowed].sort());
  });

  it("recheck.ts shares no ruling code with the ruler: its only sibling is plain.ts, and nothing but index.ts imports it or render.ts", () => {
    expect(ALLOWED_SIBLINGS["recheck.ts"]).toEqual(["plain.ts"]);
    for (const [from, tos] of Object.entries(ALLOWED_SIBLINGS)) {
      if (from === "index.ts") continue;
      expect(tos, from).not.toContain("recheck.ts");
      expect(tos, from).not.toContain("render.ts");
    }
  });
});

describe("a synthetic tree with one violation per file: each is reported, and the valid files beside them are not", () => {
  const files: Record<string, string> = {
    // ---- valid: the scan has something to wrongly flag ----
    "lib/contracts/index.ts": "export const MAX_ID_LENGTH = 1;\n",
    "lib/extent/index.ts": "export const meet = 1;\n",
    "lib/ground/index.ts": "export const declOf = 1;\n",
    "lib/entail/answer.ts": 'import type { Extent } from "../contracts/index.js";\nimport { MAX_ID_LENGTH, compareIds } from "../contracts/index.js";\nimport { meet } from "../extent/index.js";\nimport { declOf } from "../ground/index.js";\nimport { b } from "./plain.js";\nexport function a(e: Extent | null): number {\n  return MAX_ID_LENGTH + b(e) + (compareIds("a", "b") + (meet === undefined || declOf === undefined ? 0 : 1));\n}\n',
    "lib/entail/plain.ts": "export function b(e: unknown): number {\n  return e === null ? 0 : 1;\n}\nexport const twice = (n: number): number => n * 2;\nexport type Alias = number;\nexport interface Shape {\n  readonly n: number;\n}\n",
    "lib/entail/render.ts": 'import { type Extent, MAX_ID_LENGTH } from "../contracts/index.js";\nexport function c(e: Extent): number {\n  return MAX_ID_LENGTH + (e.lo === null ? 0 : 1) + (e.hi === e.lo ? 1 : 0);\n}\n',
    "lib/entail/index.ts": 'export { a } from "./answer.js";\nexport { c } from "./render.js";\n',
    "lib/entail/read-claim.ts": "export function copy(e: { readonly lo: number | null; readonly hi: number | null }): { lo: number | null; hi: number | null } {\n  return { lo: e.lo, hi: e.hi };\n}\n",
    "lib/entail/__tests__/helper.ts": 'import "node:fs";\nexport const helper = 1;\n',
    "lib/entail/thing.test.ts": 'import "node:fs";\nexport const t = 1;\n',
    // ---- one violation each ----
    "lib/entail/bad-external.ts": 'import "node:fs";\n',
    "lib/entail/bad-package.ts": 'import "react";\n',
    "lib/entail/bad-other-layer.ts": 'import { g } from "../domains/index.js";\nexport function f(): unknown {\n  return g;\n}\n',
    "lib/entail/bad-deep-contracts.ts": 'import type { Brief } from "../contracts/brief.js";\nexport type T = Brief;\n',
    "lib/entail/bad-deep-ground.ts": 'import type { Tree } from "../ground/solve.js";\nexport type T2 = Tree;\n',
    "lib/entail/bad-test-import.ts": 'import "./__tests__/helper.js";\n',
    "lib/entail/bad-export-from.ts": 'export { x } from "../domains/index.js";\n',
    "lib/entail/bad-dynamic.ts": 'export function f(): Promise<unknown> {\n  return import("node:os");\n}\n',
    "lib/entail/bad-contracts-value.ts": 'import { MAX_FIELDS } from "../contracts/index.js";\nexport function f(): number {\n  return MAX_FIELDS;\n}\n',
    "lib/entail/bad-contracts-renamed.ts": 'import { MAX_FIELDS as M } from "../contracts/index.js";\nexport function f(): number {\n  return M;\n}\n',
    "lib/entail/bad-contracts-namespace.ts": 'import * as c from "../contracts/index.js";\nexport function f(): unknown {\n  return c;\n}\n',
    "lib/entail/bad-extent-value.ts": 'import { sumForward } from "../extent/index.js";\nexport function f(): unknown {\n  return sumForward;\n}\n',
    "lib/entail/bad-ground-value.ts": 'import { readSchema } from "../ground/index.js";\nexport function f(): unknown {\n  return readSchema;\n}\n',
    "lib/entail/bad-ground-namespace.ts": 'import * as g from "../ground/index.js";\nexport function f(): unknown {\n  return g;\n}\n',
    "lib/entail/bad-sibling.ts": 'import { b } from "./plain.js";\nexport function f(): number {\n  return b(1);\n}\n',
    "lib/entail/bad-let.ts": "let n = 0;\nexport function f(): number {\n  n += 1;\n  return n;\n}\n",
    "lib/entail/bad-const.ts": "const SHARED = { lo: null, hi: null };\nexport function f(): unknown {\n  return SHARED;\n}\n",
    "lib/entail/bad-let-arrow.ts": "let f = (): number => 1;\nexport function g(): number {\n  return f();\n}\n",
    "lib/entail/bad-const-mixed.ts": "const ok = (): number => 1, bad = new Map();\nexport function g(): unknown {\n  return [ok, bad];\n}\n",
    "lib/entail/bad-exported-const.ts": "export const NONE = [];\n",
    "lib/entail/bad-call.ts": 'console.log("loaded");\n',
    "lib/entail/bad-class.ts": "export class Box {\n  value = 0;\n}\n",
    "lib/entail/bad-syntax.ts": "export function = ;\n",
    "lib/entail/bad-less-than.ts": "export function f(a: { lo: number }, b: number): boolean {\n  return a.lo < b;\n}\n",
    "lib/entail/bad-greater-equal.ts": "export function f(a: { hi: number }, b: { hi: number }): boolean {\n  return a.hi >= b.hi;\n}\n",
    "lib/entail/bad-plus.ts": "export function f(a: { lo: number }, b: { lo: number }): number {\n  return a.lo + b.lo;\n}\n",
    "lib/entail/bad-minus.ts": "export function f(a: { hi: number }, b: number): number {\n  return b - a.hi;\n}\n",
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
        "bad-deep-ground.ts:import-not-allowed",
        "bad-test-import.ts:import-not-allowed",
        "bad-export-from.ts:import-not-allowed",
        "bad-dynamic.ts:import-not-allowed",
        "bad-contracts-value.ts:contracts-value-import",
        "bad-contracts-renamed.ts:contracts-value-import",
        "bad-contracts-namespace.ts:contracts-value-import",
        "bad-extent-value.ts:extent-value-import",
        "bad-ground-value.ts:ground-value-import",
        "bad-ground-namespace.ts:ground-value-import",
        "bad-sibling.ts:sibling-not-allowed",
        "bad-let.ts:top-level-statement",
        "bad-const.ts:top-level-statement",
        "bad-let-arrow.ts:top-level-statement",
        "bad-const-mixed.ts:top-level-statement",
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

  it("does not flag the valid files (including an equality test on lo and hi, a copy of both, and a constant arrow function), a test file, or the helper under __tests__", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    for (const clean of ["answer.ts", "plain.ts", "render.ts", "index.ts", "read-claim.ts", "thing.test.ts", "helper.ts"]) expect(flagged.has(clean), clean).toBe(false);
    expect(result.scanned).toContain("answer.ts");
    expect(result.scanned).not.toContain("thing.test.ts");
  });
});

describe("the real lib/ copied and sabotaged: the rules fire on the real sources and name the file", () => {
  function sabotaged(file: string, extra: string): string {
    const root = tree({});
    cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), TREE_TSCONFIG);
    const target = join(root, "lib", "entail", file);
    writeFileSync(target, `${extra}\n${readFileSync(target, "utf8")}`);
    return root;
  }
  const scan = (root: string): string[] => summariseFindings(scanSources(root, join(root, "tsconfig.json")).findings);

  it("CONTROL: an unmodified copy is clean", () => {
    expect(scan(sabotaged("rule.ts", ""))).toEqual([]);
  });

  it("an import of a Node built-in into render.ts", () => {
    expect(scan(sabotaged("render.ts", 'import "node:fs";'))).toEqual(["render.ts:import-not-allowed"]);
  });

  it("recheck.ts reading what the snapshot is made of: an import of a file inside lib/ground, and of ground's solver", () => {
    expect(scan(sabotaged("recheck.ts", 'import type { Tree } from "../ground/solve.js";'))).toEqual(["recheck.ts:import-not-allowed"]);
    expect(scan(sabotaged("recheck.ts", 'import { solve } from "../ground/solve.js";'))).toEqual(["recheck.ts:import-not-allowed"]);
  });

  it("recheck.ts using the ruler: an import of rule.ts, answer.ts or read-claim.ts", () => {
    for (const sibling of ["rule", "answer", "read-claim"]) expect(scan(sabotaged("recheck.ts", `import "./${sibling}.js";`))).toEqual(["recheck.ts:sibling-not-allowed"]);
  });

  it("rule.ts importing recheck.ts or render.ts, so a ruling would depend on its own checker or its own text", () => {
    expect(scan(sabotaged("rule.ts", 'import "./recheck.js";'))).toEqual(["rule.ts:sibling-not-allowed"]);
    expect(scan(sabotaged("rule.ts", 'import "./render.js";'))).toEqual(["rule.ts:sibling-not-allowed"]);
  });

  it("a module-level cache in answer.ts, the hidden state that would make two calls differ", () => {
    expect(scan(sabotaged("answer.ts", "const cache = new Map();"))).toEqual(["answer.ts:top-level-statement"]);
  });

  it("an import of an extent function the layer does not use, in rule.ts", () => {
    expect(scan(sabotaged("rule.ts", 'import { sumForward } from "../extent/index.js";'))).toEqual(["rule.ts:extent-value-import"]);
  });

  it("an import of ground's schema reader in recheck.ts, which would let it read a schema the holder did not give", () => {
    expect(scan(sabotaged("recheck.ts", 'import { readSchema } from "../ground/index.js";'))).toEqual(["recheck.ts:ground-value-import"]);
  });

  it("a hand-rolled comparison of extent bounds in rule.ts", () => {
    expect(scan(sabotaged("rule.ts", "export function tighter(a: { lo: number }, b: { lo: number }): boolean {\n  return a.lo > b.lo;\n}"))).toEqual(["rule.ts:extent-operator"]);
  });
});

describe("behaviour that follows: no state is shared between calls", () => {
  it("the same call twice gives equal but distinct objects, in any order of calls, and nothing carries over", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const first = entail.answer(g, claim("deliveryDay", null, 12), [claim("packDays", 1, 1)]);
    entail.answer(groundOf(DESK, canon("o3")), claim("customsDays", null, 1), []); // a call in between about other evidence
    const second = entail.answer(g, claim("deliveryDay", null, 12), [claim("packDays", 1, 1)]);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
    if (first.ok && second.ok) {
      expect(second.brief.answer).not.toBe(first.brief.answer);
      expect(entail.recheck(g.schema, first.brief)).toStrictEqual(entail.recheck(g.schema, second.brief));
      expect(entail.renderBrief(g.schema, first.brief)).toBe(entail.renderBrief(g.schema, second.brief));
    }
  });
});

describe("M1's scans see these files, so their silence is not an empty scan", () => {
  it("the closed-module-graph scan parsed every entail source and test, and reports nothing under lib/entail", () => {
    const result = scanModuleGraph({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/entail/${name}`);
    for (const name of TESTS) expect(result.scanned, name).toContain(`lib/entail/__tests__/${name}`);
    expect(summarise(result.violations.filter((v) => v.file.startsWith("lib/entail/")))).toEqual([]);
  });

  it("the determinism guard parsed the seven entail sources and reports nothing under lib/entail (so no Date, no Math.random, no localeCompare)", () => {
    const result = scanDeterminism({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/entail/${name}`);
    expect(result.scanned.some((file) => file.startsWith("lib/entail/__tests__/"))).toBe(false);
    expect(summariseDeterminism(result.violations.filter((v) => v.file.startsWith("lib/entail/")))).toEqual([]);
  });

  it("the file inventory (no non-.ts file, no symlink) reports nothing under lib/entail", () => {
    expect(summarise(scanInventory(REPO_ROOT).filter((v) => v.file.startsWith("lib/entail/")))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The types are the plan's.
// ---------------------------------------------------------------------------------------------------------

// BEGIN PLAN COPY (section 4.1, the lib/entail block; every name that block defines is prefixed Plan)
export type PlanClaimRead = { readonly ok: true; readonly claim: Claim } | { readonly ok: false; readonly fault: ClaimFault };
export type PlanRuleResult = { readonly ok: true; readonly entailment: Entailment } | { readonly ok: false; readonly fault: ClaimFault };
export type PlanAnswerFailure =
  | { readonly kind: "question-rejected"; readonly fault: ClaimFault }
  | { readonly kind: "draft-not-an-array" }
  | { readonly kind: "draft-too-long"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };
export type PlanAnswerResult = { readonly ok: true; readonly brief: Brief } | { readonly ok: false; readonly failure: PlanAnswerFailure };
export type PlanNotReproduced =
  | { readonly kind: "missing-evidence"; readonly id: ObsId }
  | { readonly kind: "evidence-rejected"; readonly fault: ObservationFault }
  | { readonly kind: "support-conflicted" }
  | { readonly kind: "bound-differs"; readonly side: Side; readonly carried: Bound; readonly rederived: Bound }
  | { readonly kind: "kind-differs"; readonly carried: Entailment["kind"]; readonly rederived: Entailment["kind"] }
  | { readonly kind: "unmet-differs" }
  | { readonly kind: "core-satisfiable" };
export type PlanReproduction =
  | { readonly kind: "reproduced"; readonly silentSides: readonly Side[] }    // every evidence-backed bound re-derived from the carried evidence alone; silentSides = bounds with empty support, which the carried evidence cannot certify
  | { readonly kind: "not-reproduced"; readonly reason: PlanNotReproduced }
  | { readonly kind: "uncertifiable-silence" };                               // an `ungrounded` claim: an absence cannot be certified from a subset
export interface PlanRecheckFinding { readonly position: "answer" | number; readonly result: PlanReproduction }
export type PlanRecheckResult =
  | { readonly ok: true; readonly intact: boolean; readonly findings: NonEmptyReadonlyArray<PlanRecheckFinding> }
  | { readonly ok: false; readonly failure: GroundFailure };
// END PLAN COPY

type _ClaimRead = Assert<Equal<ClaimRead, PlanClaimRead>>;
type _RuleResult = Assert<Equal<RuleResult, PlanRuleResult>>;
type _AnswerFailure = Assert<Equal<AnswerFailure, PlanAnswerFailure>>;
type _AnswerResult = Assert<Equal<AnswerResult, PlanAnswerResult>>;
type _NotReproduced = Assert<Equal<NotReproduced, PlanNotReproduced>>;
type _Reproduction = Assert<Equal<Reproduction, PlanReproduction>>;
type _RecheckFinding = Assert<Equal<RecheckFinding, PlanRecheckFinding>>;
type _RecheckResult = Assert<Equal<RecheckResult, PlanRecheckResult>>;
// the six function signatures, as the plan declares them (the plan's lines are checked verbatim below)
type _ReadClaim = Assert<Equal<typeof entail.readClaim, (g: Grounding, raw: unknown) => PlanClaimRead>>;
type _Rule = Assert<Equal<typeof entail.rule, (g: Grounding, raw: unknown) => PlanRuleResult>>;
type _Answer = Assert<Equal<typeof entail.answer, (g: Grounding, rawQuestion: unknown, rawDraft: unknown) => PlanAnswerResult>>;
type _RenderEntailment = Assert<Equal<typeof entail.renderEntailment, (schema: Schema, e: Entailment) => string>>;
type _RenderBrief = Assert<Equal<typeof entail.renderBrief, (schema: Schema, brief: Brief) => string>>;
type _Recheck = Assert<Equal<typeof entail.recheck, (schema: Schema, brief: Brief) => PlanRecheckResult>>;
export type Proofs = [_ClaimRead, _RuleResult, _AnswerFailure, _AnswerResult, _NotReproduced, _Reproduction, _RecheckFinding, _RecheckResult, _ReadClaim, _Rule, _Answer, _RenderEntailment, _RenderBrief, _Recheck];
export type Unused = [FieldId];

describe("the types are the plan's", () => {
  const plan = readFileSync(join(REPO_ROOT, ".genesis", "PLAN.md"), "utf8");
  const start = plan.indexOf("// FILE: lib/entail/index.ts   (M5)");
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

  it("the plan block was found, and declares the eight types and six functions this test lists", () => {
    expect(start).toBeGreaterThan(0);
    expect([...declarations(planBlock).keys()].sort()).toEqual([...TYPES].sort());
    for (const line of [
      "export declare function readClaim(g: Grounding, raw: unknown): ClaimRead;",
      "export declare function rule(g: Grounding, raw: unknown): RuleResult;",
      "export declare function answer(g: Grounding, rawQuestion: unknown, rawDraft: unknown): AnswerResult;",
      "export declare function renderEntailment(schema: Schema, e: Entailment): string;",
      "export declare function renderBrief(schema: Schema, brief: Brief): string;",
      "export declare function recheck(schema: Schema, brief: Brief): RecheckResult;",
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
// recheck has nothing to read a snapshot from; a Grounding that disagrees with itself ends the call.
// ---------------------------------------------------------------------------------------------------------

describe("recheck takes the holder's schema and a Brief and nothing else, and the calls on a self-contradicting Grounding end", () => {
  it("recheck has two parameters, and a third argument is not read (no snapshot reaches it)", () => {
    expect(entail.recheck.length).toBe(2);
    const g = groundOf(DESK, canon("o1", "o2"));
    const made = entail.answer(g, claim("deliveryDay", 4, null), []);
    if (!made.ok) throw new Error("fixture");
    const snapshotOfAnotherWorld = groundOf(DESK, canon("o1", "o2", "o3", "o4"));
    const withExtra = (entail.recheck as unknown as (schema: Schema, brief: Brief, snapshot: unknown) => unknown)(g.schema, made.brief, snapshotOfAnotherWorld);
    expect(withExtra).toStrictEqual(entail.recheck(g.schema, made.brief));
  });

  it("a Brief is judged against the carried evidence and not against what a snapshot says: the same Brief against a grounding of other observations gives the same findings", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const made = entail.answer(g, claim("deliveryDay", 4, null), []);
    if (!made.ok) throw new Error("fixture");
    const before = entail.recheck(g.schema, made.brief);
    groundOf(DESK, canon("o3", "o4")); // another world exists in the same process; nothing about it can matter
    expect(entail.recheck(g.schema, made.brief)).toStrictEqual(before);
  });

  it("rule and answer on a hand-built Grounding whose schema has a cycle end promptly: a value or an internal-invariant throw, never a loop", () => {
    const cyclic = { fields: [base("a"), derived("x", ["y", "a"]), derived("y", ["x", "a"])] } as unknown as Schema;
    const zero = { lo: 0, hi: null };
    const g = {
      schema: cyclic,
      observations: [{ id: "k", field: "a", extent: { lo: 1, hi: 1 }, quote: "1", source: "s" }],
      baseline: [{ field: "a", extent: zero }, { field: "x", extent: zero }, { field: "y", extent: zero }],
      trees: [{ root: "x", fields: ["a", "x", "y"], state: { kind: "consistent", extents: [{ field: "a", extent: zero }, { field: "x", extent: zero }, { field: "y", extent: zero }] } }],
    } as unknown as Grounding;
    const outcomes: string[] = [];
    for (const call of [() => entail.rule(g, claim("x", 3, null)), () => entail.answer(g, claim("x", 3, null), [claim("y", 2, null)]), () => entail.readClaim(g, claim("x", 3, null))]) {
      try {
        call();
        outcomes.push("returned");
      } catch (error) {
        outcomes.push(error instanceof Error && /internal invariant/.test(error.message) ? "threw an internal invariant" : `threw ${String(error)}`);
      }
    }
    expect(outcomes.every((o) => o === "returned" || o === "threw an internal invariant"), outcomes.join("; ")).toBe(true);
  }, 2000);

  it("a Grounding that is not the engine's (an empty object, null) is a hostile read that throws or returns, but never loops", () => {
    for (const bad of [{}, null, { baseline: [], schema: { fields: [] }, observations: [], trees: [] }]) {
      const started = Date.now();
      try {
        entail.rule(bad as unknown as Grounding, claim("packDays", 1, 2));
      } catch {
        // a throw is allowed: a Grounding is the engine's own data, not an untrusted input
      }
      expect(Date.now() - started).toBeLessThan(1000);
    }
  });
});
