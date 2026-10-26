import { describe, expect, it } from "vitest";
import { MAX_FIELDS, MAX_ID_LENGTH, MAX_LABEL_LENGTH, MAX_MAGNITUDE, MAX_OPERANDS, MAX_UNIT_LENGTH, compareIds } from "../../contracts/index.js";
import type { SchemaFault } from "../../contracts/index.js";
import { ground, readSchema } from "../index.js";
import { base, chance, derived, int, jsonCopy, leafDiff, mulberry32, pick, schemaOf, shuffled, unfrozenPaths } from "./fixtures.js";
import type { RawField, Rng } from "./fixtures.js";

/**
 * EVERY SCHEMA FAULT, TABLE-DRIVEN AND MASKING-AWARE (plan section 6, M4, layer 1). The plan's reason: whole-system
 * properties do not reliably catch a deleted refusal (on its model, deleting `operand-reused`, `rule-cycle` or
 * `unit-mismatch` tripped 0 of 3 000 instances, because a generator that only produces valid schemas never
 * reaches them), so each refusal has a fixture of its own that breaks THAT rule and no other.
 *
 * "BREAKS ONLY ITS OWN RULE" IS CHECKED, NOT READ. Every row is a `broken` input and a `repaired` one, and for
 * every row the test checks four things with code that is not the code under test:
 *  1. `readSchema(broken)` is exactly the expected fault;
 *  2. `readSchema(repaired)` is accepted (a second, masked defect would still be refused);
 *  3. an independent reference validator (`refSchema`, below, a different algorithm written for this file) says
 *     `broken` violates exactly the one rule and `repaired` none, whatever the engine's precedence hides;
 *  4. `broken` and `repaired` differ in exactly the declared number of places (`leafDiff`), so the repair is the
 *     edit the row says it is.
 * Then every one of the 128 subsets of the seven rules is built by injecting disjoint defects, and the engine's
 * answer must be the first rule of the plan's precedence in the subset while the reference sees exactly the
 * subset. Last, a differential fuzz corrupts generated schemas at random and compares the engine with the
 * reference, and counts that every one of the eight fault kinds was reached.
 *
 * What none of this shows: that the reference is right where the engine is wrong in the same way. They share the
 * plan's text and nothing else.
 */

type SchemaRule = "malformed" | "too-many-fields" | "duplicate-field" | "unknown-operand" | "operand-reused" | "rule-cycle" | "unit-mismatch";
const PRECEDENCE: readonly SchemaRule[] = ["malformed", "too-many-fields", "duplicate-field", "unknown-operand", "operand-reused", "rule-cycle", "unit-mismatch"];

// ---------------------------------------------------------------------------------------------------------
// The independent reference validator.
// ---------------------------------------------------------------------------------------------------------

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max;
function extentOk(v: unknown): boolean {
  if (!isRec(v)) return false;
  const side = (x: unknown): boolean => x === null || (typeof x === "number" && Number.isInteger(x) && Math.abs(x) <= MAX_MAGNITUDE);
  const { lo, hi } = v;
  if (!side(lo) || !side(hi)) return false;
  return !(typeof lo === "number" && typeof hi === "number" && lo > hi);
}

/** Every rule a raw schema violates (not only the first), and the malformed places, by a plain re-reading of the plan's rules. */
function refSchema(raw: unknown): { places: string[]; rules: Set<SchemaRule> } {
  const rules = new Set<SchemaRule>();
  if (!isRec(raw)) return { places: ["schema"], rules: new Set(["malformed"]) };
  const list = raw["fields"];
  if (!Array.isArray(list) || list.length === 0) return { places: ["fields"], rules: new Set(["malformed"]) };
  const places: string[] = [];
  const good: { id: string; unit: string; sum: string[] }[] = [];
  list.slice(0, MAX_FIELDS + 1).forEach((el: unknown, i) => {
    const at = `fields[${i}]`;
    if (!isRec(el)) {
      places.push(at);
      return;
    }
    const before = places.length;
    const kind = el["kind"];
    if (kind !== "base" && kind !== "derived") places.push(`${at}.kind`);
    if (!isStr(el["id"], MAX_ID_LENGTH)) places.push(`${at}.id`);
    if (!isStr(el["label"], MAX_LABEL_LENGTH)) places.push(`${at}.label`);
    if (!isStr(el["unit"], MAX_UNIT_LENGTH)) places.push(`${at}.unit`);
    let sum: string[] = [];
    if (kind === "base") {
      if (!extentOk(el["baseline"])) places.push(`${at}.baseline`);
      if (el["sum"] !== undefined) places.push(`${at}.sum`);
    } else if (kind === "derived") {
      const s = el["sum"];
      if (!Array.isArray(s) || s.length < 2 || s.length > MAX_OPERANDS) places.push(`${at}.sum`);
      else {
        s.forEach((operand: unknown, j) => {
          if (!isStr(operand, MAX_ID_LENGTH)) places.push(`${at}.sum[${j}]`);
        });
        sum = s as string[];
      }
      if (el["baseline"] !== undefined) places.push(`${at}.baseline`);
    }
    if (places.length === before) good.push({ id: el["id"] as string, unit: el["unit"] as string, sum });
  });
  if (places.length > 0) rules.add("malformed");
  if (list.length > MAX_FIELDS) rules.add("too-many-fields");

  const ids = new Map<string, number>();
  for (const f of good) ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
  if ([...ids.values()].some((n) => n > 1)) rules.add("duplicate-field");
  const unitOf = new Map(good.map((f) => [f.id, f.unit]));
  const uses = new Map<string, number>();
  for (const f of good) {
    for (const operand of f.sum) {
      uses.set(operand, (uses.get(operand) ?? 0) + 1);
      if (!ids.has(operand)) rules.add("unknown-operand");
      else if (unitOf.get(operand) !== f.unit) rules.add("unit-mismatch");
    }
  }
  if ([...uses.values()].some((n) => n > 1)) rules.add("operand-reused");
  // a cycle exists iff the dependency graph cannot be ordered (Kahn's algorithm)
  const nodes = [...ids.keys()];
  const waiting = new Map(nodes.map((id) => [id, 0]));
  const feeds = new Map<string, string[]>();
  for (const f of good) {
    for (const operand of f.sum) {
      if (!ids.has(operand)) continue;
      waiting.set(f.id, (waiting.get(f.id) ?? 0) + 1);
      feeds.set(operand, [...(feeds.get(operand) ?? []), f.id]);
    }
  }
  const ready = nodes.filter((id) => waiting.get(id) === 0);
  let ordered = 0;
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    ordered += 1;
    for (const next of feeds.get(id) ?? []) {
      waiting.set(next, (waiting.get(next) as number) - 1);
      if (waiting.get(next) === 0) ready.push(next);
    }
  }
  if (ordered < nodes.length) rules.add("rule-cycle");
  return { places: [...new Set(places)].sort(compareIds), rules };
}

