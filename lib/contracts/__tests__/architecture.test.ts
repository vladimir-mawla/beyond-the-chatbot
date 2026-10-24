import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TREE_TSCONFIG, tree, useTrees } from "./support/fixtures.js";
import { LAYERS, SOURCE_EXTERNALS, TEST_EXTERNALS, scanModuleGraph, summarise } from "./support/module-graph.js";

/**
 * THE CLOSED MODULE GRAPH AND THE LAYER TABLE (`.genesis/PLAN.md` section 5, section 6 M1 (e)). The rules, and
 * what they do NOT cover, are written out at the top of `support/module-graph.ts`.
 *
 * Four kinds of test:
 *  1. The REAL repository: the scan finds nothing, and really parsed the files (an empty scan passing proves
 *     nothing).
 *  2. A synthetic tree with exactly ONE violation per file: each file must be reported with that rule and
 *     nothing else, so a rule that stopped firing, or fired on the wrong file, is a specific mismatch.
 *  3. The layer table, EXHAUSTIVELY: one importer file for every (importer layer, imported layer) pair, with the
 *     expected verdict taken from the plan's order written out in this test, not from the table under test.
 *  4. The real `lib/` COPIED and sabotaged (`import "node:fs"`, an import of a test helper): the rule fires on the
 *     real sources, and the report names the file.
 * Synthetic trees live under the OS temp directory (this milestone's tests never write inside `lib/`).
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");

describe("this repository: lib/ is a closed module graph and obeys the layer table", () => {
  const result = scanModuleGraph({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });

  it("has no violation", () => {
    expect(summarise(result.violations)).toEqual([]);
  });

  it("really parsed the contract sources and its own tests (not an empty scan passing)", () => {
    expect(result.scanned.length).toBeGreaterThanOrEqual(35);
    for (const expected of [
      "lib/contracts/ids.ts",
      "lib/contracts/entailment.ts",
      "lib/contracts/index.ts",
      "lib/contracts/__tests__/architecture.test.ts",
      "lib/contracts/__tests__/support/module-graph.ts",
      "lib/contracts/__tests__/proofs/entailment-forbidden.proofs.ts",
    ]) {
      expect(result.scanned, expected).toContain(expected);
    }
  });

  it("every allowlisted external for tests is imported by some file, so no allowance is speculative", () => {
    expect([...result.externalsUsed].sort()).toEqual([...TEST_EXTERNALS].sort());
  });

  it("library source imports nothing from outside lib/: not a package, not a Node built-in", () => {
    expect([...SOURCE_EXTERNALS]).toEqual([]);
    const sources = result.scanned.filter((f) => f.startsWith("lib/") && !f.includes("/__tests__/"));
    expect(sources.length).toBeGreaterThanOrEqual(12);
  });

  it("the test allowlist is exactly the documented seven", () => {
    expect([...TEST_EXTERNALS].sort()).toEqual(
      ["node:child_process", "node:fs", "node:os", "node:path", "typescript/unstable/ast", "typescript/unstable/sync", "vitest"].sort(),
    );
  });

  it("the layer table lists the layers of plan section 5, in order, with the three top peers at one rank", () => {
    expect(LAYERS.map((l) => l.dir)).toEqual([
      "lib/contracts",
      "lib/extent",
      "lib/ground",
      "lib/entail",
      "domains",
      "scripts",
      "components",
      "app",
    ]);
    expect(LAYERS.map((l) => l.rank)).toEqual([0, 1, 2, 3, 4, 5, 5, 5]);
  });
});

describe("a synthetic tree with one violation per file: each is reported, and the valid imports beside them are not", () => {
  const files: Record<string, string> = {
    // ---- valid, so the scan has something to wrongly flag ----
    "lib/contracts/base.ts": "export const base = 1;\n",
    "lib/contracts/index.ts": "export const idx = 1;\n",
    "lib/extent/cycle-a.ts": 'import { base } from "../contracts/base.js";\nexport const a = base;\n', // deep import of a lower layer is allowed
    "lib/ground/back.ts": 'import { a } from "../extent/cycle-a.js";\nexport const b = a;\n',
    "lib/entail/index.ts": "export const e = 1;\n",
    "lib/ground/index.ts": "export const g = 1;\n",
    "domains/company/ok.ts": 'import { e } from "../../lib/entail/index.js";\nimport { idx } from "../../lib/contracts/index.js";\nexport const c = e + idx;\n',
    "domains/company/sibling-ok.ts": 'import { c } from "./ok.js";\nexport const s = c;\n',
    "lib/contracts/__tests__/t-ok.ts": 'import "vitest";\nimport "node:fs";\nimport { base } from "../base.js";\nexport const t = base;\n',
    "lib/contracts/__tests__/helper.ts": "export const h = 1;\n",
    "lib/contracts/__tests__/t-uses-test-ok.ts": 'import { h } from "./helper.js";\nexport const t2 = h;\n', // a test may import a test
    "domains/company/__tests__/t-internal-ok.ts": 'import { g } from "../../../lib/ground/index.js";\nimport "../../../lib/ground/solve.js";\nexport const t3 = g;\n', // a domain TEST may import internals
    "lib/ground/solve.ts": "export const solve = 1;\n",
    // ---- one violation each ----
    "lib/contracts/cycle-b.ts": 'import { a } from "../extent/cycle-a.js";\nexport const x = a;\n', // contracts -> extent, closing a cycle
    "lib/extent/up.ts": 'import { b } from "../ground/back.js";\nexport const y = b;\n', // extent -> ground
    "domains/company/up.ts": 'import { p } from "../../app/p.js";\nexport const z = p;\n', // domains -> app
    "app/p.ts": "export const p = 1;\n",
    "scripts/x.ts": "export const X = 1;\n",
    "scripts/x.d.ts": "export declare const X: number;\n",
    "node_modules/pkg/index.ts": "export const pkg = 1;\n",
    "lib/contracts/outside.ts": 'import { X } from "../../scripts/x.js";\nexport const o = X;\n',
    "lib/contracts/nm.ts": 'import { pkg } from "../../node_modules/pkg/index.js";\nexport const n = pkg;\n', // relative AND resolves out
    "lib/contracts/exportfrom.ts": 'export * from "../../scripts/x.js";\n',
    "lib/contracts/typeimport.ts": 'export type T = import("../../scripts/x.js").X;\n',
    "lib/contracts/typeof-import.ts": 'export type U = typeof import("../../scripts/x.js");\n',
    "lib/contracts/ref.ts": '/// <reference path="../../scripts/x.d.ts" />\nexport {};\n',
    "lib/contracts/bare.ts": 'import "node:fs";\n',
    "lib/contracts/pkg-import.ts": 'import "react";\n',
    "lib/contracts/req.ts": 'declare const require: (id: string) => unknown;\nexport const r = require("node:fs");\n',
    "lib/contracts/dyn.ts": "declare const id: string;\nexport const d = import(id);\n",
    "lib/contracts/dyn-literal.ts": 'export const d2 = import("node:os");\n',
    "lib/contracts/unresolved.ts": 'import "./nope.js";\n',
    "lib/contracts/uses-shared.ts": 'import { h } from "../shared/helper.js";\nexport const s = h;\n',
    "lib/shared/helper.ts": "export const h = 1;\n",
    "lib/loose.ts": "export const loose = 1;\n",
    "lib/contracts/viasym.ts": 'import { evil } from "./linkdir/evil.js";\nexport const v = evil;\n',
    "external/evil.ts": "export const evil = 1;\n",
    "lib/contracts/__tests__/t-react.ts": 'import "react";\n',
    // ---- the rule the sibling project's graph test was missing: a source may not resolve into a test ----
    "lib/contracts/uses-test-dir.ts": 'import { h } from "./__tests__/helper.js";\nexport const u1 = h;\n',
    "lib/contracts/uses-test-dir-index.ts": 'import "./__tests__/withindex";\nexport const u2 = 1;\n',
    "lib/contracts/__tests__/withindex/index.ts": "export const wi = 1;\n",
    "lib/contracts/uses-test-file.ts": 'import { tf } from "./thing.test.js";\nexport const u3 = tf;\n',
    "lib/contracts/thing.test.ts": "export const tf = 1;\n",
    "lib/contracts/uses-test-reexport.ts": 'export { h } from "./__tests__/helper.js";\n',
    "lib/contracts/uses-test-dynamic.ts": 'export const u4 = import("./__tests__/helper.js");\n',
    "lib/contracts/uses-test-type.ts": 'export type U5 = typeof import("./__tests__/helper.js");\n',
    "lib/contracts/uses-test-via-symlink.ts": 'import { h } from "./testlink/helper.js";\nexport const u6 = h;\n',
    "lib/ground/uses-test-from-other-layer.ts": 'import { h } from "../contracts/__tests__/helper.js";\nexport const u7 = h;\n',
    "domains/company/uses-test.ts": 'import { dt } from "./__tests__/dhelper.js";\nexport const u8 = dt;\n',
    "domains/company/__tests__/dhelper.ts": "export const dt = 1;\n",
    // ---- domains: only inside domains/ or a lib layer's index ----
    "domains/company/internal.ts": 'import { solve } from "../../lib/ground/solve.js";\nexport const i1 = solve;\n',
    "domains/company/pkg.ts": 'import "react";\nexport const i2 = 1;\n',
    "domains/company/tests-dir.ts": 'import { th } from "../../tests/helpers.js";\nexport const i3 = th;\n',
    "tests/helpers.ts": "export const th = 1;\n",
  };
  const root = tree(files, { "lib/contracts/linkdir": "external", "lib/contracts/testlink": "lib/contracts/__tests__" });
  const result = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") });

  it("reports exactly these file:rule pairs", () => {
    expect(summarise(result.violations)).toEqual(
      [
        "domains/company/internal.ts:domain-import-not-allowed",
        "domains/company/pkg.ts:domain-import-not-allowed",
        "domains/company/tests-dir.ts:domain-import-not-allowed",
        "domains/company/up.ts:upward-layer-import",
        "domains/company/uses-test.ts:source-imports-test",
        "lib/contracts/__tests__/t-react.ts:external-not-allowed",
        "lib/contracts/bare.ts:external-not-allowed",
        "lib/contracts/cycle-b.ts:upward-layer-import",
        "lib/contracts/dyn-literal.ts:external-not-allowed",
        "lib/contracts/dyn.ts:non-literal-specifier",
        "lib/contracts/exportfrom.ts:outside-lib",
        "lib/contracts/nm.ts:outside-lib",
        "lib/contracts/outside.ts:outside-lib",
        "lib/contracts/pkg-import.ts:external-not-allowed",
        "lib/contracts/ref.ts:outside-lib",
        "lib/contracts/req.ts:external-not-allowed",
        "lib/contracts/typeimport.ts:outside-lib",
        "lib/contracts/typeof-import.ts:outside-lib",
        "lib/contracts/unresolved.ts:unresolvable",
        "lib/contracts/uses-shared.ts:import-of-undeclared-lib-directory",
        "lib/contracts/uses-test-dir-index.ts:source-imports-test",
        "lib/contracts/uses-test-dir.ts:source-imports-test",
        "lib/contracts/uses-test-dynamic.ts:source-imports-test",
        "lib/contracts/uses-test-file.ts:source-imports-test",
        "lib/contracts/uses-test-reexport.ts:source-imports-test",
        "lib/contracts/uses-test-type.ts:source-imports-test",
        "lib/contracts/uses-test-via-symlink.ts:source-imports-test",
        "lib/contracts/viasym.ts:outside-lib",
        "lib/extent/up.ts:upward-layer-import",
        "lib/ground/uses-test-from-other-layer.ts:source-imports-test",
        "lib/loose.ts:undeclared-lib-directory",
        "lib/shared/helper.ts:undeclared-lib-directory",
      ].sort(),
    );
  });

  it("names the offending specifier and line", () => {
    const nm = result.violations.find((v) => v.file === "lib/contracts/nm.ts");
    expect(nm).toMatchObject({ line: 1, specifier: "../../node_modules/pkg/index.js", rule: "outside-lib" });
    const ref = result.violations.find((v) => v.file === "lib/contracts/ref.ts");
    expect(ref).toMatchObject({ line: 1, specifier: "../../scripts/x.d.ts" });
    const test = result.violations.find((v) => v.file === "lib/contracts/uses-test-dir.ts");
    expect(test).toMatchObject({ line: 1, specifier: "./__tests__/helper.js", rule: "source-imports-test" });
  });

  it("resolves by REAL path: an import through a symlink that points into __tests__ is a source-imports-test, not a pass", () => {
    const viaSymlink = result.violations.find((v) => v.file === "lib/contracts/uses-test-via-symlink.ts");
    expect(viaSymlink).toMatchObject({ specifier: "./testlink/helper.js", rule: "source-imports-test" });
  });

  it("does not flag a test importing a test, a test importing a source, a domain TEST importing lib internals, or any downward import", () => {
    const flagged = new Set(result.violations.map((v) => v.file));
    for (const clean of [
      "lib/contracts/__tests__/t-ok.ts",
      "lib/contracts/__tests__/t-uses-test-ok.ts",
      "domains/company/__tests__/t-internal-ok.ts",
      "lib/extent/cycle-a.ts",
      "lib/ground/back.ts",
      "domains/company/ok.ts",
      "domains/company/sibling-ok.ts",
    ]) {
      expect(flagged.has(clean), clean).toBe(false);
    }
  });
});

describe("the layer table, exhaustively: every (importer, imported) pair against the plan's order", () => {
  // The plan's order, written here independently of `LAYERS`: contracts -> extent -> ground -> entail -> domains -> scripts, components, app.
  const ORDER: readonly (readonly [string, string, number])[] = [
    ["contracts", "lib/contracts", 0],
    ["extent", "lib/extent", 1],
    ["ground", "lib/ground", 2],
    ["entail", "lib/entail", 3],
    ["domains", "domains/d", 4],
    ["scripts", "scripts", 5],
    ["components", "components", 5],
    ["app", "app", 5],
  ];
  /** Only these layers' files are scanned, so only these can be importers. */
  const IMPORTERS = ORDER.filter(([name]) => ["contracts", "extent", "ground", "entail", "domains"].includes(name));

  const files: Record<string, string> = {};
  const expectedBad: string[] = [];
  for (const [target, dir] of ORDER) files[`${dir}/index.ts`] = `export const ${target.replace(/\W/g, "_")}_t = 1;\n`;
  for (const [, importerDir, importerRank] of IMPORTERS) {
    for (const [target, targetDir, targetRank] of ORDER) {
      // `lib/contracts/imp-to-extent.ts` imports `lib/extent/index.ts`, and so on.
      const file = `${importerDir}/imp-to-${target}.ts`;
      if (file === `${targetDir}/index.ts`) continue;
      const up = file.split("/").length - 1; // directories to climb to the root
      files[file] = `import "${"../".repeat(up)}${targetDir}/index.js";\nexport const v = 1;\n`;
      if (targetRank > importerRank) expectedBad.push(file);
    }
  }
  const root = tree(files);
  const result = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") });

  it("covers every pair: 5 importers x 8 targets", () => {
    expect(IMPORTERS).toHaveLength(5);
    expect(Object.keys(files).filter((f) => f.includes("/imp-to-"))).toHaveLength(5 * 8);
  });

  it("an import is a violation exactly when it goes to a HIGHER rank, and never when it goes down or sideways", () => {
    const flagged = [...new Set(result.violations.map((v) => v.file))].sort();
    expect(flagged).toEqual([...expectedBad].sort());
    expect(expectedBad.length).toBeGreaterThan(20);
  });

  it("a lib layer reaching for a layer outside lib/ is reported as outside-lib, and a higher lib layer as upward-layer-import", () => {
    const rule = (file: string): string | undefined => result.violations.find((v) => v.file === file)?.rule;
    expect(rule("lib/contracts/imp-to-extent.ts")).toBe("upward-layer-import");
    expect(rule("lib/ground/imp-to-entail.ts")).toBe("upward-layer-import");
    expect(rule("lib/entail/imp-to-domains.ts")).toBe("outside-lib");
    expect(rule("lib/contracts/imp-to-app.ts")).toBe("outside-lib");
    expect(rule("domains/d/imp-to-app.ts")).toBe("upward-layer-import");
    expect(rule("domains/d/imp-to-scripts.ts")).toBe("upward-layer-import");
  });

  it("the table under test agrees with the plan's order written above", () => {
    expect(LAYERS.map((l) => [l.name, l.rank])).toEqual(ORDER.map(([name, , rank]) => [name, rank]));
  });
});

