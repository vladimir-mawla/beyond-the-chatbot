import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isBindingElement,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportExpression,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isVariableDeclaration,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
} from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import { afterAll, describe, expect, it } from "vitest";
import { parseFile, withProject } from "../../../lib/contracts/__tests__/support/ast.js";
import { tree, useTrees } from "../../../lib/contracts/__tests__/support/fixtures.js";
import { ground } from "../../../lib/ground/index.js";
import { answer, recheck, renderBrief } from "../../../lib/entail/index.js";
import { OBSERVATIONS, ORDER_DESK_SCHEMA, QUESTIONS, claimsOf, fluentDraft, renderFluent, runScript } from "../index.js";
import type { ScriptRun, StepRun } from "../index.js";

/**
 * `npm run demo:order-desk` (plan section 6, M6): it "exits non-zero unless all five `Entailment` kinds were observed, every
 * `established` extent equals an independent oracle inside the script, and `recheck.intact` on every Brief". This file gives
 * each part of that contract a test that makes it fail, checks the oracle really is independent of the engine (with the
 * forms the check does not see listed), and runs the real program: its exit code, its output twice, and under three
 * sabotaged copies of the engine.
 */
useTrees();

type Json = Record<string, unknown>;
interface Verification {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly kindsObserved: readonly string[];
  readonly stepsChecked: number;
}
const ALL_KINDS = ["entailed", "weakened", "contradicted", "ungrounded", "conflicted"];

/**
 * `verifyRun` and `reportOf` live in `scripts/`, which is a LAYER ABOVE `domains/` (M1's graph scan, which runs over this file, refuses
 * a domain file that imports upward: `upward-layer-import`). So they are called the way the program calls them, in a child
 * Node process that imports the script, with the runs passed as JSON on stdin and the results read back as JSON. One child per
 * call, however many runs it is given. The runs are plain data (a `ScriptRun` has no function or class in it), so nothing is
 * lost by the round trip, and a run written here as JSON is exactly what the script would build.
 */
function inChild(runs: readonly unknown[]): { v: Verification; text: string }[] {
  const program = [
    'import { verifyRun, reportOf } from "./scripts/demo-order-desk.ts";',
    "const chunks = [];",
    "for await (const chunk of process.stdin) chunks.push(chunk);",
    "const runs = JSON.parse(Buffer.concat(chunks).toString());",
    "console.log(JSON.stringify(runs.map((run) => { const v = verifyRun(run); return { v, text: reportOf(run, v) }; })));",
  ].join("\n");
  const env = { ...process.env };
  delete env["AI_AGENT"];
  delete env["CLAUDECODE"];
  const result = spawnSync(process.execPath, ["--import", "./scripts/register-ts-loader.mjs", "--input-type=module", "-e", program], { cwd: REPO_ROOT, encoding: "utf8", input: JSON.stringify(runs), env });
  if (result.status !== 0) throw new Error(`the child failed: ${result.stderr}`);
  return JSON.parse(result.stdout) as { v: Verification; text: string }[];
}
const verifyAll = (runs: readonly unknown[]): Verification[] => inChild(runs).map((r) => r.v);
const verifyOne = (run: unknown): Verification => verifyAll([run])[0] as Verification;

const real = (): Extract<ScriptRun, { ok: true }> => {
  const result = runScript();
  if (!result.ok) throw new Error("the canonical script did not run");
  return result;
};
/** A mutable deep copy of a run (a run is frozen where the engine froze it). */
const thawed = (): { ok: true; schema: unknown; steps: Json[] } => JSON.parse(JSON.stringify(real()));
const ruling = (run: { steps: Json[] }, step: number, which: "answer" | number): Json => {
  const brief = run.steps[step - 1]!["brief"] as { answer: Json; claims: Json[] };
  return which === "answer" ? brief.answer : (brief.claims[which] as Json);
};
const kindsOfStep = (step: Json): Set<string> => {
  const brief = step["brief"] as { answer: Json; claims: Json[] };
  return new Set([brief.answer["kind"] as string, ...brief.claims.map((c) => c["kind"] as string)]);
};

