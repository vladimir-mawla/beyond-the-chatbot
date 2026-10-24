import { describe, expect, it } from "vitest";
import type { Entailment } from "../entailment.js";
import { assertEntailmentWellFormed } from "../integrity.js";
import { ENTAILMENT_KINDS, ENTAILMENT_SAMPLES, SOME_CORE, SOME_EXTENT, SOME_OPEN_ENDS, SOME_SUPPORT, SOME_UNMET } from "./support/samples.js";

/**
 * `assertEntailmentWellFormed` is the run-time half of the DoD gate "an `ungrounded` or `conflicted`
 * `Entailment` carrying `established`, or a `weakened` without `unmet`, does not compile, by any route": it
 * sees a contaminated value however it got there, including the routes the compiler cannot see
 * (`residual-routes.test.ts` runs those and names the cell each lands in).
 *
 * The expectations below are the PLAN's table (`.genesis/PLAN.md` section 6, M1), written out here
 * independently of `integrity.ts`'s own table, so a table that drifts from the plan is caught here and not only
 * by the compile-time assertions inside `integrity.ts`. Every contaminated value carries exactly ONE fault, so
 * deleting one cell from the guard's table turns exactly the matching test red.
 */
type Kind = Entailment["kind"];

/** A value of the wrong shape on purpose: the `as unknown as` residual, so it needs the cast. */
function build(base: Entailment, patch: Readonly<Record<string, unknown>> = {}, remove: readonly string[] = []): Entailment {
  const copy: Record<string, unknown> = { ...base, ...patch };
  for (const field of remove) delete copy[field];
  return copy as unknown as Entailment;
}

const SMUGGLED = { established: SOME_EXTENT, support: SOME_SUPPORT, unmet: SOME_UNMET, openEnds: SOME_OPEN_ENDS, core: SOME_CORE } as const;

/** Plan: what each variant refuses to carry (15 cells). */
const FORBIDDEN: readonly (readonly [Kind, keyof typeof SMUGGLED])[] = [
  ["entailed", "unmet"],
  ["entailed", "openEnds"],
  ["entailed", "core"],
  ["weakened", "core"],
  ["contradicted", "unmet"],
  ["contradicted", "openEnds"],
  ["contradicted", "core"],
  ["ungrounded", "established"],
  ["ungrounded", "support"],
  ["ungrounded", "unmet"],
  ["ungrounded", "core"],
  ["conflicted", "established"],
  ["conflicted", "support"],
  ["conflicted", "unmet"],
  ["conflicted", "openEnds"],
];

/** Plan: what each variant must carry, besides `field` and `tested` (10 cells). */
const REQUIRED: readonly (readonly [Kind, string])[] = [
  ["entailed", "established"],
  ["entailed", "support"],
  ["weakened", "established"],
  ["weakened", "support"],
  ["weakened", "unmet"],
  ["weakened", "openEnds"],
  ["contradicted", "established"],
  ["contradicted", "support"],
  ["ungrounded", "openEnds"],
  ["conflicted", "core"],
];

/** Plan: the three cells that must be non-empty. `weakened.openEnds` is an array that MAY be empty. */
const NON_EMPTY: readonly (readonly [Kind, string])[] = [
  ["weakened", "unmet"],
  ["ungrounded", "openEnds"],
  ["conflicted", "core"],
];

describe("a well-formed Entailment of each variant is ok", () => {
  for (const kind of ENTAILMENT_KINDS) {
    it(kind, () => {
      expect(assertEntailmentWellFormed(ENTAILMENT_SAMPLES[kind])).toEqual({ ok: true });
    });
  }

  it("a weakened with no open end is ok: a loose bound names no gap (plan failure case 06)", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { openEnds: [] }))).toEqual({ ok: true });
  });

  it("the table has 25 cells: 15 forbidden and 10 required, five per variant", () => {
    expect(FORBIDDEN).toHaveLength(15);
    expect(REQUIRED).toHaveLength(10);
    for (const kind of ENTAILMENT_KINDS) {
      const cells = FORBIDDEN.filter(([k]) => k === kind).length + REQUIRED.filter(([k]) => k === kind).length;
      expect(cells, kind).toBe(5);
    }
  });
});

describe("the four self-checks plan section 6 gives M2's health route", () => {
  it("(1) a well-formed conflicted is ok", () => {
    expect(assertEntailmentWellFormed(ENTAILMENT_SAMPLES.conflicted).ok).toBe(true);
  });

  it("(2) a cast-built ungrounded carrying established is unexpected-field / ungrounded / established", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.ungrounded, { established: SOME_EXTENT }))).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "ungrounded", field: "established" },
    });
  });

  it("(3) a cast-built weakened whose unmet is [] is empty-array / weakened / unmet", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { unmet: [] }))).toEqual({
      ok: false,
      error: { kind: "empty-array", variant: "weakened", field: "unmet" },
    });
  });

  it("(4) a cast-built conflicted missing core is missing-field / conflicted / core", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.conflicted, {}, ["core"]))).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "conflicted", field: "core" },
    });
  });
});