describe("a clean synthetic tree has no violation", () => {
  it("layers importing only downward, a test using the allowlist, and nothing else", () => {
    const root = tree({
      "lib/contracts/index.ts": "export const a = 1;\n",
      "lib/extent/index.ts": 'import { a } from "../contracts/index.js";\nexport const b = a;\n',
      "lib/ground/index.ts": 'import { b } from "../extent/index.js";\nimport { a } from "../contracts/index.js";\nexport const c = a + b;\n',
      "lib/entail/index.ts": 'import { c } from "../ground/index.js";\nexport const d = c;\n',
      "domains/company/e.ts": 'import { d } from "../../lib/entail/index.js";\nexport const e = d;\n',
      "lib/contracts/__tests__/a.test.ts": 'import { expect } from "vitest";\nimport { a } from "../index.js";\nexpect(a).toBe(1);\n',
    });
    const result = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") });
    expect(summarise(result.violations)).toEqual([]);
    expect(result.scanned).toHaveLength(6);
  });

  it("an absent domains/ directory is fine (there is none yet)", () => {
    const root = tree({ "lib/contracts/index.ts": "export const a = 1;\n" });
    expect(summarise(scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") }).violations)).toEqual([]);
  });

  it("a file that does not parse is a violation, not a skip", () => {
    const root = tree({ "lib/contracts/broken.ts": "export const = ;\n" });
    const result = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") });
    expect(summarise(result.violations)).toEqual(["lib/contracts/broken.ts:unparseable"]);
  });

  it("an allowlist passed in is honoured, and an unlisted external is refused even from a test", () => {
    const root = tree({ "lib/contracts/__tests__/t.ts": 'import "left-pad";\nimport "vitest";\n' });
    const strict = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json"), testExternals: new Set(["vitest"]) });
    expect(summarise(strict.violations)).toEqual(["lib/contracts/__tests__/t.ts:external-not-allowed"]);
    const loose = scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json"), testExternals: new Set(["vitest", "left-pad"]) });
    expect(summarise(loose.violations)).toEqual([]);
  });
});

describe("the real lib/ sources, copied and sabotaged: the rule fires on them and names the file", () => {
  /** A synthetic root holding a copy of the REAL `lib/`, with one source file given extra text. */
  function sabotaged(file: string, extra: string): { root: string } {
    const root = tree({});
    cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), TREE_TSCONFIG);
    const target = join(root, file);
    writeFileSync(target, `${extra}\n${readFileSync(target, "utf8")}`);
    return { root };
  }
  const scan = (root: string): string[] => summarise(scanModuleGraph({ root, tsconfig: join(root, "tsconfig.json") }).violations);

  it("CONTROL: an unmodified copy of the real lib/ is clean", () => {
    const { root } = sabotaged("lib/contracts/limits.ts", "");
    expect(scan(root)).toEqual([]);
  });

  it('inserting `import "node:fs"` into a contract source is reported against that file (plan: the falsifiable check)', () => {
    const { root } = sabotaged("lib/contracts/limits.ts", 'import "node:fs";');
    expect(scan(root)).toEqual(["lib/contracts/limits.ts:external-not-allowed"]);
  });

  it("a contract source importing a test helper is reported: the rule the sibling's graph test lacked", () => {
    const { root } = sabotaged("lib/contracts/ids.ts", 'import "./__tests__/support/samples.js";');
    expect(scan(root)).toEqual(["lib/contracts/ids.ts:source-imports-test"]);
  });

  it("the same import from a TEST file is fine", () => {
    const { root } = sabotaged("lib/contracts/__tests__/ids.test.ts", 'import "./support/samples.js";');
    expect(scan(root)).toEqual([]);
  });
});