// Each test below that starts a child has an explicit 30 s timeout (the default is 5 s): a child takes a fraction of a second here and CI is slower.
const CHILD = 30_000;

describe("verifyRun on the real run: the control", () => {
  it("passes, with all five kinds, over six steps, and says nothing is wrong", () => {
    expect(verifyOne(real())).toEqual({ ok: true, problems: [], kindsObserved: ALL_KINDS, stepsChecked: 6 });
  }, CHILD);

  it("agrees with the engine on all 80 states (16 snapshots by the 5 questions), by enumeration, in one run of 80 steps", () => {
    const steps: StepRun[] = [];
    let n = 0;
    for (let mask = 0; mask < 16; mask++) {
      const subset = OBSERVATIONS.filter((_, i) => (mask & (1 << i)) !== 0);
      const g = ground(ORDER_DESK_SCHEMA, subset);
      if (!g.ok) throw new Error("did not ground");
      for (const q of QUESTIONS) {
        const draft = fluentDraft(subset, q.claim);
        const a = answer(g.grounding, q.claim, claimsOf(draft));
        if (!a.ok) throw new Error("did not answer");
        const c = recheck(g.grounding.schema, a.brief);
        if (!c.ok) throw new Error("did not recheck");
        steps.push({ step: ++n, snapshot: subset.map((o) => o.id), questionLabel: q.label, question: q.claim, draft, paragraph: renderFluent(draft), brief: a.brief, rendered: renderBrief(g.grounding.schema, a.brief), intact: c.intact, findings: c.findings });
      }
    }
    expect(steps).toHaveLength(80);
    const v = verifyOne({ ok: true, schema: ORDER_DESK_SCHEMA, steps });
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.stepsChecked).toBe(80);
  }, CHILD);
});

