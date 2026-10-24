import { existsSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  isBindingElement,
  isCallExpression,
  isElementAccessExpression,
  isIdentifier,
  isImportExpression,
  isObjectBindingPattern,
  isPropertyAccessExpression,
  isStringLiteralLikeNode,
  isVariableDeclaration,
  type Node,
} from "typescript/unstable/ast";
import { parseFile, withProject } from "./ast.js";
import { isTestPath, walk } from "./module-graph.js";

/**
 * THE DETERMINISM GUARD (`.genesis/PLAN.md` D3, D10, section 6 M1 (f); DoD gate "no clock, randomness, network,
 * or model anywhere in `lib/` and `domains/`"). An AST walk, not a regular expression, over every NON-TEST
 * source under `lib/**` and `domains/**`. It fails on:
 *   - the identifiers `Date`, `performance`, `crypto`, `fetch`, `XMLHttpRequest`, `WebSocket`, `process`,
 *     `setTimeout`, `setInterval`, `queueMicrotask`;
 *   - `Math.random` (as `Math.random`, as `Math["random"]`, or destructured: `const { random } = Math`);
 *   - a dynamic `import()`;
 *   - `localeCompare`;
 *   - a banned name written as a string key: `globalThis["Date"]`, `x["localeCompare"]`;
 * and, failing CLOSED, on a file it cannot parse, and on a code file it does not parse at all (`.tsx`, `.js`,
 * `.mjs`, `.cjs`, `.jsx`, `.mts`, `.cts`, `.d.ts`) under `lib/` or `domains/`, which would otherwise be
 * invisible to it.
 *
 * WHAT IT DOES NOT CATCH, at full strength. It is a SYNTACTIC check of the listed names and nothing else:
 *  - A name built at run time: `globalThis["Da" + "te"]`, `globalThis[name]`. (The plan's named limit.)
 *  - `eval(...)`, `new Function(...)`, `Reflect.get(globalThis, "Date")` and any other way of reaching a global
 *    from a string. (The plan's named limit.)
 *  - An ALIAS of `Math`: `const M = Math; M.random()` is not seen; only `Math` written directly is. Destructuring
 *    `Math` in a PARAMETER default (`function f({ random } = Math)`) is not seen either.
 *  - Any source of nondeterminism that is not in the list: `Intl`, `toLocaleString`, `Symbol` registries,
 *    `WeakRef`, an unstable `sort` comparator, the iteration order of a `Map` built from nondeterministic input,
 *    `structuredClone`, `import.meta`. The list is the plan's; widening it is a decision, not a fix.
 *  - A banned effect reached through code that is not under `lib/` or `domains/` (`scripts/`, `components/`,
 *    `app/`, `tests/`), or through a package: the closed module graph (`module-graph.ts`) is what keeps library
 *    SOURCE from importing one.
 *  - TEST files are not scanned (they may use a clock or the file system; the plan's gate is about the engine).
 *    A test file is any file under a `__tests__` directory or named `*.test.ts`.
 * It OVER-reports on purpose, which fails closed: any identifier spelled like a banned name is flagged, including
 * a local variable, a property name, a type annotation (`x: Date`) and a function called `process`. A string or a
 * comment containing the name is not.
 */

export const BANNED_IDENTIFIERS: readonly string[] = [
  "Date",
  "performance",
  "crypto",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "process",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
];

export type DeterminismRule =
  | "banned-identifier"
  | "math-random"
  | "dynamic-import"
  | "locale-compare"
  | "unparseable"
  | "unscanned-code-file";

export interface DeterminismViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: DeterminismRule;
  /** The identifier or form that tripped the rule, for the report. */
  readonly detail: string;
}

export interface DeterminismResult {
  readonly violations: readonly DeterminismViolation[];
  /** Every non-test `.ts` source that was parsed (repo-relative, `/`-separated). */
  readonly scanned: readonly string[];
}

