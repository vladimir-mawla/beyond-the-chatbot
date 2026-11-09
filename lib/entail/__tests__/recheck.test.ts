import { describe, expect, it } from "vitest";
import { MAX_DRAFT_CLAIMS, MAX_OBSERVATIONS } from "../../contracts/index.js";
import type { Bound, Brief, Entailment, Extent } from "../../contracts/index.js";
import { oracleIsSubset } from "../../extent/__tests__/fixtures.js";
import { classify, oracleBaselines, oracleBounds, oracleCost, oracleTreeOf } from "../../ground/__tests__/oracle.js";
import type { OField, OObs } from "../../ground/__tests__/oracle.js";
import { refIntake } from "../../ground/__tests__/fixtures.js";
import { answer, recheck } from "../index.js";
import type { Reproduction } from "../index.js";
import { DESK, FIRST_VALUES, STEPS, base, canon, claim, counted, defineCounted, derived, groundOf, logged, mulberry32, obs, oracleFields, scenarioOf, schemaOf, tampered, thaw } from "./fixtures.js";
import type { RawObservation, RawSchema } from "./fixtures.js";

/**
 * `recheck`, THE HOLDER'S CHECKER (plan section 6, M5, check 4). It takes the holder's schema and a `Brief` and says,
 * ruling by ruling, whether the `Brief`'s own evidence re-derives the ruling. Eight groups:
 *  1. HONEST BRIEFS, on 1 000 generated scenarios: every positive ruling is `reproduced` (with `silentSides` the sides
 *     whose support is empty), every `ungrounded` one is `uncertifiable-silence`, every conflicted one is `reproduced`, and
 *     the Brief is intact.
 *  2. A BOUND CHANGED BY ONE, wherever the ruling is positive: tightened by 1, loosened by 1, made unbounded, or given
 *     where there was none, each `bound-differs` with the side and both values; a flipped `unmet` is `unmet-differs`.
 *  3. A DIFFERENTIAL FUZZ against the brute-force oracle: tamperings of nine kinds (a bound, a support id dropped or
 *     added, the kind swapped, the tested extent, the cut, a core id dropped or added, an evidence entry deleted or
 *     corrupted) and the oracle, with the reference intake of `lib/ground`'s tests, says what `recheck` must answer.
 *  4. EACH REASON IN `NotReproduced`, by hand, with the exact result.
 *  5. THE LIMITS, PINNED AS RESULTS, not hidden: a Brief that drops a bound and its support together, fabricated
 *     observations, two rulings that disagree, carried evidence nothing names.
 *  6. REFUSALS: a schema or evidence `ground` refuses, a Brief of the wrong shape, a Brief too big, a ruling about a field
 *     the schema lacks.
 *  7. READ-ONCE at every place the Brief is read, with a first value from each class and a hostile second one; and what
 *     is never read (`rejected`, an extra property).
 *  8. AT THE MAXIMUM: 33 rulings, 64 observations, a support of 32 ids.
 */

type Ruling = Entailment;
const honest = (g: ReturnType<typeof groundOf>, question: unknown, draft: unknown): Brief => {
  const r = answer(g, question, draft);
  if (!r.ok) throw new Error(`fixture: ${JSON.stringify(r.failure)}`);
  return r.brief;
};
const rulingsOf = (brief: Brief): Ruling[] => [brief.answer, ...brief.claims];

/** One finding as a short string, so two verdicts compare with `toBe` and a failure reads. */
function show(r: Reproduction): string {
  switch (r.kind) {
    case "reproduced":
      return `reproduced:${r.silentSides.join("+")}`;
    case "uncertifiable-silence":
      return "uncertifiable-silence";
    case "not-reproduced": {
      const why = r.reason;
      switch (why.kind) {
        case "bound-differs":
          return `bound-differs:${why.side}:${String(why.carried)}->${String(why.rederived)}`;
        case "evidence-rejected":
          return `evidence-rejected:${why.fault.kind}`;
        case "kind-differs":
          return `kind-differs:${why.carried}->${why.rederived}`;
        case "missing-evidence":
          return "missing-evidence";
        default:
          return why.kind;
      }
    }
  }
}
const shown = (brief: Brief, schema: ReturnType<typeof groundOf>["schema"]): string[] => {
  const r = recheck(schema, brief);
  if (!r.ok) throw new Error(`expected findings, got ${JSON.stringify(r.failure)}`);
  return r.findings.map((f) => show(f.result));
};

/** A ruling is positive when it rests on a support. */
const isPositive = (e: Ruling): e is Extract<Ruling, { support: unknown }> => e.kind === "entailed" || e.kind === "weakened" || e.kind === "contradicted";

// ---------------------------------------------------------------------------------------------------------
// 1. Honest Briefs.
// ---------------------------------------------------------------------------------------------------------

const HONEST_CHUNKS = 40;
const HONEST_PER = 25;
const honestSeen = { scenarios: 0, briefs: 0, rulings: 0, positive: 0, ungrounded: 0, conflicted: 0, silentSides: 0, mostIds: 0, mostRulings: 0 };