// ---------------------------------------------------------------------------------------------------------
// The table.
// ---------------------------------------------------------------------------------------------------------

type Doc = { fields: Array<Record<string, any>> };
/** a, b, c, total = a + b. `c` is an operand of nothing, so a defect in `c` cannot be seen by a rule that looks at sums. */
const valid4 = (): Doc => jsonCopy(schemaOf(base("a"), base("b"), base("c"), derived("total", ["a", "b"]))) as unknown as Doc;
const text = (n: number): string => "x".repeat(n);

interface Row {
  readonly name: string;
  readonly broken: unknown;
  readonly repaired: unknown;
  readonly expected: SchemaFault;
  readonly rule: SchemaRule;
  readonly edits: number;
}
const rows: Row[] = [];
function edit(name: string, change: (doc: Doc) => void, rule: SchemaRule, expected: SchemaFault, edits = 1): void {
  const broken = valid4();
  change(broken);
  rows.push({ name, broken, repaired: valid4(), expected, rule, edits });
}
const malformed = (...fields: [string, ...string[]]): SchemaFault => ({ kind: "malformed", fields });
function whole(name: string, broken: unknown, expected: SchemaFault, repaired: unknown = valid4()): void {
  rows.push({ name, broken, repaired, expected, rule: "malformed", edits: 1 });
}
const C = 2; // the index of `c`
const TOTAL = 3; // the index of `total`