describe("each part of the exit contract fails when it is broken (tampered copies of the real run)", () => {
  it("the script did not run: not ok, and the failure is named", () => {
    const v = verifyOne({ ok: false, failure: { kind: "snapshot-out-of-range", step: 3 } });
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(["the script did not run: snapshot-out-of-range at step 3"]);
  }, CHILD);

  it("an `established` extent that differs from the oracle's is a problem naming the step, for a lower end, an upper end, and an end made unbounded", () => {
    const cases = [
      ["upper end 9 -> 10", (r: Json) => ((r["established"] as Json)["hi"] = 10)],
      ["lower end 4 -> 3", (r: Json) => ((r["established"] as Json)["lo"] = 3)],
      ["upper end 9 -> unbounded", (r: Json) => ((r["established"] as Json)["hi"] = null)],
    ] as const;
    const runs = cases.map(([, change]) => {
      const run = thawed();
      change(ruling(run, 4, "answer"));
      return run;
    });
    verifyAll(runs).forEach((v, i) => {
      expect(v.ok, cases[i]![0]).toBe(false);
      expect(v.problems.length, cases[i]![0]).toBe(1);
      expect(v.problems[0], cases[i]![0]).toMatch(/^step 4 question: established .* differs from the oracle's/);
    });
  }, CHILD);

  it("a derived extent is held to the oracle too: step 6's [7, 10] changed to [7, 11] fails", () => {
    const run = thawed();
    ((ruling(run, 6, "answer")["established"]) as Json)["hi"] = 11;
    expect(verifyOne(run).problems.some((p) => p.startsWith("step 6 question: established"))).toBe(true);
  }, CHILD);

  it("a kind the oracle does not give is a problem: weakened -> entailed, entailed -> weakened, contradicted -> weakened, ungrounded -> weakened, conflicted -> weakened", () => {
    const cases: [number, "answer" | number, string][] = [
      [1, "answer", "entailed"],
      [2, "answer", "weakened"],
      [3, "answer", "weakened"],
      [1, 2, "weakened"],
      [5, "answer", "weakened"],
    ];
    const runs = cases.map(([step, which, to]) => {
      const run = thawed();
      ruling(run, step, which)["kind"] = to;
      return run;
    });
    verifyAll(runs).forEach((v, i) => {
      const [step, which, to] = cases[i]!;
      expect(v.ok, `${step} ${which} -> ${to}`).toBe(false);
      expect(v.problems.some((p) => p.startsWith(`step ${step} ${which === "answer" ? "question" : `claim ${which}`}: engine ruled ${to}, oracle says`)), `${step} ${which}`).toBe(true);
    });
  }, CHILD);

  it("a claim the schema already satisfies is 'vacuous' to the oracle: a tested extent of [0, unbounded) on packing is flagged", () => {
    const run = thawed();
    ruling(run, 1, 0)["tested"] = { lo: 0, hi: null };
    expect(verifyOne(run).problems.some((p) => p.includes("oracle says vacuous"))).toBe(true);
  }, CHILD);

  it("recheck not intact at one step is a problem naming that step, and only that", () => {
    const steps = [1, 3, 6];
    const runs = steps.map((step) => {
      const run = thawed();
      run.steps[step - 1]!["intact"] = false;
      return run;
    });
    verifyAll(runs).forEach((v, i) => expect(v.problems).toEqual([`step ${steps[i]}: recheck is not intact`]));
  }, CHILD);

  it("a kind never observed is a problem: for each of the five kinds, a run built only from the steps that lack it fails, naming it (and exactly the kinds those steps lack)", () => {
    const runs = ALL_KINDS.map((kind) => {
      const run = thawed();
      run.steps = run.steps.filter((step) => !kindsOfStep(step).has(kind));
      expect(run.steps.length, kind).toBeGreaterThan(0);
      return run;
    });
    verifyAll(runs).forEach((v, i) => {
      const kind = ALL_KINDS[i]!;
      // the steps kept are the ones without `kind`; every kind they also lack is reported too (for `weakened` only step 5 is left, which has one kind)
      const kept = new Set(runs[i]!.steps.flatMap((step) => [...kindsOfStep(step)]));
      expect(v.problems, kind).toEqual(ALL_KINDS.filter((k) => !kept.has(k)).map((k) => `kind never observed: ${k}`));
      expect(v.problems, kind).toContain(`kind never observed: ${kind}`);
      expect(v.kindsObserved, kind).not.toContain(kind);
    });
  }, CHILD);

  it("draft claims refused before ruling, or fewer than four ruled, fail the demo (a drafter that states NaN is refused by the engine, and the oracle never sees it)", () => {
    const refused = thawed();
    (refused.steps[0]!["brief"] as { rejected: unknown[] }).rejected = [{ index: 3, fault: { kind: "malformed", fields: ["extent"] } }];
    (refused.steps[0]!["brief"] as { claims: unknown[] }).claims.pop();
    const fewer = thawed();
    (fewer.steps[1]!["brief"] as { claims: unknown[] }).claims.pop();
    const [a, b] = verifyAll([refused, fewer]);
    expect(a!.ok).toBe(false);
    expect(a!.problems).toEqual(["step 1: 1 draft claim(s) refused before ruling", "step 1: 3 of 4 draft claims were ruled"]);
    expect(b!.ok).toBe(false);
    expect(b!.problems).toEqual(["step 2: 3 of 4 draft claims were ruled"]);
  }, CHILD);

  it("a conflicted ruling whose core is satisfiable fails (drop o4 from step 5's question core), and so does a core that names a document not in the snapshot", () => {
    const run = thawed();
    ruling(run, 5, "answer")["core"] = ["o1", "o2", "o3"];
    const run2 = thawed();
    ruling(run2, 5, "answer")["core"] = ["o1", "o2", "o3", "o4", "o9"];
    const [a, b] = verifyAll([run, run2]);
    expect(a!.problems).toEqual(["step 5 question: the core is satisfiable by the oracle"]);
    expect(b!.problems).toEqual(["step 5 question: the core is satisfiable by the oracle"]);
  }, CHILD);

  it("the oracle reads the step's snapshot, not the Brief: step 6's snapshot changed to include o3 makes the oracle say conflicted, and the engine's rulings disagree", () => {
    const run = thawed();
    run.steps[5]!["snapshot"] = ["o1", "o2", "o3", "o4"];
    const v = verifyOne(run);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.startsWith("step 6 question: engine ruled contradicted, oracle says conflicted"))).toBe(true);
  }, CHILD);

  it("a ruling the engine calls conflicted where the oracle finds a world fails (step 1's question is tampered to conflicted)", () => {
    const run = thawed();
    ruling(run, 1, "answer")["kind"] = "conflicted";
    ruling(run, 1, "answer")["core"] = ["o1", "o2"];
    const v = verifyOne(run);
    expect(v.problems.some((p) => p.startsWith("step 1 question: engine ruled conflicted, oracle says weakened"))).toBe(true);
    expect(v.problems.some((p) => p.includes("core is satisfiable"))).toBe(true);
  }, CHILD);
});

