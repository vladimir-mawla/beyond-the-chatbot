import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_IDENTIFIERS, scanDeterminism, summariseDeterminism } from "./support/determinism.js";
import { TREE_TSCONFIG, tree, useTrees } from "./support/fixtures.js";

/**
 * THE DETERMINISM GUARD (`.genesis/PLAN.md` D3, D10, section 6 M1 (f)). The rule, and what it does NOT catch, are
 * the header of `support/determinism.ts`; this file shows it red on each thing it claims to catch and quiet on
 * each thing it claims not to flag, in one synthetic tree (one scan) with one file per case.
 *
 * Why an AST and not a regular expression: `// Date.now()` and `"Date.now()"` are text, not code, and a
 * guard that flags them gets switched off. The "quiet" cases below are exactly the ones a regex trips on.
 *
 * It scans only NON-TEST sources under `lib/` and `domains/`. `domains/` does not exist yet, so the
 * real-repository scan can only cover `lib/`; the synthetic tree is what shows `domains/` is covered.
 */
useTrees();
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const REPO_TSCONFIG = join(REPO_ROOT, "tsconfig.lib.json");

describe("this repository: no clock, randomness, network or model under lib/", () => {
  const result = scanDeterminism({ root: REPO_ROOT, tsconfig: REPO_TSCONFIG });

  it("finds nothing", () => {
    expect(summariseDeterminism(result.violations)).toEqual([]);
  });

  it("really parsed the contract sources, and not the tests (an empty scan passing proves nothing)", () => {
    expect(result.scanned).toContain("lib/contracts/integrity.ts");
    expect(result.scanned).toContain("lib/contracts/ids.ts");
    expect(result.scanned.length).toBeGreaterThanOrEqual(12);
    expect(result.scanned.some((f) => f.includes("__tests__"))).toBe(false);
    expect(result.scanned.some((f) => f.endsWith(".test.ts"))).toBe(false);
  });

  it("the banned identifiers are exactly the plan's ten", () => {
    expect([...BANNED_IDENTIFIERS].sort()).toEqual(
      ["Date", "WebSocket", "XMLHttpRequest", "crypto", "fetch", "performance", "process", "queueMicrotask", "setInterval", "setTimeout"].sort(),
    );
  });
});