// -- malformed: the root and the field list
whole("the schema is undefined", undefined, malformed("schema"));
whole("the schema is null", null, malformed("schema"));
whole("the schema is an array", [], malformed("schema"));
whole("the schema is a number", 42, malformed("schema"));
whole("the schema is a string", "text", malformed("schema"));
whole("the schema is a function", () => 1, malformed("schema"));
whole("the schema has no fields property", {}, malformed("fields"));
whole("fields is null", { fields: null }, malformed("fields"));
whole("fields is an object, not an array", { fields: {} }, malformed("fields"));
whole("fields is a string", { fields: "abc" }, malformed("fields"));
whole("fields is empty", { fields: [] }, malformed("fields"), { fields: [base("a")] });
// -- malformed: an element
for (const [name, value] of [["a number", 7], ["null", null], ["an array", []], ["a string", "str"], ["undefined", undefined]] as const) {
  edit(`an element is ${name}`, (d) => void (d.fields[C] = value as never), "malformed", malformed(`fields[${C}]`));
}
edit("kind has the wrong case", (d) => void (d.fields[C]!["kind"] = "BASE"), "malformed", malformed(`fields[${C}].kind`));
edit("kind is missing", (d) => void delete d.fields[C]!["kind"], "malformed", malformed(`fields[${C}].kind`));
edit("kind is a number", (d) => void (d.fields[C]!["kind"] = 5), "malformed", malformed(`fields[${C}].kind`));
for (const [name, value] of [["empty", ""], ["too long", text(MAX_ID_LENGTH + 1)], ["a number", 5], ["null", null], ["a boxed string", Object("a")]] as const) {
  edit(`an id is ${name}`, (d) => void (d.fields[C]!["id"] = value), "malformed", malformed(`fields[${C}].id`));
}
edit("an id is missing", (d) => void delete d.fields[C]!["id"], "malformed", malformed(`fields[${C}].id`));
for (const [name, value] of [["empty", ""], ["too long", text(MAX_LABEL_LENGTH + 1)], ["a number", 1], ["undefined", undefined]] as const) {
  edit(`a label is ${name}`, (d) => void (d.fields[C]!["label"] = value), "malformed", malformed(`fields[${C}].label`));
}
for (const [name, value] of [["empty", ""], ["too long", text(MAX_UNIT_LENGTH + 1)], ["a number", 1], ["null", null]] as const) {
  edit(`a unit is ${name}`, (d) => void (d.fields[C]!["unit"] = value), "malformed", malformed(`fields[${C}].unit`));
}
// -- malformed: baseline, sum, and the two forbidden pairings
edit("a base field has no baseline", (d) => void delete d.fields[C]!["baseline"], "malformed", malformed(`fields[${C}].baseline`));
for (const [name, value] of [
  ["inverted", { lo: 0, hi: -1 }],
  ["a fraction", { lo: 0.5, hi: null }],
  ["out of range", { lo: 0, hi: MAX_MAGNITUDE + 1 }],
  ["NaN", { lo: Number.NaN, hi: null }],
  ["an infinity", { lo: 0, hi: Number.POSITIVE_INFINITY }],
  ["a string bound", { lo: "0", hi: null }],
  ["missing a side", { lo: 0 }],
  ["an array", []],
  ["a number", 5],
] as const) {
  edit(`a baseline is ${name}`, (d) => void (d.fields[C]!["baseline"] = value), "malformed", malformed(`fields[${C}].baseline`));
}
edit("a base field carries a sum", (d) => void (d.fields[C]!["sum"] = ["a", "b"]), "malformed", malformed(`fields[${C}].sum`));
edit("a derived field declares a baseline", (d) => void (d.fields[TOTAL]!["baseline"] = { lo: 0, hi: null }), "malformed", malformed(`fields[${TOTAL}].baseline`));
edit("a derived field has no sum", (d) => void delete d.fields[TOTAL]!["sum"], "malformed", malformed(`fields[${TOTAL}].sum`));
for (const [name, value] of [
  ["a string", "a,b"],
  ["null", null],
  ["an object", { 0: "a", 1: "b", length: 2 }],
  ["one operand", ["a"]],
  ["no operand", []],
  ["too many operands", ["a", "b", ...Array.from({ length: MAX_OPERANDS - 1 }, (_, i) => `o${i}`)]],
] as const) {
  edit(`a sum is ${name}`, (d) => void (d.fields[TOTAL]!["sum"] = value), "malformed", malformed(`fields[${TOTAL}].sum`));
}
for (const [name, value] of [["a number", 5], ["empty", ""], ["too long", text(MAX_ID_LENGTH + 1)], ["null", null]] as const) {
  edit(`an operand is ${name}`, (d) => void (d.fields[TOTAL]!["sum"][1] = value), "malformed", malformed(`fields[${TOTAL}].sum[1]`));
}
// -- malformed: more than one place, and the order they are reported in
edit(
  "two places in two fields are both named, sorted",
  (d) => {
    d.fields[TOTAL]!["unit"] = "";
    d.fields[C]!["id"] = 5;
  },
  "malformed",
  malformed(`fields[${C}].id`, `fields[${TOTAL}].unit`),
  2,
);
edit(
  "two properties of one field are both named",
  (d) => {
    d.fields[C]!["id"] = "";
    d.fields[C]!["label"] = "";
  },
  "malformed",
  malformed(`fields[${C}].id`, `fields[${C}].label`),
  2,
);
{
  const twelve = (): Doc => ({ fields: Array.from({ length: 12 }, (_, i) => jsonCopy(base(`b${i}`))) as Array<Record<string, any>> });
  const broken = twelve();
  broken.fields[2]!["label"] = "";
  broken.fields[10]!["label"] = "";
  rows.push({
    name: "paths sort by code unit, so fields[10] comes before fields[2]",
    broken,
    repaired: twelve(),
    expected: malformed("fields[10].label", "fields[2].label"),
    rule: "malformed",
    edits: 2,
  });
}
// -- too-many-fields
rows.push({
  name: "65 fields",
  broken: { fields: Array.from({ length: MAX_FIELDS + 1 }, (_, i) => base(`b${i}`)) },
  repaired: { fields: Array.from({ length: MAX_FIELDS }, (_, i) => base(`b${i}`)) },
  expected: { kind: "too-many-fields", count: MAX_FIELDS + 1, max: MAX_FIELDS },
  rule: "too-many-fields",
  edits: 1,
});
// -- duplicate-field
edit("two fields share an id", (d) => void (d.fields[C]!["id"] = "a"), "duplicate-field", { kind: "duplicate-field", field: "a" });
// -- unknown-operand
edit("an operand no field declares", (d) => void (d.fields[TOTAL]!["sum"][1] = "ghost"), "unknown-operand", { kind: "unknown-operand", result: "total", operand: "ghost" });
// -- operand-reused: the diamond, the same operand twice in one sum, a derived field in two sums
rows.push({
  name: "a diamond: x = a + b, y = a + c, z = x + y",
  broken: schemaOf(base("a"), base("b"), base("c"), base("d"), derived("x", ["a", "b"]), derived("y", ["a", "c"]), derived("z", ["x", "y"])),
  repaired: schemaOf(base("a"), base("b"), base("c"), base("d"), derived("x", ["a", "b"]), derived("y", ["d", "c"]), derived("z", ["x", "y"])),
  expected: { kind: "operand-reused", operand: "a" },
  rule: "operand-reused",
  edits: 1,
});
edit("the same operand twice in one sum", (d) => void (d.fields[TOTAL]!["sum"][1] = "a"), "operand-reused", { kind: "operand-reused", operand: "a" });
rows.push({
  name: "a derived field in two sums",
  broken: schemaOf(base("a"), base("b"), base("c"), base("d"), base("e"), derived("x", ["a", "b"]), derived("y", ["x", "c"]), derived("z", ["x", "d"])),
  repaired: schemaOf(base("a"), base("b"), base("c"), base("d"), base("e"), derived("x", ["a", "b"]), derived("y", ["x", "c"]), derived("z", ["e", "d"])),
  expected: { kind: "operand-reused", operand: "x" },
  rule: "operand-reused",
  edits: 1,
});
// -- rule-cycle: a self-cycle, a mutual cycle, a longer ring, a cycle with a tail, and the largest ring a 64-field schema can hold
edit("a field that is its own operand", (d) => void (d.fields[TOTAL]!["sum"][1] = "total"), "rule-cycle", { kind: "rule-cycle", field: "total" });
rows.push({
  name: "two fields that are each other's operand",
  broken: schemaOf(base("a"), base("b"), base("c"), derived("x", ["y", "b"]), derived("y", ["x", "c"])),
  repaired: schemaOf(base("a"), base("b"), base("c"), derived("x", ["a", "b"]), derived("y", ["x", "c"])),
  expected: { kind: "rule-cycle", field: "x" },
  rule: "rule-cycle",
  edits: 1,
});
rows.push({
  name: "a ring of three",
  broken: schemaOf(base("a"), base("b"), base("c"), base("d"), derived("x", ["z", "b"]), derived("y", ["x", "c"]), derived("z", ["y", "d"])),
  repaired: schemaOf(base("a"), base("b"), base("c"), base("d"), derived("x", ["a", "b"]), derived("y", ["x", "c"]), derived("z", ["y", "d"])),
  expected: { kind: "rule-cycle", field: "x" },
  rule: "rule-cycle",
  edits: 1,
});
rows.push({
  name: "a cycle with a tail: the field that feeds the cycle is not the one named, though it sorts first",
  broken: schemaOf(base("aTail"), base("r"), base("p"), derived("x", ["aTail", "y"]), derived("y", ["x", "p"])),
  repaired: schemaOf(base("aTail"), base("r"), base("p"), derived("x", ["aTail", "r"]), derived("y", ["x", "p"])),
  expected: { kind: "rule-cycle", field: "x" },
  rule: "rule-cycle",
  edits: 1,
});
/**
 * 33 base fields (`b00` to `b31` and a spare `s`) and 31 derived ones, r(i) = r(i+1) + b(i): exactly 64 fields.
 * The last rule closes the ring on r00, or, opened, takes the spare base field instead.
 */
