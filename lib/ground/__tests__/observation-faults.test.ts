import { describe, expect, it } from "vitest";
import { MAX_ID_LENGTH, MAX_MAGNITUDE, MAX_OBSERVATIONS, MAX_QUOTE_LENGTH, MAX_SOURCE_LENGTH } from "../../contracts/index.js";
import type { ObservationFault, SchemaFault } from "../../contracts/index.js";
import { ground } from "../index.js";
import { OBS_RULE_ORDER, ORDER_DESK, base, derived, jsonCopy, leafDiff, obs, oracleFields, refViolations, schemaOf } from "./fixtures.js";
import type { ObsRule, RawObservation } from "./fixtures.js";
import { oracleBaselines } from "./oracle.js";

/**
 * EVERY OBSERVATION FAULT, TABLE-DRIVEN AND MASKING-AWARE (plan section 6, M4, layer 1), for `ground`. As in
 * `schema-faults.test.ts`, a row is a snapshot with one defect in it and the same snapshot repaired, and for every
 * row the test checks, besides the engine's answer: the repaired snapshot is accepted whole, an independent
 * reference (`refViolations` in `fixtures.ts`, which re-reads the plan's rules and takes `B` from the brute-force
 * oracle) says the broken observation breaks exactly the one rule, and the two snapshots differ in exactly the
 * declared number of places. "The fixture is otherwise well-formed and quoted" is therefore a checked fact for
 * every row, and in particular the `outside-baseline` rows have quotes that contain their numbers.
 *
 * Also here: the precedence between rules, the failures of the whole call (`GroundFailure`), and the limits on
 * what `number-not-in-quote` can see.
 */

const SCHEMA = ORDER_DESK;
const BASELINES = oracleBaselines(oracleFields(SCHEMA));
const good = (): RawObservation[] => [obs("a1", "packDays", 1, 2), obs("a2", "transitDays", 3, 5), obs("a3", "customsDays", 0, 2)];
const text = (n: number): string => "x".repeat(n);

interface Row {
  readonly name: string;
  readonly broken: unknown[];
  readonly repaired: unknown[];
  /** The positions refused, each with `expected`. */
  readonly refused: readonly number[];
  readonly expected: ObservationFault;
  readonly rule: ObsRule;
  readonly edits: number;
}
const rows: Row[] = [];
function row(name: string, change: (s: RawObservation[]) => void, rule: ObsRule, expected: ObservationFault, refused: readonly number[] = [1], edits = 1): void {
  const broken = good();
  change(broken);
  rows.push({ name, broken, repaired: good(), refused, expected, rule, edits });
}
const malformed = (...fields: [string, ...string[]]): ObservationFault => ({ kind: "malformed", fields });
const set = (i: number, key: string, value: unknown) => (s: RawObservation[]) => void ((s[i] as unknown as Record<string, unknown>)[key] = value);

// -- duplicate-id: every occurrence is refused, whichever came first
row("two observations share an id: both are refused", set(1, "id", "a1"), "duplicate-id", { kind: "duplicate-id", id: "a1" }, [0, 1]);
row("three observations share an id: all three are refused", (s) => {
  s[1]!.id = "a1";
  s[2]!.id = "a1";
}, "duplicate-id", { kind: "duplicate-id", id: "a1" }, [0, 1, 2], 2);
row("two observations share an id even when they say the same thing", (s) => {
  s[1] = { ...s[0]!, source: "another source" }; // replaced whole: id, field, both bounds, quote and source differ from the original second observation
}, "duplicate-id", { kind: "duplicate-id", id: "a1" }, [0, 1], 6);