const BANNED = new Set(BANNED_IDENTIFIERS);
/** Extensions of code the parser here does not read; a file with one under `lib/` or `domains/` is itself a violation. */
const UNSCANNED_CODE = [".tsx", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"];

/** The text of a property key (an identifier or a string-like literal), or `undefined` for a computed one. */
function keyText(node: Node | undefined): string | undefined {
  if (node === undefined) return undefined;
  if (isIdentifier(node) || isStringLiteralLikeNode(node)) return node.text;
  return undefined;
}

export function scanDeterminism(options: { readonly root: string; readonly tsconfig: string }): DeterminismResult {
  const root = realpathSync(options.root);
  const rel = (path: string): string => relative(root, path).split(sep).join("/");
  const violations: DeterminismViolation[] = [];
  const scanned: string[] = [];

  const files: string[] = [];
  for (const top of ["lib", "domains"]) {
    const dir = join(root, top);
    if (!existsSync(dir)) continue;
    for (const entry of walk(dir)) {
      if (entry.directory || entry.symlink || isTestPath(entry.path)) continue;
      if (entry.path.endsWith(".ts") && !entry.path.endsWith(".d.ts")) files.push(entry.path);
      else {
        const extension = UNSCANNED_CODE.find((ext) => entry.path.endsWith(ext));
        if (extension !== undefined) violations.push({ file: rel(entry.path), line: 0, rule: "unscanned-code-file", detail: extension });
      }
    }
  }

  withProject(options.tsconfig, (project) => {
    for (const file of files) {
      const name = rel(file);
      const sf = parseFile(project, file);
      if (sf === undefined) {
        violations.push({ file: name, line: 0, rule: "unparseable", detail: "" });
        continue;
      }
      scanned.push(name);
      const lineOf = (node: Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const report = (node: Node, rule: DeterminismRule, detail: string): void => {
        violations.push({ file: name, line: lineOf(node), rule, detail });
      };

      const visit = (node: Node): void => {
        if (isIdentifier(node)) {
          if (BANNED.has(node.text)) report(node, "banned-identifier", node.text);
          if (node.text === "localeCompare") report(node, "locale-compare", "localeCompare");
        } else if (isPropertyAccessExpression(node)) {
          if (isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random") {
            report(node, "math-random", "Math.random");
          }
        } else if (isElementAccessExpression(node)) {
          const key = keyText(node.argumentExpression);
          if (key !== undefined) {
            if (isIdentifier(node.expression) && node.expression.text === "Math" && key === "random") report(node, "math-random", 'Math["random"]');
            else if (BANNED.has(key)) report(node, "banned-identifier", `["${key}"]`);
            else if (key === "localeCompare") report(node, "locale-compare", '["localeCompare"]');
          }
        } else if (isBindingElement(node)) {
          // `const { random } = Math` (and `const { random: r } = Math`)
          const pattern = node.parent;
          const declaration = pattern === undefined ? undefined : pattern.parent;
          if (
            pattern !== undefined &&
            isObjectBindingPattern(pattern) &&
            declaration !== undefined &&
            isVariableDeclaration(declaration) &&
            declaration.initializer !== undefined &&
            isIdentifier(declaration.initializer) &&
            declaration.initializer.text === "Math" &&
            keyText(node.propertyName ?? node.name) === "random"
          ) {
            report(node, "math-random", "const { random } = Math");
          }
        } else if (isCallExpression(node) && isImportExpression(node.expression)) {
          report(node, "dynamic-import", "import()");
        }
        node.forEachChild(visit);
      };
      visit(sf);
    }
  });

  return { violations, scanned };
}

/** `file:rule:detail`, sorted, for compact assertions. */
export function summariseDeterminism(violations: readonly DeterminismViolation[]): string[] {
  return violations.map((v) => `${v.file}:${v.rule}${v.detail === "" ? "" : `:${v.detail}`}`).sort();
}
