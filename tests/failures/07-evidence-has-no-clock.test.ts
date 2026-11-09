import { afterEach, describe, expect, it, vi } from "vitest";
import * as contracts from "../../lib/contracts/index.js";
import * as extent from "../../lib/extent/index.js";
import * as groundLayer from "../../lib/ground/index.js";
import * as entail from "../../lib/entail/index.js";
import { recheck, renderBrief } from "../../lib/entail/index.js";
import { OBSERVATIONS, observationsOf } from "../../domains/order-desk/index.js";
import { DELIVERY, ORDER_DESK_SCHEMA, answerOk, claim, copyOf, groundOk, obs } from "./helpers.js";

/**
 * KIND: DISCLOSES (plan section 11, case 07).
 * TRACES TO: D9 (a snapshot is the closed world; there is no clock and no staleness; time is memory-ledger's problem), D3
 * (no clock, no counting, no randomness anywhere in the engine).
 *
 * THE LIMIT. A snapshot that includes `o2` (the carrier SLA) rules `entailed` forever. The engine has no time parameter, reads no
 * clock, and so cannot know that an observation was true last month and has since been recalled: it keeps entailing until the
 * SNAPSHOT changes (a new snapshot is a new grounding). Staleness belongs to memory-ledger; the composition (a `believed` memory
 * becoming an `Observation`) is named and not built.
 *
 * WHAT IS PINNED, three ways. (1) THE ARITIES of every function the four `lib/*` layers export: a table written here, one row
 * per function, with `answer`, `rule`, `ground` and `recheck` among them and none taking a time; a function added to a barrel
 * without a row is red, so a new parameter cannot arrive unnoticed. (2) THE BEHAVIOUR: with the system clock moved a century
 * either way, the same snapshot gives byte-identical `ground`, `rule`, `answer`, `renderBrief` and `recheck` results, and the
 * engine reads `Date.now` and `performance.now` zero times in those calls. (3) THE CONSEQUENCE: an observation whose quote and
 * source say it was recalled, or that has expired, entails exactly what the unmarked one does; only removing it from the
 * snapshot (the caller's act) changes the ruling. The second half of the plan's sentence, "and by M1's determinism guard", is
 * M1's `lib/contracts/__tests__/determinism.test.ts` ("this repository: no clock, randomness, network or model under lib/ > finds
 * nothing"); it is cited and not re-run here, because this file may import only the barrels and the domain.
 *
 * WHAT WOULD MAKE THIS FAIL: (1) any function of a barrel gaining a parameter (an `asOf`, a `now`), or a function with no row;
 * (2) any ruling that depended on the clock (an expiry, a freshness weight) or any read of the clock; (3) any change that made
 * the engine read a quote or a source for a meaning (a recall, an "expired" marker).
 */

/** The arity of every exported function, by layer. */
const ARITY: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  contracts: { fieldId: 1, obsId: 1, compareIds: 2, isNonEmptyArray: 1, assertNeverEntailment: 1, assertEntailmentWellFormed: 1 },
  extent: { checkExtent: 1, meet: 2, isSameExtent: 2, isSubset: 2, unmetSides: 2, sumForward: 1, sumBackward: 3 },
  ground: { declOf: 2, extentOf: 2, ground: 2, openEndsOf: 3, readSchema: 1, supportOf: 2 },
  entail: { answer: 3, readClaim: 2, recheck: 2, renderBrief: 2, renderEntailment: 2, rule: 2 },
};

