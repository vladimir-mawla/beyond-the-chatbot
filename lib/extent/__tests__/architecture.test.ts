import { cpSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isExportDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedExports,
  isNamedImports,
  isTypeAliasDeclaration,
  SyntaxKind,
} from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";
import { parseFile, withProject } from "../../contracts/__tests__/support/ast.js";
import { scanDeterminism, summariseDeterminism } from "../../contracts/__tests__/support/determinism.js";
import { referencesIn, scanInventory, scanModuleGraph, summarise } from "../../contracts/__tests__/support/module-graph.js";
import { TREE_TSCONFIG, tree, useTrees } from "../../contracts/__tests__/support/fixtures.js";
import * as extent from "../index.js";
import type { Extent } from "../../contracts/index.js";
import { gridExtents, GRID_VALUES } from "./fixtures.js";

/**
 * WHAT `lib/extent` IS ALLOWED TO BE (`.genesis/PLAN.md` section 5: `lib/extent` imports `contracts`; section 6 M3:
 * "pure, total and framework-free"). Five kinds of test:
 *  1. The file inventory: `lib/extent` holds exactly the files the plan's M3 lists, and nothing else.
 *  2. The public surface: the seven functions and `ExtentCheck`, read at run time and by the parser.
 *  3. The import closure of the SOURCES, stricter than M1's layer table: only `../contracts/index.js` (never one
 *     of its internal files) and this directory's own sources; from `contracts` only the type names and the one
 *     VALUE `MAX_MAGNITUDE`. So there is no framework, no Node built-in and no other layer to be impure with.
 *     The rule is run on the real tree AND on a synthetic tree with one violation per file, so it is seen to fire.
 *  4. No module-level state: a source holds only imports, re-exports, function declarations and types. A module
 *     level `let` is mutable state; a module level `const` such as a shared `{ lo: null, hi: null }` handed out
 *     by reference is the same hazard (a caller edits it and every later answer changes), so none exists.
 *  5. Behaviour that follows from 4: deeply frozen arguments are accepted, and no result is ever an argument or an
 *     earlier result.
 * M1's closed-module-graph scan and determinism guard (`lib/contracts/__tests__/`) already read `lib/**`; the last
 * section here only shows that they SEE these files, so their silence is not an empty scan.
 *
 * NOT covered: that a function reads no global (that is M1's determinism guard, a list of banned names), and that
 * it is deterministic in a way a list of names cannot see. Synthetic trees live under the OS temp directory.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");
const EXTENT_DIR = join(REPO_ROOT, "lib", "extent");

const SOURCES = ["check-extent.ts", "index.ts", "meet.ts", "subset.ts", "sum.ts", "unmet.ts"];
const TESTS = [
  "architecture.test.ts",
  "boundaries.test.ts",
  "check-extent.test.ts",
  "fixtures.ts",
  "hostile-input.test.ts",
  "meet-subset.test.ts",
  "sum-exactness.test.ts",
  "unmet.test.ts",
];
const FUNCTIONS = ["checkExtent", "isSameExtent", "isSubset", "meet", "sumBackward", "sumForward", "unmetSides"];

describe("the file inventory: exactly the files plan section 6 lists for M3", () => {
  it("six sources, and in __tests__ the seven named test files plus fixtures.ts", () => {
    expect(readdirSync(EXTENT_DIR).sort()).toEqual(["__tests__", ...SOURCES].sort());
    expect(readdirSync(join(EXTENT_DIR, "__tests__")).sort()).toEqual([...TESTS].sort());
  });
});

describe("the public surface of index.ts: the plan's seven functions and ExtentCheck", () => {
  it("run time: exactly the seven functions, all functions (satisfiesLo and satisfiesHi stay internal)", () => {
    expect(Object.keys(extent).sort()).toEqual([...FUNCTIONS].sort());
    for (const name of FUNCTIONS) expect(typeof (extent as Record<string, unknown>)[name], name).toBe("function");
  });

  it("as the parser reads it: those seven values, one type, ExtentCheck, no `export *`, only this directory's modules", () => {
    const exported = withProject(REPO_TSCONFIG, (project) => {
      const sf = parseFile(project, join(EXTENT_DIR, "index.ts"));
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
    expect(exported.types).toEqual(["ExtentCheck"]);
    expect([...exported.sources].sort()).toEqual(["./check-extent.js", "./meet.js", "./subset.js", "./sum.js", "./unmet.js"]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The import closure and the no-module-state rule, as a scan that can be pointed at a synthetic tree.
// ---------------------------------------------------------------------------------------------------------

type Rule = "import-not-allowed" | "contracts-value-import" | "top-level-statement" | "unparseable";
interface Finding {
  readonly file: string;
  readonly rule: Rule;
}

/** The only VALUE `lib/extent` may take from `contracts`: the cap `checkExtent` enforces. */
const ALLOWED_CONTRACT_VALUES: ReadonlySet<string> = new Set(["MAX_MAGNITUDE"]);

