import { assertEntailmentWellFormed, fieldId, obsId } from "../../../lib/contracts/index.js";
import type { Conflicted, Entailment, EntailmentIntegrity, Ungrounded, Weakened } from "../../../lib/contracts/index.js";

/**
 * The self-checks behind `GET /api/health` (`.genesis/PLAN.md` section 6, M2). They live beside the route, not
 * in it, for one reason: a Next.js route module may export only `GET`, the segment config and a few other
 * names, so a seam that tests need (a case whose input construction throws) cannot be exported from
 * `route.ts`. `route.test.ts` pins that `route.ts` still exports exactly `GET`, `dynamic` and `runtime`.
 *
 * WHAT IS CHECKED. `assertEntailmentWellFormed` (M1) is run on four values, and its verdict is compared with
 * the plan's expectation for each:
 *   1. a well-formed `conflicted`                                  -> ok
 *   2. an `ungrounded` that also carries `established`             -> unexpected-field / ungrounded / established
 *   3. a `weakened` whose `unmet` is `[]`                           -> empty-array / weakened / unmet
 *   4. a `conflicted` that has no `core`                            -> missing-field / conflicted / core
 * Two directions on purpose: 1 fails if the guard turns into "reject everything", 2 to 4 fail if it turns
 * into "accept everything", and each of 2 to 4 names a different cell of the guard's table.
 *
 * EACH CAST-BUILT VALUE IS A COMPLETE, WELL-FORMED VALUE THAT DIFFERS FROM IT IN EXACTLY ONE FIELD. This is
 * not tidiness: the guard reports the FIRST problem it finds, and it checks a variant's required fields
 * before its forbidden ones (`integrity.ts`, its doc comment). A bare `{ kind: "ungrounded", established }`
 * therefore reports `missing-field` / `openEnds`, never the `unexpected-field` the plan wants to see, and a
 * check built that way would pass for the wrong reason (or fail for it). `checks.test.ts` pins both halves:
 * the bare form really does report the other fault, and repairing the one field of each case really does make
 * the whole value pass.
 *
 * HOW THE FAULTS ARE BUILT: by a cast, `as unknown as Entailment`. `lib/contracts/entailment.ts` and M1's ADR
 * (Decision 3) list the other routes by which a value like these can exist (a supertype, mutation after
 * construction, parsed JSON, ...); this file takes one of them and does not claim it is the only one.
 *
 * WHAT COULD STILL GO WRONG WITHOUT THIS GOING RED. Three cells of the guard's table (one forbidden, one
 * required, one non-empty) and one value that must pass whole are exercised, not every cell
 * (`lib/contracts/__tests__/integrity.test.ts` pins them all). A guard that broke some other cell would not
 * turn this red. This is a smoke check that M1's guard still behaves in the deployed process, not a
 * replacement for M1's own tests.
 */

/** One self-check. `expected` is `ok`, or the guard's error written as `kind/variant/field`. */
export interface HealthCase {
  readonly name: string;
  readonly expected: string;
  /** Builds the value to test. `runCase` calls it INSIDE its `try`: a throw here is a failed check, not a 500. */
  readonly build: () => Entailment;
}

export interface CaseResult {
  readonly name: string;
  readonly pass: boolean;
  readonly expected: string;
  /** What the guard said (`ok` or `kind/variant/field`), or `threw during <phase>: <message>`. */
  readonly actual: string;
}

export interface ContractChecks {
  readonly pass: boolean;
  /** The names of the cases that did not pass, in case order. Empty when `pass` is true. */
  readonly failing: readonly string[];
  readonly cases: readonly CaseResult[];
}

// ---- the values -------------------------------------------------------------------------------------------
// Built by functions, called per request, not constants built at import time: construction that throws must
// be catchable by `runCase`, and a module-level throw would make the route fail to load instead.

/** A complete, well-formed `conflicted` (the plan's section 7, step 5: `delivery <= 12` against all four documents). */
function wellFormedConflicted(): Conflicted {
  return {
    kind: "conflicted",
    field: fieldId("deliveryDay"),
    tested: { lo: null, hi: 12 },
    core: [obsId("o1"), obsId("o2"), obsId("o3"), obsId("o4")],
  };
}