const ringFields = (closed: boolean): RawField[] => {
  const name = (prefix: string, i: number): string => `${prefix}${String(i).padStart(2, "0")}`;
  const out: RawField[] = [];
  for (let i = 0; i < 32; i++) out.push(base(name("b", i)));
  out.push(base("s"));
  for (let i = 0; i < 31; i++) out.push(derived(name("r", i), [i < 30 ? name("r", i + 1) : closed ? "r00" : "s", name("b", i)]));
  return out;
};
rows.push({
  name: "a ring of 31 derived fields in a schema of exactly 64 fields",
  broken: { fields: ringFields(true) },
  repaired: { fields: ringFields(false) },
  expected: { kind: "rule-cycle", field: "r00" },
  rule: "rule-cycle",
  edits: 1,
});
// -- unit-mismatch
edit("an operand in another unit", (d) => void (d.fields[1]!["unit"] = "hours"), "unit-mismatch", { kind: "unit-mismatch", result: "total", operand: "b" });
edit("the result in another unit names the smallest operand", (d) => void (d.fields[TOTAL]!["unit"] = "hours"), "unit-mismatch", { kind: "unit-mismatch", result: "total", operand: "a" });

describe("every schema fault: the fixture breaks only its own rule, and repairing it is accepted", () => {
  for (const row of rows) {
    it(row.name, () => {
      expect(readSchema(row.broken), "the fault").toStrictEqual({ ok: false, fault: row.expected });
      expect(readSchema(row.repaired).ok, "the repaired input is accepted").toBe(true);

      const broken = refSchema(row.broken);
      expect([...broken.rules], "the reference sees exactly this rule").toEqual([row.rule]);
      if (row.expected.kind === "malformed") expect(broken.places, "and the same places").toEqual(row.expected.fields);
      expect([...refSchema(row.repaired).rules], "the reference sees nothing in the repaired input").toEqual([]);
      expect(leafDiff(row.broken, row.repaired), "the repair is the declared number of edits").toBe(row.edits);
    });
  }

  it("the table reaches seven of the eight fault kinds (the eighth, hostile-input, is the table in hostile-input.test.ts)", () => {
    expect(new Set(rows.map((r) => r.rule))).toEqual(new Set(PRECEDENCE));
    expect(rows.length).toBeGreaterThanOrEqual(70);
  });

  it("the ring row is a schema of exactly MAX_FIELDS fields", () => {
    expect((rows.find((r) => r.name.startsWith("a ring of 31"))?.broken as { fields: unknown[] }).fields).toHaveLength(MAX_FIELDS);
  });
});