/** Scan the non-test sources directly inside `<root>/lib/extent`. */
function scanSources(rootDir: string, tsconfig: string): { findings: Finding[]; scanned: string[] } {
  const root = realpathSync(rootDir);
  const dir = join(root, "lib", "extent");
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();
  const siblings = new Set(names);
  const findings: Finding[] = [];
  const scanned: string[] = [];
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

      // 1. Every module reference, however it is written (import, export from, import type, import(), require, /// <reference>).
      for (const ref of referencesIn(sf)) {
        const sibling = ref.specifier !== null ? /^\.\/([a-z-]+)\.js$/.exec(ref.specifier) : null;
        const isSibling = sibling !== null && siblings.has(`${sibling[1]}.ts`);
        if (!isSibling && ref.specifier !== "../contracts/index.js") report("import-not-allowed");
      }

      for (const node of sf.statements) {
        if (isImportDeclaration(node)) {
          // 2. From contracts: types, plus the one allowed value. A default or namespace import is a value import.
          const specifier = (node.moduleSpecifier as unknown as { text: string }).text;
          const clause = node.importClause;
          if (specifier === "../contracts/index.js" && clause !== undefined && clause.phaseModifier !== SyntaxKind.TypeKeyword) {
            const bindings = clause.namedBindings;
            const valueNames: string[] = [];
            if (clause.name !== undefined) valueNames.push("default");
            if (bindings !== undefined && !isNamedImports(bindings)) valueNames.push("*");
            if (bindings !== undefined && isNamedImports(bindings)) {
              for (const element of bindings.elements) if (!element.isTypeOnly) valueNames.push((element.propertyName ?? element.name).text);
            }
            if (valueNames.some((n) => !ALLOWED_CONTRACT_VALUES.has(n))) report("contracts-value-import");
          }
        } else if (!(isExportDeclaration(node) || isFunctionDeclaration(node) || isTypeAliasDeclaration(node) || isInterfaceDeclaration(node))) {
          // 3. Nothing else at module level: no let, no const, no statement that runs.
          report("top-level-statement");
        }
      }
    }
  });
  return { findings, scanned };
}