// -- malformed: each property, and what counts as malformed for it
for (const [name, value] of [["empty", ""], ["too long", text(MAX_ID_LENGTH + 1)], ["a number", 5], ["null", null], ["a boxed string", Object("a9")], ["undefined", undefined]] as const) {
  row(`an id is ${name}`, set(1, "id", value), "malformed", malformed("id"));
}
for (const [name, value] of [["empty", ""], ["too long", text(MAX_ID_LENGTH + 1)], ["a number", 5], ["null", null]] as const) {
  row(`a field is ${name}`, set(1, "field", value), "malformed", malformed("field"));
}
for (const [name, value] of [
  ["inverted", { lo: 5, hi: 3 }],
  ["a fraction", { lo: 3.5, hi: 5 }],
  ["NaN", { lo: Number.NaN, hi: 5 }],
  ["an infinity", { lo: 3, hi: Number.POSITIVE_INFINITY }],
  ["out of range", { lo: 3, hi: MAX_MAGNITUDE + 1 }],
  ["a string bound", { lo: "3", hi: 5 }],
  ["missing a side", { lo: 3 }],
  ["an array", [3, 5]],
  ["null", null],
  ["a number", 5],
] as const) {
  row(`an extent is ${name}`, set(1, "extent", value), "malformed", malformed("extent"), [1], leafDiff(value, { lo: 3, hi: 5 }));
}
for (const [name, value] of [["empty", ""], ["too long", text(MAX_QUOTE_LENGTH + 1)], ["a number", 5], ["null", null]] as const) {
  row(`a quote is ${name}`, set(1, "quote", value), "malformed", malformed("quote"));
}
for (const [name, value] of [["empty", ""], ["too long", text(MAX_SOURCE_LENGTH + 1)], ["a number", 5], ["null", null]] as const) {
  row(`a source is ${name}`, set(1, "source", value), "malformed", malformed("source"));
}
for (const [name, value] of [["a number", 7], ["null", null], ["an array", []], ["a string", "obs"], ["undefined", undefined]] as const) {
  row(`an element is ${name}`, (s) => void (s[1] = value as never), "malformed", malformed("extent", "field", "id", "quote", "source"), [1], leafDiff(value, good()[1]));
}
row("two properties are both named, sorted", (s) => {
  s[1]!.quote = "";
  s[1]!.id = "";
}, "malformed", malformed("id", "quote"), [1], 2);
row("every property can be malformed at once", (s) => {
  const o = s[1] as unknown as Record<string, unknown>;
  o["id"] = 1;
  o["field"] = 2;
  o["extent"] = 3;
  o["quote"] = 4;
  o["source"] = 5;
}, "malformed", malformed("extent", "field", "id", "quote", "source"), [1], 5);

// -- unknown-field
row("a field no schema declares", set(1, "field", "ghost"), "unknown-field", { kind: "unknown-field", field: "ghost" });
row("a field that is a prototype name is unknown, not found on Object.prototype", set(1, "field", "constructor"), "unknown-field", { kind: "unknown-field", field: "constructor" });

// -- number-not-in-quote: the quote keeps its digits except the one that is refused
row("the lower bound is not in the quote", (s) => void (s[1]!.quote = "Standard transit takes 4 to 5 days"), "number-not-in-quote", { kind: "number-not-in-quote", value: 3 });
row("the upper bound is not in the quote (the plan's case 01: a quote of 0 to 2 read as 0 to 7)", (s) => {
  s[2]!.extent = { lo: 0, hi: 7 };
}, "number-not-in-quote", { kind: "number-not-in-quote", value: 7 }, [2]);
row("both bounds are missing from the quote: the lower one is named", (s) => void (s[1]!.quote = "Standard transit takes a few days"), "number-not-in-quote", { kind: "number-not-in-quote", value: 3 });
row("a bound of 0 needs a 0 in the quote", (s) => void (s[2]!.quote = "Customs clearance takes up to 2 days"), "number-not-in-quote", { kind: "number-not-in-quote", value: 0 }, [2]);
row("the digits are longer: a bound of 13 is not in 'between 3 and 5'", (s) => void (s[1]!.extent = { lo: 3, hi: 13 }), "number-not-in-quote", { kind: "number-not-in-quote", value: 13 }, [1], 1);
row("a bound with a thousands separator is not found: '1,000' holds the runs 1 and 000", (s) => {
  s[1]!.extent = { lo: 1000, hi: null };
  s[1]!.quote = "transit takes at least 1,000 days";
}, "number-not-in-quote", { kind: "number-not-in-quote", value: 1000 }, [1], 3);
row("full-width digits are not ASCII digits", (s) => void (s[1]!.quote = "transit takes 3 to ５ days".replace("3", "３")), "number-not-in-quote", { kind: "number-not-in-quote", value: 3 });