// ---------------------------------------------------------------------------------------------------------
// All 128 subsets of the seven rules.
// ---------------------------------------------------------------------------------------------------------

describe("every subset of the seven rules: the engine reports the first by the plan's precedence, and the reference sees exactly the subset", () => {
  const FILLERS = 63;
  const inject: Record<SchemaRule, (fields: Array<Record<string, any>>) => void> = {
    malformed: (f) => void f.push({ ...jsonCopy(base("badKind")), kind: "oops" }),
    "duplicate-field": (f) => void f.push(jsonCopy(base("dupBase")), jsonCopy(base("dupBase"))),
    "unknown-operand": (f) => void f.push(jsonCopy(base("uk1")), jsonCopy(derived("ukSum", ["uk1", "ghost"]))),
    "operand-reused": (f) =>
      void f.push(jsonCopy(base("ru1")), jsonCopy(base("ru2")), jsonCopy(base("ru3")), jsonCopy(derived("ruA", ["ru1", "ru2"])), jsonCopy(derived("ruB", ["ru1", "ru3"]))),
    "rule-cycle": (f) => void f.push(jsonCopy(base("cy1")), jsonCopy(base("cy2")), jsonCopy(derived("cyA", ["cyB", "cy1"])), jsonCopy(derived("cyB", ["cyA", "cy2"]))),
    "unit-mismatch": (f) => void f.push(jsonCopy(base("um1")), jsonCopy(base("um2", 0, null, "hours")), jsonCopy(derived("umSum", ["um1", "um2"]))),
    // last, so that every other injected field is within the first MAX_FIELDS + 1 elements the engine reads
    "too-many-fields": (f) => {
      for (let i = 0; i < FILLERS; i++) f.push(jsonCopy(base(`fill${String(i).padStart(2, "0")}`)));
    },
  };
  // the fillers go last, so that every other injected field is among the first MAX_FIELDS + 1 elements the engine reads
  const INJECTION_ORDER: readonly SchemaRule[] = [...PRECEDENCE.filter((r) => r !== "too-many-fields"), "too-many-fields"];
  const build = (subset: readonly SchemaRule[]): Doc => {
    const doc: Doc = { fields: [jsonCopy(base("p")), jsonCopy(base("q"))] };
    for (const rule of INJECTION_ORDER.filter((r) => subset.includes(r))) inject[rule](doc.fields);
    return doc;
  };
  const expectedFault = (subset: readonly SchemaRule[], doc: Doc): SchemaFault | undefined => {
    const first = PRECEDENCE.find((r) => subset.includes(r));
    switch (first) {
      case undefined:
        return undefined;
      case "malformed":
        return malformed(`fields[${doc.fields.findIndex((f) => f["kind"] === "oops")}].kind`);
      case "too-many-fields":
        return { kind: "too-many-fields", count: doc.fields.length, max: MAX_FIELDS };
      case "duplicate-field":
        return { kind: "duplicate-field", field: "dupBase" };
      case "unknown-operand":
        return { kind: "unknown-operand", result: "ukSum", operand: "ghost" };
      case "operand-reused":
        return { kind: "operand-reused", operand: "ru1" };
      case "rule-cycle":
        return { kind: "rule-cycle", field: "cyA" };
      case "unit-mismatch":
        return { kind: "unit-mismatch", result: "umSum", operand: "um2" };
    }
  };

  const subsets: SchemaRule[][] = [];
  for (let mask = 0; mask < 1 << PRECEDENCE.length; mask++) subsets.push(PRECEDENCE.filter((_, bit) => (mask & (1 << bit)) !== 0));

  it("there are 128 of them, the empty one included", () => {
    expect(subsets).toHaveLength(128);
    expect(subsets[0]).toEqual([]);
  });

  it("each subset: the engine's answer is the first rule of the precedence in it; the reference sees exactly the subset", () => {
    let mismatches = 0;
    const first: string[] = [];
    for (const subset of subsets) {
      const doc = build(subset);
      const verdict = readSchema(doc);
      const want = expectedFault(subset, doc);
      const seen = [...refSchema(doc).rules].sort();
      const sameRules = JSON.stringify(seen) === JSON.stringify([...subset].sort());
      const sameFault = want === undefined ? verdict.ok : !verdict.ok && JSON.stringify(verdict.fault) === JSON.stringify(want);
      if (!sameRules || !sameFault) {
        mismatches += 1;
        if (first.length < 3) first.push(`${subset.join("+") || "(none)"}: engine ${JSON.stringify(verdict)} want ${JSON.stringify(want)} reference ${seen.join("+")}`);
      }
    }
    expect({ mismatches, first }).toEqual({ mismatches: 0, first: [] });
  });

  it("the same answer when the fields, and the operands within each sum, are shuffled (except the positions in a malformed path)", () => {
    const rng = mulberry32(2026);
    let checked = 0;
    for (const subset of subsets) {
      if (subset.includes("malformed")) continue;
      const doc = build(subset);
      const want = readSchema(doc);
      for (let k = 0; k < 4; k++) {
        const mixed: Doc = { fields: shuffled(rng, doc.fields).map((f) => (f["sum"] === undefined ? f : { ...f, sum: shuffled(rng, f["sum"] as string[]) })) };
        const got = readSchema(mixed);
        // an accepted schema keeps the author's field order, so only the fact of acceptance is the same
        if (want.ok) expect(got.ok, subset.join("+")).toBe(true);
        else expect(got, subset.join("+")).toStrictEqual(want);
        checked += 1;
      }
    }
    expect(checked).toBe(4 * 64);
  });
});