const summariseFindings = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.file}:${f.rule}`).sort();

describe("the import closure and the no-module-state rule hold on the real sources", () => {
  const result = scanSources(REPO_ROOT, REPO_TSCONFIG);

  it("really scanned the six sources (an empty scan passing proves nothing)", () => {
    expect(result.scanned).toEqual(SOURCES);
  });

  it("has no finding", () => {
    expect(summariseFindings(result.findings)).toEqual([]);
  });

  it("the real sources import from contracts only through index.js, and MAX_MAGNITUDE is the only value taken", () => {
    const text = SOURCES.map((name) => readFileSync(join(EXTENT_DIR, name), "utf8")).join("\n");
    const contractImports = [...text.matchAll(/from "(\.\.\/[^"]+)"/g)].map((m) => m[1]);
    expect(contractImports.length).toBeGreaterThan(0);
    expect(new Set(contractImports)).toEqual(new Set(["../contracts/index.js"]));
    expect(text).toContain('import { MAX_MAGNITUDE } from "../contracts/index.js";');
  });
});

describe("a synthetic tree with one violation per file: each is reported, and the valid files beside them are not", () => {
  const files: Record<string, string> = {
    // ---- valid: the scan has something to wrongly flag ----
    "lib/contracts/index.ts": "export const MAX_MAGNITUDE = 1;\n",
    "lib/extent/ok-a.ts": 'import type { Extent } from "../contracts/index.js";\nimport { MAX_MAGNITUDE } from "../contracts/index.js";\nimport { b } from "./ok-b.js";\nexport function a(e: Extent | null): number {\n  return MAX_MAGNITUDE + b(e);\n}\n',
    "lib/extent/ok-b.ts": "export function b(e: unknown): number {\n  return e === null ? 0 : 1;\n}\nexport type Alias = number;\nexport interface Shape {\n  readonly n: number;\n}\n",
    "lib/extent/ok-inline-type.ts": 'import { type Extent, MAX_MAGNITUDE } from "../contracts/index.js";\nexport function c(e: Extent): number {\n  return MAX_MAGNITUDE + (e.lo ?? 0);\n}\n',
    "lib/extent/ok-reexport.ts": 'export { b } from "./ok-b.js";\nexport type { Alias } from "./ok-b.js";\n',
    "lib/extent/__tests__/helper.ts": 'import "node:fs";\nexport const helper = 1;\n',
    "lib/extent/thing.test.ts": 'import "node:fs";\nexport const t = 1;\n',
    // ---- one violation each ----
    "lib/extent/bad-external.ts": 'import "node:fs";\n',
    "lib/extent/bad-package.ts": 'import "react";\n',
    "lib/extent/bad-other-layer.ts": 'import { g } from "../ground/index.js";\nexport function f(): unknown {\n  return g;\n}\n',
    "lib/extent/bad-deep-contracts.ts": 'import type { Brief } from "../contracts/brief.js";\nexport type T = Brief;\n',
    "lib/extent/bad-test-import.ts": 'import "./__tests__/helper.js";\n',
    "lib/extent/bad-test-file-import.ts": 'import { t } from "./thing.test.js";\nexport function f(): number {\n  return t;\n}\n',
    "lib/extent/bad-export-from.ts": 'export { x } from "../ground/index.js";\n',
    "lib/extent/bad-dynamic.ts": 'export function f(): Promise<unknown> {\n  return import("node:os");\n}\n',
    "lib/extent/bad-value.ts": 'import { MAX_FIELDS } from "../contracts/index.js";\nexport function f(): number {\n  return MAX_FIELDS;\n}\n',
    "lib/extent/bad-value-mixed.ts": 'import { MAX_MAGNITUDE, MAX_FIELDS } from "../contracts/index.js";\nexport function f(): number {\n  return MAX_MAGNITUDE + MAX_FIELDS;\n}\n',
    "lib/extent/bad-value-renamed.ts": 'import { MAX_FIELDS as M } from "../contracts/index.js";\nexport function f(): number {\n  return M;\n}\n',
    "lib/extent/bad-namespace.ts": 'import * as c from "../contracts/index.js";\nexport function f(): unknown {\n  return c;\n}\n',
    "lib/extent/bad-default.ts": 'import c from "../contracts/index.js";\nexport function f(): unknown {\n  return c;\n}\n',
    "lib/extent/bad-let.ts": "let n = 0;\nexport function f(): number {\n  n += 1;\n  return n;\n}\n",
    "lib/extent/bad-var.ts": "var n = 0;\nexport function f(): number {\n  return n;\n}\n",
    "lib/extent/bad-const.ts": "const SHARED = { lo: null, hi: null };\nexport function f(): unknown {\n  return SHARED;\n}\n",
    "lib/extent/bad-exported-const.ts": "export const NONE = { lo: null, hi: null };\n",
    "lib/extent/bad-call.ts": 'console.log("loaded");\n',
    "lib/extent/bad-class.ts": "export class Box {\n  value = 0;\n}\n",
    "lib/extent/bad-syntax.ts": "export function = ;\n",
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
        "bad-test-import.ts:import-not-allowed",
        "bad-test-file-import.ts:import-not-allowed",
        "bad-export-from.ts:import-not-allowed",
        "bad-dynamic.ts:import-not-allowed",
        "bad-value.ts:contracts-value-import",
        "bad-value-mixed.ts:contracts-value-import",
        "bad-value-renamed.ts:contracts-value-import",
        "bad-namespace.ts:contracts-value-import",
        "bad-default.ts:contracts-value-import",
        "bad-let.ts:top-level-statement",
        "bad-var.ts:top-level-statement",
        "bad-const.ts:top-level-statement",
        "bad-exported-const.ts:top-level-statement",
        "bad-call.ts:top-level-statement",
        "bad-class.ts:top-level-statement",
        "bad-syntax.ts:unparseable",
      ].sort(),
    );
  });

  it("does not flag the valid files, a test file, or the helper under __tests__", () => {
    const flagged = new Set(result.findings.map((f) => f.file));
    for (const clean of ["ok-a.ts", "ok-b.ts", "ok-inline-type.ts", "ok-reexport.ts", "thing.test.ts", "helper.ts"]) expect(flagged.has(clean), clean).toBe(false);
    expect(result.scanned).toContain("ok-a.ts");
    expect(result.scanned).not.toContain("thing.test.ts");
  });
});

describe("the real lib/ copied and sabotaged: the rules fire on the real sources and name the file", () => {
  /** A synthetic root holding a copy of the REAL `lib/`, with one extent source given extra text at the top. */
  function sabotaged(file: string, extra: string): string {
    const root = tree({});
    cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), TREE_TSCONFIG);
    const target = join(root, "lib", "extent", file);
    writeFileSync(target, `${extra}\n${readFileSync(target, "utf8")}`);
    return root;
  }
  const scan = (root: string): string[] => summariseFindings(scanSources(root, join(root, "tsconfig.json")).findings);

  it("CONTROL: an unmodified copy is clean", () => {
    expect(scan(sabotaged("sum.ts", ""))).toEqual([]);
  });

  it("an import of a Node built-in into meet.ts", () => {
    expect(scan(sabotaged("meet.ts", 'import "node:fs";'))).toEqual(["meet.ts:import-not-allowed"]);
  });

  it("a module-level counter in sum.ts", () => {
    expect(scan(sabotaged("sum.ts", "let calls = 0;"))).toEqual(["sum.ts:top-level-statement"]);
  });

  it("a shared constant handed out by reference in unmet.ts", () => {
    expect(scan(sabotaged("unmet.ts", "const BOTH = [];"))).toEqual(["unmet.ts:top-level-statement"]);
  });

  it("a value import of another cap in check-extent.ts", () => {
    expect(scan(sabotaged("check-extent.ts", 'import { MAX_FIELDS } from "../contracts/index.js";'))).toEqual(["check-extent.ts:contracts-value-import"]);
  });
});

describe("behaviour that follows: nothing is mutated, nothing is shared, repeating a call gives the same answer", () => {
  const GRID = gridExtents(GRID_VALUES);
  const freezeAll = (e: Extent): Extent => Object.freeze({ ...e });
  const FROZEN = GRID.map(freezeAll);
  const frozenList = (...items: Extent[]): readonly Extent[] => Object.freeze(items);

  it("every function accepts deeply frozen arguments over the grid (a write to an argument would throw in strict mode)", () => {
    let calls = 0;
    for (const a of FROZEN) {
      for (const b of FROZEN) {
        const operands = frozenList(a, b) as unknown as readonly [Extent, ...Extent[]];
        extent.meet(a, b);
        extent.isSubset(a, b);
        extent.isSameExtent(a, b);
        extent.unmetSides(a, b);
        extent.sumForward(operands);
        extent.sumBackward(a, operands, 0);
        extent.sumBackward(a, operands, 5);
        calls += 7;
      }
      extent.checkExtent(Object.freeze({ lo: a.lo, hi: a.hi }));
      calls += 1;
    }
    expect(calls).toBe(34 * 34 * 7 + 34);
  });

  it("no answer is an argument or an earlier answer, and the same call twice gives equal but distinct objects", () => {
    for (const a of FROZEN) {
      for (const b of FROZEN) {
        const operands = frozenList(a, b) as unknown as readonly [Extent, ...Extent[]];
        const answers: (Extent | undefined)[][] = [
          [extent.meet(a, b), extent.meet(a, b)],
          [extent.sumForward(operands), extent.sumForward(operands)],
          [extent.sumBackward(a, operands, 0), extent.sumBackward(a, operands, 0)],
          [extent.sumBackward(a, operands, 9), extent.sumBackward(a, operands, 9)],
        ];
        for (const [first, second] of answers) {
          expect(second).toStrictEqual(first);
          if (first === undefined || second === undefined) continue;
          expect(first).not.toBe(second);
          for (const argument of [a, b]) expect(first).not.toBe(argument);
        }
      }
    }
  });
});

describe("M1's scans see these files, so their silence is not an empty scan", () => {
  it("the closed-module-graph scan parsed every extent source and test, and reports nothing under lib/extent", () => {
    const result = scanModuleGraph({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/extent/${name}`);
    for (const name of TESTS) expect(result.scanned, name).toContain(`lib/extent/__tests__/${name}`);
    expect(summarise(result.violations.filter((v) => v.file.startsWith("lib/extent/")))).toEqual([]);
  });

  it("the determinism guard parsed the six extent sources and reports nothing under lib/extent", () => {
    const result = scanDeterminism({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });
    for (const name of SOURCES) expect(result.scanned, name).toContain(`lib/extent/${name}`);
    expect(result.scanned.some((file) => file.startsWith("lib/extent/__tests__/"))).toBe(false); // tests are not scanned, by M1's design
    expect(summariseDeterminism(result.violations.filter((v) => v.file.startsWith("lib/extent/")))).toEqual([]);
  });

  it("the file inventory (no non-.ts file, no symlink) reports nothing under lib/extent", () => {
    expect(summarise(scanInventory(REPO_ROOT).filter((v) => v.file.startsWith("lib/extent/")))).toEqual([]);
  });
});