describe("honest Briefs: everything the engine rules is certified, silence is not", () => {
  for (let chunk = 0; chunk < HONEST_CHUNKS; chunk++) {
    const from = chunk * HONEST_PER + 1;
    it(`seeds ${from} to ${from + HONEST_PER - 1}`, () => {
      for (let seed = from; seed < from + HONEST_PER; seed++) {
        const s = scenarioOf(seed);
        honestSeen.scenarios += 1;
        const made = answer(s.grounding, s.question, s.draft);
        if (!made.ok) continue;
        const brief = made.brief;
        const checked = recheck(s.grounding.schema, brief);
        if (!checked.ok) throw new Error(`seed ${seed}: ${JSON.stringify(checked.failure)}`);
        honestSeen.briefs += 1;
        const rulings = rulingsOf(brief);
        honestSeen.mostRulings = Math.max(honestSeen.mostRulings, rulings.length);
        expect(checked.findings.map((f) => f.position), `seed ${seed}: positions`).toStrictEqual(["answer", ...brief.claims.map((_, i) => i)]);
        expect(checked.intact, `seed ${seed}: intact`).toBe(true);
        rulings.forEach((ruling, i) => {
          const result = (checked.findings[i] as { result: Reproduction }).result;
          honestSeen.rulings += 1;
          if (ruling.kind === "ungrounded") {
            honestSeen.ungrounded += 1;
            expect(result, `seed ${seed} #${i}`).toStrictEqual({ kind: "uncertifiable-silence" });
          } else if (ruling.kind === "conflicted") {
            honestSeen.conflicted += 1;
            expect(result, `seed ${seed} #${i}`).toStrictEqual({ kind: "reproduced", silentSides: [] });
          } else {
            honestSeen.positive += 1;
            const silent = (["lo", "hi"] as const).filter((side) => ruling.support[side].length === 0);
            honestSeen.silentSides += silent.length;
            honestSeen.mostIds = Math.max(honestSeen.mostIds, ruling.support.lo.length, ruling.support.hi.length);
            expect(result, `seed ${seed} #${i}`).toStrictEqual({ kind: "reproduced", silentSides: silent });
          }
        });
      }
    });
  }
  it("the generated Briefs reached every kind and a silent side (needs every chunk above to have run)", () => {
    expect(honestSeen.scenarios, "all chunks ran: do not filter this file with -t").toBe(HONEST_CHUNKS * HONEST_PER);
    console.log(
      `recheck honest: ${honestSeen.scenarios} scenarios, ${honestSeen.briefs} briefs, ${honestSeen.rulings} rulings (${honestSeen.positive} positive, ${honestSeen.ungrounded} ungrounded, ${honestSeen.conflicted} conflicted), ${honestSeen.silentSides} silent sides, most ids in a support ${honestSeen.mostIds}, most rulings in a Brief ${honestSeen.mostRulings}`,
    );
    expect(honestSeen.positive).toBeGreaterThanOrEqual(1000);
    expect(honestSeen.ungrounded).toBeGreaterThanOrEqual(500);
    expect(honestSeen.conflicted).toBeGreaterThanOrEqual(500);
    expect(honestSeen.silentSides).toBeGreaterThanOrEqual(200);
    expect(honestSeen.mostIds).toBeGreaterThanOrEqual(3);
  });

  it("the plan's six steps: every Brief is intact, and the ungrounded customs claim of steps 1 to 3 is the one silence", () => {
    for (const step of STEPS) {
      const g = groundOf(DESK, canon(...step.ids));
      const brief = honest(g, step.question, step.draft);
      const r = recheck(g.schema, brief);
      expect(r.ok && r.intact, `step ${step.number}`).toBe(true);
      const found = shown(brief, g.schema);
      expect(found.filter((f) => f === "uncertifiable-silence").length, `step ${step.number}`).toBe(step.number <= 3 ? 1 : 0);
    }
    const g = groundOf(DESK, canon("o1", "o2"));
    expect(shown(honest(g, claim("deliveryDay", null, 12), STEPS[0]!.draft), g.schema)).toStrictEqual([
      "reproduced:hi",
      "reproduced:",
      "reproduced:",
      "uncertifiable-silence",
      "reproduced:hi",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 2. A bound changed by one.
// ---------------------------------------------------------------------------------------------------------

describe("a bound changed by one is caught as bound-differs, with the side and both values", () => {
  const tally = { rulings: 0, tightened: 0, tightenedCaught: 0, loosened: 0, loosenedCaught: 0, unbounded: 0, unboundedCaught: 0, invented: 0, inventedCaught: 0, flipped: 0, flippedCaught: 0, withSupport: 0 };
  const CHUNKS = 20;
  const PER = 25;
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER + 1;
    it(`seeds ${from} to ${from + PER - 1}`, () => {
      for (let seed = from; seed < from + PER; seed++) {
        const s = scenarioOf(seed);
        const made = answer(s.grounding, s.question, s.draft);
        if (!made.ok) continue;
        const brief = made.brief;
        const schema = s.grounding.schema;
        rulingsOf(brief).forEach((ruling, i) => {
          if (!isPositive(ruling)) return;
          const position = i === 0 ? "answer" : i - 1;
          tally.rulings += 1;
          for (const side of ["lo", "hi"] as const) {
            const carried = ruling.established[side];
            const attempt = (value: Bound, count: "tightened" | "loosened" | "unbounded" | "invented"): void => {
              const next: Extent = side === "lo" ? { lo: value, hi: ruling.established.hi } : { lo: ruling.established.lo, hi: value };
              if (next.lo !== null && next.hi !== null && next.lo > next.hi) return;
              if (ruling.support[side].length > 0) tally.withSupport += 1;
              const forged = tampered(brief, position, (r) => void (r["established"] = next));
              const r = recheck(schema, forged);
              if (!r.ok) throw new Error(`seed ${seed}: ${JSON.stringify(r.failure)}`);
              const finding = r.findings[i] as { result: Reproduction };
              tally[count] += 1;
              expect(r.intact).toBe(false);
              expect(finding.result, `seed ${seed} ${count} ${side}`).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side, carried: value, rederived: carried } });
              tally[`${count}Caught`] += 1;
            };
            if (carried !== null) {
              // tightening is +1 on a lower bound and -1 on an upper one; loosening is the reverse
              attempt(side === "lo" ? carried + 1 : carried - 1, "tightened");
              attempt(side === "lo" ? carried - 1 : carried + 1, "loosened");
              attempt(null, "unbounded");
            } else {
              attempt(side === "lo" ? (ruling.established.hi ?? 4) - 1 : (ruling.established.lo ?? 4) + 1, "invented");
            }
          }
          if (ruling.kind === "weakened") {
            for (const unmet of [["lo"], ["hi"], ["lo", "hi"]] as const) {
              if (unmet.length === ruling.unmet.length && unmet.every((side, k) => side === ruling.unmet[k])) continue;
              tally.flipped += 1;
              const forged = tampered(brief, position, (r) => void (r["unmet"] = [...unmet]));
              const r = recheck(schema, forged);
              if (!r.ok) throw new Error(`seed ${seed}: ${JSON.stringify(r.failure)}`);
              expect((r.findings[i] as { result: Reproduction }).result, `seed ${seed} unmet ${unmet.join("+")}`).toStrictEqual({ kind: "not-reproduced", reason: { kind: "unmet-differs" } });
              tally.flippedCaught += 1;
            }
          }
        });
      }
    });
  }
  it("they were reached, each caught every time (needs every chunk above to have run)", () => {
    console.log(
      `recheck bound tamper: ${tally.rulings} positive rulings; tightened by 1 ${tally.tightenedCaught} of ${tally.tightened}, loosened by 1 ${tally.loosenedCaught} of ${tally.loosened}, made unbounded ${tally.unboundedCaught} of ${tally.unbounded}, given where none was ${tally.inventedCaught} of ${tally.invented}, unmet flipped ${tally.flippedCaught} of ${tally.flipped}; ${tally.withSupport} of the changed bounds cite a non-empty support`,
    );
    for (const key of ["tightened", "loosened", "unbounded", "invented", "flipped"] as const) {
      expect(tally[key], key).toBeGreaterThanOrEqual(50);
      expect(tally[`${key}Caught`], `${key} caught`).toBe(tally[key]);
    }
    expect(tally.withSupport).toBeGreaterThanOrEqual(500);
  });

  it("hand-worked: step 4's 'delivery <= 12' is [4, 9]; 8 and 10 on the upper side, 5 and 3 on the lower, each caught with both values", () => {
    const g = groundOf(DESK, canon("o1", "o2", "o3"));
    const brief = honest(g, claim("deliveryDay", null, 12), []);
    const at = (extent: Extent) => recheck(g.schema, tampered(brief, "answer", (r) => void (r["established"] = extent)));
    const finding = (r: ReturnType<typeof recheck>): Reproduction => (r.ok ? (r.findings[0] as { result: Reproduction }).result : { kind: "uncertifiable-silence" });
    expect(finding(at({ lo: 4, hi: 9 }))).toStrictEqual({ kind: "reproduced", silentSides: [] });
    expect(finding(at({ lo: 4, hi: 8 }))).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "hi", carried: 8, rederived: 9 } });
    expect(finding(at({ lo: 4, hi: 10 }))).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "hi", carried: 10, rederived: 9 } });
    expect(finding(at({ lo: 5, hi: 9 }))).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "lo", carried: 5, rederived: 4 } });
    expect(finding(at({ lo: 3, hi: 9 }))).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "lo", carried: 3, rederived: 4 } });
    // both wrong: the lower side is named, the order is lower first
    expect(finding(at({ lo: 5, hi: 8 }))).toStrictEqual({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "lo", carried: 5, rederived: 4 } });
  });
});

// ---------------------------------------------------------------------------------------------------------
// 3. A differential fuzz against the brute-force oracle.
// ---------------------------------------------------------------------------------------------------------

/** What `recheck` must answer for one ruling, from the oracle and `lib/ground`'s reference intake, never from `recheck`. */
interface Reference {
  readonly fields: OField[];
  readonly baseline: ReadonlyMap<string, Extent>;
  readonly verdict: ReadonlyMap<string, string>;
  readonly accepted: readonly OObs[];
  readonly bound: ReturnType<typeof oracleBounds>;
}

function referenceFor(schema: RawSchema, evidence: readonly RawObservation[]): Reference {
  const fields = oracleFields(schema);
  const { verdicts, accepted } = refIntake(schema, evidence);
  const verdict = new Map<string, string>();
  for (const v of verdicts) {
    const id = (evidence[v.index] as RawObservation).id;
    if (!verdict.has(id)) verdict.set(id, v.verdict);
  }
  return { fields, baseline: oracleBaselines(fields), verdict, accepted, bound: oracleBounds(fields, accepted) };
}

/** The reference answer for one ruling, in `show`'s vocabulary. */
function referenceFinding(ref: Reference, ruling: Record<string, unknown>): string {
  const kind = ruling["kind"] as Ruling["kind"];
  const field = ruling["field"] as string;
  if (kind === "ungrounded") return "uncertifiable-silence";
  const support = ruling["support"] as { lo: string[]; hi: string[] } | undefined;
  const core = ruling["core"] as string[] | undefined;
  const ids = kind === "conflicted" ? (core as string[]) : [...(support as { lo: string[]; hi: string[] }).lo, ...(support as { lo: string[]; hi: string[] }).hi];
  for (const id of ids) {
    const v = ref.verdict.get(id);
    if (v === undefined) return "missing-evidence";
    if (v !== "accepted") return `evidence-rejected:${v}`;
  }
  if (kind === "conflicted") {
    const tree = oracleTreeOf(ref.fields, ref.accepted.filter((o) => (core as string[]).includes(o.id)), field);
    return tree.exists ? "core-satisfiable" : "reproduced:";
  }
  const sup = support as { lo: string[]; hi: string[] };
  const lo = ref.bound(sup.lo, field, "lo");
  const hi = ref.bound(sup.hi, field, "hi");
  if (lo === "conflict" || hi === "conflict") return "support-conflicted";
  const established = ruling["established"] as Extent;
  if (established.lo !== lo) return `bound-differs:lo:${String(established.lo)}->${String(lo)}`;
  if (established.hi !== hi) return `bound-differs:hi:${String(established.hi)}->${String(hi)}`;
  const tested = ruling["tested"] as Extent;
  const rederived = classify({ lo, hi }, ref.baseline.get(field) as Extent, tested);
  if (rederived === "vacuous") throw new Error("the fuzz must not produce a vacuous tested extent");
  if (rederived !== kind) return `kind-differs:${kind}->${rederived}`;
  if (kind === "weakened") {
    const unmet: string[] = [];
    if (tested.lo !== null && (lo === null || lo < tested.lo)) unmet.push("lo");
    if (tested.hi !== null && (hi === null || hi > tested.hi)) unmet.push("hi");
    if (JSON.stringify(unmet) !== JSON.stringify(ruling["unmet"])) return "unmet-differs";
  }
  return `reproduced:${(["lo", "hi"] as const).filter((side) => (sup[side] as string[]).length === 0).join("+")}`;
}

