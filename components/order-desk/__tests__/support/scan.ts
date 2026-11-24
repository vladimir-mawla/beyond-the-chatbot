import {
  SyntaxKind,
  isCallExpression,
  isElementAccessExpression,
  isExportDeclaration,
  isExpressionStatement,
  isForOfStatement,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportExpression,
  isPropertyAccessExpression,
  isStringLiteralLikeNode,
  type Node,
  type SourceFile,
} from "typescript/unstable/ast";
import { parseFile, withProject } from "./ast.js";

/**
 * THE SOURCE SCANS OF M8 (plan section 6, M8: "a source scan (parsed, not grepped) for the banned hooks"). Two walks over
 * the parsed syntax tree of a file: `scanBanned` (hooks, timers, clocks, randomness, locale, dynamic code, async) and
 * `importsOf` (every module specifier a file names, any form). Both are SYNTACTIC checks of listed forms and nothing more.
 *
 * `scanBanned` reports, with the rule that fired:
 *  - hook: the identifiers `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useCallback`, `useMemo`;
 *  - react-use: the identifier `use` (React's `use`);
 *  - timer: `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask`, `requestAnimationFrame`, `requestIdleCallback`, `MessageChannel`;
 *  - clock-or-network: `Date`, `performance`, `crypto`, `fetch`, `XMLHttpRequest`, `WebSocket`;
 *  - math-random: `Math.random` (also `Math["random"]` and `globalThis.Math.random`);
 *  - intl: `Intl`;  locale: any identifier that starts with `toLocale`, and `localeCompare`;
 *  - function-constructor: `Function` (as `new Function(...)` or called);  eval: `eval`;  promise: `Promise`;
 *  - await: an `await` expression;  for-await: `for await`;  async: the `async` modifier on any function or method;
 *  - dynamic-import: `import(...)`;
 * and a banned NAME written as a string key (`x["useEffect"]`, `globalThis["Date"]`) under the rule of that name. It
 * OVER-reports on purpose, which fails closed: any identifier spelled like a banned name is flagged, including a variable,
 * a property and a type annotation. A string or a comment containing the name is not flagged.
 *
 * WHAT IT DOES NOT SEE. These are EXAMPLES, NOT A COMPLETE LIST; each has a planted "not seen" fixture in
 * `architecture.test.ts` that passes the scan clean:
 *  - a name built at run time: `globalThis["set" + "Timeout"]`, `React["use" + "Effect"]`;
 *  - a global reached from strings: `Reflect.get(globalThis, "Date")`;
 *  - an alias or wrapped form of `Math`: `const M = Math; M.random()`, `(0, Math).random()`;
 *  - a thenable with no `Promise` or `await`: an object with a `then` method;
 *  - a source of nondeterminism or state not on the list: `process.nextTick`, `localStorage`, `navigator`, `structuredClone`;
 *  - a banned call made inside a file this scan is not pointed at, or through a package.
 */

export type BannedRule =
  | "hook"
  | "react-use"
  | "timer"
  | "clock-or-network"
  | "math-random"
  | "intl"
  | "locale"
  | "function-constructor"
  | "eval"
  | "promise"
  | "await"
  | "for-await"
  | "async"
  | "dynamic-import"
  | "unparseable"
  | "unscanned-code-file";

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: BannedRule;
  readonly detail: string;
}

/** Every banned name and its rule. `architecture.test.ts` checks that each has a planted fixture that trips it. */
export const BANNED_NAMES: { readonly [name: string]: BannedRule } = {
  useEffect: "hook",
  useLayoutEffect: "hook",
  useInsertionEffect: "hook",
  useCallback: "hook",
  useMemo: "hook",
  use: "react-use",
  setTimeout: "timer",
  setInterval: "timer",
  setImmediate: "timer",
  queueMicrotask: "timer",
  requestAnimationFrame: "timer",
  requestIdleCallback: "timer",
  MessageChannel: "timer",
  Date: "clock-or-network",
  performance: "clock-or-network",
  crypto: "clock-or-network",
  fetch: "clock-or-network",
  XMLHttpRequest: "clock-or-network",
  WebSocket: "clock-or-network",
  Intl: "intl",
  localeCompare: "locale",
  Function: "function-constructor",
  eval: "eval",
  Promise: "promise",
};

/** The rule a name is banned under, or `undefined`. A `toLocale…` method is banned as a family. */
export function ruleOfName(name: string): BannedRule | undefined {
  if (Object.prototype.hasOwnProperty.call(BANNED_NAMES, name)) return BANNED_NAMES[name];
  return name.startsWith("toLocale") ? "locale" : undefined;
}

const keyText = (node: Node | undefined): string | undefined => (node !== undefined && (isIdentifier(node) || isStringLiteralLikeNode(node)) ? node.text : undefined);

/** `Math`, or a property named `Math` (`globalThis.Math`, `self["Math"]`). */
function isMathObject(node: Node | undefined): boolean {
  if (node === undefined) return false;
  if (isIdentifier(node)) return node.text === "Math";
  if (isPropertyAccessExpression(node)) return node.name.text === "Math";
  if (isElementAccessExpression(node)) return keyText(node.argumentExpression) === "Math";
  return false;
}

