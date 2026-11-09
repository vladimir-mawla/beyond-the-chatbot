import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OBSERVATIONS, runScript } from "../domains/order-desk/index.js";
import type { ScriptRun, StepRun } from "../domains/order-desk/index.js";

/**
 * `npm run demo:order-desk` (plan section 6, M6). For each of the six scripted steps it prints the chatbot's paragraph,
 * the rendered Brief, and the `recheck` result, then exits non-zero unless ALL of these hold:
 *   1. the script ran to the end;
 *   2. every ruling's kind equals the kind the ORACLE below gives it, and every `established` extent equals the oracle's
 *      extent for that quantity (and a `conflicted` ruling's core is, by the oracle, unsatisfiable on its own);
 *   3. `recheck.intact` on every Brief;
 *   4. all five kinds were observed across the six steps.
 * The oracle imports nothing from `lib/` and calls nothing the engine exports: it lists every integer world of the
 * four-field order desk. `__tests__/demo.test.ts` pins that by a parsed scan, says which forms the scan does not see, and
 * gives each of the five conditions a test that makes it fail.
 */

// ---------------------------------------------------------------------------------------------------------
// THE ORACLE (begin). Plain data in, plain data out. A world is an integer for each of packDays, transitDays and
// customsDays in [0, cap] (the schema's baseline is >= 0), with deliveryDay their sum; it must lie inside every
// observation's extent.
// ---------------------------------------------------------------------------------------------------------
interface OExtent {
  readonly lo: number | null;
  readonly hi: number | null;
}
interface OObservation extends OExtent {
  readonly id: string;
  readonly field: string;
}
const ORACLE_FIELDS = ["packDays", "transitDays", "customsDays", "deliveryDay"];
/** Larger than every finite bound in the canon (the largest constant is 14). */
const ORACLE_CAP = 40;

/** Least and greatest value of each field over every world in the window, or `undefined` if there is none. */
function oracleWindow(observations: readonly OObservation[], cap: number): { min: number[]; max: number[] } | undefined {
  const min = [Infinity, Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity, -Infinity];
  let any = false;
  for (let p = 0; p <= cap; p++)
    for (let t = 0; t <= cap; t++)
      for (let c = 0; c <= cap; c++) {
        const world = [p, t, c, p + t + c];
        const fits = observations.every((o) => {
          const v = world[ORACLE_FIELDS.indexOf(o.field)] as number;
          return (o.lo === null || v >= o.lo) && (o.hi === null || v <= o.hi);
        });
        if (!fits) continue;
        any = true;
        world.forEach((v, i) => {
          min[i] = Math.min(min[i] as number, v);
          max[i] = Math.max(max[i] as number, v);
        });
      }
  return any ? { min, max } : undefined;
}

/** The extent of each field over all worlds; a `hi` is unbounded exactly when widening the window moves it. `undefined`: no world. */
function oracleExtents(observations: readonly OObservation[]): Record<string, OExtent> | undefined {
  const small = oracleWindow(observations, ORACLE_CAP);
  const large = oracleWindow(observations, ORACLE_CAP + 1);
  if (small === undefined || large === undefined) {
    if (small !== large) throw new Error("oracle window too small: a world exists in only one of two windows");
    return undefined;
  }
  const out: Record<string, OExtent> = {};
  ORACLE_FIELDS.forEach((f, i) => {
    out[f] = { lo: small.min[i] as number, hi: small.max[i] === large.max[i] ? (small.max[i] as number) : null };
  });
  return out;
}

const within = (inner: OExtent, outer: OExtent): boolean => (outer.lo === null || (inner.lo !== null && inner.lo >= outer.lo)) && (outer.hi === null || (inner.hi !== null && inner.hi <= outer.hi));
const disjoint = (a: OExtent, b: OExtent): boolean => (a.hi !== null && b.lo !== null && a.hi < b.lo) || (b.hi !== null && a.lo !== null && b.hi < a.lo);
const sameExtent = (a: OExtent, b: OExtent): boolean => a.lo === b.lo && a.hi === b.hi;

/** The plan's table in the plan's precedence, from sets alone: conflicted, ungrounded (E = B), entailed (E in C), contradicted (E and C disjoint), else weakened. `e` is `undefined` when no world exists. */
function oracleKind(e: Record<string, OExtent> | undefined, b: Record<string, OExtent>, field: string, claim: OExtent): string {
  if (e === undefined) return "conflicted";
  if (within(b[field] as OExtent, claim)) return "vacuous";
  if (sameExtent(e[field] as OExtent, b[field] as OExtent)) return "ungrounded";
  if (within(e[field] as OExtent, claim)) return "entailed";
  return disjoint(e[field] as OExtent, claim) ? "contradicted" : "weakened";
}
// ---------------------------------------------------------------------------------------------------------
// THE ORACLE (end).
// ---------------------------------------------------------------------------------------------------------