// -- outside-baseline: the extent is well-formed and quoted, and meets nothing the field can be
row("a duration below its floor", (s) => void (s[1] = obs("a2", "transitDays", -5, -1)), "outside-baseline", { kind: "outside-baseline", field: "transitDays" } as ObservationFault, [1], 3);
row("a derived field whose computed baseline is [0, inf)", (s) => void (s[1] = obs("a2", "deliveryDay", -3, -1)), "outside-baseline", { kind: "outside-baseline", field: "deliveryDay" } as ObservationFault, [1], 4);

describe("every observation fault: the fixture breaks only its own rule, and repairing it is accepted", () => {
  const repeatedIds = (snapshot: readonly unknown[]): Set<string> => {
    const counts = new Map<string, number>();
    for (const o of snapshot) {
      const id = (o as { id?: unknown } | null)?.id;
      if (typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  };

  for (const r of rows) {
    it(r.name, () => {
      const result = ground(SCHEMA, r.broken);
      if (!result.ok) throw new Error(`the call failed: ${JSON.stringify(result.failure)}`);
      expect(result.rejected, "exactly the expected observations are refused, each with the expected fault").toStrictEqual(r.refused.map((index) => ({ index, fault: r.expected })));
      const kept = r.broken.flatMap((o, index) => (r.refused.includes(index) ? [] : [(o as RawObservation).id])).sort();
      expect(result.grounding.observations.map((o) => o.id), "and the others are accepted").toEqual(kept);

      const repaired = ground(SCHEMA, r.repaired);
      expect(repaired.ok && repaired.rejected, "the repaired snapshot is accepted whole").toEqual([]);

      const repeated = repeatedIds(r.broken);
      r.broken.forEach((o, index) => {
        const seen = [...refViolations(o, repeated, BASELINES)];
        expect(seen, `the reference sees ${r.refused.includes(index) ? "only the one rule" : "no rule"} at ${index}`).toEqual(r.refused.includes(index) ? [r.rule] : []);
      });
      expect(leafDiff(r.broken, r.repaired), "the repair is the declared number of edits").toBe(r.edits);
    });
  }

  it("the table reaches five of the six fault kinds (hostile-input is the table in hostile-input.test.ts)", () => {
    expect(new Set(rows.map((r) => r.rule))).toEqual(new Set(OBS_RULE_ORDER));
    expect(rows.length).toBeGreaterThanOrEqual(45);
  });
});

describe("digit-containment accepts what the plan's rule accepts, and no more, in every case tried here", () => {
  const accepted = (field: string, lo: number | null, hi: number | null, quote: string) => {
    const r = ground(SCHEMA, [obs("k", field, lo, hi, quote)]);
    return r.ok && r.rejected.length === 0;
  };
  it("the sign is not checked: a bound of -3 is found in a quote that says 3", () => {
    expect(accepted("deliveryDay", -3, 5, "between minus 3 and 5 days")).toBe(true);
    expect(accepted("deliveryDay", -3, 5, "between 3 and 5 days")).toBe(true);
  });
  it("a decimal point ends a run: '3.5' holds 3 and 5, so the bounds 3 and 5 are found and 35 is not", () => {
    expect(accepted("transitDays", 3, 5, "between 3.5 days")).toBe(true);
    expect(accepted("transitDays", 35, null, "between 3.5 days")).toBe(false);
  });
  it("leading zeros do not matter: '007' is 7, and a run of zeros is 0", () => {
    expect(accepted("transitDays", 7, 7, "exactly 007 days")).toBe(true);
    expect(accepted("transitDays", 0, 4, "from 000 to 4 days")).toBe(true);
  });
  it("a run is maximal: '14' is not '1' and not '4'", () => {
    expect(accepted("deliveryDay", 14, 14, "estimates delivery on day 14")).toBe(true);
    expect(accepted("deliveryDay", 1, 14, "estimates delivery on day 14")).toBe(false);
    expect(accepted("deliveryDay", 4, 14, "estimates delivery on day 14")).toBe(false);
  });
  it("a bound can be found anywhere in the quote, and each side in its own run", () => {
    expect(accepted("transitDays", 3, 5, "5 or 3 days, the carrier says")).toBe(true);
  });
  it("MAX_MAGNITUDE (13 digits) is found, a run one digit longer matches no bound, and a run of 41 digits that starts with 40 zeros holds 7", () => {
    expect(accepted("transitDays", MAX_MAGNITUDE, null, `at least ${MAX_MAGNITUDE} days`)).toBe(true);
    expect(accepted("transitDays", MAX_MAGNITUDE, null, `at least ${MAX_MAGNITUDE}0 days`)).toBe(false);
    expect(accepted("transitDays", 7, null, `at least ${"0".repeat(40)}7 days`)).toBe(true);
  });
  it("an extent with no finite bound needs no digit", () => {
    expect(accepted("transitDays", null, null, "no figure given")).toBe(true);
  });
  it("outside-baseline: an extent that touches the baseline is accepted, and one that misses it by one is not", () => {
    expect(accepted("transitDays", -5, 0, "between 5 and 0 days")).toBe(true);
    expect(accepted("transitDays", -5, -1, "between 5 and 1 days")).toBe(false);
  });
  it("outside-baseline against a finite baseline", () => {
    const run = (lo: number, hi: number) => {
      const r = ground(schemaOf(base("w", 0, 10)), [obs("k", "w", lo, hi)]);
      return r.ok ? r.rejected.map((x) => x.fault.kind) : ["failed"];
    };
    expect(run(10, 20)).toEqual([]);
    expect(run(11, 20)).toEqual(["outside-baseline"]);
    expect(run(-5, 0)).toEqual([]);
    expect(run(-5, -1)).toEqual(["outside-baseline"]);
  });
  it("outside-baseline for a derived field uses the baseline the sum rules imply, not a declared one", () => {
    const schema = schemaOf(base("a", 2, 3), base("b", 4, 5), derived("t", ["a", "b"]));
    const run = (lo: number, hi: number) => {
      const r = ground(schema, [obs("k", "t", lo, hi)]);
      return r.ok ? r.rejected.map((x) => x.fault.kind) : ["failed"];
    };
    expect(run(8, 8)).toEqual([]); // B(t) = [6, 8]
    expect(run(9, 9)).toEqual(["outside-baseline"]);
    expect(run(5, 5)).toEqual(["outside-baseline"]);
    expect(run(6, 6)).toEqual([]);
  });
});

describe("the size boundaries of an observation: the maximum is accepted (one more is the 'too long' rows above)", () => {
  it("an id of MAX_ID_LENGTH, a quote of MAX_QUOTE_LENGTH and a source of MAX_SOURCE_LENGTH, together, are accepted and kept whole", () => {
    const quote = `5 ${"x".repeat(MAX_QUOTE_LENGTH - 2)}`;
    expect(quote).toHaveLength(MAX_QUOTE_LENGTH);
    const o = { id: "i".repeat(MAX_ID_LENGTH), field: "packDays", extent: { lo: 5, hi: 5 }, quote, source: "s".repeat(MAX_SOURCE_LENGTH) };
    const r = ground(SCHEMA, [o]);
    expect(r.ok && r.rejected).toEqual([]);
    expect(r.ok && r.grounding.observations[0]).toStrictEqual(o);
  });

  it("the lengths are in UTF-16 code units, not characters: half the limit in astral characters is accepted and one more is malformed, for an id, a source and a quote", () => {
    const astral = "\u{1F600}"; // one character, two code units
    expect(astral).toHaveLength(2);
    const run = (patch: Record<string, unknown>): { rejected: unknown[] | undefined } => {
      const r = ground(SCHEMA, [{ ...obs("k", "packDays", 1, 1), ...patch }]);
      return { rejected: r.ok ? r.rejected.map((x) => x.fault) : undefined };
    };
    // the quote keeps the bound 1 in it, so that only its length can refuse it
    for (const [key, half, make] of [
      ["id", MAX_ID_LENGTH / 2, (n: number) => astral.repeat(n)],
      ["source", MAX_SOURCE_LENGTH / 2, (n: number) => astral.repeat(n)],
      ["quote", Math.floor((MAX_QUOTE_LENGTH - 1) / 2), (n: number) => `${astral.repeat(n)}1`], // 139 characters and the 1: 279 code units; 140: 281
    ] as const) {
      expect(run({ [key]: make(half) }).rejected, `${key}: ${half} characters`).toEqual([]);
      expect(run({ [key]: make(half + 1) }).rejected, `${key}: ${half + 1} characters`).toEqual([{ kind: "malformed", fields: [key] }]);
    }
  });

  it("a field of MAX_ID_LENGTH is accepted when the schema declares a field of that length", () => {
    const name = "f".repeat(MAX_ID_LENGTH);
    const r = ground(schemaOf({ ...base(name), label: "a long id" }), [obs("k", name, 1, 2)]);
    expect(r.ok && r.rejected).toEqual([]);
    expect(r.ok && r.grounding.observations[0]?.field).toBe(name);
  });
});

describe("digit runs, character by character", () => {
  const verdict = (lo: number | null, hi: number | null, quote: string): string => {
    const r = ground(SCHEMA, [obs("k", "deliveryDay", lo, hi, quote)]);
    return r.ok ? (r.rejected[0]?.fault.kind ?? "accepted") : "failed";
  };

  it("every ASCII character that is not a digit ends a run: 'three c five' holds 3 and 5 and never 35, for every code unit from 0 to 127 except the ten digits", () => {
    let tried = 0;
    const wrong: string[] = [];
    for (let code = 0; code < 128; code++) {
      if (code >= 48 && code <= 57) continue;
      const quote = `3${String.fromCharCode(code)}5`;
      if (verdict(3, 5, quote) !== "accepted") wrong.push(`code ${code} does not end a run`);
      if (verdict(35, null, quote) !== "number-not-in-quote") wrong.push(`code ${code} was joined into a run`);
      tried += 1;
    }
    expect({ wrong, tried }).toEqual({ wrong: [], tried: 118 });
  });

  it("a run is maximal at every length from 2 to 13 digits: for a run of each length every substring is tried as a bound, and only the whole run is found", () => {
    // 2 to 12 digits are the first digits of 123456789012; 13 digits are MAX_MAGNITUDE itself (1234567890123 is over the limit and would be malformed)
    const runs = [...Array.from({ length: 11 }, (_, k) => "123456789012".slice(0, k + 2)), String(MAX_MAGNITUDE)];
    expect(runs.map((r) => r.length)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    let checked = 0;
    const wrong: string[] = [];
    for (const run of runs) {
      for (let start = 0; start < run.length; start++) {
        for (let end = start + 1; end <= run.length; end++) {
          const piece = run.slice(start, end);
          const want = piece === run ? "accepted" : "number-not-in-quote";
          const got = verdict(Number(piece), Number(piece), `x${run}y`);
          checked += 1;
          if (got !== want) wrong.push(`${run} holds ${piece}: ${got}, wanted ${want}`);
        }
      }
    }
    expect({ checked, wrong }).toEqual({ checked: 454, wrong: [] });
  });

  it("a space ends a run: '1234 5678' holds 1234 and 5678 and not 12345678", () => {
    expect(verdict(1234, 1234, "x1234 5678y")).toBe("accepted");
    expect(verdict(5678, 5678, "x1234 5678y")).toBe("accepted");
    expect(verdict(12345678, 12345678, "x1234 5678y")).toBe("number-not-in-quote");
  });

  it("each of the ten ASCII digits is a digit: a quote that holds only it contains exactly it", () => {
    for (let d = 0; d <= 9; d++) {
      expect(verdict(d, d, `x${d}y`), `digit ${d}`).toBe("accepted");
      expect(verdict(d === 9 ? 0 : d + 1, null, `x${d}y`), `digit ${d} is not the next one`).toBe("number-not-in-quote");
    }
  });

  it("digits of other scripts are not digits: Arabic-Indic, fullwidth, superscript and Devanagari three do not contain 3", () => {
    for (const three of ["\u0663", "\uFF13", "\u00B3", "\u0969", "\u2462"]) expect(verdict(3, null, `at least ${three} days`), JSON.stringify(three)).toBe("number-not-in-quote");
  });
});

describe("ids that are prototype names are ordinary ids", () => {
  it("an observation id of __proto__, constructor or toString is accepted and sorted like any other, and a repeated __proto__ is a duplicate", () => {
    const names = ["toString", "__proto__", "constructor", "hasOwnProperty"];
    const r = ground(ORDER_DESK, names.map((id, i) => obs(id, ["packDays", "transitDays", "customsDays", "deliveryDay"][i] as string, 0, 5)));
    expect(r.ok && r.rejected).toEqual([]);
    expect(r.ok && r.grounding.observations.map((o) => o.id)).toEqual(["__proto__", "constructor", "hasOwnProperty", "toString"]);
    const twice = ground(ORDER_DESK, [obs("__proto__", "packDays", 0, 5), obs("__proto__", "transitDays", 0, 5)]);
    expect(twice.ok && twice.rejected.map((x) => x.fault)).toEqual([{ kind: "duplicate-id", id: "__proto__" }, { kind: "duplicate-id", id: "__proto__" }]);
  });

  it("a JSON-parsed observation with its own __proto__ key is read like any other record: the key is data and reaches nothing", () => {
    const parsed = JSON.parse('{"id":"p","field":"packDays","extent":{"lo":1,"hi":2},"quote":"1 to 2 days","source":"s","__proto__":{"id":"hijacked"}}');
    const r = ground(ORDER_DESK, [parsed]);
    expect(r.ok && r.grounding.observations.map((o) => o.id)).toEqual(["p"]);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "id")).toBe(false);
  });
});

describe("precedence: duplicate-id > malformed > unknown-field > number-not-in-quote > outside-baseline", () => {
  const verdict = (snapshot: RawObservation[], index: number): string => {
    const r = ground(SCHEMA, snapshot);
    if (!r.ok) return `failed:${r.failure.kind}`;
    return r.rejected.find((x) => x.index === index)?.fault.kind ?? "accepted";
  };
  /** Each case breaks the rules in `rules` at observation 1 (and the reference agrees that it breaks exactly those). */
  const cases: readonly { rules: readonly ObsRule[]; make: (o: RawObservation, other: RawObservation) => void }[] = [
    { rules: ["duplicate-id", "malformed"], make: (o, other) => ((o.id = other.id), (o.quote = "")) },
    { rules: ["duplicate-id", "unknown-field"], make: (o, other) => ((o.id = other.id), (o.field = "ghost")) },
    { rules: ["duplicate-id", "number-not-in-quote"], make: (o, other) => ((o.id = other.id), (o.quote = "a few days")) },
    { rules: ["duplicate-id", "outside-baseline"], make: (o, other) => ((o.id = other.id), (o.extent = { lo: -5, hi: -1 }), (o.quote = "between 5 and 1 days")) },
    { rules: ["malformed", "unknown-field"], make: (o) => ((o.source = ""), (o.field = "ghost")) },
    { rules: ["malformed", "number-not-in-quote"], make: (o) => ((o.extent = { lo: 3, hi: 5 }), (o.source = ""), (o.quote = "a few days")) },
    { rules: ["unknown-field", "number-not-in-quote"], make: (o) => ((o.field = "ghost"), (o.quote = "a few days")) },
    { rules: ["number-not-in-quote", "outside-baseline"], make: (o) => ((o.extent = { lo: -5, hi: -1 }), (o.quote = "a few days")) },
    { rules: ["unknown-field", "malformed"], make: (o) => ((o.field = "ghost"), (o.id = "")) },
  ];
  for (const { rules, make } of cases) {
    it(`${rules.join(" and ")}: ${OBS_RULE_ORDER.find((r) => rules.includes(r))}`, () => {
      const snapshot = good();
      make(snapshot[1] as RawObservation, snapshot[0] as RawObservation);
      const seen = [...refViolations(snapshot[1], new Set([snapshot[0]!.id]), BASELINES)].sort();
      expect(seen, "the reference sees both rules").toEqual([...rules].sort());
      expect(verdict(snapshot, 1)).toBe(OBS_RULE_ORDER.find((r) => rules.includes(r)));
    });
  }
});

describe("the failures of the whole call", () => {
  const FAULTS: readonly [string, unknown, SchemaFault][] = [
    ["malformed", { fields: [] }, { kind: "malformed", fields: ["fields"] }],
    ["too-many-fields", { fields: Array.from({ length: 65 }, (_, i) => base(`b${i}`)) }, { kind: "too-many-fields", count: 65, max: 64 }],
    ["duplicate-field", { fields: [base("a"), base("a")] }, { kind: "duplicate-field", field: "a" }],
    ["unknown-operand", schemaOf(base("a"), derived("t", ["a", "ghost"])), { kind: "unknown-operand", result: "t", operand: "ghost" }],
    ["operand-reused", schemaOf(base("a"), base("b"), derived("t", ["a", "a"]), derived("u", ["b", "t"])), { kind: "operand-reused", operand: "a" }],
    ["rule-cycle", schemaOf(base("a"), derived("t", ["t", "a"])), { kind: "rule-cycle", field: "t" }],
    ["unit-mismatch", schemaOf(base("a"), base("b", 0, null, "hours"), derived("t", ["a", "b"])), { kind: "unit-mismatch", result: "t", operand: "b" }],
  ];
  for (const [name, schema, fault] of FAULTS) {
    it(`a schema fault (${name}) is an invalid-schema failure carrying it, and the observations are not read`, () => {
      let reads = 0;
      const observations = new Proxy([], {
        get(target, key, receiver) {
          reads += 1;
          return Reflect.get(target, key, receiver);
        },
      });
      expect(ground(schema, observations)).toStrictEqual({ ok: false, failure: { kind: "invalid-schema", fault } });
      expect(reads).toBe(0);
    });
  }

  it("a schema read that throws is an invalid-schema failure carrying hostile-input", () => {
    const hostile = {
      get fields(): unknown {
        throw new Error("no");
      },
    };
    expect(ground(hostile, [])).toStrictEqual({ ok: false, failure: { kind: "invalid-schema", fault: { kind: "hostile-input", message: "reading fields threw" } } });
  });

  it("MAX_OBSERVATIONS observations are accepted; one more is too-many-observations, decided from the length alone", () => {
    const many = (n: number): RawObservation[] => Array.from({ length: n }, (_, i) => obs(`id${i}`, "packDays", 0, 5));
    const at = ground(SCHEMA, many(MAX_OBSERVATIONS));
    expect(at.ok && at.grounding.observations).toHaveLength(MAX_OBSERVATIONS);
    expect(ground(SCHEMA, many(MAX_OBSERVATIONS + 1))).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: MAX_OBSERVATIONS + 1, max: MAX_OBSERVATIONS } });

    let indexReads = 0;
    const claimed = new Proxy(many(3), {
      get(target, key, receiver) {
        if (key === "length") return 2 ** 32 - 1;
        if (typeof key === "string" && /^\d+$/.test(key)) indexReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(ground(SCHEMA, claimed)).toStrictEqual({ ok: false, failure: { kind: "too-many-observations", count: 2 ** 32 - 1, max: MAX_OBSERVATIONS } });
    expect(indexReads).toBe(0);
  });

  for (const [name, value] of [["undefined", undefined], ["null", null], ["an object", {}], ["an object with a length", { length: 1, 0: obs("a", "packDays", 0, 1) }], ["a string", "abc"], ["a number", 3]] as const) {
    it(`observations that are ${name} are a hostile-input failure, not an empty snapshot`, () => {
      expect(ground(SCHEMA, value)).toStrictEqual({ ok: false, failure: { kind: "hostile-input", message: "observations is not an array" } });
    });
  }

  it("a revoked Proxy of an array is a hostile-input failure, not a throw", () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(ground(SCHEMA, proxy)).toStrictEqual({ ok: false, failure: { kind: "hostile-input", message: "reading observations threw" } });
  });

  it("a length that throws, and a length that is no count, are hostile-input failures", () => {
    const throwing = new Proxy([], {
      get(target, key, receiver) {
        if (key === "length") throw new Error("no");
        return Reflect.get(target, key, receiver);
      },
    });
    expect(ground(SCHEMA, throwing)).toStrictEqual({ ok: false, failure: { kind: "hostile-input", message: "reading observations.length threw" } });
    for (const length of [-1, 1.5, Number.NaN, "3", null, undefined, 2 ** 53, Number.POSITIVE_INFINITY]) {
      const odd = new Proxy([], { get: (target, key, receiver) => (key === "length" ? length : Reflect.get(target, key, receiver)) });
      expect(ground(SCHEMA, odd), String(length)).toStrictEqual({ ok: false, failure: { kind: "hostile-input", message: "observations has no usable length" } });
    }
  });

  it("an empty snapshot is not a failure", () => {
    const r = ground(SCHEMA, []);
    expect(r.ok && r.rejected).toEqual([]);
    expect(r.ok && r.grounding.observations).toEqual([]);
  });
});