describe("a synthetic tree, one file per case", () => {
  const CAUGHT: Record<string, string> = {
    // ---- the ten identifiers ----
    "lib/contracts/date-now.ts": "export const a = Date.now();\n",
    "lib/contracts/date-new.ts": "export const b = new Date();\n",
    "lib/contracts/performance.ts": "export const c = performance.now();\n",
    "lib/contracts/crypto.ts": "export const d = crypto.randomUUID();\n",
    "lib/contracts/crypto-global.ts": "export const e = globalThis.crypto;\n",
    "lib/contracts/fetch.ts": 'export const f = fetch("https://example.invalid");\n',
    "lib/contracts/xhr.ts": "export const g = new XMLHttpRequest();\n",
    "lib/contracts/websocket.ts": 'export const h = new WebSocket("wss://example.invalid");\n',
    "lib/contracts/process.ts": "export const i = process.env;\n",
    "lib/contracts/set-timeout.ts": "export const j = setTimeout(() => 1, 1);\n",
    "lib/contracts/set-interval.ts": "export const k = setInterval(() => 1, 1);\n",
    "lib/contracts/queue-microtask.ts": "queueMicrotask(() => 1);\nexport {};\n",
    // ---- Math.random, in every syntactic form the guard knows ----
    "lib/contracts/math-random.ts": "export const l = Math.random();\n",
    "lib/contracts/math-random-index.ts": 'export const m = Math["random"]();\n',
    "lib/contracts/math-random-destructure.ts": "const { random } = Math;\nexport const n = random();\n",
    "lib/contracts/math-random-destructure-alias.ts": "const { random: r } = Math;\nexport const o = r();\n",
    "lib/contracts/math-random-reference.ts": "export const p = [1, 2].map(Math.random);\n",
    "lib/contracts/math-random-global.ts": "export const p2 = (globalThis as { Math: Math }).Math.random();\n",
    "lib/contracts/math-random-global-index.ts": 'export const p3 = (globalThis as { Math: Math })["Math"].random();\n',
    "lib/contracts/math-random-global-destructure.ts": "const { random } = (globalThis as { Math: Math }).Math;\nexport const p4 = random();\n",
    // ---- dynamic import, locale order ----
    "lib/contracts/dyn-literal.ts": 'export const q = import("./date-now.js");\n',
    "lib/contracts/dyn-computed.ts": "declare const spec: string;\nexport const r = import(spec);\n",
    "lib/contracts/locale-compare.ts": 'export const s = "a".localeCompare("b");\n',
    "lib/contracts/locale-compare-index.ts": 'export const t = "a"["localeCompare"]("b");\n',
    "lib/contracts/locale-sort.ts": "export const u = [\"b\", \"a\"].sort((x, y) => x.localeCompare(y));\n",
    // ---- a banned name written as a string key ----
    "lib/contracts/global-date.ts": 'export const v = (globalThis as { Date?: unknown })["Date"];\n',
    "lib/contracts/global-fetch.ts": 'export const w = (globalThis as { fetch?: unknown })["fetch"];\n',
    "lib/contracts/global-dot-date.ts": "export const x = (globalThis as { Date?: unknown }).Date;\n",
    // ---- other syntactic forms of the same names ----
    "lib/contracts/template-key.ts": "export const rr = (globalThis as Record<string, unknown>)[`Date`];\n",
    "lib/contracts/template-math-key.ts": "export const ss = Math[`random`]();\n",
    "lib/contracts/optional-chain.ts": "export const tt = Math?.random();\n",
    "lib/contracts/extends-date.ts": "export class Stamp extends Date {}\n",
    // ---- over-reports on purpose: the name appears, so it is flagged ----
    "lib/contracts/type-annotation.ts": "export declare const y: Date;\n",
    "lib/contracts/typeof-process.ts": "export type Z = typeof process;\n",
    "lib/contracts/function-named-process.ts": "export function process(): number {\n  return 1;\n}\n",
    "lib/contracts/destructure-date.ts": "const { Date: D } = globalThis as { Date?: unknown };\nexport const aa = D;\n",
    // ---- domains/ is covered ----
    "domains/company/clock.ts": "export const bb = Date.now();\n",
    "domains/company/random.ts": "export const cc = Math.random();\n",
    // ---- fails closed ----
    "lib/contracts/unparseable.ts": "export const = ;\n",
    "lib/contracts/view.tsx": "export const dd = 1;\n",
    "lib/contracts/plain.js": "export const ee = Date.now();\n",
    "lib/contracts/mod.mjs": "export const ff = 1;\n",
    "domains/company/view.tsx": "export const gg = 1;\n",
    "domains/company/declared.d.ts": "export declare const hh: number;\n",
  };

  /** Things a regular expression flags and an AST must not, and everything the guard says it cannot see. */
  const QUIET: Record<string, string> = {
    "lib/contracts/comment.ts": "// Date.now() and Math.random() are banned, and so is localeCompare\nexport const q1 = 1;\n/* process.env, fetch(), setTimeout */\n",
    "lib/contracts/string.ts": 'export const q2 = "Date.now()";\nexport const q3 = \'Math.random()\';\nexport const q4 = `performance ${1} crypto`;\n',
    "lib/contracts/near-miss.ts": "export const Dates = 1;\nexport const datefn = 2;\nexport const performanceX = 3;\nexport const processed = 4;\nexport const mathRandom = 5;\nexport const random = 6;\nexport const fetched = 7;\nexport const q5 = Math.max(1, 2) + Math.floor(1.5);\n",
    "lib/contracts/sort-by-code-unit.ts": 'export const q6 = ["b", "a"].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));\n',
    "lib/contracts/type-import.ts": 'export type Q7 = typeof import("./near-miss.js");\n',
    "lib/contracts/static-import.ts": 'import { Dates } from "./near-miss.js";\nexport const q8 = Dates;\n',
    // ---- the TEST role is not scanned ----
    "lib/contracts/__tests__/uses-clock.ts": "export const t1 = Date.now() + Math.random();\n",
    "lib/contracts/thing.test.ts": "export const t2 = performance.now();\n",
    "domains/company/__tests__/uses-clock.ts": "export const t3 = process.env;\n",
    "lib/contracts/__tests__/view.tsx": "export const t4 = 1;\n",
    // ---- outside lib/ and domains/ is not scanned ----
    "scripts/uses-clock.ts": "export const o1 = Date.now();\n",
    "app/page.ts": "export const o2 = fetch;\n",
  };

  /**
   * THE DOCUMENTED LIMITS, pinned as code: each file below is a way to reach a banned global that the guard does
   * NOT see. They are expected to pass (be quiet), and the test is named so that a reader who "fixes" one knows
   * they are changing the guard's stated limit.
   */
  const NOT_CAUGHT: Record<string, string> = {
    "lib/contracts/limit-computed-name.ts": 'export const n1 = (globalThis as Record<string, unknown>)["Da" + "te"];\n',
    "lib/contracts/limit-variable-name.ts": 'const name = "Date";\nexport const n2 = (globalThis as Record<string, unknown>)[name];\n',
    "lib/contracts/limit-eval.ts": 'export const n3 = eval("Date.now()");\n',
    "lib/contracts/limit-function-constructor.ts": 'export const n4 = new Function("return Date")();\n',
    "lib/contracts/limit-reflect.ts": 'export const n5 = Reflect.get(globalThis, "Dat" + "e");\n',
    "lib/contracts/limit-math-alias.ts": "const M = Math;\nexport const n6 = M.random();\n",
    "lib/contracts/limit-math-alias-global.ts": "const M = (globalThis as { Math: Math }).Math;\nexport const n9 = M.random();\n",
    "lib/contracts/limit-math-param-default.ts": "export function n7({ random } = Math): number {\n  return random();\n}\n",
    "lib/contracts/limit-math-paren.ts": "export const n10 = (Math).random();\n",
    "lib/contracts/limit-math-as.ts": "export const n11 = (Math as { random(): number }).random();\n",
    "lib/contracts/limit-math-nonnull.ts": "export const n12 = Math!.random();\n",
    "lib/contracts/limit-math-comma.ts": "export const n13 = (0, Math).random();\n",
    "lib/contracts/limit-math-satisfies.ts": "export const n14 = (Math satisfies Math).random();\n",
    "lib/contracts/limit-math-destructure-assign.ts": "let r: () => number;\n({ random: r } = Math);\nexport const n15 = r();\n",
    "lib/contracts/limit-math-for-head.ts": "export const n16: number[] = [];\nfor (const { random } of [Math]) n16.push(random());\n",
    "lib/contracts/limit-math-spread.ts": "export const n17 = ({ ...Math }).random();\n",
    "lib/contracts/limit-math-argument.ts": "const call = (m: Math): number => m.random();\nexport const n18 = call(Math);\n",
    "lib/contracts/limit-intl.ts": 'export const n8 = new Intl.NumberFormat("de-DE").format(1.5) + (1.5).toLocaleString();\n',
  };

  const root = tree({ ...CAUGHT, ...QUIET, ...NOT_CAUGHT });
  const result = scanDeterminism({ root, tsconfig: join(root, "tsconfig.json") });
  const found = (file: string): string[] => summariseDeterminism(result.violations.filter((v) => v.file === file));

  it("reports exactly these file:rule:detail triples", () => {
    expect(summariseDeterminism(result.violations)).toEqual(
      [
        "lib/contracts/date-now.ts:banned-identifier:Date",
        "lib/contracts/date-new.ts:banned-identifier:Date",
        "lib/contracts/performance.ts:banned-identifier:performance",
        "lib/contracts/crypto.ts:banned-identifier:crypto",
        "lib/contracts/crypto-global.ts:banned-identifier:crypto",
        "lib/contracts/fetch.ts:banned-identifier:fetch",
        "lib/contracts/xhr.ts:banned-identifier:XMLHttpRequest",
        "lib/contracts/websocket.ts:banned-identifier:WebSocket",
        "lib/contracts/process.ts:banned-identifier:process",
        "lib/contracts/set-timeout.ts:banned-identifier:setTimeout",
        "lib/contracts/set-interval.ts:banned-identifier:setInterval",
        "lib/contracts/queue-microtask.ts:banned-identifier:queueMicrotask",
        "lib/contracts/math-random.ts:math-random:Math.random",
        'lib/contracts/math-random-index.ts:math-random:Math["random"]',
        "lib/contracts/math-random-destructure.ts:math-random:const { random } = Math",
        "lib/contracts/math-random-destructure-alias.ts:math-random:const { random } = Math",
        "lib/contracts/math-random-reference.ts:math-random:Math.random",
        "lib/contracts/math-random-global.ts:math-random:Math.random",
        "lib/contracts/math-random-global-index.ts:math-random:Math.random",
        "lib/contracts/math-random-global-destructure.ts:math-random:const { random } = Math",
        "lib/contracts/dyn-literal.ts:dynamic-import:import()",
        "lib/contracts/dyn-computed.ts:dynamic-import:import()",
        "lib/contracts/locale-compare.ts:locale-compare:localeCompare",
        'lib/contracts/locale-compare-index.ts:locale-compare:["localeCompare"]',
        "lib/contracts/locale-sort.ts:locale-compare:localeCompare",
        'lib/contracts/global-date.ts:banned-identifier:["Date"]',
        'lib/contracts/global-date.ts:banned-identifier:Date',
        'lib/contracts/global-fetch.ts:banned-identifier:["fetch"]',
        'lib/contracts/global-fetch.ts:banned-identifier:fetch',
        "lib/contracts/global-dot-date.ts:banned-identifier:Date",
        "lib/contracts/global-dot-date.ts:banned-identifier:Date",
        'lib/contracts/template-key.ts:banned-identifier:["Date"]',
        'lib/contracts/template-math-key.ts:math-random:Math["random"]',
        "lib/contracts/optional-chain.ts:math-random:Math.random",
        "lib/contracts/extends-date.ts:banned-identifier:Date",
        "lib/contracts/type-annotation.ts:banned-identifier:Date",
        "lib/contracts/typeof-process.ts:banned-identifier:process",
        "lib/contracts/function-named-process.ts:banned-identifier:process",
        "lib/contracts/destructure-date.ts:banned-identifier:Date",
        "lib/contracts/destructure-date.ts:banned-identifier:Date",
        "domains/company/clock.ts:banned-identifier:Date",
        "domains/company/random.ts:math-random:Math.random",
        "lib/contracts/unparseable.ts:unparseable",
        "lib/contracts/view.tsx:unscanned-code-file:.tsx",
        "lib/contracts/plain.js:unscanned-code-file:.js",
        "lib/contracts/mod.mjs:unscanned-code-file:.mjs",
        "domains/company/view.tsx:unscanned-code-file:.tsx",
        "domains/company/declared.d.ts:unscanned-code-file:.d.ts",
      ].sort(),
    );
  });

  it("names the file and the line", () => {
    const v = result.violations.find((x) => x.file === "lib/contracts/date-now.ts");
    expect(v).toMatchObject({ line: 1, rule: "banned-identifier", detail: "Date" });
    expect(result.violations.find((x) => x.file === "lib/contracts/dyn-computed.ts")).toMatchObject({ line: 2, rule: "dynamic-import" });
  });

  it("is an AST, not a regex: a comment, a string, a template literal and a near-miss name are all quiet", () => {
    for (const file of Object.keys(QUIET)) expect(found(file), file).toEqual([]);
  });

  it("covers the test role as NOT scanned: the same code in a test file is not reported", () => {
    for (const file of ["lib/contracts/__tests__/uses-clock.ts", "lib/contracts/thing.test.ts", "domains/company/__tests__/uses-clock.ts", "lib/contracts/__tests__/view.tsx"]) {
      expect(found(file), file).toEqual([]);
    }
  });

  it("does not scan outside lib/ and domains/", () => {
    expect(result.scanned.some((f) => f.startsWith("scripts/") || f.startsWith("app/"))).toBe(false);
  });

  it("really parsed the quiet and the limit files (so 'quiet' is not 'skipped')", () => {
    for (const file of [...Object.keys(QUIET), ...Object.keys(NOT_CAUGHT)]) {
      if (/__tests__|\.test\.ts|^scripts\/|^app\//.test(file)) continue;
      expect(result.scanned, file).toContain(file);
    }
  });

  describe("THE DOCUMENTED LIMITS: ways to reach a banned global that the guard does NOT see (the header says so; this pins it)", () => {
    for (const file of Object.keys(NOT_CAUGHT)) {
      it(`does not flag ${file.split("/").pop()}`, () => {
        expect(found(file)).toEqual([]);
      });
    }

    it("the plan's two named limits are among them: a computed global name and eval", () => {
      expect(Object.keys(NOT_CAUGHT)).toContain("lib/contracts/limit-computed-name.ts");
      expect(Object.keys(NOT_CAUGHT)).toContain("lib/contracts/limit-eval.ts");
    });
  });
});

describe("the real lib/ sources, copied and sabotaged: the guard names the file (plan: the falsifiable check)", () => {
  function sabotaged(file: string, extra: string): string {
    const root = tree({});
    cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), TREE_TSCONFIG);
    const target = join(root, file);
    writeFileSync(target, `${readFileSync(target, "utf8")}\n${extra}\n`);
    return root;
  }
  const scan = (root: string): string[] => summariseDeterminism(scanDeterminism({ root, tsconfig: join(root, "tsconfig.json") }).violations);

  it("CONTROL: an unmodified copy is clean", () => {
    expect(scan(sabotaged("lib/contracts/limits.ts", ""))).toEqual([]);
  });

  it("`Date.now()` appended to a contract source is reported against that file", () => {
    expect(scan(sabotaged("lib/contracts/limits.ts", "export const stamp = Date.now();"))).toEqual(["lib/contracts/limits.ts:banned-identifier:Date"]);
  });

  it("`Math.random()` appended to another contract source is reported against that file", () => {
    expect(scan(sabotaged("lib/contracts/ids.ts", "export const roll = Math.random();"))).toEqual(["lib/contracts/ids.ts:math-random:Math.random"]);
  });

  it("the same line appended to a TEST file is not", () => {
    expect(scan(sabotaged("lib/contracts/__tests__/ids.test.ts", "export const stamp = Date.now();"))).toEqual([]);
  });
});