describe("the 15 forbidden cells: each is reported as unexpected-field, one test per (variant, field)", () => {
  for (const [variant, field] of FORBIDDEN) {
    it(`${variant} carrying ${field}`, () => {
      const result = assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES[variant], { [field]: SMUGGLED[field] }));
      expect(result).toEqual({ ok: false, error: { kind: "unexpected-field", variant, field } });
    });
  }
});

describe("the 10 required cells: each is reported as missing-field when absent, one test per (variant, field)", () => {
  for (const [variant, field] of REQUIRED) {
    it(`${variant} without ${field}`, () => {
      const result = assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES[variant], {}, [field]));
      expect(result).toEqual({ ok: false, error: { kind: "missing-field", variant, field } });
    });
  }
});

describe("the 3 non-empty cells: each is reported as empty-array when [], one test per (variant, field)", () => {
  for (const [variant, field] of NON_EMPTY) {
    it(`${variant} with ${field} = []`, () => {
      const result = assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES[variant], { [field]: [] }));
      expect(result).toEqual({ ok: false, error: { kind: "empty-array", variant, field } });
    });
  }

  it("a one-element array in each is ok: the non-empty test is about length, nothing else", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { unmet: ["lo"] })).ok).toBe(true);
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.ungrounded, { openEnds: [SOME_OPEN_ENDS[0]] })).ok).toBe(true);
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.conflicted, { core: ["o1"] })).ok).toBe(true);
  });
});

describe("what counts as present", () => {
  it("a required field holding undefined is missing, and so is one holding null", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.entailed, { established: undefined }))).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "entailed", field: "established" },
    });
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.entailed, { support: null }))).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "entailed", field: "support" },
    });
  });

  it("a required ARRAY field holding a non-array is reported as missing-field: the plan's error type has no wrong-type member", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { unmet: "lo" }))).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "weakened", field: "unmet" },
    });
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { openEnds: {} }))).toEqual({
      ok: false,
      error: { kind: "missing-field", variant: "weakened", field: "openEnds" },
    });
  });

  it("a forbidden field holding null is reported: null is not undefined", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.ungrounded, { established: null }))).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "ungrounded", field: "established" },
    });
  });

  it("a forbidden field whose value is undefined is STILL reported: the KEY being present counts (ADR decision; tsconfig.json accepts this value)", () => {
    // Under tsconfig.json (no exactOptionalPropertyTypes) `established?: never` accepts `established: undefined`;
    // `residual-routes.test.ts` shows that line compiles. The guard sides with the key, as `in`, `Object.keys`,
    // a spread and structuredClone all do.
    const withKey = build(ENTAILMENT_SAMPLES.ungrounded, { established: undefined });
    expect("established" in withKey).toBe(true);
    expect(Object.hasOwn(withKey, "established")).toBe(true);
    expect(assertEntailmentWellFormed(withKey)).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "ungrounded", field: "established" },
    });
  });

  it("... and a value with the key REMOVED, rather than set to undefined, is ok: absence is the well-formed state", () => {
    const without = build(ENTAILMENT_SAMPLES.ungrounded, {}, ["established"]);
    expect("established" in without).toBe(false);
    expect(assertEntailmentWellFormed(without)).toEqual({ ok: true });
  });

  it("a forbidden field that is inherited from a prototype, non-enumerable or an accessor is still seen: the guard asks `in`, not Object.keys", () => {
    const viaPrototype = Object.create({ established: SOME_EXTENT }) as Record<string, unknown>;
    Object.assign(viaPrototype, ENTAILMENT_SAMPLES.ungrounded);
    expect(Object.hasOwn(viaPrototype, "established")).toBe(false);
    expect(assertEntailmentWellFormed(viaPrototype as unknown as Entailment)).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "ungrounded", field: "established" },
    });

    const hidden: Record<string, unknown> = { ...ENTAILMENT_SAMPLES.ungrounded };
    Object.defineProperty(hidden, "support", { value: SOME_SUPPORT, enumerable: false });
    expect(Object.keys(hidden)).not.toContain("support");
    expect(assertEntailmentWellFormed(hidden as unknown as Entailment)).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "ungrounded", field: "support" },
    });

    const accessor: Record<string, unknown> = { ...ENTAILMENT_SAMPLES.conflicted };
    Object.defineProperty(accessor, "unmet", { get: () => undefined, enumerable: true });
    expect(assertEntailmentWellFormed(accessor as unknown as Entailment)).toEqual({
      ok: false,
      error: { kind: "unexpected-field", variant: "conflicted", field: "unmet" },
    });
  });
});