const FUZZ_KINDS = ["bound-plus", "bound-minus", "bound-null", "bound-given", "support-drop", "support-add", "support-swap", "support-all", "kind-swap", "tested", "unmet", "core-drop", "core-add", "core-all", "evidence-delete", "evidence-corrupt", "evidence-shift"] as const;
type FuzzKind = (typeof FUZZ_KINDS)[number];

describe("a differential fuzz: seventeen tamperings, answered as the oracle and the reference intake say", () => {
  const CHUNKS = 60;
  const PER = 10;
  const ORACLE_BUDGET = 60_000;
  const seen = { scenarios: 0, skipped: 0, applied: new Map<FuzzKind, number>(), answers: new Map<string, number>(), compared: 0, refused: 0, mostEvidence: 0 };
  const bump = <K>(map: Map<K, number>, key: K): void => void map.set(key, (map.get(key) ?? 0) + 1);

  /** The tampering `kind` applied to a thawed Brief, `true` if it applied. Choices come from `rng`. */
  function tamper(kind: FuzzKind, brief: { answer: Record<string, unknown>; claims: Record<string, unknown>[]; evidence: Record<string, unknown>[] }, baseline: ReadonlyMap<string, Extent>, rng: () => number): boolean {
    const rulings = [brief.answer, ...brief.claims];
    const target = rulings[Math.floor(rng() * rulings.length)] as Record<string, unknown>;
    const positive = target["kind"] === "entailed" || target["kind"] === "weakened" || target["kind"] === "contradicted";
    const support = target["support"] as { lo: string[]; hi: string[] } | undefined;
    const established = target["established"] as { lo: Bound; hi: Bound } | undefined;
    const tested = target["tested"] as Extent;
    // `bound-given` needs a side with no bound, so it looks for one; every other tampering picks a side at random
    const side: "lo" | "hi" = kind === "bound-given" && established !== undefined ? (established.lo === null ? "lo" : "hi") : rng() < 0.5 ? "lo" : "hi";
    const valid = (e: { lo: Bound; hi: Bound }): boolean => e.lo === null || e.hi === null || e.lo <= e.hi;
    const allIds = brief.evidence.map((o) => o["id"] as string);
    switch (kind) {
      case "bound-plus":
      case "bound-minus": {
        if (!positive || established === undefined || established[side] === null) return false;
        const next = { ...established, [side]: (established[side] as number) + (kind === "bound-plus" ? 1 : -1) };
        if (!valid(next)) return false;
        target["established"] = next;
        return true;
      }
      case "bound-null": {
        if (!positive || established === undefined || established[side] === null) return false;
        target["established"] = { ...established, [side]: null };
        return true;
      }
      case "bound-given": {
        if (!positive || established === undefined || established[side] !== null) return false;
        const other = side === "lo" ? established.hi : established.lo;
        const next = { ...established, [side]: side === "lo" ? (other ?? 5) - 1 : (other ?? 3) + 1 };
        if (!valid(next)) return false;
        target["established"] = next;
        return true;
      }
      case "support-drop": {
        if (!positive || support === undefined || support[side].length === 0) return false;
        support[side].splice(Math.floor(rng() * support[side].length), 1);
        return true;
      }
      case "support-add": {
        if (!positive || support === undefined) return false;
        const extra = allIds.filter((id) => !support[side].includes(id));
        if (extra.length === 0) return false;
        support[side].push(extra[Math.floor(rng() * extra.length)] as string);
        return true;
      }
      case "support-swap": {
        if (!positive || support === undefined) return false;
        [support.lo, support.hi] = [support.hi, support.lo];
        return true;
      }
      case "support-all": {
        if (!positive || support === undefined || allIds.length < 2) return false;
        support[side] = [...allIds];
        return true;
      }
      case "kind-swap": {
        if (target["kind"] !== "entailed" && target["kind"] !== "contradicted") return false;
        target["kind"] = target["kind"] === "entailed" ? "contradicted" : "entailed";
        return true;
      }
      case "tested": {
        if (!positive) return false;
        const lo = rng() < 0.4 ? null : Math.floor(rng() * 12) - 2;
        const hi = rng() < 0.4 ? null : (lo ?? 0) + Math.floor(rng() * 8);
        const next = { lo, hi };
        if (oracleIsSubset(baseline.get(target["field"] as string) as Extent, next)) return false;
        target["tested"] = next;
        return JSON.stringify(next) !== JSON.stringify(tested);
      }
      case "unmet": {
        if (target["kind"] !== "weakened") return false;
        const options = [["lo"], ["hi"], ["lo", "hi"]];
        target["unmet"] = options[Math.floor(rng() * 3)];
        return true;
      }
      case "core-drop": {
        const core = target["core"] as string[] | undefined;
        if (core === undefined || core.length < 2) return false;
        core.splice(Math.floor(rng() * core.length), 1);
        return true;
      }
      case "core-add": {
        const core = target["core"] as string[] | undefined;
        if (core === undefined) return false;
        const extra = allIds.filter((id) => !core.includes(id));
        if (extra.length === 0) return false;
        core.push(extra[Math.floor(rng() * extra.length)] as string);
        return true;
      }
      case "core-all": {
        if (target["core"] === undefined || allIds.length === 0) return false;
        target["core"] = [...allIds];
        return true;
      }
      case "evidence-delete": {
        if (brief.evidence.length === 0) return false;
        brief.evidence.splice(Math.floor(rng() * brief.evidence.length), 1);
        return true;
      }
      case "evidence-corrupt": {
        const finite = brief.evidence.filter((o) => (o["extent"] as Extent).lo !== null || (o["extent"] as Extent).hi !== null);
        if (finite.length === 0) return false;
        (finite[Math.floor(rng() * finite.length)] as Record<string, unknown>)["quote"] = "nothing numeric here";
        return true;
      }
      case "evidence-shift": {
        if (brief.evidence.length === 0) return false;
        const o = brief.evidence[Math.floor(rng() * brief.evidence.length)] as Record<string, unknown>;
        const e = o["extent"] as { lo: Bound; hi: Bound };
        if (e.hi === null) return false;
        o["extent"] = { lo: e.lo, hi: e.hi + 1 };
        return true;
      }
    }
  }

  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER + 1;
    it(`seeds ${from} to ${from + PER - 1}: eight tamperings each`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER; seed++) {
        const s = scenarioOf(seed);
        seen.scenarios += 1;
        const accepted = s.instance.observations.filter((_, i) => !s.instance.hostile.has(i));
        if (oracleCost(oracleFields(s.instance.schema), refIntake(s.instance.schema, accepted).accepted) > ORACLE_BUDGET) {
          seen.skipped += 1;
          continue;
        }
        const made = answer(s.grounding, s.question, s.draft);
        if (!made.ok) continue;
        const rng = mulberry32(seed * 7919);
        const baseline = oracleBaselines(oracleFields(s.instance.schema));
        for (let round = 0; round < 8; round++) {
          const copy = thaw(made.brief) as unknown as { answer: Record<string, unknown>; claims: Record<string, unknown>[]; evidence: Record<string, unknown>[]; rejected: unknown[] };
          const kind = FUZZ_KINDS[Math.floor(rng() * FUZZ_KINDS.length)] as FuzzKind;
          if (!tamper(kind, copy, baseline, rng)) continue;
          bump(seen.applied, kind);
          seen.mostEvidence = Math.max(seen.mostEvidence, copy.evidence.length);
          const ref = referenceFor(s.instance.schema, copy.evidence as unknown as RawObservation[]);
          const result = recheck(s.grounding.schema, copy as unknown as Brief);
          if (!result.ok) {
            seen.refused += 1;
            problems.push(`seed ${seed} ${kind}: recheck refused a well-shaped Brief: ${JSON.stringify(result.failure)}`);
            continue;
          }
          const want = [copy.answer, ...copy.claims].map((r) => referenceFinding(ref, r));
          const got = result.findings.map((f) => show(f.result));
          seen.compared += want.length;
          for (const w of want) bump(seen.answers, w.replace(/:.*$/, ""));
          if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`seed ${seed} ${kind}: recheck ${JSON.stringify(got)}, the oracle ${JSON.stringify(want)}`);
          const intact = want.every((w) => !(w.startsWith("bound-differs") || w.startsWith("kind-differs") || w.startsWith("unmet-differs") || w.startsWith("missing-evidence") || w.startsWith("evidence-rejected") || w === "support-conflicted" || w === "core-satisfiable"));
          if (result.intact !== intact) problems.push(`seed ${seed} ${kind}: intact is ${String(result.intact)}, expected ${String(intact)}`);
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} problems, the first five:\n${problems.slice(0, 5).join("\n")}`);
    });
  }

  it("the fuzz applied every tampering and reached every answer (needs every chunk above to have run)", () => {
    expect(seen.scenarios, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER);
    const sortedApplied = [...seen.applied].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k} ${v}`).join(", ");
    const sortedAnswers = [...seen.answers].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`recheck fuzz: ${seen.scenarios} scenarios (${seen.skipped} too costly for the oracle), ${seen.compared} rulings compared; tamperings: ${sortedApplied}; reference answers: ${sortedAnswers}; most carried observations ${seen.mostEvidence}`);
    for (const kind of FUZZ_KINDS) expect(seen.applied.get(kind) ?? 0, `tampering ${kind}`).toBeGreaterThanOrEqual(5);
    for (const answerKind of ["reproduced", "uncertifiable-silence", "bound-differs", "kind-differs", "unmet-differs", "missing-evidence", "evidence-rejected", "core-satisfiable"]) {
      expect(seen.answers.get(answerKind) ?? 0, `reference answer ${answerKind}`).toBeGreaterThanOrEqual(10);
    }
    // `support-conflicted` is not asked of the fuzz: a positive ruling's tree is consistent, so no tampering of the ids puts a conflict inside one tree's support; section 4 builds it by hand
    expect(seen.refused).toBe(0);
    expect(seen.skipped).toBeLessThanOrEqual(CHUNKS * PER * 0.05);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 4. Each reason in NotReproduced, by hand.
