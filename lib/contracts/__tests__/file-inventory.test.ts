import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tree, useTrees } from "./support/fixtures.js";
import { scanInventory, summarise } from "./support/module-graph.js";

/**
 * THE FILE INVENTORY OF `lib/` (`.genesis/PLAN.md` section 6, M1 (e): "no non-`.ts` file under `lib/`"). The
 * parser-based scans (`architecture.test.ts`, `determinism.test.ts`) read `.ts` files and nothing else, so a
 * `.js`, `.mjs`, `.json` or `.tsx` file dropped under `lib/` would be code or configuration that no scan ever
 * sees; a hand-written `.d.ts` beside a `.js` would be an import that resolves inside `lib/` and lies about its
 * type; and a symlink would put a file from elsewhere under a path that looks like `lib/`. Each is a violation.
 *
 * This is about FILES. It says nothing about what a `.ts` file contains. It looks only at `lib/`: a stray file
 * under `domains/` is left to the determinism guard, which refuses a code file it cannot parse there.
 * A hidden file such as a macOS `.DS_Store` is a non-`.ts` file and is reported; it is gitignored, so it can
 * only appear in a local working tree, and the report names it.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

describe("this repository: lib/ holds only .ts files", () => {
  it("has no violation", () => {
    expect(summarise(scanInventory(REPO_ROOT))).toEqual([]);
  });
});

describe("a synthetic tree with one stray file per kind: each is reported and the valid files beside them are not", () => {
  const root = tree(
    {
      // valid
      "lib/contracts/a.ts": "export const a = 1;\n",
      "lib/contracts/__tests__/a.test.ts": "export const t = 1;\n",
      "lib/contracts/__tests__/proofs/p.proofs.ts": "export const p = 1;\n",
      "lib/extent/index.ts": "export const e = 1;\n",
      // strays
      "lib/contracts/data.json": "{}\n",
      "lib/contracts/decl.d.ts": "export declare const decl: number;\n",
      "lib/contracts/script.js": "export const script = 1;\n",
      "lib/contracts/module.mjs": "export const m = 1;\n",
      "lib/contracts/common.cjs": "module.exports = 1;\n",
      "lib/contracts/view.tsx": "export const v = 1;\n",
      "lib/contracts/typed.mts": "export const mt = 1;\n",
      "lib/contracts/NOTES.md": "# notes\n",
      "lib/contracts/Makefile": "all:\n",
      "lib/contracts/.hidden": "x\n",
      "lib/contracts/UPPER.TS": "export const u = 1;\n",
      "lib/contracts/__tests__/fixture.json": "{}\n",
      "external/real.ts": "export const real = 1;\n",
      "external/other.txt": "x\n",
    },
    { "lib/contracts/linkdir": "external" },
  );

  it("reports exactly these file:rule pairs", () => {
    expect(summarise(scanInventory(root))).toEqual(
      [
        "lib/contracts/.hidden:non-ts-file",
        "lib/contracts/Makefile:non-ts-file",
        "lib/contracts/NOTES.md:non-ts-file",
        "lib/contracts/UPPER.TS:non-ts-file",
        "lib/contracts/__tests__/fixture.json:non-ts-file",
        "lib/contracts/common.cjs:non-ts-file",
        "lib/contracts/data.json:non-ts-file",
        "lib/contracts/decl.d.ts:non-ts-file",
        "lib/contracts/linkdir:symlink",
        "lib/contracts/module.mjs:non-ts-file",
        "lib/contracts/script.js:non-ts-file",
        "lib/contracts/typed.mts:non-ts-file",
        "lib/contracts/view.tsx:non-ts-file",
      ].sort(),
    );
  });

  it("does not follow a symlink: the files behind it are not listed under lib/", () => {
    const files = scanInventory(root).map((v) => v.file);
    expect(files.some((f) => f.startsWith("lib/contracts/linkdir/"))).toBe(false);
  });

  it("a file symlink is reported too", () => {
    // `tree` links directories; a symlink to a FILE is the other shape, made here directly inside the tree.
    const withFileLink = tree({ "lib/contracts/a.ts": "export const a = 1;\n", "external/b.ts": "export const b = 1;\n" });
    symlinkSync(join(withFileLink, "external", "b.ts"), join(withFileLink, "lib", "contracts", "b.ts"));
    expect(summarise(scanInventory(withFileLink))).toEqual(["lib/contracts/b.ts:symlink"]);
  });
});

describe("edge cases", () => {
  it("a repository with no lib/ directory has nothing to report", () => {
    const root = tree({ "app/page.ts": "export const p = 1;\n" });
    expect(scanInventory(root)).toEqual([]);
  });

  it("an empty lib/ has nothing to report", () => {
    const root = tree({});
    mkdirSync(join(root, "lib"));
    expect(scanInventory(root)).toEqual([]);
  });
});