describe("a hostile read stops at the observation it happened in", () => {
  const hostileProperty = (key: string): RawObservation => {
    const o = jsonCopy(obs("h", "packDays", 1, 2)) as unknown as Record<string, unknown>;
    Object.defineProperty(o, key, {
      enumerable: true,
      get() {
        throw new Error("hostile");
      },
    });
    return o as unknown as RawObservation;
  };
  for (const key of ["id", "field", "extent", "quote", "source"]) {
    it(`a getter that throws on ${key}: that observation is hostile-input, the others are unaffected`, () => {
      const snapshot = [obs("a1", "packDays", 1, 2), hostileProperty(key), obs("a3", "customsDays", 0, 2)];
      const r = ground(SCHEMA, snapshot);
      if (!r.ok) throw new Error("the call failed");
      expect(r.rejected).toStrictEqual([{ index: 1, fault: { kind: "hostile-input", message: `reading ${key} threw` } }]);
      expect(r.grounding.observations.map((o) => o.id)).toEqual(["a1", "a3"]);
    });
  }

  it("a getter that throws on the element itself", () => {
    const list = [obs("a1", "packDays", 1, 2), obs("a2", "transitDays", 3, 5)];
    Object.defineProperty(list, 1, {
      enumerable: true,
      get() {
        throw new Error("hostile");
      },
    });
    const r = ground(SCHEMA, list);
    if (!r.ok) throw new Error("the call failed");
    expect(r.rejected).toStrictEqual([{ index: 1, fault: { kind: "hostile-input", message: "reading element threw" } }]);
  });

  it("a getter that throws on an extent's lo or hi is hostile-input about the extent", () => {
    for (const side of ["lo", "hi"]) {
      const extent = { lo: 1, hi: 2 };
      Object.defineProperty(extent, side, {
        enumerable: true,
        get() {
          throw new Error("hostile");
        },
      });
      const r = ground(SCHEMA, [{ ...obs("h", "packDays", 1, 2), extent }]);
      if (!r.ok) throw new Error("the call failed");
      expect(r.rejected, side).toStrictEqual([{ index: 0, fault: { kind: "hostile-input", message: "reading extent threw" } }]);
    }
  });

  it("hostile-input outranks every other fault of the same observation, and the message does not hold the value an id getter threw", () => {
    const o = hostileProperty("quote") as unknown as Record<string, unknown>;
    o["source"] = "";
    o["field"] = "ghost";
    const r = ground(SCHEMA, [o, o]);
    if (!r.ok) throw new Error("the call failed");
    expect(r.rejected.map((x) => x.fault.kind)).toEqual(["hostile-input", "hostile-input"]);
    const thrower = {
      get id(): unknown {
        throw new Error("SECRET-VALUE");
      },
    };
    const again = ground(SCHEMA, [thrower]);
    expect(JSON.stringify(again)).not.toContain("SECRET-VALUE");
  });
});