describe("where a rule fails in several places the smallest id is named, whatever order the fields are in", () => {
  it("duplicate-field: the smallest repeated id", () => {
    const doc = { fields: [base("zeta"), base("alpha"), base("zeta"), base("alpha")] };
    expect(readSchema(doc)).toStrictEqual({ ok: false, fault: { kind: "duplicate-field", field: "alpha" } });
    expect(readSchema({ fields: [...doc.fields].reverse() })).toStrictEqual({ ok: false, fault: { kind: "duplicate-field", field: "alpha" } });
  });

  it("unknown-operand: the smallest result, then the smallest operand", () => {
    const doc = schemaOf(base("a"), derived("zz", ["a", "ghost"]), derived("mm", ["a", "zzz", "aaa"]));
    const want = { ok: false, fault: { kind: "unknown-operand", result: "mm", operand: "aaa" } };
    expect(readSchema(doc)).toStrictEqual(want);
    expect(readSchema({ fields: [...doc.fields].reverse() })).toStrictEqual(want);
  });

  it("operand-reused: the smallest reused operand", () => {
    const doc = schemaOf(base("a"), base("b"), base("c"), base("d"), derived("x", ["d", "c"]), derived("y", ["d", "c"]), derived("w", ["a", "b"]));
    expect(readSchema(doc)).toStrictEqual({ ok: false, fault: { kind: "operand-reused", operand: "c" } });
  });

  it("rule-cycle: the smallest field ON a cycle, of two separate cycles", () => {
    const doc = schemaOf(base("p"), base("q"), base("r"), base("s"), derived("k2", ["k3", "p"]), derived("k3", ["k2", "q"]), derived("a2", ["a3", "r"]), derived("a3", ["a2", "s"]));
    expect(readSchema(doc)).toStrictEqual({ ok: false, fault: { kind: "rule-cycle", field: "a2" } });
  });

  it("unit-mismatch: the smallest result, then the smallest operand", () => {
    const doc = schemaOf(
      base("a", 0, null, "days"),
      base("b", 0, null, "hours"),
      base("c", 0, null, "hours"),
      base("d", 0, null, "days"),
      derived("t", ["a", "b"], "days"),
      derived("s", ["c", "d"], "days"),
    );
    expect(readSchema(doc)).toStrictEqual({ ok: false, fault: { kind: "unit-mismatch", result: "s", operand: "c" } });
  });
});

