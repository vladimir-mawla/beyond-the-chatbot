import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { withProject, parseFile } from "./support/ast.js";
import { BANNED_NAMES, callCount, namedImports, ruleOfName, scanFiles, summarise } from "./support/scan.js";

/**
 * THE ARCHITECTURE OF THE DEMO, PINNED BY PARSED SOURCE (plan section 6, M8: "a source scan (parsed, not grepped) for the banned
 * hooks"; "the only file under `components/` that imports `lib/**`/`domains/**`"). Three things:
 *   1. the scans run over the real files of M8 (the inventory is exact, so a file the scan does not reach is itself red);
 *   2. each scan rule has a planted fixture that trips it (a scan with no tooth is not a check);
 *   3. what the scan does NOT see is planted too, and passes clean: those are the limits, pinned. They are examples, not a
 *      complete list.
 */

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const REPO_TSCONFIG = join(ROOT, "tsconfig.json");
const SLOW = 60_000;

/** The sources M8 owns or hands to the page, repo-relative. */
const EXPECTED_SOURCES = [
  "app/layout.tsx",
  "app/milestones.ts",
  "app/page.tsx",
  "components/order-desk/OrderDeskDemo.tsx",
  "components/order-desk/compute-demo-view.ts",
  "components/order-desk/format-entailment.ts",
  "components/order-desk/format-evidence.ts",
];

const UNSCANNED_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"];

function isTestPath(path: string): boolean {
  return path.split("/").includes("__tests__") || /\.test\.tsx?$/.test(path);
}

/** Every file under `dir`, repo-relative with `/`, not following links. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** The non-test files of `components/order-desk` and of `app/` outside the frozen health route. */
function sourceInventory(): string[] {
  return [...walk("components/order-desk"), ...walk("app")].filter((path) => !isTestPath(path) && !path.startsWith("app/api/")).sort();
}

/** Does `specifier`, written in the file `from` (repo-relative), reach `lib/`, `domains/`, `scripts/`, `tests/` or `.genesis/`? */
export function reachesProtectedLayer(specifier: string, from: string): boolean {
  const target = specifier.startsWith(".") ? posix.normalize(posix.join(posix.dirname(from), specifier)) : specifier;
  return target.startsWith("../") || target.startsWith("@/") || ["lib", "domains", "scripts", "tests", ".genesis"].includes(target.split("/")[0] ?? "");
}