/** A complete, well-formed `ungrounded`: both ends of customs time are open. */
function wellFormedUngrounded(): Ungrounded {
  return {
    kind: "ungrounded",
    field: fieldId("customsDays"),
    tested: { lo: 2, hi: 2 },
    openEnds: [
      { field: fieldId("customsDays"), side: "lo" },
      { field: fieldId("customsDays"), side: "hi" },
    ],
  };
}

/** A complete, well-formed `weakened`: `delivery <= 12` cut back to "at least 4"; the cut is the upper side. */
function wellFormedWeakened(): Weakened {
  return {
    kind: "weakened",
    field: fieldId("deliveryDay"),
    tested: { lo: null, hi: 12 },
    established: { lo: 4, hi: null },
    support: { lo: [obsId("o1"), obsId("o2")], hi: [] },
    unmet: ["hi"],
    openEnds: [{ field: fieldId("customsDays"), side: "hi" }],
  };
}

/** The `ungrounded` above with ONE field added: `established`, which that variant refuses to carry. */
function ungroundedCarryingEstablished(): Entailment {
  return { ...wellFormedUngrounded(), established: { lo: 4, hi: 9 } } as unknown as Entailment;
}

/** The `weakened` above with ONE field changed: `unmet` is `[]`, which the type forbids and the guard names. */
function weakenedWithEmptyUnmet(): Entailment {
  return { ...wellFormedWeakened(), unmet: [] } as unknown as Entailment;
}

/** The `conflicted` above with ONE field removed: `core`. */
function conflictedMissingCore(): Entailment {
  const { core: _core, ...withoutCore } = wellFormedConflicted();
  return withoutCore as unknown as Entailment;
}

/** The four self-checks of the plan, in the plan's order. `route.test.ts` and `checks.test.ts` pin names and expectations. */
export const HEALTH_CASES: readonly HealthCase[] = [
  { name: "well-formed-conflicted", expected: "ok", build: wellFormedConflicted },
  { name: "ungrounded-carrying-established", expected: "unexpected-field/ungrounded/established", build: ungroundedCarryingEstablished },
  { name: "weakened-with-empty-unmet", expected: "empty-array/weakened/unmet", build: weakenedWithEmptyUnmet },
  { name: "conflicted-missing-core", expected: "missing-field/conflicted/core", build: conflictedMissingCore },
];

// ---- running them -----------------------------------------------------------------------------------------

/** The guard's verdict in the same `kind/variant/field` notation the cases use for `expected`. */
function describeVerdict(verdict: EntailmentIntegrity): string {
  if (verdict.ok) return "ok";
  const error = verdict.error;
  return error.kind === "unknown-variant" ? `unknown-variant/${error.found}` : `${error.kind}/${error.variant}/${error.field}`;
}

/** What a thrown value says. A value that is not a string or an `Error` is not stringified: that could itself throw. */
function describeThrown(thrown: unknown): string {
  if (typeof thrown === "string") return thrown;
  if (thrown instanceof Error) return thrown.message;
  return "a value that is not an Error was thrown";
}

/**
 * Runs one case. NEITHER step may escape: input construction (`build`) and the guard call are BOTH inside the
 * `try`, so a case that throws while being built, or a guard that throws, is a failed check with the phase
 * named, and the route answers 503 instead of letting the exception out of `GET`. If `build()` is hoisted out
 * of the `try` (it looks like a harmless tidy-up) the first throw escapes, which `checks.test.ts` and
 * `route.test.ts` each catch.
 */
export function runCase(healthCase: HealthCase): CaseResult {
  const { name, expected } = healthCase;
  let phase = "input construction";
  try {
    const input = healthCase.build();
    phase = "guard";
    const actual = describeVerdict(assertEntailmentWellFormed(input));
    return { name, pass: actual === expected, expected, actual };
  } catch (thrown) {
    return { name, pass: false, expected, actual: `threw during ${phase}: ${describeThrown(thrown)}` };
  }
}

/**
 * Runs every case; `pass` is true only if there is at least one case and all of them passed (an empty list
 * must not read as healthy: a check that ran nothing cannot fail). `cases` is a parameter so a test can hand
 * it one that throws.
 */
export function runContractChecks(cases: readonly HealthCase[] = HEALTH_CASES): ContractChecks {
  const results = cases.map(runCase);
  const failing = results.filter((result) => !result.pass).map((result) => result.name);
  return { pass: results.length > 0 && failing.length === 0, failing, cases: results };
}