/** The violations in one parsed file, in source order. */
export function scanBanned(sourceFile: SourceFile, file: string): Violation[] {
  const out: Violation[] = [];
  const report = (node: Node, rule: BannedRule, detail: string): void => {
    out.push({ file, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, rule, detail });
  };
  const visit = (node: Node): void => {
    if (isIdentifier(node)) {
      const rule = ruleOfName(node.text);
      if (rule !== undefined) report(node, rule, node.text);
    } else if (isPropertyAccessExpression(node)) {
      if (isMathObject(node.expression) && node.name.text === "random") report(node, "math-random", "Math.random");
    } else if (isElementAccessExpression(node)) {
      const key = keyText(node.argumentExpression);
      if (key !== undefined) {
        const rule = ruleOfName(key);
        if (isMathObject(node.expression) && key === "random") report(node, "math-random", 'Math["random"]');
        else if (rule !== undefined) report(node, rule, `["${key}"]`);
      }
    } else if (isCallExpression(node) && isImportExpression(node.expression)) {
      report(node, "dynamic-import", "import()");
    } else if (node.kind === SyntaxKind.AwaitExpression) {
      report(node, "await", "await");
    } else if (isForOfStatement(node) && node.awaitModifier !== undefined) {
      report(node, "for-await", "for await");
    } else if (node.kind === SyntaxKind.AsyncKeyword) {
      report(node, "async", "async");
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return out;
}

/** Every module specifier a file names: `import`, `import type`, `export … from`, `import x = require()`, `import()`, `require()`. */
export function importsOf(sourceFile: SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: Node): void => {
    if (isImportDeclaration(node) && isStringLiteralLikeNode(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    else if (isExportDeclaration(node) && node.moduleSpecifier !== undefined && isStringLiteralLikeNode(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    else if (isImportEqualsDeclaration(node) && node.moduleReference.kind === SyntaxKind.ExternalModuleReference) {
      const expression = (node.moduleReference as { readonly expression: Node }).expression;
      if (isStringLiteralLikeNode(expression)) out.push(expression.text);
    } else if (isCallExpression(node)) {
      const first = node.arguments[0];
      if ((isImportExpression(node.expression) || (isIdentifier(node.expression) && node.expression.text === "require")) && first !== undefined && isStringLiteralLikeNode(first)) out.push(first.text);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return out;
}

/** The names imported by `import { a, b as c } from "<module>"` (the imported name, not the local one), over every such declaration. */
export function namedImports(sourceFile: SourceFile, module: string): string[] {
  const out: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!isImportDeclaration(statement) || !isStringLiteralLikeNode(statement.moduleSpecifier) || statement.moduleSpecifier.text !== module) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && bindings.kind === SyntaxKind.NamedImports) {
      for (const element of (bindings as unknown as { readonly elements: readonly { readonly name: Node; readonly propertyName?: Node }[] }).elements) {
        const imported = element.propertyName ?? element.name;
        if (isIdentifier(imported)) out.push(imported.text);
      }
    }
  }
  return out;
}

/** How many times `name(...)` is called as a bare identifier. */
export function callCount(sourceFile: SourceFile, name: string): number {
  let count = 0;
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === name) count++;
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return count;
}

/** The text of every string literal, template part and JSX text in a file (not comments, not identifiers). */
export function literalTexts(sourceFile: SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: Node): void => {
    if (isStringLiteralLikeNode(node)) out.push(node.text);
    else if (node.kind === SyntaxKind.TemplateHead || node.kind === SyntaxKind.TemplateMiddle || node.kind === SyntaxKind.TemplateTail || node.kind === SyntaxKind.JsxText) {
      out.push((node as unknown as { readonly text: string }).text);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return out;
}

/** Is the first statement of the file the directive `"use client"`? */
export function startsWithUseClient(sourceFile: SourceFile): boolean {
  const first = sourceFile.statements[0];
  return first !== undefined && isExpressionStatement(first) && isStringLiteralLikeNode(first.expression) && first.expression.text === "use client";
}

export interface ScanResult {
  readonly violations: readonly Violation[];
  readonly imports: ReadonlyMap<string, readonly string[]>;
  readonly useClient: ReadonlyMap<string, boolean>;
  /** Files parsed, in the order given. */
  readonly scanned: readonly string[];
}

/** Parse each file in the project of `tsconfig`; an unparseable file is a violation (fail closed). `names` maps a file to the name reports use. */
export function scanFiles(tsconfig: string, files: readonly { readonly path: string; readonly name: string }[]): ScanResult {
  const violations: Violation[] = [];
  const imports = new Map<string, readonly string[]>();
  const useClient = new Map<string, boolean>();
  const scanned: string[] = [];
  withProject(tsconfig, (project) => {
    for (const { path, name } of files) {
      const sourceFile = parseFile(project, path);
      if (sourceFile === undefined) {
        violations.push({ file: name, line: 0, rule: "unparseable", detail: "" });
        continue;
      }
      scanned.push(name);
      violations.push(...scanBanned(sourceFile, name));
      imports.set(name, importsOf(sourceFile));
      useClient.set(name, startsWithUseClient(sourceFile));
    }
  });
  return { violations, imports, useClient, scanned };
}

/** `file:rule:detail`, sorted. */
export function summarise(violations: readonly Violation[]): string[] {
  return violations.map((v) => `${v.file}:${v.rule}${v.detail === "" ? "" : `:${v.detail}`}`).sort();
}