describe("reportOf: what the program prints", () => {
  it("lists every step with the chatbot's paragraph, the rendered Brief and the recheck, then the kinds and the verdict", () => {
    const run = real();
    const text = inChild([run])[0]!.text;
    for (const step of run.steps) {
      expect(text).toContain(`=== Step ${step.step}: snapshot ${step.snapshot.join(" ")}; question: ${step.questionLabel} ===`);
      expect(text).toContain(step.paragraph);
      expect(text).toContain(step.rendered);
    }
    expect(text).toContain("Kinds observed (5 of 5): entailed, weakened, contradicted, ungrounded, conflicted");
    expect(text).toContain("Oracle: every ruling's kind and every established extent agree with the enumeration, in 6 steps.");
    expect(text).not.toContain("FAIL");
    expect(text.match(/--- recheck: intact ---/g)).toHaveLength(6);
    expect(text).toContain("  claim 2: uncertifiable-silence");
    expect(text).toContain("  question: reproduced, silent sides: hi");
  }, CHILD);

  it("prints FAIL lines for a failing run, and says which step", () => {
    const run = thawed();
    run.steps[2]!["intact"] = false;
    const text = inChild([run])[0]!.text;
    expect(text).toContain("FAIL: step 3: recheck is not intact");
    expect(text).toContain("--- recheck: NOT intact ---");
    expect(text).not.toContain("Oracle: every ruling's kind");
  }, CHILD);

  it("a failed run prints no step, only the failure", () => {
    const failed: ScriptRun = { ok: false, failure: { kind: "question-out-of-range", step: 2 } };
    expect(inChild([failed])[0]!.text).toBe("Kinds observed (0 of 5): \nFAIL: the script did not run: question-out-of-range at step 2");
  }, CHILD);
});

// ---------------------------------------------------------------------------------------------------------
// The oracle does not call the engine: a parsed scan of the region between the two marker comments.
// ---------------------------------------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const DEMO_FILE = join(REPO_ROOT, "scripts", "demo-order-desk.ts");
const BEGIN = "THE ORACLE (begin)";
const END = "THE ORACLE (end)";
/** Names the oracle region may use that it does not declare itself: the language's own, nothing else. */
const GLOBALS: ReadonlySet<string> = new Set(["Math", "Infinity", "Error", "Record", "undefined"]);

/** The slice of `text` between the two markers, as source text and as offsets. */
function regionOf(text: string): { start: number; end: number } | undefined {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b < 0 || e < 0 || e < b || text.indexOf(BEGIN, b + 1) >= 0 || text.indexOf(END, e + 1) >= 0) return undefined;
  return { start: text.indexOf("\n", b), end: text.lastIndexOf("\n", e) };
}

/**
 * Every identifier in the oracle region that is neither declared inside it, nor a property name, nor one of GLOBALS; and, separately, a dynamic `import()`
 * or a `require` call in it. Detection is by name: an identifier counts as declared if SOME declaration of that name is in the region.
 */