describe("a value that is not an Entailment of any variant is unknown-variant, never ok", () => {
  const CASES: readonly (readonly [string, unknown, string])[] = [
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["a number", 42, "number"],
    ["a string", "entailed", "string"],
    ["an array", [], "undefined"],
    ["an empty object", {}, "undefined"],
    ["a sixth kind", { kind: "refuted", field: "f", tested: {} }, "refuted"],
    ["a numeric kind", { kind: 5 }, "number"],
    ["a null kind", { kind: null }, "object"],
    ["a kind that is an Object.prototype name", { kind: "constructor" }, "constructor"],
    ["a kind that is __proto__", { kind: "__proto__" }, "__proto__"],
    ["a kind with different case", { kind: "Entailed" }, "Entailed"],
  ];
  for (const [name, value, found] of CASES) {
    it(name, () => {
      expect(assertEntailmentWellFormed(value as Entailment)).toEqual({ ok: false, error: { kind: "unknown-variant", found } });
    });
  }
});

describe("precedence: required fields, then forbidden fields, then the two common fields", () => {
  it("a value with both a missing required field and a forbidden one reports the missing one", () => {
    const both = build(ENTAILMENT_SAMPLES.entailed, { unmet: SOME_UNMET }, ["established"]);
    expect(assertEntailmentWellFormed(both)).toEqual({ ok: false, error: { kind: "missing-field", variant: "entailed", field: "established" } });
  });

  it("required fields are reported in the table's order: a weakened lacking both established and unmet names established", () => {
    const both = build(ENTAILMENT_SAMPLES.weakened, {}, ["unmet", "established"]);
    expect(assertEntailmentWellFormed(both)).toEqual({ ok: false, error: { kind: "missing-field", variant: "weakened", field: "established" } });
  });

  it("a forbidden field is reported before a missing common field", () => {
    const both = build(ENTAILMENT_SAMPLES.ungrounded, { established: SOME_EXTENT }, ["tested"]);
    expect(assertEntailmentWellFormed(both)).toEqual({ ok: false, error: { kind: "unexpected-field", variant: "ungrounded", field: "established" } });
  });

  it("the two common fields are required on every variant, one test each", () => {
    for (const kind of ENTAILMENT_KINDS) {
      for (const field of ["field", "tested"]) {
        expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES[kind], {}, [field])), `${kind} without ${field}`).toEqual({
          ok: false,
          error: { kind: "missing-field", variant: kind, field },
        });
      }
    }
  });
});

describe("what it does NOT catch, pinned so the limit is code and not only prose", () => {
  it("an unrelated extra key passes: ?: never and this table close the named fields, not every possible extra property", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.entailed, { note: "not an Entailment field" }))).toEqual({ ok: true });
  });

  it("a present field of the wrong kind passes: presence and array-ness only", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.entailed, { established: 42, support: "nope" })).ok).toBe(true);
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { unmet: ["sideways"] })).ok).toBe(true);
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.conflicted, { core: [1, 2] })).ok).toBe(true);
  });

  it("an inverted extent passes: Extent validity is M3's", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.entailed, { established: { lo: 9, hi: 1 } })).ok).toBe(true);
  });

  it("no relation between fields is checked: an unmet that is not the cut, a core of one", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.weakened, { unmet: ["lo", "lo", "hi"] })).ok).toBe(true);
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.conflicted, { core: ["o1"] })).ok).toBe(true);
  });

  it("an array with holes passes: its contents are not inspected", () => {
    expect(assertEntailmentWellFormed(build(ENTAILMENT_SAMPLES.conflicted, { core: new Array(3) })).ok).toBe(true);
  });

  it("it is not total: a forbidden-field getter that throws makes it throw (hostile input is read once at intake, not here)", () => {
    const hostile: Record<string, unknown> = { ...ENTAILMENT_SAMPLES.ungrounded };
    Object.defineProperty(hostile, "openEnds", {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() => assertEntailmentWellFormed(hostile as unknown as Entailment)).toThrow("hostile getter");
  });
});

describe("it only reads", () => {
  it("does not change a deep-frozen value and does not throw on one", () => {
    const frozen = JSON.parse(JSON.stringify(ENTAILMENT_SAMPLES.weakened)) as Entailment;
    const deepFreeze = (v: unknown): void => {
      if (typeof v === "object" && v !== null) {
        Object.freeze(v);
        for (const child of Object.values(v)) deepFreeze(child);
      }
    };
    deepFreeze(frozen);
    const before = JSON.stringify(frozen);
    expect(assertEntailmentWellFormed(frozen)).toEqual({ ok: true });
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("returns a fresh result each time: a caller cannot poison a shared ok", () => {
    const a = assertEntailmentWellFormed(ENTAILMENT_SAMPLES.entailed);
    const b = assertEntailmentWellFormed(ENTAILMENT_SAMPLES.entailed);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