describe("a hand-built cyclic schema never makes a walk loop", () => {
  it("a self-cycle, a mutual cycle and a ring are refused promptly by readSchema and by ground, which never reads the observations", () => {
    let reads = 0;
    const observations = new Proxy([], {
      get(target, key, receiver) {
        reads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const cyclic = [
      schemaOf(base("a"), derived("x", ["x", "a"])),
      schemaOf(base("a"), base("b"), derived("x", ["y", "a"]), derived("y", ["x", "b"])),
      { fields: ringFields(true) },
    ];
    for (const schema of cyclic) {
      expect(readSchema(schema)).toMatchObject({ ok: false, fault: { kind: "rule-cycle" } });
      expect(ground(schema, observations)).toMatchObject({ ok: false, failure: { kind: "invalid-schema", fault: { kind: "rule-cycle" } } });
    }
    expect(reads).toBe(0);
  }, 2000);
});

// ---------------------------------------------------------------------------------------------------------
// The boundaries, N and N + 1, and what a good schema looks like.
// ---------------------------------------------------------------------------------------------------------

describe("the size boundaries: N is accepted and N + 1 is refused", () => {
  const withField = (patch: Record<string, unknown>): Doc => {
    const d = valid4();
    Object.assign(d.fields[0] as object, patch);
    return d;
  };
  it("an id of MAX_ID_LENGTH, a label of MAX_LABEL_LENGTH and a unit of MAX_UNIT_LENGTH are accepted; one more of each is malformed", () => {
    // change every unit together, so that no sum crosses units
    const sized = (id: string, label: string, unit: string): Doc => {
      const d = valid4();
      d.fields[0] = { ...d.fields[0], id, label, unit };
      for (const i of [1, 2, 3]) d.fields[i]!["unit"] = unit;
      d.fields[3]!["sum"][0] = id;
      return d;
    };
    expect(readSchema(sized(text(MAX_ID_LENGTH), text(MAX_LABEL_LENGTH), text(MAX_UNIT_LENGTH))).ok).toBe(true);
    expect(readSchema(withField({ id: text(MAX_ID_LENGTH + 1) }))).toMatchObject({ ok: false, fault: { kind: "malformed", fields: ["fields[0].id"] } });
    expect(readSchema(withField({ label: text(MAX_LABEL_LENGTH + 1) }))).toMatchObject({ ok: false, fault: { kind: "malformed", fields: ["fields[0].label"] } });
    expect(readSchema(withField({ unit: text(MAX_UNIT_LENGTH + 1) }))).toMatchObject({ ok: false, fault: { kind: "malformed", fields: ["fields[0].unit"] } });
  });

  it("the lengths are in UTF-16 code units, not characters: half the limit in astral characters (two code units each) is accepted and one more is malformed", () => {
    const astral = "\u{1F600}"; // one character, two code units
    expect(astral).toHaveLength(2);
    // `c` (index 2) is an operand of nothing, so a change to it cannot be seen by any structural rule
    const withC = (patch: Record<string, unknown>): Doc => {
      const d = valid4();
      Object.assign(d.fields[2] as object, patch);
      return d;
    };
    for (const [key, limit] of [["id", MAX_ID_LENGTH], ["label", MAX_LABEL_LENGTH], ["unit", MAX_UNIT_LENGTH]] as const) {
      expect(readSchema(withC({ [key]: astral.repeat(limit / 2) })).ok, `${key}: ${limit / 2} characters`).toBe(true);
      expect(readSchema(withC({ [key]: astral.repeat(limit / 2 + 1) })), `${key}: ${limit / 2 + 1} characters`).toStrictEqual({ ok: false, fault: malformed(`fields[2].${key}`) });
    }
  });

  it("a sum of MAX_OPERANDS operands is accepted; one more is malformed at its sum", () => {
    const eight = Array.from({ length: MAX_OPERANDS }, (_, i) => `b${i}`);
    const wide = (names: string[]) => schemaOf(...names.map((n) => base(n)), derived("total", names));
    expect(readSchema(wide(eight)).ok).toBe(true);
    expect(readSchema(wide([...eight, "b8"]))).toStrictEqual({ ok: false, fault: malformed(`fields[${MAX_OPERANDS + 1}].sum`) });
  });

  it("MAX_FIELDS fields are accepted and MAX_FIELDS + 1 are not (the row above), and a bound of MAX_MAGNITUDE is accepted where one past it is not", () => {
    expect(readSchema({ fields: Array.from({ length: MAX_FIELDS }, (_, i) => base(`b${i}`)) }).ok).toBe(true);
    expect(readSchema({ fields: [base("a", -MAX_MAGNITUDE, MAX_MAGNITUDE)] }).ok).toBe(true);
    expect(readSchema({ fields: [base("a", -MAX_MAGNITUDE - 1, null)] }).ok).toBe(false);
  });
});

describe("an accepted schema", () => {
  it("is a fresh, deeply frozen copy in the author's order, with exactly the declared keys", () => {
    const input = schemaOf(base("b", 1, 5), derived("t", ["b", "a"]), base("a"));
    const result = readSchema(input);
    expect(result).toStrictEqual({
      ok: true,
      schema: {
        fields: [
          { kind: "base", id: "b", label: "b label", unit: "days", baseline: { lo: 1, hi: 5 } },
          { kind: "derived", id: "t", label: "t label", unit: "days", sum: ["b", "a"] },
          { kind: "base", id: "a", label: "a label", unit: "days", baseline: { lo: 0, hi: null } },
        ],
      },
    });
    if (!result.ok) throw new Error("unreachable");
    expect(unfrozenPaths(result)).toEqual([]);
    expect(result.schema.fields[0]).not.toBe(input.fields[0]);
    expect(result.schema.fields[0]!.baseline).not.toBe(input.fields[0] && (input.fields[0] as { baseline: unknown }).baseline);
  });

  it("is a copy: changing the input afterwards changes nothing in it", () => {
    const input = jsonCopy(schemaOf(base("a"), base("b"), derived("t", ["a", "b"])));
    const result = readSchema(input);
    if (!result.ok) throw new Error("unreachable");
    const before = JSON.stringify(result);
    (input.fields[0] as { id: string }).id = "changed";
    ((input.fields[2] as { sum: string[] }).sum[0] as string) = "changed";
    (input.fields[0] as { baseline: { lo: number } }).baseline.lo = 99;
    expect(JSON.stringify(result)).toBe(before);
  });

  it("accepts ids that are prototype names, and a field with no unit relation to a separate tree", () => {
    const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];
    const result = readSchema({ fields: [...names.map((n) => base(n)), base("other", 0, null, "items")] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.schema.fields.map((f) => f.id)).toEqual([...names, "other"]);
  });

  it("an explicit undefined for the property a kind forbids is read as absent, in both directions", () => {
    const baseWithSum = { ...base("a"), sum: undefined };
    const derivedWithBaseline = { ...derived("t", ["a", "b"]), baseline: undefined };
    const result = readSchema({ fields: [baseWithSum, base("b"), derivedWithBaseline] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("sum" in (result.schema.fields[0] as object)).toBe(false);
      expect("baseline" in (result.schema.fields[2] as object)).toBe(false);
    }
  });

  it("an extra property on the input is neither refused nor copied", () => {
    const field = { ...base("a"), colour: "red" };
    const result = readSchema({ fields: [field], note: "x" });
    expect(result).toStrictEqual({ ok: true, schema: { fields: [base("a")] } });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Differential fuzz: random corruption, engine against reference, with every kind counted.
// ---------------------------------------------------------------------------------------------------------

describe("differential fuzz: corrupt a good schema at random and compare the engine with the reference", () => {
  const BAD_VALUES: readonly unknown[] = [undefined, null, 0, -1, 1.5, Number.NaN, "", "ghost", text(200), true, [], {}, ["a"], { lo: 5, hi: 1 }];

  function good(rng: Rng): Doc {
    const nBases = int(rng, 2, 5);
    const bases = Array.from({ length: nBases }, (_, i) => base(`b${i}`, chance(rng, 0.5) ? 0 : -2, chance(rng, 0.5) ? null : 6));
    const fields: RawField[] = [...bases];
    const free = bases.map((b) => b.id);
    let k = 0;
    while (free.length >= 2 && chance(rng, 0.7)) {
      const take = shuffled(rng, free).slice(0, int(rng, 2, Math.min(3, free.length)));
      const id = `d${k++}`;
      fields.push(derived(id, take));
      for (const t of take) free.splice(free.indexOf(t), 1);
      free.push(id);
    }
    return jsonCopy({ fields }) as unknown as Doc;
  }

  function corrupt(rng: Rng, doc: Doc): void {
    const f = pick(rng, doc.fields);
    if (typeof f !== "object" || f === null) return; // an earlier corruption already replaced it by a non-record
    const idOf = (x: unknown): unknown => (typeof x === "object" && x !== null ? (x as Record<string, unknown>)["id"] : undefined);
    const props = ["kind", "id", "label", "unit", "baseline", "sum"];
    switch (int(rng, 0, 9)) {
      case 0:
        f[pick(rng, props)] = pick(rng, BAD_VALUES);
        break;
      case 1:
        delete f[pick(rng, props)];
        break;
      case 2:
        f["id"] = idOf(pick(rng, doc.fields)); // a duplicate id
        break;
      case 3:
        if (Array.isArray(f["sum"])) f["sum"][int(rng, 0, f["sum"].length - 1)] = pick(rng, ["ghost", f["id"], idOf(pick(rng, doc.fields))]); // unknown, self or reused
        break;
      case 4:
        f["unit"] = pick(rng, ["days", "items", "hours"]);
        break;
      case 5:
        if (Array.isArray(f["sum"])) f["sum"].push(idOf(pick(rng, doc.fields)));
        break;
      case 6:
        doc.fields.push(jsonCopy(base(`extra${doc.fields.length}`)));
        break;
      case 7:
        if (f["baseline"] !== undefined) f["baseline"] = pick(rng, BAD_VALUES);
        break;
      case 8:
        if (Array.isArray(f["sum"])) f["sum"] = f["sum"].slice(0, int(rng, 0, 1));
        break;
      default:
        doc.fields[int(rng, 0, doc.fields.length - 1)] = pick(rng, BAD_VALUES) as Record<string, any>;
        break;
    }
  }

  it("on 4000 corrupted schemas the engine's fault is the reference's first rule, the malformed places agree, and all seven kinds were reached", () => {
    const counts = new Map<string, number>();
    let disagreements = 0;
    const first: string[] = [];
    for (let seed = 1; seed <= 4000; seed++) {
      const rng = mulberry32(seed);
      const doc = good(rng);
      const rounds = int(rng, 0, 3);
      for (let i = 0; i < rounds; i++) corrupt(rng, doc);
      // some inputs grow past MAX_FIELDS so that too-many-fields is reached
      if (chance(rng, 0.03)) while (doc.fields.length <= MAX_FIELDS) doc.fields.push(jsonCopy(base(`pad${doc.fields.length}`)));
      const reference = refSchema(doc);
      const want = PRECEDENCE.find((r) => reference.rules.has(r));
      const got = readSchema(doc);
      const kind = got.ok ? "ok" : got.fault.kind;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      const placesAgree = got.ok || got.fault.kind !== "malformed" || JSON.stringify(got.fault.fields) === JSON.stringify(reference.places);
      if (kind !== (want ?? "ok") || !placesAgree) {
        disagreements += 1;
        if (first.length < 3) first.push(`seed ${seed}: engine ${JSON.stringify(got)} reference ${[...reference.rules].join("+")} ${reference.places.join(",")}`);
      }
    }
    expect({ disagreements, first }).toEqual({ disagreements: 0, first: [] });
    for (const kind of PRECEDENCE) expect(counts.get(kind) ?? 0, `kind ${kind} reached`).toBeGreaterThanOrEqual(15);
    expect(counts.get("ok") ?? 0).toBeGreaterThanOrEqual(100);
    console.log(`schema fuzz: ${[...counts].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
  });
});