export const ALL_KINDS: readonly string[] = ["entailed", "weakened", "contradicted", "ungrounded", "conflicted"];

export interface Verification {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly kindsObserved: readonly string[];
  /** How many steps the run had. */
  readonly stepsChecked: number;
}

const observationsFor = (step: StepRun): OObservation[] =>
  OBSERVATIONS.filter((o) => step.snapshot.includes(o.id)).map((o) => ({ id: o.id, field: o.field, lo: o.extent.lo, hi: o.extent.hi }));

/** The four conditions of the file header, as a list of problems (empty = the demo passes). Pure: it only reads `run`. */
export function verifyRun(run: ScriptRun): Verification {
  const problems: string[] = [];
  const kinds = new Set<string>();
  if (!run.ok) return { ok: false, problems: [`the script did not run: ${run.failure.kind} at step ${run.failure.step}`], kindsObserved: [], stepsChecked: 0 };
  const baseline = oracleExtents([]) as Record<string, OExtent>;
  for (const step of run.steps) {
    const observations = observationsFor(step);
    const extents = oracleExtents(observations);
    const rulings = [{ where: "question", ruling: step.brief.answer }, ...step.brief.claims.map((ruling, i) => ({ where: `claim ${i}`, ruling }))];
    for (const { where, ruling } of rulings) {
      kinds.add(ruling.kind);
      const expected = oracleKind(extents, baseline, ruling.field, ruling.tested);
      if (ruling.kind !== expected) problems.push(`step ${step.step} ${where}: engine ruled ${ruling.kind}, oracle says ${expected}`);
      if ("established" in ruling && ruling.established !== undefined) {
        const e = extents?.[ruling.field];
        if (e === undefined || !sameExtent(ruling.established, e)) problems.push(`step ${step.step} ${where}: established ${JSON.stringify(ruling.established)} differs from the oracle's ${JSON.stringify(e)}`);
      }
      if (ruling.kind === "conflicted") {
        const core = observations.filter((o) => ruling.core.some((id) => id === o.id));
        if (core.length !== ruling.core.length || oracleExtents(core) !== undefined) problems.push(`step ${step.step} ${where}: the core is satisfiable by the oracle`);
      }
    }
    if (step.brief.rejected.length > 0) problems.push(`step ${step.step}: ${step.brief.rejected.length} draft claim(s) refused before ruling`);
    if (step.brief.claims.length !== 4) problems.push(`step ${step.step}: ${step.brief.claims.length} of 4 draft claims were ruled`);
    if (!step.intact) problems.push(`step ${step.step}: recheck is not intact`);
  }
  for (const kind of ALL_KINDS) if (!kinds.has(kind)) problems.push(`kind never observed: ${kind}`);
  return { ok: problems.length === 0, problems, kindsObserved: ALL_KINDS.filter((k) => kinds.has(k)), stepsChecked: run.steps.length };
}

/** The whole report as text: deterministic, no clock, no environment. */
export function reportOf(run: ScriptRun, verification: Verification): string {
  const lines: string[] = [];
  if (run.ok) {
    for (const step of run.steps) {
      lines.push(`=== Step ${step.step}: snapshot ${step.snapshot.join(" ")}; question: ${step.questionLabel} ===`);
      lines.push("--- What a chatbot would say ---", step.paragraph);
      lines.push("--- What the system says (renderBrief) ---", step.rendered);
      lines.push(`--- recheck: ${step.intact ? "intact" : "NOT intact"} ---`);
      for (const finding of step.findings) {
        const r = finding.result;
        const detail = r.kind === "reproduced" ? (r.silentSides.length > 0 ? `reproduced, silent sides: ${r.silentSides.join(", ")}` : "reproduced") : r.kind === "not-reproduced" ? `NOT reproduced (${r.reason.kind})` : r.kind;
        lines.push(`  ${finding.position === "answer" ? "question" : `claim ${finding.position}`}: ${detail}`);
      }
      lines.push("");
    }
  }
  lines.push(`Kinds observed (${verification.kindsObserved.length} of ${ALL_KINDS.length}): ${verification.kindsObserved.join(", ")}`);
  if (verification.ok) lines.push(`Oracle: every ruling's kind and every established extent agree with the enumeration, in ${verification.stepsChecked} steps.`);
  else for (const problem of verification.problems) lines.push(`FAIL: ${problem}`);
  return lines.join("\n");
}

function main(): void {
  let run: ScriptRun;
  let verification: Verification;
  try {
    run = runScript();
    verification = verifyRun(run);
  } catch (error) {
    // The engine throws only on an internal invariant violation (plan D11). That is a failed demo, reported as one.
    console.log(`FAIL: the run threw: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  console.log(reportOf(run, verification));
  if (!verification.ok) process.exitCode = 1;
}

/** Runs only when this file is the program, not when a test imports it. */
const entry = process.argv[1];
if (entry !== undefined && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) main();