function oracleFindings(source: string): string[] {
  const root = realpathSync(tree({ "domains/x/o.ts": source }));
  const file = join(root, "domains", "x", "o.ts");
  return withProject(join(root, "tsconfig.json"), (project) => {
    const sf = parseFile(project, file);
    if (sf === undefined) return ["unparseable"];
    const text = sf.text;
    const region = regionOf(text);
    if (region === undefined) return ["markers missing or repeated"];
    const inRegion = (node: Node): boolean => node.getStart(sf) >= region.start && node.end <= region.end;
    const declared = new Set<string>();
    const used: { name: string; node: Node }[] = [];
    const findings: string[] = [];
    const visit = (node: Node): void => {
      if (inRegion(node)) {
        if ((isFunctionDeclaration(node) || isInterfaceDeclaration(node) || isTypeAliasDeclaration(node)) && node.name !== undefined) declared.add(node.name.text);
        if ((isVariableDeclaration(node) || isParameterDeclaration(node) || isBindingElement(node)) && node.name !== undefined && isIdentifier(node.name)) declared.add(node.name.text);
        if (isIdentifier(node)) {
          const parent = node.parent;
          const isMemberName = (isPropertyAccessExpression(parent) && parent.name === node) || (isPropertyAssignment(parent) && parent.name === node) || (isPropertySignatureDeclaration(parent) && parent.name === node) || (isBindingElement(parent) && parent.propertyName === node);
          if (!isMemberName) used.push({ name: node.text, node });
        }
        if (isCallExpression(node) && (isImportExpression(node.expression) || (isIdentifier(node.expression) && node.expression.text === "require"))) findings.push("dynamic import or require");
        if (isImportDeclaration(node)) findings.push("import inside the region");
      }
      node.forEachChild(visit);
    };
    visit(sf);
    for (const { name } of used) if (!declared.has(name) && !GLOBALS.has(name)) findings.push(`free name: ${name}`);
    return [...new Set(findings)].sort();
  });
}

