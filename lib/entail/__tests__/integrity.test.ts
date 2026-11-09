import { beforeEach, describe, expect, it, vi } from "vitest";
import * as contracts from "../../contracts/index.js";
import type { Brief, Entailment } from "../../contracts/index.js";
import { answer, recheck, rule } from "../index.js";
import { DESK, STEPS, canon, claim, groundOf, tampered, thaw } from "./fixtures.js";

/**
 * THE INTEGRITY GATE, PROVED BOTH WAYS (plan section 6, M5, check 5): "`integrity.test.ts` mocks
 * `assertEntailmentWellFormed` to fail and asserts a throw, plus a real un-mocked cast-built contaminated value".
 *
 *  1. WITH THE GUARD MOCKED to report a failure, `rule` throws instead of returning a ruling, for each of the five
 *     kinds (so the guard is called on every kind `rule` builds, not on some), and `answer` throws with it. With the
 *     guard mocked to pass, nothing changes: the mock is only a switch, and the same inputs give the same rulings.
 *  2. WITH THE REAL GUARD, a cast-built contaminated value is refused by it (the guard is not a mock of itself), and a
 *     `Brief` that carries one is refused by `recheck` as `hostile-input`: the same guard stands in front of the
 *     holder's reading of a `Brief`. One fault per contaminated value, so the cell that fires is named.
 *  3. THE ENGINE'S OWN OUTPUT passes the real guard: every ruling of the plan's six steps.
 *
 * `vi.mock` replaces the one export; every other export of `lib/contracts` is the real one.
 */
const switchboard = vi.hoisted(() => ({ fail: false, calls: 0 }));

vi.mock("../../contracts/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../contracts/index.js")>();
  return {
    ...real,
    assertEntailmentWellFormed: (e: Entailment) => {
      switchboard.calls += 1;
      if (switchboard.fail) return { ok: false, error: { kind: "empty-array", variant: "entailed", field: "support" } } as const;
      return real.assertEntailmentWellFormed(e);
    },
  };
});

/** One claim of each kind against one grounding: o1 o2 give delivery [4, null] and o3 is absent, so customs is ungrounded; a second grounding conflicts. */
const OK = groundOf(DESK, canon("o1", "o2"));
const CONFLICTED = groundOf(DESK, canon("o1", "o2", "o3", "o4"));
const BY_KIND: readonly (readonly [Entailment["kind"], unknown, typeof OK])[] = [
  ["entailed", claim("deliveryDay", 4, null), OK],
  ["weakened", claim("deliveryDay", null, 12), OK],
  ["contradicted", claim("deliveryDay", null, 3), OK],
  ["ungrounded", claim("customsDays", 2, 2), OK],
  ["conflicted", claim("deliveryDay", null, 12), CONFLICTED],
];

beforeEach(() => {
  switchboard.fail = false;
  switchboard.calls = 0;
});

describe("with the guard mocked to fail, rule throws for each kind it builds", () => {
  for (const [kind, raw, g] of BY_KIND) {
    it(`${kind}: the ruling is built, the guard is asked about it once, and the call throws as an internal invariant violation`, () => {
      switchboard.fail = true;
      expect(() => rule(g, raw)).toThrow(/internal invariant violated: a .* ruling failed assertEntailmentWellFormed \(empty-array: entailed\.support\)/);
      expect(switchboard.calls).toBe(1);
    });
    it(`${kind}: with the mock passing through, the same call returns that kind and asks the guard once`, () => {
      const r = rule(g, raw);
      expect(r.ok && r.entailment.kind).toBe(kind);
      expect(switchboard.calls).toBe(1);
    });
  }
  it("a fault is not a ruling and is not shown to the guard: the guard is not called for a refused claim", () => {
    switchboard.fail = true;
    expect(rule(OK, { field: "ghost", extent: { lo: 1, hi: 2 } }).ok).toBe(false);
    expect(switchboard.calls).toBe(0);
  });
  it("answer rules the question and every claim through rule, so a failing guard throws out of answer too", () => {
    switchboard.fail = true;
    expect(() => answer(OK, claim("deliveryDay", null, 12), [])).toThrow(/internal invariant violated/);
  });
  it("answer asks the guard once per ruling: the question and each ruled draft claim, and not for a refused one", () => {
    const step = STEPS[0]!;
    const g = groundOf(DESK, canon(...step.ids));
    answer(g, step.question, [...step.draft, { field: "ghost", extent: { lo: 1, hi: 2 } }]);
    expect(switchboard.calls).toBe(1 + step.draft.length);
  });
});