// ---------------------------------------------------------------------------------------------------------

/** Step 4 of the plan: o1 o2 o3, the question 'delivery <= 12' entailed on [4, 9], and a draft of a weakened pack and customs claim. */
const G3 = groundOf(DESK, canon("o1", "o2", "o3"));
const B3 = honest(G3, claim("deliveryDay", null, 12), [claim("packDays", 1, 1), claim("customsDays", 1, 1)]);
/** Step 5: all four observations, the question conflicted. */
const G4 = groundOf(DESK, canon("o1", "o2", "o3", "o4"));
const B4 = honest(G4, claim("deliveryDay", null, 12), []);

/** The first finding of `recheck(schema, brief)`, as the whole Reproduction. */
function firstFinding(brief: Brief, schema = G3.schema): Reproduction {
  const r = recheck(schema, brief);
  if (!r.ok) throw new Error(`expected findings, got ${JSON.stringify(r.failure)}`);
  return (r.findings[0] as { result: Reproduction }).result;
}
/** `brief` with its carried observations changed by `change`. */
function withEvidence(brief: Brief, change: (evidence: Record<string, unknown>[]) => void): Brief {
  const copy = thaw(brief) as unknown as { evidence: Record<string, unknown>[] };
  change(copy.evidence);
  return copy as unknown as Brief;
}
const notReproduced = (reason: object): Reproduction => ({ kind: "not-reproduced", reason }) as Reproduction;

