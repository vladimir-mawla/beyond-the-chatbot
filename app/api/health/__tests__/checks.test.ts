import { describe, expect, it } from "vitest";
import { assertEntailmentWellFormed, obsId } from "../../../../lib/contracts/index.js";
import type { Entailment } from "../../../../lib/contracts/index.js";
import { HEALTH_CASES, runCase, runContractChecks } from "../checks";
import type { HealthCase } from "../checks";

/**
 * The self-checks of `GET /api/health`, tested without the route: the plan's four cases against the real
 * `assertEntailmentWellFormed`, the one-fault property of each cast-built value, and the one place the route
 * must never let an exception out (`runCase`'s `try`).
 *
 * The route-level behaviour (status codes, the SHA, the module's exports) is in `route.test.ts`.
 */

/** The plan's four cases (`.genesis/PLAN.md` section 6, M2), written out here independently of `checks.ts`. */
const PLAN: readonly (readonly [name: string, expected: string])[] = [
  ["well-formed-conflicted", "ok"],
  ["ungrounded-carrying-established", "unexpected-field/ungrounded/established"],
  ["weakened-with-empty-unmet", "empty-array/weakened/unmet"],
  ["conflicted-missing-core", "missing-field/conflicted/core"],
];

function caseNamed(name: string): HealthCase {
  const found = HEALTH_CASES.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no health case named ${name}`);
  return found;
}

function asRecord(value: Entailment): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

describe("the four cases of the plan", () => {
  it("are exactly these four, in this order, with these expectations", () => {
    expect(HEALTH_CASES.map((c) => [c.name, c.expected])).toEqual(PLAN);
  });

  it.each(PLAN)("%s: the real guard says %s", (name, expected) => {
    const result = runCase(caseNamed(name));
    expect(result).toEqual({ name, pass: true, expected, actual: expected });
  });

  it("runContractChecks passes only when all four do", () => {
    const checks = runContractChecks();
    expect(checks.pass).toBe(true);
    expect(checks.failing).toEqual([]);
    expect(checks.cases.map((c) => c.name)).toEqual(PLAN.map(([name]) => name));
  });

  it("build() returns a fresh value each call, so one run cannot change the next", () => {
    for (const c of HEALTH_CASES) expect(c.build()).not.toBe(c.build());
  });
});

describe("each cast-built value has exactly one fault", () => {
  // Repairing the one named field must make the WHOLE value pass the guard. The guard reports only the first
  // problem, so a value with a second fault would still fail after the repair. This is what "differs from a
  // complete, well-formed value in exactly that one field" means, as far as the guard can see it.
  const repairs: readonly (readonly [name: string, repair: (value: Record<string, unknown>) => Record<string, unknown>])[] = [
    [
      "ungrounded-carrying-established",
      (value) => {
        const { established: _established, ...rest } = value;
        return rest;
      },
    ],
    ["weakened-with-empty-unmet", (value) => ({ ...value, unmet: ["hi"] })],
    ["conflicted-missing-core", (value) => ({ ...value, core: [obsId("o1")] })],
  ];

  it.each(repairs)("%s: repairing that one field leaves a value the guard accepts", (name, repair) => {
    const repaired = repair(asRecord(caseNamed(name).build()));
    expect(assertEntailmentWellFormed(repaired as unknown as Entailment)).toEqual({ ok: true });
  });

  it("and the faulty value itself is refused (the repair above is not a no-op)", () => {
    for (const [name] of repairs) {
      expect(assertEntailmentWellFormed(caseNamed(name).build()).ok).toBe(false);
    }
  });

  it("the well-formed conflicted is complete: it is accepted as built", () => {
    expect(assertEntailmentWellFormed(caseNamed("well-formed-conflicted").build())).toEqual({ ok: true });
  });
});

describe("why the values are complete and not bare", () => {
  // The trap M1's verifier found, pinned: the guard checks a variant's REQUIRED fields before its FORBIDDEN
  // ones, so a bare ungrounded or weakened literal reports a different, earlier fault than the one a health check
  // wants to see (a bare conflicted without a core reports the plan's cell, so it is not an instance of this trap).
  it("a bare ungrounded carrying established reports the missing openEnds, not the unexpected established", () => {
    const bare = { kind: "ungrounded", established: { lo: 4, hi: 9 } } as unknown as Entailment;
    expect(assertEntailmentWellFormed(bare)).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "ungrounded", field: "openEnds" },
    });
  });

  it("a bare weakened with an empty unmet reports the missing established, not the empty unmet", () => {
    const bare = { kind: "weakened", unmet: [] } as unknown as Entailment;
    expect(assertEntailmentWellFormed(bare)).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "weakened", field: "established" },
    });
  });
});

describe("runCase never lets an exception out", () => {
  it("input construction that throws is a failed check naming the phase, not a throw", () => {
    const building: HealthCase = {
      name: "throws while building",
      expected: "ok",
      build: () => {
        throw new Error("boom");
      },
    };
    expect(() => runCase(building)).not.toThrow();
    expect(runCase(building)).toEqual({ name: "throws while building", pass: false, expected: "ok", actual: "threw during input construction: boom" });
  });

  it("a guard that throws is a failed check naming the phase, not a throw", () => {
    // The real guard throws on a hostile object: M1's doc comment on it says "a getter that throws makes it throw".
    const hostile: HealthCase = {
      name: "hostile getter",
      expected: "ok",
      build: () => Object.defineProperty({}, "kind", {
        get() {
          throw new Error("hostile getter");
        },
      }) as unknown as Entailment,
    };
    expect(() => runCase(hostile)).not.toThrow();
    expect(runCase(hostile)).toEqual({ name: "hostile getter", pass: false, expected: "ok", actual: "threw during guard: hostile getter" });
  });

  it("a thrown value that is not an Error is reported without being stringified", () => {
    const hostileToString = {
      toString() {
        throw new Error("toString must not be called");
      },
    };
    for (const thrown of ["a string", 42, hostileToString]) {
      const c: HealthCase = {
        name: "odd throw",
        expected: "ok",
        build: () => {
          throw thrown;
        },
      };
      const result = runCase(c);
      expect(result.pass).toBe(false);
      expect(result.actual).toBe(
        typeof thrown === "string" ? "threw during input construction: a string" : "threw during input construction: a value that is not an Error was thrown",
      );
    }
  });

  it("a wrong verdict is a failed check that shows both sides", () => {
    const wrong: HealthCase = { ...caseNamed("conflicted-missing-core"), name: "wrong expectation", expected: "ok" };
    expect(runCase(wrong)).toEqual({ name: "wrong expectation", pass: false, expected: "ok", actual: "missing-field/conflicted/core" });
  });
});

describe("runContractChecks", () => {
  const passing = caseNamed("well-formed-conflicted");
  const throwing: HealthCase = {
    name: "throws",
    expected: "ok",
    build: () => {
      throw new Error("boom");
    },
  };

  it("names exactly the failing cases, in order, and is not pass", () => {
    const checks = runContractChecks([passing, throwing, { ...passing, name: "wrong", expected: "empty-array/weakened/unmet" }]);
    expect(checks.pass).toBe(false);
    expect(checks.failing).toEqual(["throws", "wrong"]);
    expect(checks.cases.map((c) => c.pass)).toEqual([true, false, false]);
  });

  it("an empty list is not healthy: a check that ran nothing cannot fail", () => {
    expect(runContractChecks([])).toEqual({ pass: false, failing: [], cases: [] });
  });
});