describe("the oracle region of the demo script does not call the engine", () => {
  const source = readFileSync(DEMO_FILE, "utf8");

  it("the real region exists once, holds the oracle's functions, and has no finding", () => {
    expect(regionOf(source)).toBeDefined();
    const region = source.slice(regionOf(source)!.start, regionOf(source)!.end);
    for (const name of ["oracleWindow", "oracleExtents", "oracleKind"]) expect(region, name).toContain(`function ${name}(`);
    expect(oracleFindings(source)).toEqual([]);
  });

  it("nothing in the script imports from lib/ except through the domain's index, and the oracle's names are not imports", () => {
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../domains/order-desk/index.js", "../domains/order-desk/index.js", "node:fs", "node:url"]);
  });

  const wrap = (region: string, outside = ""): string => `${outside}\n// ${BEGIN}\n${region}\n// ${END}\n`;
  const ENGINE_FIXTURES: Record<string, [string, string]> = {
    "an imported engine function called": ['import { ground } from "../lib/ground/index.js";', "export function f(): unknown {\n  return ground(1, 2);\n}"],
    "an imported name merely referenced": ['import { runScript } from "../domains/order-desk/index.js";', "export const g = runScript;"],
    "a renamed import": ['import { ground as g2 } from "../lib/ground/index.js";', "export const h = g2;"],
    "a namespace import": ['import * as engine from "../lib/entail/index.js";', "export const i = engine;"],
    "a local alias declared OUTSIDE the region": ["const alias = (n: number): number => n;", "export const j = alias(1);"],
    "globalThis": ["", "export const k = globalThis;"],
    "Function": ["", 'export const l = Function("return 1");'],
    "eval": ["", 'export const m = eval("1");'],
    "Object": ["", "export const n = Object.keys({});"],
    "process": ["", "export const o = process.argv;"],
    "a dynamic import": ["", 'export const p = import("../lib/ground/index.js");'],
    "require": ["", 'export const q = require("x");'],
  };
  for (const [label, [outside, region]] of Object.entries(ENGINE_FIXTURES)) {
    it(`reports ${label}`, () => {
      const findings = oracleFindings(wrap(region, outside));
      expect(findings.length, label).toBeGreaterThan(0);
    });
  }

  it("does not report plain local code: parameters, locals, loops, Math, Infinity, Record, an interface, a destructured local", () => {
    const region = [
      "interface P { readonly a: number }",
      "export function f(x: readonly P[]): Record<string, number> {",
      "  const out: Record<string, number> = {};",
      "  for (let i = 0; i < x.length; i++) {",
      "    const { a } = x[i] as P;",
      "    out[`k${i}`] = Math.max(a, -Infinity);",
      "  }",
      "  return out;",
      "}",
    ].join("\n");
    expect(oracleFindings(wrap(region))).toEqual([]);
  });

  it("markers: missing, repeated or reversed are findings, so the scan cannot be passed by deleting them", () => {
    expect(oracleFindings("export const a = 1;\n")).toEqual(["markers missing or repeated"]);
    expect(oracleFindings(`// ${BEGIN}\n// ${BEGIN}\nexport const a = 1;\n// ${END}\n`)).toEqual(["markers missing or repeated"]);
    expect(oracleFindings(`// ${END}\nexport const a = 1;\n// ${BEGIN}\n`)).toEqual(["markers missing or repeated"]);
  });

  it("what it does NOT see (stated): an engine function handed in through a PARAMETER, and code outside the region that feeds the oracle's inputs", () => {
    const passed = wrap("export function oracle(engine: (n: number) => number): number {\n  return engine(1);\n}");
    expect(oracleFindings(passed)).toEqual([]);
    // the region's `verifyRun` caller is outside it: the oracle is handed `observations` built from the domain's constants, which this scan does not check.
    expect(source.indexOf("observationsFor")).toBeGreaterThan(regionOf(source)!.end);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The real program, and the real program over sabotaged copies of the engine.
// ---------------------------------------------------------------------------------------------------------

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** Run the demo as `npm run demo:order-desk` does, in `cwd`, with a clean environment for the vitest-only variables. */
function demo(cwd: string): { status: number | null; out: string } {
  const env = { ...process.env };
  delete env["AI_AGENT"];
  delete env["CLAUDECODE"];
  const result = spawnSync(process.execPath, ["--import", "./scripts/register-ts-loader.mjs", "scripts/demo-order-desk.ts"], { cwd, encoding: "utf8", env });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/** A copy of the program (lib, domains without tests, scripts, package.json) in a fresh directory, with `edit` applied to one file. */
function copyWithEdit(file: string | undefined, edit: (text: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), "btc-demo-"));
  made.push(dir);
  const keep = (src: string): boolean => !src.includes("__tests__");
  cpSync(join(REPO_ROOT, "lib"), join(dir, "lib"), { recursive: true, filter: keep });
  cpSync(join(REPO_ROOT, "domains"), join(dir, "domains"), { recursive: true, filter: keep });
  cpSync(join(REPO_ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(REPO_ROOT, "package.json"), join(dir, "package.json"));
  if (file !== undefined) {
    const path = join(dir, file);
    const before = readFileSync(path, "utf8");
    const after = edit(before);
    if (after === before) throw new Error(`the edit changed nothing in ${file}`);
    writeFileSync(path, after);
  }
  return dir;
}

describe("the program itself", () => {
  // Each spawns node on the TypeScript sources: explicit 60 s timeouts (the default is 5 s).
  it("exits 0 on the real engine, and prints the same bytes twice", () => {
    const first = demo(REPO_ROOT);
    const second = demo(REPO_ROOT);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.out).toBe(second.out);
    expect(first.out).toContain("Kinds observed (5 of 5): entailed, weakened, contradicted, ungrounded, conflicted");
    expect(first.out).toContain("=== Step 6: snapshot o1 o2 o4; question: customs ≤ 3 ===");
    expect(first.out.match(/^=== Step /gm)).toHaveLength(6);
    expect(first.out).not.toContain("FAIL");
  }, 60_000);

  it("the copy in a fresh directory, with no edit, also exits 0 (so the sabotage runs below differ from it by the edit alone)", () => {
    expect(demo(copyWithEdit(undefined, (t) => t)).status).toBe(0);
  }, 60_000);

  it("sabotage: sumBackward's upper-bound sign flipped in lib/extent (the plan's sabotage) exits non-zero, and the oracle's FAIL lines are at step 6", () => {
    const dir = copyWithEdit("lib/extent/sum.ts", (t) => t.replace("hi - other.lo", "hi + other.lo"));
    const out = demo(dir);
    expect(out.status).not.toBe(0);
    const fails = out.out.split("\n").filter((line) => line.startsWith("FAIL: "));
    expect(fails.length).toBeGreaterThan(0);
    for (const line of fails) expect(line).toMatch(/^FAIL: step 6[ :]/);
    expect(out.out).toContain('FAIL: step 6 question: established {"lo":7,"hi":18} differs from the oracle\'s {"lo":7,"hi":10}');
  }, 60_000);

  it("sabotage: the lower-bound sign flipped too (or alone) makes the engine's own propagation guard throw; the demo reports that as a failure and exits non-zero", () => {
    for (const edit of [(t: string) => t.replace("lo - other.hi", "lo + other.hi"), (t: string) => t.replace("lo - other.hi", "lo + other.hi").replace("hi - other.lo", "hi + other.lo")]) {
      const out = demo(copyWithEdit("lib/extent/sum.ts", edit));
      expect(out.status).not.toBe(0);
      expect(out.out).toContain("FAIL: the run threw: lib/ground: internal invariant violated: propagation over 4 fields did not settle");
    }
  }, 60_000);

  it("sabotage: a recheck that never finds a Brief intact (lib/entail) exits non-zero, with a 'recheck is not intact' line for every step", () => {
    const dir = copyWithEdit("lib/entail/recheck.ts", (t) => t.replace("intact: findings.every(", "intact: false && findings.every("));
    const out = demo(dir);
    expect(out.status).not.toBe(0);
    expect(out.out.match(/^FAIL: step \d: recheck is not intact$/gm)).toHaveLength(6);
  }, 60_000);

  it("sabotage: a rule that skips its `contradicted` row (lib/entail) exits non-zero: the oracle says contradicted where the engine says weakened", () => {
    const dir = copyWithEdit("lib/entail/rule.ts", (t) => t.replace('if (meet(established, tested) === undefined) return finish({ kind: "contradicted"', 'if (false as boolean && meet(established, tested) === undefined) return finish({ kind: "contradicted"'));
    const out = demo(dir);
    expect(out.status).not.toBe(0);
    expect(out.out).toMatch(/FAIL: step 3 question: engine ruled weakened, oracle says contradicted/);
    expect(out.out).toContain("FAIL: kind never observed: contradicted");
  }, 60_000);

  it("sabotage: a drafter that states NaN for delivery (the engine refuses those claims) exits non-zero, with the refused claims named", () => {
    const dir = copyWithEdit("domains/order-desk/drafter.ts", (t) => t.replace('exactly(FIELDS.deliveryDay, total, "sum")', 'exactly(FIELDS.deliveryDay, Number.NaN, "sum")'));
    const out = demo(dir);
    expect(out.status).not.toBe(0);
    expect(out.out).toContain("FAIL: step 1: 1 draft claim(s) refused before ruling");
    expect(out.out).toContain("FAIL: step 1: 3 of 4 draft claims were ruled");
  }, 60_000);

  it("the demo's source sets the exit code in two places only, a thrown run and a failed verification, and calls process.exit nowhere", () => {
    const source = readFileSync(DEMO_FILE, "utf8");
    expect(source.match(/process\.exitCode = 1/g)).toHaveLength(2);
    expect(source).not.toMatch(/process\.exit\(/);
    expect(readdirSync(join(REPO_ROOT, "scripts")).sort()).toEqual(["demo-order-desk.ts", "register-ts-loader.mjs", "ts-loader-hooks.mjs"]);
  });
});