const LAYERS: Readonly<Record<string, Record<string, unknown>>> = { contracts, extent, ground: groundLayer, entail };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("07 evidence has no clock", () => {
  it("every function every lib layer exports has the arity of its row, and no row is missing: none takes a time", () => {
    for (const [layer, exports] of Object.entries(LAYERS)) {
      const functions = Object.entries(exports).filter(([, value]) => typeof value === "function");
      const found = Object.fromEntries(functions.map(([name, value]) => [name, (value as { length: number }).length]));
      expect(found, layer).toEqual(ARITY[layer]);
    }
    // The four the plan names.
    expect([entail.answer.length, entail.rule.length, groundLayer.ground.length, entail.recheck.length]).toEqual([3, 2, 2, 2]);
  });

  it("with the system clock moved a century either way, the same snapshot gives byte-identical results, and the clocks are read zero times", () => {
    const snapshot = observationsOf(["o1", "o2", "o3"]);
    const question = claim(DELIVERY, null, 12);
    const draft = [claim(DELIVERY, 6, 6)];
    const run = (): string => {
      const g = groundOk(ORDER_DESK_SCHEMA, snapshot);
      const brief = answerOk(g, question, draft);
      return JSON.stringify([g, brief, renderBrief(g.schema, brief), recheck(g.schema, brief)]);
    };
    vi.useFakeTimers();
    const dateNow = vi.spyOn(Date, "now");
    const performanceNow = vi.spyOn(performance, "now");
    const results = new Set<string>();
    for (const when of ["1926-01-01T00:00:00Z", "2026-11-09T00:00:00Z", "2126-01-01T00:00:00Z"]) {
      vi.setSystemTime(new Date(when));
      dateNow.mockClear();
      performanceNow.mockClear();
      results.add(run());
      expect([dateNow.mock.calls.length, performanceNow.mock.calls.length], when).toEqual([0, 0]);
    }
    expect(results.size).toBe(1);
    expect(JSON.parse([...results][0] as string)[1].answer).toMatchObject({ kind: "entailed", established: { lo: 4, hi: 9 } });
  });

  it("a recalled or expired observation entails exactly what the unmarked one does, at any time; only the caller removing it changes the ruling", () => {
    const [o1, o2, o3] = observationsOf(["o1", "o2", "o3"]) as [(typeof OBSERVATIONS)[number], (typeof OBSERVATIONS)[number], (typeof OBSERVATIONS)[number]];
    const recalled = obs("o2", o2.field, 3, 5, "Standard international transit takes 3 to 5 days. RECALLED on 1 March 2019: this SLA is withdrawn and expired.", "Carrier SLA sheet (superseded, expired)");
    const question = claim(DELIVERY, null, 12);
    const rulingOf = (documents: readonly unknown[]) => JSON.stringify(answerOk(groundOk(ORDER_DESK_SCHEMA, documents), question, []).answer);

    const unmarked = rulingOf([o1, o2, o3]);
    expect(unmarked).toContain('"kind":"entailed"');
    vi.useFakeTimers();
    for (const when of ["2019-02-28T00:00:00Z", "2019-03-02T00:00:00Z", "2040-01-01T00:00:00Z"]) {
      vi.setSystemTime(new Date(when));
      // The recalled observation entails the same ruling, before and after its own recall date, to the byte (the id and extents are the same).
      expect(rulingOf([o1, recalled, o3]), when).toBe(unmarked);
    }
    // Thirty years in monthly steps: never a different ruling.
    const rulings = new Set<string>();
    for (let month = 0; month < 360; month += 1) {
      vi.setSystemTime(new Date(Date.UTC(2019, month, 1)));
      rulings.add(rulingOf([o1, recalled, o3]));
    }
    expect([...rulings]).toEqual([unmarked]);
    // A new snapshot is a new grounding: the caller drops the recalled document, and only then does the ruling change.
    const without = answerOk(groundOk(ORDER_DESK_SCHEMA, [o1, o3]), question, []).answer;
    expect(without).toMatchObject({ kind: "weakened", established: { lo: 1, hi: null } });
    expect(JSON.stringify(without)).not.toBe(unmarked);
    // The snapshot is the closed world: the marked observation is carried as given, its quote and source are not read for a meaning.
    expect(copyOf(groundOk(ORDER_DESK_SCHEMA, [o1, recalled, o3]).observations[1])).toEqual(recalled);
  });
});