describe("every reason a ruling is not reproduced, built by hand, with its exact result", () => {
  it("the starting point: step 4's Brief is intact, entailed [4, 9] with its support, and the pack claim and the customs claim are weakened", () => {
    expect(B3.answer).toMatchObject({ kind: "entailed", established: { lo: 4, hi: 9 }, support: { lo: ["o1", "o2"], hi: ["o1", "o2", "o3"] } });
    expect(shown(B3, G3.schema)).toStrictEqual(["reproduced:", "reproduced:", "reproduced:lo"]);
  });

  it("missing-evidence: the first id of the support that the Brief does not carry (lower side first, then upper)", () => {
    expect(firstFinding(withEvidence(B3, (e) => void e.splice(2, 1)))).toStrictEqual(notReproduced({ kind: "missing-evidence", id: "o3" }));
    expect(firstFinding(withEvidence(B3, (e) => void e.splice(0, 1)))).toStrictEqual(notReproduced({ kind: "missing-evidence", id: "o1" }));
    expect(firstFinding(withEvidence(B3, (e) => void e.splice(0, 3)))).toStrictEqual(notReproduced({ kind: "missing-evidence", id: "o1" }));
  });

  it("evidence-rejected: a carried observation that no longer passes intake, with the fault it gets, by each rule", () => {
    expect(firstFinding(withEvidence(B3, (e) => void ((e[2] as Record<string, unknown>)["quote"] = "Customs clearance takes a few days")))).toStrictEqual(
      notReproduced({ kind: "evidence-rejected", fault: { kind: "number-not-in-quote", value: 0 } }),
    );
    expect(firstFinding(withEvidence(B3, (e) => void ((e[2] as Record<string, unknown>)["field"] = "ghostDays")))).toStrictEqual(
      notReproduced({ kind: "evidence-rejected", fault: { kind: "unknown-field", field: "ghostDays" } }),
    );
    expect(firstFinding(withEvidence(B3, (e) => void ((e[2] as Record<string, unknown>)["source"] = "")))).toStrictEqual(
      notReproduced({ kind: "evidence-rejected", fault: { kind: "malformed", fields: ["source"] } }),
    );
    expect(firstFinding(withEvidence(B3, (e) => void e.push(structuredClone(e[2] as Record<string, unknown>))))).toStrictEqual(notReproduced({ kind: "evidence-rejected", fault: { kind: "duplicate-id", id: "o3" } }));
    // outside the field's own baseline: customsDays >= 0, so an observation of [-5, -1] is impossible by the schema
    expect(firstFinding(withEvidence(B3, (e) => void Object.assign(e[2] as Record<string, unknown>, { extent: { lo: -5, hi: -1 }, quote: "customs between -5 and -1 days" })))).toStrictEqual(
      notReproduced({ kind: "evidence-rejected", fault: { kind: "outside-baseline", field: "customsDays" } }),
    );
  });

  it("support-conflicted: ids that together cannot hold, named as the support of one side", () => {
    const four = withEvidence(B3, (e) => void e.push(structuredClone(thaw(B4.evidence)[3] as unknown as Record<string, unknown>)));
    const forged = tampered(four, "answer", (r) => void (r["support"] = { lo: ["o1", "o2"], hi: ["o1", "o2", "o3", "o4"] }));
    expect(firstFinding(forged)).toStrictEqual(notReproduced({ kind: "support-conflicted" }));
    // a conflict on the lower side alone is the same result
    expect(firstFinding(tampered(four, "answer", (r) => void (r["support"] = { lo: ["o1", "o2", "o3", "o4"], hi: ["o1", "o2", "o3"] })))).toStrictEqual(notReproduced({ kind: "support-conflicted" }));
  });

  it("bound-differs, kind-differs and unmet-differs, one result each", () => {
    expect(firstFinding(tampered(B3, "answer", (r) => void (r["established"] = { lo: 4, hi: 10 })))).toStrictEqual(notReproduced({ kind: "bound-differs", side: "hi", carried: 10, rederived: 9 }));
    expect(firstFinding(tampered(B3, "answer", (r) => void (r["kind"] = "contradicted")))).toStrictEqual(notReproduced({ kind: "kind-differs", carried: "contradicted", rederived: "entailed" }));
    // the pack claim (position 0) is weakened with the upper side unmet; flipping the cut is unmet-differs, and so is dropping a side
    expect(recheck(G3.schema, tampered(B3, 0, (r) => void (r["unmet"] = ["lo"])))).toMatchObject({ ok: true, intact: false, findings: [{}, { position: 0, result: notReproduced({ kind: "unmet-differs" }) }, {}] });
    expect(recheck(G3.schema, tampered(B3, 0, (r) => void (r["unmet"] = ["lo", "hi"])))).toMatchObject({ ok: true, findings: [{}, { position: 0, result: notReproduced({ kind: "unmet-differs" }) }, {}] });
    // the kind of a weakened claim given as entailed: its bounds hold and its kind does not (and `unmet` and `openEnds` would be unexpected fields, so they are removed)
    const asEntailed = tampered(B3, 0, (r) => {
      r["kind"] = "entailed";
      delete r["unmet"];
      delete r["openEnds"];
    });
    expect(recheck(G3.schema, asEntailed)).toMatchObject({ ok: true, findings: [{}, { position: 0, result: notReproduced({ kind: "kind-differs", carried: "entailed", rederived: "weakened" }) }, {}] });
  });

  it("core-satisfiable: a core that is not a conflict on its own, and every core id must be carried and pass intake", () => {
    expect(B4.answer.kind).toBe("conflicted");
    expect(firstFinding(B4, G4.schema)).toStrictEqual({ kind: "reproduced", silentSides: [] });
    expect(firstFinding(tampered(B4, "answer", (r) => void (r["core"] = ["o1", "o2", "o3"])), G4.schema)).toStrictEqual(notReproduced({ kind: "core-satisfiable" }));
    expect(firstFinding(tampered(B4, "answer", (r) => void (r["core"] = ["o4"])), G4.schema)).toStrictEqual(notReproduced({ kind: "core-satisfiable" }));
    expect(firstFinding(withEvidence(B4, (e) => void e.splice(3, 1)), G4.schema)).toStrictEqual(notReproduced({ kind: "missing-evidence", id: "o4" }));
    expect(firstFinding(withEvidence(B4, (e) => void ((e[0] as Record<string, unknown>)["quote"] = "no digits")), G4.schema)).toMatchObject({ kind: "not-reproduced", reason: { kind: "evidence-rejected" } });
  });

  it("intact is false as soon as one ruling is not reproduced, and silence does not make a Brief not intact", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = honest(g, claim("deliveryDay", null, 12), STEPS[0]!.draft);
    const r = recheck(g.schema, brief);
    expect(r.ok && r.intact).toBe(true);
    expect(r.ok && r.findings.some((f) => f.result.kind === "uncertifiable-silence")).toBe(true);
    const bad = recheck(g.schema, tampered(brief, 3, (x) => void (x["established"] = { lo: 5, hi: null })));
    expect(bad.ok && bad.intact).toBe(false);
    expect(bad.ok && bad.findings.filter((f) => f.result.kind === "not-reproduced")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 5. The limits, pinned as results.
// ---------------------------------------------------------------------------------------------------------

describe("the limits are pinned as results, not hidden", () => {
  it("a Brief that drops a bound and its support together claims silence and is reproduced, with the side in silentSides", () => {
    // step 4: delivery <= 12 is entailed on [4, 9]. Drop the lower bound (to the schema's floor, 0) and the lower support together: the kind is still entailed.
    const forged = tampered(B3, "answer", (r) => {
      r["established"] = { lo: 0, hi: 9 };
      r["support"] = { lo: [], hi: ["o1", "o2", "o3"] };
    });
    const r = recheck(G3.schema, forged);
    expect(r.ok && r.intact).toBe(true);
    expect(firstFinding(forged)).toStrictEqual({ kind: "reproduced", silentSides: ["lo"] });
    // the same forgery on the upper side: [4, null] from o1 o2 alone no longer entails 'delivery <= 12', so the kind changes and it IS caught
    const weaker = tampered(B3, "answer", (r) => {
      r["established"] = { lo: 4, hi: null };
      r["support"] = { lo: ["o1", "o2"], hi: [] };
    });
    expect(firstFinding(weaker)).toStrictEqual(notReproduced({ kind: "kind-differs", carried: "entailed", rederived: "weakened" }));
  });

  const DROPS = { rulings: 0, sides: 0, undetected: 0, kindChanged: 0, unmetChanged: 0 };
  for (let chunk = 0; chunk < 10; chunk++) {
    it(`generated Briefs, seeds ${chunk * 50 + 1} to ${chunk * 50 + 50}: a dropped bound and support are caught exactly when the kind or the cut changes`, () => {
      for (let seed = chunk * 50 + 1; seed <= chunk * 50 + 50; seed++) {
        const s = scenarioOf(seed);
        const made = answer(s.grounding, s.question, s.draft);
        if (!made.ok) continue;
        const baseline = oracleBaselines(oracleFields(s.instance.schema));
        rulingsOf(made.brief).forEach((ruling, i) => {
          if (!isPositive(ruling)) return;
          DROPS.rulings += 1;
          const position = i === 0 ? "answer" : i - 1;
          for (const side of ["lo", "hi"] as const) {
            if (ruling.support[side].length === 0) continue;
            const b = baseline.get(ruling.field) as Extent;
            const next: Extent = { lo: ruling.established.lo, hi: ruling.established.hi, [side]: b[side] };
            const kind = classify({ ...next }, b, ruling.tested);
            const unmet = [...(ruling.tested.lo !== null && (next.lo === null || next.lo < ruling.tested.lo) ? ["lo"] : []), ...(ruling.tested.hi !== null && (next.hi === null || next.hi > ruling.tested.hi) ? ["hi"] : [])];
            const stays = kind === ruling.kind;
            const cutStays = ruling.kind !== "weakened" || JSON.stringify(unmet) === JSON.stringify(ruling.unmet);
            const forged = tampered(made.brief, position, (r) => {
              r["established"] = next;
              (r["support"] as Record<string, unknown>)[side] = [];
            });
            const got = recheck(s.grounding.schema, forged);
            if (!got.ok) throw new Error(`seed ${seed}: ${JSON.stringify(got.failure)}`);
            const finding = (got.findings[i] as { result: Reproduction }).result;
            DROPS.sides += 1;
            if (stays && cutStays) {
              DROPS.undetected += 1;
              expect(finding.kind, `seed ${seed} ${side}`).toBe("reproduced");
              expect(finding.kind === "reproduced" && finding.silentSides.includes(side), `seed ${seed} ${side}`).toBe(true);
            } else {
              if (!stays) DROPS.kindChanged += 1;
              else DROPS.unmetChanged += 1;
              expect(finding, `seed ${seed} ${side}`).toStrictEqual(notReproduced(stays ? { kind: "unmet-differs" } : { kind: "kind-differs", carried: ruling.kind, rederived: kind }));
            }
          }
        });
      }
    });
  }
  it("some forged omissions are undetected, the rest change the kind or the cut (needs every chunk above to have run)", () => {
    console.log(`recheck dropped bound and support together: ${DROPS.sides} on ${DROPS.rulings} positive rulings, ${DROPS.undetected} undetected, ${DROPS.kindChanged} change the kind, ${DROPS.unmetChanged} change only the cut`);
    expect(DROPS.sides).toBeGreaterThanOrEqual(500);
    expect(DROPS.undetected).toBeGreaterThanOrEqual(100);
    expect(DROPS.kindChanged).toBeGreaterThanOrEqual(100);
    expect(DROPS.unmetChanged).toBeGreaterThanOrEqual(10);
    expect(DROPS.undetected + DROPS.kindChanged + DROPS.unmetChanged).toBe(DROPS.sides);
  });

  it("fabricated observations are certified: authorship is asserted, which is why the quotes are carried", () => {
    // step 4's customs observation, invented as 'exactly 0 days' with a quote that holds the digit; the ruling is moved to match
    const forged = tampered(
      withEvidence(B3, (e) => void Object.assign(e[2] as Record<string, unknown>, { extent: { lo: 0, hi: 0 }, quote: "Customs clearance takes 0 days" })),
      "answer",
      (r) => void (r["established"] = { lo: 4, hi: 7 }),
    );
    expect(firstFinding(forged)).toStrictEqual({ kind: "reproduced", silentSides: [] });
    // wholly invented evidence, from nothing: four observations nobody wrote
    const invented = {
      answer: { kind: "entailed", field: "deliveryDay", tested: { lo: null, hi: 12 }, established: { lo: 5, hi: 5 }, support: { lo: ["x1", "x2", "x3"], hi: ["x1", "x2", "x3"] } },
      claims: [],
      rejected: [],
      evidence: [
        { id: "x1", field: "packDays", extent: { lo: 1, hi: 1 }, quote: "packed in 1 day", source: "nobody" },
        { id: "x2", field: "transitDays", extent: { lo: 3, hi: 3 }, quote: "transit is 3 days", source: "nobody" },
        { id: "x3", field: "customsDays", extent: { lo: 1, hi: 1 }, quote: "customs takes 1 day", source: "nobody" },
      ],
    };
    const r = recheck(G3.schema, invented as unknown as Brief);
    expect(r.ok && r.intact).toBe(true);
    expect(r.ok && r.findings).toStrictEqual([{ position: "answer", result: { kind: "reproduced", silentSides: [] } }]);
  });

  it("an ungrounded ruling is never certified or refuted, even when the Brief's own evidence bounds the field", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = honest(g, claim("customsDays", 2, 2), []);
    expect(brief.answer.kind).toBe("ungrounded");
    // the same ruling, carrying o3 which does bound customs: the Brief says 'nothing known', its evidence says otherwise, and the answer is unchanged
    const withO3 = withEvidence(brief, (e) => void e.push(structuredClone(thaw(B3.evidence)[2] as unknown as Record<string, unknown>)));
    expect(firstFinding(withO3, g.schema)).toStrictEqual({ kind: "uncertifiable-silence" });
    // and its open ends and tested extent can be anything the shape allows
    expect(firstFinding(tampered(brief, "answer", (r) => void (r["tested"] = { lo: 40, hi: 90 })), g.schema)).toStrictEqual({ kind: "uncertifiable-silence" });
    expect(firstFinding(tampered(brief, "answer", (r) => void (r["openEnds"] = [{ field: "elsewhere", side: "hi" }])), g.schema)).toStrictEqual({ kind: "uncertifiable-silence" });
  });

  it("a weakened ruling's openEnds is never compared with anything: an absence is not certified", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = honest(g, claim("deliveryDay", null, 12), []);
    expect(brief.answer).toMatchObject({ kind: "weakened", openEnds: [{ field: "customsDays", side: "hi" }] });
    const same = shown(brief, g.schema);
    for (const openEnds of [[], [{ field: "packDays", side: "lo" }], [{ field: "ghost", side: "hi" }, { field: "ghost", side: "lo" }], [null]]) {
      expect(shown(tampered(brief, "answer", (r) => void (r["openEnds"] = openEnds)), g.schema)).toStrictEqual(same);
    }
  });

  it("rulings are checked one at a time: two rulings of one field with different established extents are both reproduced", () => {
    const g = groundOf(DESK, canon("o1", "o2", "o3"));
    const brief = honest(g, claim("deliveryDay", 4, null), []);
    const second = honest(g, claim("deliveryDay", null, 12), []).answer;
    const mixed = { ...thaw(brief), claims: [thaw(second)] } as unknown as Brief;
    expect(mixed.answer).toMatchObject({ established: { lo: 4, hi: 9 } });
    const r = recheck(g.schema, mixed);
    expect(r.ok && r.intact).toBe(true);
    // and a ruling that says 'delivery is at least 4' next to one that says 'delivery is at most 3' (the same evidence cannot give both): each alone is judged
    const contradictory = { ...thaw(brief), claims: [{ ...thaw(second), tested: { lo: null, hi: 3 }, kind: "contradicted" }] } as unknown as Brief;
    const c = recheck(g.schema, contradictory);
    expect(c.ok && c.intact).toBe(true);
  });

  it("carried observations that no ruling names are grounded with the rest and otherwise not looked at, even a conflicting set", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = honest(g, claim("deliveryDay", 4, null), []);
    const extra = withEvidence(brief, (e) => void e.push(...(thaw(B4.evidence).filter((o) => o.id === "o3" || o.id === "o4") as unknown as Record<string, unknown>[])));
    expect(extra.evidence).toHaveLength(4);
    expect(shown(extra, g.schema)).toStrictEqual(shown(brief, g.schema));
    const r = recheck(g.schema, extra);
    expect(r.ok && r.intact).toBe(true);
  });

  it("Brief.rejected is not read and is not a ruling: a Brief whose refusals are replaced by anything gives the same result", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const brief = honest(g, claim("deliveryDay", 4, null), [null, { field: "ghost", extent: { lo: 1, hi: 2 } }]);
    expect(brief.rejected).toHaveLength(2);
    const same = recheck(g.schema, brief);
    for (const rejected of [[], "not a list", 7, { index: 0 }, null]) {
      expect(recheck(g.schema, { ...thaw(brief), rejected } as unknown as Brief)).toStrictEqual(same);
    }
  });

  it("the schema is the holder's: a Brief does not carry one, and a schema property on the Brief is not read", () => {
    const brief = honest(G3, claim("deliveryDay", null, 12), []);
    const rich = { ...thaw(brief), schema: { fields: [] } } as unknown as Brief;
    expect(recheck(G3.schema, rich)).toStrictEqual(recheck(G3.schema, brief));
    // and a different schema changes the verdict: the same Brief against a schema in which customsDays has a ceiling of 1 day is not what o3 allows
    const other = groundOf(schemaOf(base("packDays"), base("transitDays"), base("customsDays", 0, 1), derived("deliveryDay", ["packDays", "transitDays", "customsDays"])), []).schema;
    const r = recheck(other, brief);
    expect(r.ok && r.intact).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 6. Refusals.
// ---------------------------------------------------------------------------------------------------------

const hostileOf = (r: ReturnType<typeof recheck>): string | undefined => (!r.ok && r.failure.kind === "hostile-input" ? r.failure.message : undefined);

describe("what recheck refuses: a schema or evidence ground refuses, and a Brief of the wrong shape", () => {
  const ok3 = thaw(B3) as unknown as Record<string, unknown>;
  const mutate = (change: (b: { answer: Record<string, unknown>; claims: Record<string, unknown>[]; evidence: Record<string, unknown>[] } & Record<string, unknown>) => void): Brief => {
    const copy = thaw(B3) as unknown as { answer: Record<string, unknown>; claims: Record<string, unknown>[]; evidence: Record<string, unknown>[] } & Record<string, unknown>;
    change(copy);
    return copy as unknown as Brief;
  };
  it("a schema ground refuses is its failure, not a throw; the Brief is never needed to say so", () => {
    expect(recheck({ fields: [] } as never, B3)).toStrictEqual({ ok: false, failure: { kind: "invalid-schema", fault: { kind: "malformed", fields: ["fields"] } } });
    expect(recheck(null as never, B3)).toMatchObject({ ok: false, failure: { kind: "invalid-schema" } });
    expect(recheck(undefined as never, B3)).toMatchObject({ ok: false, failure: { kind: "invalid-schema" } });
  });

  it("more than MAX_OBSERVATIONS carried observations is too-many-observations with the count, and no element is read", () => {
    const log: string[] = [];
    const big = new Array<unknown>(MAX_OBSERVATIONS + 1);
    const brief = { ...(ok3 as object), evidence: logged(big, log) } as unknown as Brief;
    expect(recheck(G3.schema, brief)).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: MAX_OBSERVATIONS + 1, max: MAX_OBSERVATIONS } });
    expect(log).toStrictEqual(["get:length"]);
    // exactly MAX_OBSERVATIONS is read (here 64 copies of one observation's shape are refused one by one, as duplicates, not as too many)
    const at = mutate((b) => void (b.evidence = Array.from({ length: MAX_OBSERVATIONS }, (_, i) => ({ id: `e${i}`, field: "packDays", extent: { lo: 1, hi: 2 }, quote: "1 to 2 days", source: "s" }))));
    expect(recheck(G3.schema, at).ok).toBe(true);
  });

  it("an evidence length of 2**32 or more, which no real array has, is too-many-observations with that count, not a throw", () => {
    for (const length of [2 ** 32 - 1, 2 ** 32, 2 ** 40, Number.MAX_SAFE_INTEGER]) {
      const log: string[] = [];
      const lying = logged(new Proxy([] as unknown[], { get: (t, k, r) => (k === "length" ? length : Reflect.get(t, k, r)) }), log);
      const brief = { ...(ok3 as object), evidence: lying } as unknown as Brief;
      expect(recheck(G3.schema, brief), `length ${length}`).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: length, max: MAX_OBSERVATIONS } });
      expect(log, `length ${length}`).toStrictEqual(["get:length"]);
    }
  });

  const CASES: readonly (readonly [string, (b: { answer: unknown; claims: unknown; evidence: unknown; [k: string]: unknown }) => void, string])[] = [
    ["no answer", (b) => void delete (b as { answer?: unknown }).answer, "brief.answer is not an object"],
    ["an answer that is null", (b) => void (b.answer = null), "brief.answer is not an object"],
    ["an answer that is an array", (b) => void (b.answer = []), "brief.answer is not an object"],
    ["claims that are not an array", (b) => void (b.claims = {}), "brief.claims is not an array"],
    ["claims of 33", (b) => void (b.claims = Array.from({ length: MAX_DRAFT_CLAIMS + 1 }, () => b.answer)), `brief.claims has more than ${MAX_DRAFT_CLAIMS} entries`],
    ["a claim that is a string", (b) => void (b.claims = ["x"]), "brief.claims[0] is not an object"],
    ["evidence that is not an array", (b) => void (b.evidence = "x"), "brief.evidence is not an array"],
    ["an unknown kind", (b) => void ((b.answer as Record<string, unknown>)["kind"] = "plausible"), "brief.answer has an unknown kind"],
    ["a field that is empty", (b) => void ((b.answer as Record<string, unknown>)["field"] = ""), "brief.answer.field is not a field id"],
    ["a field that is a number", (b) => void ((b.answer as Record<string, unknown>)["field"] = 5), "brief.answer.field is not a field id"],
    ["a tested extent that is inverted", (b) => void ((b.answer as Record<string, unknown>)["tested"] = { lo: 5, hi: 3 }), "brief.answer.tested is not an extent"],
    ["an established extent out of range", (b) => void ((b.answer as Record<string, unknown>)["established"] = { lo: 2 ** 41, hi: null }), "brief.answer.established is not an extent"],
    ["a support that is not an object", (b) => void ((b.answer as Record<string, unknown>)["support"] = []), "brief.answer.support is not an object"],
    ["a support list that is not a list", (b) => void ((b.answer as Record<string, unknown>)["support"] = { lo: 1, hi: [] }), "brief.answer.support.lo is not a list"],
    ["a support id that is not an id", (b) => void ((b.answer as Record<string, unknown>)["support"] = { lo: [1], hi: [] }), "brief.answer.support.lo[0] is not an id"],
    ["a support list of 65 ids", (b) => void ((b.answer as Record<string, unknown>)["support"] = { lo: Array.from({ length: 65 }, () => "o1"), hi: [] }), "brief.answer.support.lo has more than 64 entries"],
    ["a cut that is not a side", (b) => void (((b.claims as unknown[])[0] as Record<string, unknown>)["unmet"] = ["middle"]), "brief.claims[0].unmet[0] is not a side"],
    ["openEnds that is not a list", (b) => void (((b.claims as unknown[])[0] as Record<string, unknown>)["openEnds"] = "none"), "brief.claims[0].openEnds is not a list"],
    ["a ruling carrying a field its kind forbids", (b) => void ((b.answer as Record<string, unknown>)["core"] = ["o1"]), "brief.answer is not a well-formed entailed: unexpected-field core"],
    ["a ruling missing a field its kind needs", (b) => void delete (b.answer as Record<string, unknown>)["support"], "brief.answer is not a well-formed entailed: missing-field support"],
    ["a weakened ruling with an empty cut", (b) => void (((b.claims as unknown[])[0] as Record<string, unknown>)["unmet"] = []), "brief.claims[0] is not a well-formed weakened: empty-array unmet"],
    ["an answer about a field the schema does not declare", (b) => void ((b.answer as Record<string, unknown>)["field"] = "elsewhere"), "brief.answer names a field the schema does not declare"],
    ["a claim about a field the schema does not declare", (b) => void (((b.claims as unknown[])[1] as Record<string, unknown>)["field"] = "elsewhere"), "brief.claims[1] names a field the schema does not declare"],
  ];
  for (const [title, change, message] of CASES) {
    it(`${title}: hostile-input, "${message}"`, () => {
      const brief = mutate((b) => change(b as never));
      const r = recheck(G3.schema, brief);
      expect(hostileOf(r)).toBe(message);
    });
  }

  it("a Brief that is not an object at all, in each way that could be", () => {
    for (const bad of [null, undefined, 5, "brief", [], true, Symbol("b"), () => 1]) expect(hostileOf(recheck(G3.schema, bad as never)), String(typeof bad)).toBe("the brief is not an object");
  });

  it("a revoked Proxy, at the Brief and at each object inside it, is hostile-input in the package's own words", () => {
    const revoked = (): object => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      return proxy;
    };
    expect(hostileOf(recheck(G3.schema, revoked() as never))).toBe("reading the brief threw");
    const places: readonly [string, (b: Record<string, unknown>) => void][] = [
      ["answer", (b) => void (b["answer"] = revoked())],
      ["claims", (b) => void (b["claims"] = revoked())],
      ["evidence", (b) => void (b["evidence"] = revoked())],
      ["a claim", (b) => void ((b["claims"] as unknown[])[0] = revoked())],
      ["an observation", (b) => void ((b["evidence"] as unknown[])[0] = revoked())],
      ["an extent", (b) => void (((b["answer"] as Record<string, unknown>)["tested"]) = revoked())],
      ["a support", (b) => void (((b["answer"] as Record<string, unknown>)["support"]) = revoked())],
    ];
    for (const [name, change] of places) {
      const brief = mutate((b) => change(b));
      const message = hostileOf(recheck(G3.schema, brief));
      expect(message, name).toMatch(/^(reading .* threw|brief\.\S+ is not an? \w+)$/);
    }
  });

  it("a message is made of the package's words alone: whatever a throwing getter says never reaches the result", () => {
    const brief = mutate((b) => void Object.defineProperty(b.answer, "kind", { enumerable: true, get: () => { throw new Error("SECRET-31337"); } }));
    const r = recheck(G3.schema, brief);
    expect(hostileOf(r)).toBe("reading brief.answer.kind threw");
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });
});