describe("the real sources", () => {
  const files = sourceInventory().filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  const result = scanFiles(REPO_TSCONFIG, files.map((path) => ({ path: join(ROOT, path), name: path })));

  it("the inventory is exactly the files this milestone expects, and no code file is of a kind the scan cannot parse", () => {
    const everything = sourceInventory();
    expect(everything.filter((path) => UNSCANNED_EXTENSIONS.some((extension) => path.endsWith(extension)))).toEqual([]);
    expect(files).toEqual(EXPECTED_SOURCES.slice().sort());
    expect(result.scanned.slice().sort()).toEqual(EXPECTED_SOURCES.slice().sort());
  }, SLOW);

  it("no banned hook, timer, clock, randomness, locale call, dynamic code, `await`, `async` or dynamic import", () => {
    expect(summarise(result.violations)).toEqual([]);
  }, SLOW);

  it("only compute-demo-view.ts imports lib/** or domains/** (type imports and re-exports included); nothing imports scripts, tests or .genesis", () => {
    const offenders: string[] = [];
    for (const [file, specifiers] of result.imports) {
      for (const specifier of specifiers) {
        if (reachesProtectedLayer(specifier, file) && file !== "components/order-desk/compute-demo-view.ts") offenders.push(`${file} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
    const bridge = result.imports.get("components/order-desk/compute-demo-view.ts") ?? [];
    expect(bridge.filter((specifier) => reachesProtectedLayer(specifier, "components/order-desk/compute-demo-view.ts")).length).toBeGreaterThan(0);
  }, SLOW);

  it("OrderDeskDemo.tsx is a client component, page.tsx is not; the component's only React import is useReducer, called once", () => {
    expect(result.useClient.get("components/order-desk/OrderDeskDemo.tsx")).toBe(true);
    expect(result.useClient.get("app/page.tsx")).toBe(false);
    const demo = join(ROOT, "components/order-desk/OrderDeskDemo.tsx");
    withProject(REPO_TSCONFIG, (project) => {
      const sourceFile = parseFile(project, demo);
      expect(sourceFile).toBeDefined();
      if (sourceFile === undefined) return;
      expect(namedImports(sourceFile, "react")).toEqual(["useReducer"]);
      expect(callCount(sourceFile, "useReducer")).toBe(1);
    });
  }, SLOW);
});

describe("the scan's teeth: one planted fixture per rule, each trips exactly its rule", () => {
  /** Source text of each fixture, keyed by a label. `rules` is the exact set of rules the scan must report. */
  const TEETH: readonly { readonly label: string; readonly source: string; readonly rules: readonly string[]; readonly detail?: string }[] = [
    { label: "useEffect", source: `import { useEffect } from "react";\nexport function C() { useEffect(() => {}, []); return null; }`, rules: ["hook"], detail: "useEffect" },
    { label: "useLayoutEffect", source: `import { useLayoutEffect } from "react";\nexport function C() { useLayoutEffect(() => {}); return null; }`, rules: ["hook"], detail: "useLayoutEffect" },
    { label: "useInsertionEffect", source: `export const p = (useInsertionEffect as unknown);`, rules: ["hook"], detail: "useInsertionEffect" },
    { label: "useCallback", source: `export function C() { const f = useCallback(() => 1, []); return f; }`, rules: ["hook"], detail: "useCallback" },
    { label: "useMemo", source: `export function C() { return useMemo(() => 1, []); }`, rules: ["hook"], detail: "useMemo" },
    { label: "use", source: `import { use } from "react";\nexport function C(p: unknown) { return use(p); }`, rules: ["react-use"], detail: "use" },
    { label: "use via namespace", source: `import * as React from "react";\nexport function C(p: unknown) { return React.use(p); }`, rules: ["react-use"], detail: "use" },
    { label: "setTimeout", source: `export const p = setTimeout(() => 1, 0);`, rules: ["timer"], detail: "setTimeout" },
    { label: "setInterval", source: `export const p = setInterval(() => 1, 5);`, rules: ["timer"], detail: "setInterval" },
    { label: "setImmediate", source: `export const p = setImmediate(() => 1);`, rules: ["timer"], detail: "setImmediate" },
    { label: "queueMicrotask", source: `queueMicrotask(() => 1);`, rules: ["timer"], detail: "queueMicrotask" },
    { label: "requestAnimationFrame", source: `requestAnimationFrame(() => 1);`, rules: ["timer"], detail: "requestAnimationFrame" },
    { label: "requestIdleCallback", source: `requestIdleCallback(() => 1);`, rules: ["timer"], detail: "requestIdleCallback" },
    { label: "MessageChannel", source: `export const p = new MessageChannel();`, rules: ["timer"], detail: "MessageChannel" },
    { label: "Date", source: `export const p = new Date();`, rules: ["clock-or-network"], detail: "Date" },
    { label: "Date.now", source: `export const p = Date.now();`, rules: ["clock-or-network"], detail: "Date" },
    { label: "performance", source: `export const p = performance.now();`, rules: ["clock-or-network"], detail: "performance" },
    { label: "crypto", source: `export const p = crypto.randomUUID();`, rules: ["clock-or-network"], detail: "crypto" },
    { label: "fetch", source: `export const p = fetch("x");`, rules: ["clock-or-network"], detail: "fetch" },
    { label: "XMLHttpRequest", source: `export const p = new XMLHttpRequest();`, rules: ["clock-or-network"], detail: "XMLHttpRequest" },
    { label: "WebSocket", source: `export const p = new WebSocket("x");`, rules: ["clock-or-network"], detail: "WebSocket" },
    { label: "Math.random", source: `export const p = Math.random();`, rules: ["math-random"] },
    { label: 'Math["random"]', source: `export const p = Math["random"]();`, rules: ["math-random"] },
    { label: "globalThis.Math.random", source: `export const p = globalThis.Math.random();`, rules: ["math-random"] },
    { label: "Intl", source: `export const p = new Intl.NumberFormat("en");`, rules: ["intl"], detail: "Intl" },
    { label: "toLocaleString", source: `export const p = (1).toLocaleString();`, rules: ["locale"], detail: "toLocaleString" },
    { label: "toLocaleDateString", source: `export const p = x.toLocaleDateString();`, rules: ["locale"], detail: "toLocaleDateString" },
    { label: "toLocaleTimeString", source: `export const p = x.toLocaleTimeString();`, rules: ["locale"], detail: "toLocaleTimeString" },
    { label: "toLocaleUpperCase", source: `export const p = "a".toLocaleUpperCase();`, rules: ["locale"], detail: "toLocaleUpperCase" },
    { label: "toLocaleLowerCase", source: `export const p = "A".toLocaleLowerCase();`, rules: ["locale"], detail: "toLocaleLowerCase" },
    { label: "localeCompare", source: `export const p = "a".localeCompare("b");`, rules: ["locale"], detail: "localeCompare" },
    { label: "new Function", source: `export const p = new Function("return 1");`, rules: ["function-constructor"], detail: "Function" },
    { label: "eval", source: `export const p = eval("1");`, rules: ["eval"], detail: "eval" },
    { label: "Promise", source: `export const p = Promise.resolve(1);`, rules: ["promise"], detail: "Promise" },
    { label: "await expression", source: `declare const q: unknown;\nexport function f() { return (async function () { await q; })(); }`, rules: ["async", "await"] },
    { label: "for await", source: `declare const q: AsyncIterable<number>;\nexport function f() { return (async function () { for await (const x of q) void x; })(); }`, rules: ["async", "for-await"] },
    { label: "async arrow", source: `export const f = async () => 1;`, rules: ["async"] },
    { label: "async method", source: `export class C { async m() { return 1; } }`, rules: ["async"] },
    { label: "dynamic import", source: `export const p = import("./x");`, rules: ["dynamic-import"] },
    { label: 'string key ["Date"]', source: `export const p = globalThis["Date"];`, rules: ["clock-or-network"], detail: '["Date"]' },
    { label: 'string key ["useEffect"]', source: `declare const React: Record<string, unknown>;\nexport const p = React["useEffect"];`, rules: ["hook"], detail: '["useEffect"]' },
  ];

  const CLEAN = `import { useReducer } from "react";
// setTimeout, useEffect, Date.now(), Math.random(), await, Intl and eval in a comment are not code
export function C() {
  const [s, d] = useReducer((x: number, y: number) => x + y, 0);
  const text = "useEffect setTimeout Date Math.random Promise toLocaleString";
  return text + String(s) + String(d);
}`;

  /** Planted limits: each passes the scan clean. EXAMPLES, NOT A COMPLETE LIST. */
  const NOT_SEEN: readonly { readonly label: string; readonly source: string }[] = [
    { label: "a timer name built at run time", source: `const g = globalThis as unknown as Record<string, (f: () => void, n: number) => unknown>;\nexport const p = g["set" + "Timeout"]!(() => 1, 0);` },
    { label: "a hook name built at run time", source: `declare const R: Record<string, unknown>;\nexport const p = R["use" + "Effect"];` },
    { label: "Reflect.get of a global by string", source: `export const p = Reflect.get(globalThis, "Date");` },
    { label: "an alias of Math", source: `const M = Math;\nexport const p = M.random();` },
    { label: "Math in a comma expression", source: `export const p = (0, Math).random();` },
    { label: "a thenable (no Promise, no await)", source: `export const p = { then(resolve: (v: number) => void) { resolve(1); } };` },
    { label: "process.nextTick", source: `declare const process: { nextTick(f: () => void): void };\nprocess.nextTick(() => 1);` },
    { label: "localStorage", source: `declare const localStorage: { getItem(k: string): string | null };\nexport const p = localStorage.getItem("k");` },
    { label: "structuredClone", source: `export const p = structuredClone({ a: 1 });` },
  ];

  const root = realpathSync(mkdtempSync(join(tmpdir(), "btc-m8-scan-")));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const entries: { readonly key: string; readonly source: string }[] = [
    ...TEETH.map((tooth, index) => ({ key: `tooth-${String(index)}.tsx`, source: tooth.source })),
    { key: "clean.tsx", source: CLEAN },
    ...NOT_SEEN.map((limit, index) => ({ key: `notseen-${String(index)}.tsx`, source: limit.source })),
    { key: "broken.tsx", source: "export const = ;" },
  ];
  for (const entry of entries) writeFileSync(join(root, entry.key), entry.source);
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", noEmit: true, skipLibCheck: true, types: [] }, include: ["*.tsx"] }));
  const scan = scanFiles(join(root, "tsconfig.json"), entries.map((entry) => ({ path: join(root, entry.key), name: entry.key })));
  const hits = (key: string) => scan.violations.filter((violation) => violation.file === key);

  it.each(TEETH.map((tooth, index) => ({ tooth, index })))("trips its rule: $tooth.label", ({ tooth, index }) => {
    const found = hits(`tooth-${String(index)}.tsx`);
    expect([...new Set(found.map((violation) => violation.rule))].sort()).toEqual([...tooth.rules].sort());
    if (tooth.detail !== undefined) expect(found.map((violation) => violation.detail)).toContain(tooth.detail);
  }, SLOW);

  it("every banned name in the table, and the toLocale family, has a planted fixture that trips it", () => {
    const covered = new Set<string>();
    for (const tooth of TEETH) {
      if (tooth.detail !== undefined) covered.add(tooth.detail.replace(/^\["|"\]$/g, ""));
    }
    expect(Object.keys(BANNED_NAMES).filter((name) => !covered.has(name))).toEqual([]);
    expect(ruleOfName("toLocaleWhatever")).toBe("locale");
    expect(ruleOfName("notBanned")).toBeUndefined();
    expect(ruleOfName("constructor")).toBeUndefined();
    expect(ruleOfName("hasOwnProperty")).toBeUndefined();
  });

  it("clean code, with every banned word in a string or a comment, trips nothing", () => {
    expect(hits("clean.tsx")).toEqual([]);
  }, SLOW);

  it("a file that does not parse is a violation, not a skip (fail closed)", () => {
    expect(hits("broken.tsx").map((violation) => violation.rule)).toEqual(["unparseable"]);
    expect(scan.scanned).not.toContain("broken.tsx");
  }, SLOW);

  it.each(NOT_SEEN.map((limit, index) => ({ limit, index })))("NOT SEEN (a limit, pinned): $limit.label passes the scan clean", ({ index }) => {
    expect(hits(`notseen-${String(index)}.tsx`)).toEqual([]);
  }, SLOW);

  it("the import scan sees every form of a module specifier", () => {
    const forms = [
      `import a from "../../lib/ground/index.js";`,
      `import type { B } from "../../lib/contracts/index.js";`,
      `export { c } from "../../domains/order-desk/index.js";`,
      `export * from "../../lib/entail/index.js";`,
      `export const d = import("../../lib/extent/index.js");`,
      `declare function require(s: string): unknown;\nexport const e = require("../../scripts/demo-order-desk.ts");`,
      `import f = require("../../tests/failures/helpers.ts");`,
    ];
    const probe = realpathSync(mkdtempSync(join(tmpdir(), "btc-m8-imports-")));
    try {
      forms.forEach((source, index) => writeFileSync(join(probe, `f${String(index)}.ts`), source));
      writeFileSync(join(probe, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "esnext", moduleResolution: "bundler", noEmit: true, skipLibCheck: true, types: [] }, include: ["*.ts"] }));
      const result = scanFiles(join(probe, "tsconfig.json"), forms.map((_, index) => ({ path: join(probe, `f${String(index)}.ts`), name: `f${String(index)}.ts` })));
      const seen = forms.map((_, index) => result.imports.get(`f${String(index)}.ts`) ?? []);
      expect(seen.map((specifiers) => specifiers.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
      // and each is recognised as reaching a protected layer when written in components/order-desk/x.ts
      expect(seen.flat().map((specifier) => reachesProtectedLayer(specifier, "components/order-desk/x.ts"))).toEqual([true, true, true, true, true, true, true]);
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
  }, SLOW);

  it("reachesProtectedLayer: what it flags and what it lets through", () => {
    const from = "components/order-desk/format-x.ts";
    expect(reachesProtectedLayer("../../lib/ground/index.js", from)).toBe(true);
    expect(reachesProtectedLayer("../../domains/order-desk/index.js", from)).toBe(true);
    expect(reachesProtectedLayer("./compute-demo-view.js", from)).toBe(false);
    expect(reachesProtectedLayer("react", from)).toBe(false);
    expect(reachesProtectedLayer("next", from)).toBe(false);
    expect(reachesProtectedLayer("./format-evidence.js", from)).toBe(false);
    expect(reachesProtectedLayer("../components/order-desk/OrderDeskDemo", "app/page.tsx")).toBe(false);
    expect(reachesProtectedLayer("../lib/contracts/index.js", "app/page.tsx")).toBe(true);
    expect(reachesProtectedLayer("../../scripts/demo-order-desk.ts", from)).toBe(true);
    expect(reachesProtectedLayer("../../tests/failures/helpers.ts", from)).toBe(true);
  });
});

describe("what the page's source says it is", () => {
  it("the component's header names its rules, and the scan header calls its blind-spot list examples, not a complete list", () => {
    const scanHeader = readFileSync(join(ROOT, "components/order-desk/__tests__/support/scan.ts"), "utf8");
    expect(scanHeader).toContain("EXAMPLES, NOT A COMPLETE LIST");
  });
});
