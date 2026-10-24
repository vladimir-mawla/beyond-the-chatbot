import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportExpression,
  isImportTypeNode,
  isLiteralTypeNode,
  isStringLiteralLikeNode,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { parseFile, withProject } from "./ast.js";

/**
 * THE CLOSED MODULE GRAPH AND THE LAYER TABLE (`.genesis/PLAN.md` section 5 and section 6, M1 (e)).
 *
 *   lib/contracts -> lib/extent -> lib/ground -> lib/entail -> domains -> scripts, components, app
 *
 * An import may go to the same layer or a LOWER one, never a higher one; a strict order cannot contain a cycle
 * between layers, which is what the DoD gate "zero cycles" asks for at this level. (`scripts`, `components` and
 * `app` are peers: the plan names no direction among them, so this table does not either.)
 *
 * WHAT IS CHECKED, for every `.ts` file under `lib/` and `domains/` (the files `lib/` and `domains/` have today):
 *  1. Every module reference TypeScript's grammar has a form for: `import ... from`, `import "x"`, `export ...
 *     from`, `import x = require("x")`, a dynamic `import("x")`, a `require("x")` call, an import TYPE
 *     (`import("x").T`, `typeof import("x")`), and `/// <reference path|types|lib>`. In `lib/`, a specifier that is
 *     not a string literal (a computed `import(expr)`) is a violation: it cannot be resolved, so it fails closed.
 *  2. A relative specifier is resolved to a real file (`.js` -> `.ts`, a directory -> `index.ts`) and its REAL
 *     path (`realpathSync`) must lie inside `lib/` for a file in `lib/`. It is the resolved path that is tested,
 *     never the number of `../` in the specifier, so `../../node_modules/x/index.js` and a symlink pointing out
 *     are caught. A specifier that resolves to nothing is a violation, not a pass.
 *  3. A bare or `node:` specifier in `lib/` is allowed only if it is on the allowlist for the file's role: NONE
 *     for library source, a short fixed list for files under `__tests__/`.
 *  4. The file's own layer and the target's layer obey the order above; a directory under `lib/` that is not a
 *     declared layer, and a `.ts` file directly in `lib/`, are violations.
 *  5. A NON-TEST SOURCE under `lib/` or `domains/` may not resolve into any `__tests__` directory or into a
 *     `*.test.ts` file (`source-imports-test`), by REAL path, so a symlink into one is caught too. The sibling
 *     project's graph test did not have this rule: library code could import a test helper and every layer check
 *     would still pass, shipping test-only code (and the Node built-ins the test helpers use) into the engine.
 *  6. A non-test source under `domains/` may import only inside `domains/` or a `lib/<layer>/index.ts`
 *     (`domain-import-not-allowed`; plan section 5: "imports only the `index` of a `lib` layer"), and no bare or `node:` package.
 * Parsing is by the TypeScript parser, not a regular expression, and a file that does not parse is a
 * violation (`unparseable`), not a skip.
 *
 * WHAT IS NOT CHECKED, at full strength:
 *  - This is about IMPORTS. It does not look at what a file DECLARES (an ambient `declare module`, `declare
 *    global`), and it does not stop code from using an ambient global (`fetch`, `process`, `Date.now`,
 *    `Math.random`): the closed graph says where code can come from, not that the code is pure. The
 *    determinism guard (`determinism.ts`) is a separate, narrower check of that.
 *  - Layer order is a rank comparison, so a layer may import ANY lower layer, not only the next one down, and
 *    code in `lib/` may import another layer's internals (only `domains/` is held to `index`).
 *  - `scripts/`, `components/`, `app/` and `tests/` are not scanned; they are only import TARGETS here.
 *  - `.tsx`, `.js` and `.mjs` files are not parsed. Under `lib/` the inventory check (`scanInventory`) refuses
 *    any such file; under `domains/` the determinism guard does.
 */

export type Rule =
  | "outside-lib"
  | "unresolvable"
  | "external-not-allowed"
  | "non-literal-specifier"
  | "upward-layer-import"
  | "undeclared-lib-directory"
  | "import-of-undeclared-lib-directory"
  | "source-imports-test"
  | "domain-import-not-allowed"
  | "unparseable";

export type InventoryRule = "non-ts-file" | "symlink";

export interface Violation<R extends string = Rule> {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly rule: R;
}

export interface Layer {
  readonly name: string;
  readonly dir: string;
  readonly rank: number;
}

/** The layer table of plan section 5. `domains` is one layer: every directory under it has the same rank. */
export const LAYERS: readonly Layer[] = [
  { name: "contracts", dir: "lib/contracts", rank: 0 },
  { name: "extent", dir: "lib/extent", rank: 1 },
  { name: "ground", dir: "lib/ground", rank: 2 },
  { name: "entail", dir: "lib/entail", rank: 3 },
  { name: "domains", dir: "domains", rank: 4 },
  { name: "scripts", dir: "scripts", rank: 5 },
  { name: "components", dir: "components", rank: 5 },
  { name: "app", dir: "app", rank: 5 },
];