// ---------------------------------------------------------------------------------------------------------
// 7. Read-once.
// ---------------------------------------------------------------------------------------------------------

/**
 * A Brief that has every shape of ruling in it, so every place the reader looks at is real: an answer that is `weakened`
 * (a support, a cut, an open end), an entailed claim, an ungrounded one, a contradicted one, a conflicted one with its
 * core, and the four observations of the plan carried. The rulings come from two groundings (o1 o2, and o1 o2 o3 o4); the
 * Brief is hand-assembled, which `recheck` does not mind: it reads only the Brief.
 */
function mixedBrief(): Brief {
  const g12 = groundOf(DESK, canon("o1", "o2"));
  const weak = honest(g12, claim("deliveryDay", null, 12), []).answer;
  const entailed = honest(g12, claim("deliveryDay", 4, null), []).answer;
  const ungrounded = honest(g12, claim("customsDays", 2, 2), []).answer;
  const contradicted = honest(g12, claim("deliveryDay", null, 3), []).answer;
  const conflicted = B4.answer;
  return thaw({ answer: weak, claims: [entailed, ungrounded, contradicted, conflicted], rejected: [], evidence: B4.evidence }) as unknown as Brief;
}
const MIXED = mixedBrief();
const THROW = Symbol.for("throw");

type Path = readonly (string | number)[];
const RULING_KEYS = ["kind", "field", "tested", "established", "support", "unmet", "openEnds", "core"] as const;