/** The cast every residual route needs: the types forbid each of these. */
const asEntailment = (value: unknown): Entailment => value as Entailment;

describe("with the real guard, cast-built contaminated values are refused, one fault each", () => {
  const real = (e: Entailment): ReturnType<typeof contracts.assertEntailmentWellFormed> => {
    // the mock delegates to the real guard while `fail` is false
    return contracts.assertEntailmentWellFormed(e);
  };
  const ruled = (kind: Entailment["kind"]): Entailment => {
    const [, raw, g] = BY_KIND.find(([k]) => k === kind)!;
    const r = rule(g, raw);
    if (!r.ok) throw new Error("fixture");
    return thaw(r.entailment);
  };
  const CONTAMINATED: readonly (readonly [string, Entailment["kind"], (e: Record<string, unknown>) => void, string, string])[] = [
    ["an ungrounded claim that carries an established extent", "ungrounded", (e) => void (e["established"] = { lo: 1, hi: 2 }), "unexpected-field", "established"],
    ["a weakened claim with no cut named", "weakened", (e) => void (e["unmet"] = []), "empty-array", "unmet"],
    ["a weakened claim that lost its support", "weakened", (e) => void delete e["support"], "missing-field", "support"],
    ["a conflicted claim that carries an extent", "conflicted", (e) => void (e["established"] = { lo: 1, hi: 2 }), "unexpected-field", "established"],
    ["a conflicted claim with an empty core", "conflicted", (e) => void (e["core"] = []), "empty-array", "core"],
    ["an entailed claim that carries open ends", "entailed", (e) => void (e["openEnds"] = []), "unexpected-field", "openEnds"],
    ["a contradicted claim that carries a core", "contradicted", (e) => void (e["core"] = ["o1"]), "unexpected-field", "core"],
    ["an ungrounded claim with no open ends", "ungrounded", (e) => void (e["openEnds"] = []), "empty-array", "openEnds"],
  ];
  for (const [title, kind, contaminate, error, field] of CONTAMINATED) {
    it(`${title}: ${error} ${field}`, () => {
      const value = ruled(kind) as unknown as Record<string, unknown>;
      expect(real(asEntailment(value)), "the value before contamination is well formed").toStrictEqual({ ok: true });
      contaminate(value);
      expect(real(asEntailment(value))).toStrictEqual({ ok: false, error: { kind: error, variant: kind, field } });
    });
  }

  it("the same contaminated rulings, carried in a Brief, make recheck refuse the whole Brief as hostile-input in its own words", () => {
    const g = groundOf(DESK, canon("o1", "o2"));
    const made = answer(g, claim("deliveryDay", null, 12), [claim("customsDays", 2, 2)]);
    if (!made.ok) throw new Error("fixture");
    const brief: Brief = made.brief;
    expect(recheck(g.schema, brief).ok).toBe(true);
    // the Brief above holds a weakened answer and an ungrounded claim, so those are the two kinds that can be contaminated in place
    const inPlace = CONTAMINATED.filter(([, kind]) => kind === "ungrounded" || kind === "weakened");
    expect(inPlace).toHaveLength(4);
    for (const [title, kind, contaminate] of inPlace) {
      const position = kind === "ungrounded" ? 0 : "answer";
      const result = recheck(g.schema, tampered(brief, position, (ruling) => contaminate(ruling)));
      expect(result.ok, title).toBe(false);
      expect(!result.ok && result.failure.kind, title).toBe("hostile-input");
      expect(!result.ok && result.failure.kind === "hostile-input" && result.failure.message, title).toMatch(/^brief\.(answer|claims\[0\]) is not a well-formed (weakened|ungrounded): /);
    }
  });
});

describe("the engine's own rulings pass the real guard: every ruling of the plan's six steps", () => {
  for (const step of STEPS) {
    it(`step ${step.number}: the question and ${step.draft.length} draft claims`, () => {
      const g = groundOf(DESK, canon(...step.ids));
      const made = answer(g, step.question, step.draft);
      if (!made.ok) throw new Error("fixture");
      const rulings = [made.brief.answer, ...made.brief.claims];
      expect(rulings).toHaveLength(1 + step.draft.length);
      for (const ruling of rulings) expect(contracts.assertEntailmentWellFormed(ruling)).toStrictEqual({ ok: true });
    });
  }
});