/** Library SOURCE (outside `__tests__/`) imports nothing outside `lib/`: no Node built-in, no package. */
export const SOURCE_EXTERNALS: ReadonlySet<string> = new Set();

/**
 * What files under `__tests__/` may import from outside `lib/`: exactly what `lib/**` imports today
 * (`architecture.test.ts` also fails on an entry nothing uses), not what a later milestone might want. THE
 * TRADE-OFF, stated: this file is M1's and is frozen after M1, so a later milestone whose tests need another
 * package or built-in cannot add it here without breaking the freeze boundary. M3-M5 are specified to write
 * scratch fixtures under `os.tmpdir()` with `node:fs`/`node:os`/`node:path` and to scan with the TypeScript
 * parser, which these already cover.
 */
export const TEST_EXTERNALS: ReadonlySet<string> = new Set([
  "node:child_process",
  "node:fs",
  "node:os",
  "node:path",
  "typescript/unstable/ast",
  "typescript/unstable/sync",
  "vitest",
]);

export interface Reference {
  readonly specifier: string | null;
  readonly raw: string;
  readonly line: number;
}

/** Every module reference in a parsed file. A non-literal specifier has `specifier: null`. */
export function referencesIn(sf: SourceFile): Reference[] {
  const found: Reference[] = [];
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const record = (node: Node | undefined): void => {
    if (node === undefined) return;
    found.push({
      specifier: isStringLiteralLikeNode(node) ? node.text : null,
      raw: node.getText(sf),
      line: lineOf(node.getStart(sf)),
    });
  };

  const visit = (node: Node): void => {
    if (isImportDeclaration(node) || isExportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      record(node.moduleReference.expression);
    } else if (isImportTypeNode(node)) {
      record(isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument);
    } else if (isCallExpression(node)) {
      if (isImportExpression(node.expression) || (isIdentifier(node.expression) && node.expression.text === "require")) {
        record(node.arguments[0]);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);

  for (const ref of [...sf.referencedFiles, ...sf.typeReferenceDirectives, ...sf.libReferenceDirectives]) {
    found.push({ specifier: ref.fileName, raw: ref.fileName, line: lineOf(ref.pos) });
  }
  return found;
}

/** Every entry below `dir`, with `lstat` so a symlink is seen as one (and not followed). */
export function walk(dir: string): { path: string; symlink: boolean; directory: boolean }[] {
  const out: { path: string; symlink: boolean; directory: boolean }[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    out.push({ path, symlink: stat.isSymbolicLink(), directory: stat.isDirectory() });
    if (stat.isDirectory()) out.push(...walk(path));
  }
  return out;
}

/** Every file a specifier written as `target` could mean, in TypeScript's resolution order. */
function candidatesFor(target: string): string[] {
  const list = [target];
  if (target.endsWith(".js")) list.push(target.slice(0, -3) + ".ts", target.slice(0, -3) + ".tsx");
  else if (target.endsWith(".mjs")) list.push(target.slice(0, -4) + ".mts");
  else if (target.endsWith(".cjs")) list.push(target.slice(0, -4) + ".cts");
  else list.push(target + ".ts", target + ".tsx", join(target, "index.ts"));
  return list;
}

/** A test file: anywhere under a `__tests__` directory, or named `*.test.ts`. */
export function isTestPath(path: string): boolean {
  return path.split(/[\\/]/).includes("__tests__") || path.endsWith(".test.ts");
}

export interface ScanOptions {
  /** Absolute path of the repository (or a synthetic copy of its layout). */
  readonly root: string;
  /** Absolute path of a tsconfig whose program includes every `.ts` file under `lib/` and `domains/`. */
  readonly tsconfig: string;
  /** Overridable so the allowlist test can be exercised on a fixture; defaults to this module's lists. */
  readonly sourceExternals?: ReadonlySet<string>;
  readonly testExternals?: ReadonlySet<string>;
}

export interface ScanResult {
  readonly violations: readonly Violation[];
  /** Every `.ts` file that was parsed (repo-relative, `/`-separated). */
  readonly scanned: readonly string[];
  /** Every external specifier that some scanned `lib/` file imports and that was accepted. */
  readonly externalsUsed: ReadonlySet<string>;
}

/** The files to parse: every `.ts` under `lib/` and `domains/` that is not a declaration file or a symlink. */
function filesToParse(root: string): string[] {
  const out: string[] = [];
  for (const top of ["lib", "domains"]) {
    const dir = join(root, top);
    if (!existsSync(dir)) continue;
    for (const entry of walk(dir)) {
      if (!entry.directory && !entry.symlink && entry.path.endsWith(".ts") && !entry.path.endsWith(".d.ts")) out.push(entry.path);
    }
  }
  return out;
}

export function scanModuleGraph(options: ScanOptions): ScanResult {
  const root = realpathSync(options.root);
  const rel = (path: string): string => relative(root, path).split(sep).join("/");
  const sourceExternals = options.sourceExternals ?? SOURCE_EXTERNALS;
  const testExternals = options.testExternals ?? TEST_EXTERNALS;
  const violations: Violation[] = [];
  const scanned: string[] = [];
  const externalsUsed = new Set<string>();

  const realLayers = LAYERS.map((layer) => ({ ...layer, real: join(root, ...layer.dir.split("/")) }));
  const layerOf = (realPath: string): Layer | undefined =>
    realLayers.find((layer) => realPath === layer.real || realPath.startsWith(layer.real + sep));
  const inside = (realPath: string, dir: string): boolean => realPath === dir || realPath.startsWith(dir + sep);
  const libRoot = join(root, "lib");
  const domainsRoot = join(root, "domains");

  withProject(options.tsconfig, (project) => {
    for (const file of filesToParse(root)) {
      const name = rel(file);
      const sf = parseFile(project, file);
      if (sf === undefined) {
        violations.push({ file: name, line: 0, specifier: "", rule: "unparseable" });
        continue;
      }
      scanned.push(name);

      const isLib = inside(file, libRoot);
      const isDomain = inside(file, domainsRoot);
      const importerLayer = layerOf(file);
      if (isLib && importerLayer === undefined) {
        violations.push({ file: name, line: 0, specifier: "", rule: "undeclared-lib-directory" });
      }
      const role = isTestPath(file) ? "test" : "source";

      for (const ref of referencesIn(sf)) {
        const violation = (rule: Rule): void => {
          violations.push({ file: name, line: ref.line, specifier: ref.specifier ?? ref.raw, rule });
        };
        if (ref.specifier === null) {
          if (isLib) violation("non-literal-specifier");
          continue;
        }
        const spec = ref.specifier;

        if (!spec.startsWith("./") && !spec.startsWith("../")) {
          // A bare name, a `node:` built-in, or an absolute path.
          if (isLib) {
            const allowed = role === "test" ? testExternals : sourceExternals;
            if (!spec.startsWith("/") && allowed.has(spec)) externalsUsed.add(spec);
            else violation("external-not-allowed");
          } else if (isDomain && role === "source") {
            violation("domain-import-not-allowed");
          }
          continue;
        }

        const target = resolve(dirname(file), spec);
        const real = candidatesFor(target)
          .filter((candidate) => existsSync(candidate))
          .map((candidate) => realpathSync(candidate));
        if (real.length === 0) {
          if (isLib) violation("unresolvable");
          continue;
        }
        // Every file the specifier could mean must satisfy every rule; the first rule broken is the one reported.
        for (const path of real) {
          if (isLib && !inside(path, libRoot)) {
            violation("outside-lib");
            break;
          }
          const targetLayer = layerOf(path);
          if (isLib && targetLayer === undefined) {
            violation("import-of-undeclared-lib-directory");
            break;
          }
          if (role === "source" && (isLib || isDomain) && isTestPath(rel(path))) {
            violation("source-imports-test");
            break;
          }
          if (importerLayer !== undefined && targetLayer !== undefined && targetLayer.rank > importerLayer.rank) {
            violation("upward-layer-import");
            break;
          }
          if (isDomain && role === "source") {
            const inDomains = inside(path, domainsRoot);
            const isLibIndex = targetLayer !== undefined && targetLayer.dir.startsWith("lib/") && path === join(root, ...targetLayer.dir.split("/"), "index.ts");
            if (!inDomains && !isLibIndex) {
              violation("domain-import-not-allowed");
              break;
            }
          }
        }
      }
    }
  });

  return { violations, scanned, externalsUsed };
}

/**
 * Inventory of `lib/` (plan section 6, M1 (e): "no non-`.ts` file under `lib/`"): every file is a `.ts` file that
 * is not a declaration file, and none is a symlink. A hand-written `.d.ts` plus a `.js` inside `lib/` would
 * otherwise be an import that resolves inside `lib/` and lies about its type; a data file or script would be
 * code or configuration the parser-based scans never see.
 */
export function scanInventory(root: string): Violation<InventoryRule>[] {
  const real = realpathSync(root);
  const libRoot = join(real, "lib");
  const violations: Violation<InventoryRule>[] = [];
  if (!existsSync(libRoot)) return violations;
  for (const entry of walk(libRoot)) {
    const file = relative(real, entry.path).split(sep).join("/");
    if (entry.symlink) violations.push({ file, line: 0, specifier: "", rule: "symlink" });
    else if (!entry.directory && (!entry.path.endsWith(".ts") || entry.path.endsWith(".d.ts"))) {
      violations.push({ file, line: 0, specifier: "", rule: "non-ts-file" });
    }
  }
  return violations;
}

/** `file:rule` pairs, sorted, for compact assertions. */
export function summarise(violations: readonly Violation<string>[]): string[] {
  return violations.map((v) => `${v.file}:${v.rule}`).sort();
}