/** Every place `recheck` reads, as paths into the Brief, each with its place named. `length` is a read of its own. */
function placesOf(brief: Brief): Path[] {
  const places: Path[] = [["answer"], ["claims"], ["evidence"]];
  const walk = (value: unknown, path: Path): void => {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      places.push([...path, "length"]);
      value.forEach((item, i) => {
        places.push([...path, i]);
        walk(item, [...path, i]);
      });
      return;
    }
    for (const key of Object.keys(value)) {
      places.push([...path, key]);
      walk((value as Record<string, unknown>)[key], [...path, key]);
    }
  };
  const record = brief as unknown as { answer: unknown; claims: unknown[]; evidence: unknown[] };
  const rulingPlaces = (ruling: Record<string, unknown>, path: Path): void => {
    for (const key of RULING_KEYS) if (!(key in ruling)) places.push([...path, key]);
    walk(ruling, path);
  };
  rulingPlaces(record.answer as Record<string, unknown>, ["answer"]);
  places.push(["claims", "length"]);
  record.claims.forEach((claimed, i) => {
    places.push(["claims", i]);
    rulingPlaces(claimed as Record<string, unknown>, ["claims", i]);
  });
  places.push(["evidence", "length"]);
  record.evidence.forEach((observed, i) => {
    places.push(["evidence", i]);
    walk(observed, ["evidence", i]);
  });
  // the walk visited the keys of the rulings and observations; drop the repeats (a path is one place)
  const seen = new Set<string>();
  return places.filter((p) => !seen.has(JSON.stringify(p)) && !!seen.add(JSON.stringify(p)));
}

/**
 * The Brief with `path` made a probe: an accessor that answers `first` once and `later` after, or, for a `length`, a
 * Proxy over the array whose length does the same. Returns the Brief and the read counter of that place.
 */
function probed(path: Path, first: unknown, later: unknown): { brief: Brief; reads: () => number } {
  const copy = thaw(MIXED) as unknown as Record<string, unknown>;
  const probe = counted(first, later);
  let parent: unknown = copy;
  for (const step of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[step];
  const last = path[path.length - 1] as string | number;
  if (last === "length") {
    const grandPath = path.slice(0, -2);
    let holder: unknown = copy;
    for (const step of grandPath) holder = (holder as Record<string | number, unknown>)[step];
    const key = path[path.length - 2] as string | number;
    const array = (holder as Record<string | number, unknown>)[key] as unknown[];
    (holder as Record<string | number, unknown>)[key] = new Proxy(array, { get: (t, k, r) => (k === "length" ? probe.get() : Reflect.get(t, k, r)) });
  } else {
    defineCounted(parent as object, last, probe);
  }
  return { brief: copy as unknown as Brief, reads: probe.reads };
}

const ALL_PLACES = placesOf(MIXED);
/** `openEnds` is read for being a list and for its length, and its entries are never read: nothing may read an open end (the header of `readBrief`). */
const isOpenEndEntry = (p: Path): boolean => p.includes("openEnds") && p.length > p.indexOf("openEnds") + 1 && p[p.indexOf("openEnds") + 1] !== "length";
const PLACES = ALL_PLACES.filter((p) => !isOpenEndEntry(p));
const NEVER_READ = ALL_PLACES.filter(isOpenEndEntry);
const REVOKED = (() => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
})();
const FIRSTS: readonly (readonly [string, unknown])[] = [...FIRST_VALUES, ["a throw", THROW], ["a revoked Proxy", REVOKED]];
const LATERS: readonly (readonly [string, unknown])[] = [
  ["NaN", Number.NaN],
  ["an object", { lo: 0, hi: 0, kind: "entailed" }],
  ["a throw", THROW],
];

describe("read-once: every place the Brief is read gives one read, whatever a later read would say", () => {
  it("the places are the Brief's own: a hundred or more, each a distinct path, and none of them under rejected", () => {
    console.log(`recheck read-once: ${PLACES.length} places, ${FIRSTS.length} first values, ${LATERS.length} hostile later values: ${PLACES.length * FIRSTS.length * LATERS.length} cases`);
    expect(PLACES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(PLACES.map((p) => JSON.stringify(p))).size).toBe(PLACES.length);
    expect(PLACES.some((p) => p[0] === "rejected")).toBe(false);
    for (const wanted of [["answer"], ["claims", 3, "core", 0], ["evidence", 3, "extent", "hi"], ["claims", "length"], ["evidence", "length"], ["answer", "support", "lo", "length"], ["answer", "openEnds", "length"], ["claims", 1, "established"]]) {
      expect(PLACES.map((p) => JSON.stringify(p)), `the place ${JSON.stringify(wanted)}`).toContain(JSON.stringify(wanted));
    }
  });

  const CHUNK = 8;
  const total = Math.ceil(PLACES.length / CHUNK);
  const seen = { cases: 0, places: 0 };
  for (let c = 0; c < total; c++) {
    it(`places ${c * CHUNK + 1} to ${Math.min(PLACES.length, (c + 1) * CHUNK)}: each read once, and the result equals the one a constant first value gives`, () => {
      for (const path of PLACES.slice(c * CHUNK, (c + 1) * CHUNK)) {
        seen.places += 1;
        for (const [firstName, first] of FIRSTS) {
          // the reference: the same place, always answering `first`
          const constant = probed(path, first, first);
          const want = recheck(G3.schema, constant.brief);
          for (const [laterName, later] of LATERS) {
            const hostile = probed(path, first, later);
            const got = recheck(G3.schema, hostile.brief);
            seen.cases += 1;
            expect(hostile.reads(), `${JSON.stringify(path)} first ${firstName} later ${laterName}: reads`).toBe(1);
            expect(JSON.stringify(got), `${JSON.stringify(path)} first ${firstName} later ${laterName}`).toBe(JSON.stringify(want));
          }
        }
      }
    });
  }
  it("an open end is never read: a probe on an entry of openEnds, or on a part of one, is read zero times, whatever it says", () => {
    expect(NEVER_READ.length).toBeGreaterThanOrEqual(4);
    const honestResult = JSON.stringify(recheck(G3.schema, MIXED));
    for (const path of NEVER_READ) {
      for (const [name, first] of FIRSTS) {
        const probe = probed(path, first, THROW);
        expect(JSON.stringify(recheck(G3.schema, probe.brief)), `${JSON.stringify(path)} ${name}`).toBe(honestResult);
        expect(probe.reads(), `${JSON.stringify(path)} ${name}`).toBe(0);
      }
    }
  });

  it("the table ran at every place with every first value (needs every chunk above to have run)", () => {
    expect(seen.places, "all chunks ran: do not filter this file with -t").toBe(PLACES.length);
    expect(seen.cases).toBe(PLACES.length * FIRSTS.length * LATERS.length);
  });

  it("with the original value as the first read, the result is the honest one, at every place", () => {
    const honestResult = JSON.stringify(recheck(G3.schema, MIXED));
    let checked = 0;
    for (const path of PLACES) {
      let original: unknown = MIXED;
      for (const step of path) original = (original as Record<string | number, unknown>)?.[step];
      const probe = probed(path, original, THROW);
      expect(JSON.stringify(recheck(G3.schema, probe.brief)), JSON.stringify(path)).toBe(honestResult);
      expect(probe.reads(), JSON.stringify(path)).toBe(1);
      checked += 1;
    }
    expect(checked).toBe(PLACES.length);
  });

  it("the honest result of the mixed Brief is what this table is about: every kind of finding the Brief can hold", () => {
    expect(shown(MIXED, G3.schema)).toStrictEqual(["reproduced:hi", "reproduced:hi", "uncertifiable-silence", "reproduced:hi", "reproduced:"]);
  });

  it("the top of the Brief is read as exactly answer, claims, evidence, and nothing else: no rejected, no schema, no key listing", () => {
    const log: string[] = [];
    const r = recheck(G3.schema, logged(thaw(MIXED), log));
    expect(r.ok).toBe(true);
    expect(log).toStrictEqual(["get:answer", "get:claims", "get:evidence"]);
  });

  it("what is never read: rejected, and an extra property of the Brief, of a ruling or of an observation, even one whose getter throws", () => {
    const copy = thaw(MIXED) as unknown as Record<string, unknown>;
    const trap = { get: () => { throw new Error("must not be read"); }, enumerable: true } as const;
    Object.defineProperty(copy, "rejected", trap);
    Object.defineProperty(copy, "extra", trap);
    Object.defineProperty((copy["answer"] as object), "extra", trap);
    Object.defineProperty(((copy["claims"] as object[])[0] as object), "note", trap);
    Object.defineProperty(((copy["evidence"] as object[])[0] as object), "tag", trap);
    Object.defineProperty((((copy["answer"] as Record<string, unknown>)["tested"]) as object), "extra", trap);
    expect(JSON.stringify(recheck(G3.schema, copy as unknown as Brief))).toBe(JSON.stringify(recheck(G3.schema, MIXED)));
  });

  it("a ruling is read through Proxy traps of get alone: no has, ownKeys, descriptor or prototype trap", () => {
    const log: string[] = [];
    const copy = thaw(MIXED) as unknown as { answer: object; claims: object[]; evidence: object[] };
    copy.answer = logged(copy.answer, log);
    copy.claims[1] = logged(copy.claims[1] as object, log);
    copy.evidence[0] = logged(copy.evidence[0] as object, log);
    expect(recheck(G3.schema, copy as unknown as Brief).ok).toBe(true);
    expect(log.filter((entry) => !entry.startsWith("get:"))).toStrictEqual([]);
    const gets = log.filter((entry) => entry.startsWith("get:"));
    expect(gets).toHaveLength(8 + 8 + 5);
    expect(new Set(gets).size).toBeLessThan(gets.length);
  });
});

// ---------------------------------------------------------------------------------------------------------
// 8. At the maximum.
// ---------------------------------------------------------------------------------------------------------

describe("at the maximum: 33 rulings, 64 observations, and a support of 32 ids", () => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const fields = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`)), ...Array.from({ length: 31 }, (_, i) => derived(`d${pad(i + 1)}`, [i === 0 ? "b00" : `d${pad(i)}`, `b${pad(i + 1)}`])), base("spare")];
  const schema = schemaOf(...fields);
  const observations: RawObservation[] = [
    ...Array.from({ length: 32 }, (_, i) => obs(`ob${pad(i)}`, `b${pad(i)}`, i, i + 1)),
    ...Array.from({ length: 30 }, (_, i) => obs(`ol${pad(i + 1)}`, `d${pad(i + 1)}`, 0, 1000)),
    obs("ospare", "spare", 0, 0),
    obs("oroot", "d31", 0, 1000),
  ];
  const g = groundOf(schema, observations);
  const claims = Array.from({ length: MAX_DRAFT_CLAIMS }, (_, i) => claim("d31", null, i % 2 === 0 ? 528 : 527));
  const brief = honest(g, claim("d31", 496, null), claims);

  it("the instance is at the maximum: 64 fields, 64 observations, 1 question and 32 draft claims, a support of 32 ids", () => {
    expect(schema.fields).toHaveLength(64);
    expect(observations).toHaveLength(64);
    expect(brief.claims).toHaveLength(MAX_DRAFT_CLAIMS);
    const widest = rulingsOf(brief).map((r) => (isPositive(r) ? Math.max(r.support.lo.length, r.support.hi.length) : 0));
    expect(Math.max(...widest)).toBe(32);
    // only the observations some support names are carried: 32 bases (the upper support of every claim) and no others, because the loose ones move nothing
    expect(brief.evidence).toHaveLength(32);
  });

  it("every one of the 33 rulings is reproduced, and the weakened ones carry the cut: D31 is [496, 528] by arithmetic", () => {
    const r = recheck(g.schema, brief);
    expect(r.ok && r.intact).toBe(true);
    expect(r.ok && r.findings).toHaveLength(33);
    expect(shown(brief, g.schema).filter((f) => f === "reproduced:")).toHaveLength(33);
    expect(brief.answer).toMatchObject({ kind: "entailed", established: { lo: 496, hi: 528 } });
    expect(brief.claims.filter((c) => c.kind === "entailed")).toHaveLength(16);
    expect(brief.claims.filter((c) => c.kind === "weakened")).toHaveLength(16);
  });

  it("one more claim than the cap is refused whole, and one more bound is caught at the widest support", () => {
    const over = { ...thaw(brief), claims: [...thaw(brief.claims), thaw(brief.claims[0])] } as unknown as Brief;
    expect(hostileOf(recheck(g.schema, over))).toBe(`brief.claims has more than ${MAX_DRAFT_CLAIMS} entries`);
    expect(firstFinding(tampered(brief, "answer", (x) => void (x["established"] = { lo: 496, hi: 529 })), g.schema)).toStrictEqual(notReproduced({ kind: "bound-differs", side: "hi", carried: 529, rederived: 528 }));
    expect(firstFinding(tampered(brief, "answer", (x) => void (x["established"] = { lo: 495, hi: 528 })), g.schema)).toStrictEqual(notReproduced({ kind: "bound-differs", side: "lo", carried: 495, rederived: 496 }));
    // and a support that lacks its last id (31 of the 32) re-derives a hi bound of 527, so the carried 528 is not reproduced
    const short = tampered(brief, "answer", (x) => void ((x["support"] as { hi: string[] }).hi.pop()));
    expect(firstFinding(short, g.schema)).toMatchObject({ kind: "not-reproduced", reason: { kind: "bound-differs", side: "hi", carried: 528 } });
  });

  it("a fully carried 64 observations are all grounded: the loose ones are carried too, and unnamed, and nothing changes", () => {
    const withAll = { ...thaw(brief), evidence: thaw(g.observations) } as unknown as Brief;
    expect(withAll.evidence).toHaveLength(64);
    expect(shown(withAll, g.schema)).toStrictEqual(shown(brief, g.schema));
    const tooMany = { ...thaw(brief), evidence: [...thaw(g.observations), { id: "extra", field: "spare", extent: { lo: 0, hi: 0 }, quote: "0", source: "s" }] } as unknown as Brief;
    expect(recheck(g.schema, tooMany)).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: 65, max: 64 } });
  });
});
