import { describe, expect, it } from "vitest";
import { MAX_ID_LENGTH, MAX_MAGNITUDE } from "../../contracts/index.js";
import type { ClaimFault, Extent } from "../../contracts/index.js";
import { oracleBaselines } from "../../ground/__tests__/oracle.js";
import { oracleIsSubset } from "../../extent/__tests__/fixtures.js";
import { readClaim } from "../index.js";
import { DESK, FIRST_VALUES, LATER_VALUES, base, chance, counted, defineCounted, derived, genInstance, groundOf, int, jsonCopy, logged, mulberry32, nonPlainPaths, obs, oracleFields, pick, refExtent, schemaOf, unfrozenPaths } from "./fixtures.js";

/**
 * CLAIM FAULTS AND READ-ONCE INTAKE for `readClaim` (plan section 6, M5: "reads the claim once, validates the extent
 * with `checkExtent`, requires a known field and rejects a vacuous claim"; section 4.1: malformed > unknown-field >
 * vacuous-claim).
 *
 *  1. A TABLE, masking-aware: every fault row breaks only its own rule, and its repair is accepted whole, so a second,
 *     masked defect would still be refused. Rows are checked against a reference written for this file (a different
 *     method from the engine's: `refExtent` is ground's reference extent check, the baseline comes from the
 *     brute-force oracle, set inclusion from M3's listing oracle), not against the engine.
 *  2. THE PRECEDENCE, one row per pair.
 *  3. A DIFFERENTIAL FUZZ: generated and corrupted claims against the reference, with the tally of what was reached.
 *  4. READ-ONCE: first values from 25 classes at each of the four places the engine reads, each followed by a hostile
 *     later value or a throw, with the reads counted and the result compared with a plain input holding the first value
 *     alone; a Proxy trap log for the exact reads; a revoked Proxy; a throw that carries a secret.
 *  5. THE OUTPUT: fresh, deeply frozen, and independent of the input afterwards.
 */

const g = groundOf(DESK, []);
const GOOD = { field: "packDays", extent: { lo: 1, hi: 3 } };
const fault = (raw: unknown, grounding = g): ClaimFault => {
  const read = readClaim(grounding, raw);
  if (read.ok) throw new Error(`expected a fault, got ${JSON.stringify(read.claim)}`);
  return read.fault;
};

/** The reference: what the plan's precedence says about a raw claim, by independent means. */
function reference(raw: unknown, fields: ReturnType<typeof oracleFields>, schemaIds: readonly string[]): { kind: "ok" } | { kind: "malformed"; fields: string[] } | { kind: "unknown-field" } | { kind: "vacuous-claim" } {
  const record = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as { field?: unknown; extent?: unknown }) : undefined;
  const fieldOk = record !== undefined && typeof record.field === "string" && record.field.length >= 1 && record.field.length <= MAX_ID_LENGTH;
  const extent = record === undefined ? undefined : refExtent(record.extent);
  const bad = [...(extent === undefined ? ["extent"] : []), ...(fieldOk ? [] : ["field"])];
  if (bad.length > 0) return { kind: "malformed", fields: bad };
  if (!schemaIds.includes((record as { field: string }).field)) return { kind: "unknown-field" };
  const b = oracleBaselines(fields).get((record as { field: string }).field) as Extent;
  return oracleIsSubset(b, extent as Extent) ? { kind: "vacuous-claim" } : { kind: "ok" };
}

describe("every fault row breaks only its own rule, and its repair is accepted", () => {
  interface Row {
    readonly name: string;
    readonly broken: unknown;
    readonly repaired: unknown;
    readonly expect: unknown;
  }
  const malformedExtent = (extent: unknown, name: string): Row => ({ name: `extent: ${name}`, broken: { field: "packDays", extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["extent"] } });
  const rows: readonly Row[] = [
    { name: "field: not a string (a number)", broken: { field: 7, extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    { name: "field: null", broken: { field: null, extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    { name: "field: missing", broken: { extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    { name: "field: the empty string", broken: { field: "", extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    { name: "field: a boxed String", broken: { field: new String("packDays"), extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    { name: `field: ${MAX_ID_LENGTH + 1} code units`, broken: { field: "x".repeat(MAX_ID_LENGTH + 1), extent: GOOD.extent }, repaired: GOOD, expect: { kind: "malformed", fields: ["field"] } },
    malformedExtent(null, "null"),
    malformedExtent(undefined, "missing"),
    malformedExtent(7, "a number"),
    malformedExtent("1..3", "a string"),
    malformedExtent([1, 3], "an array"),
    malformedExtent({ lo: 1.5, hi: 3 }, "a fractional bound"),
    malformedExtent({ lo: Number.NaN, hi: 3 }, "NaN"),
    malformedExtent({ lo: 1, hi: Number.POSITIVE_INFINITY }, "Infinity"),
    malformedExtent({ lo: 1 }, "a missing side"),
    malformedExtent({ lo: MAX_MAGNITUDE + 1, hi: null }, "past MAX_MAGNITUDE"),
    malformedExtent({ lo: 5, hi: 3 }, "inverted"),
    { name: "unknown field", broken: { field: "ghost", extent: GOOD.extent }, repaired: GOOD, expect: { kind: "unknown-field", field: "ghost" } },
    { name: "unknown field: a prototype name", broken: { field: "toString", extent: GOOD.extent }, repaired: GOOD, expect: { kind: "unknown-field", field: "toString" } },
    { name: "unknown field: case matters", broken: { field: "packdays", extent: GOOD.extent }, repaired: GOOD, expect: { kind: "unknown-field", field: "packdays" } },
    { name: "vacuous: unbounded", broken: { field: "packDays", extent: { lo: null, hi: null } }, repaired: GOOD, expect: { kind: "vacuous-claim", field: "packDays" } },
    { name: "vacuous: at least the floor", broken: { field: "packDays", extent: { lo: 0, hi: null } }, repaired: { field: "packDays", extent: { lo: 1, hi: null } }, expect: { kind: "vacuous-claim", field: "packDays" } },
    { name: "vacuous: below the floor", broken: { field: "customsDays", extent: { lo: -4, hi: null } }, repaired: { field: "customsDays", extent: { lo: 1, hi: null } }, expect: { kind: "vacuous-claim", field: "customsDays" } },
    { name: "vacuous: a derived field, whose baseline is computed", broken: { field: "deliveryDay", extent: { lo: 0, hi: null } }, repaired: { field: "deliveryDay", extent: { lo: 1, hi: null } }, expect: { kind: "vacuous-claim", field: "deliveryDay" } },
  ];
  const fields = oracleFields(DESK);
  const ids = DESK.fields.map((f) => f.id);

  for (const row of rows) {
    it(`${row.name}`, () => {
      expect(readClaim(g, row.broken)).toStrictEqual({ ok: false, fault: row.expect });
      const ref = reference(row.broken, fields, ids);
      expect(ref.kind, "the reference sees the same rule and no other").toBe((row.expect as { kind: string }).kind);
      const repaired = readClaim(g, row.repaired);
      expect(repaired.ok, "the repair is accepted whole, so a second defect would still have been refused").toBe(true);
      expect(reference(row.repaired, fields, ids).kind).toBe("ok");
    });
  }

  it("values that are not records are malformed in both places: null, a number, a string, an array, a function, a symbol", () => {
    for (const raw of [null, undefined, 7, "claim", [GOOD], () => GOOD, Symbol("c"), true, 1n]) {
      expect(readClaim(g, raw), String(typeof raw)).toStrictEqual({ ok: false, fault: { kind: "malformed", fields: ["extent", "field"] } });
    }
  });

  it("when both places are wrong both are named, in code-unit order", () => {
    expect(fault({ field: 5, extent: null })).toStrictEqual({ kind: "malformed", fields: ["extent", "field"] });
    expect(fault({})).toStrictEqual({ kind: "malformed", fields: ["extent", "field"] });
  });
});

describe("the id length limit counts UTF-16 code units, and N is accepted where N + 1 is refused", () => {
  const long = "f".repeat(MAX_ID_LENGTH);
  const gl = groundOf(schemaOf({ ...base(long), label: "long" }, base("short")), []);
  it("a field of exactly MAX_ID_LENGTH code units is a claim about it; one more is malformed", () => {
    expect(readClaim(gl, { field: long, extent: { lo: 1, hi: 2 } }).ok).toBe(true);
    expect(fault({ field: `${long}f`, extent: { lo: 1, hi: 2 } }, gl)).toStrictEqual({ kind: "malformed", fields: ["field"] });
  });
  it("an astral character is two code units: half the limit of them is accepted as text, one more is malformed", () => {
    const astral = "\u{1F600}".repeat(MAX_ID_LENGTH / 2);
    expect(astral.length).toBe(MAX_ID_LENGTH);
    expect(fault({ field: astral, extent: { lo: 1, hi: 2 } }, gl)).toStrictEqual({ kind: "unknown-field", field: astral });
    expect(fault({ field: `${astral}\u{1F600}`, extent: { lo: 1, hi: 2 } }, gl)).toStrictEqual({ kind: "malformed", fields: ["field"] });
  });
  it("a schema that declares __proto__ and constructor as fields can be claimed about: ids are looked up by equality, not by property", () => {
    const gp = groundOf(schemaOf({ ...base("__proto__"), label: "proto" }, { ...base("constructor"), label: "ctor" }), []);
    for (const field of ["__proto__", "constructor"]) expect(readClaim(gp, { field, extent: { lo: 1, hi: 1 } }).ok, field).toBe(true);
    expect(fault({ field: "hasOwnProperty", extent: { lo: 1, hi: 1 } }, gp)).toStrictEqual({ kind: "unknown-field", field: "hasOwnProperty" });
  });
});

describe("the precedence malformed > unknown-field > vacuous-claim, one row per pair", () => {
  it("malformed outranks unknown-field: an unknown field with a bad extent is malformed (extent), not unknown", () => {
    expect(fault({ field: "ghost", extent: { lo: 9, hi: 1 } })).toStrictEqual({ kind: "malformed", fields: ["extent"] });
  });
  it("malformed outranks vacuous-claim: a bad field is malformed even if the extent would be vacuous", () => {
    expect(fault({ field: 3, extent: { lo: null, hi: null } })).toStrictEqual({ kind: "malformed", fields: ["field"] });
  });
  it("unknown-field outranks vacuous-claim: an unknown field with an unbounded extent is unknown, because vacuity cannot be judged", () => {
    expect(fault({ field: "ghost", extent: { lo: null, hi: null } })).toStrictEqual({ kind: "unknown-field", field: "ghost" });
  });
  it("vacuity is judged for a field in a conflicted tree too, so a vacuous claim never reaches a ruling", () => {
    const conflicted = groundOf(DESK, [obs("a", "packDays", 5, 5), obs("b", "packDays", 0, 3)]);
    expect(fault({ field: "packDays", extent: { lo: null, hi: null } }, conflicted)).toStrictEqual({ kind: "vacuous-claim", field: "packDays" });
    expect(readClaim(conflicted, { field: "packDays", extent: { lo: 1, hi: 3 } }).ok, "a claim that rules something out is read, and ruled `conflicted` later").toBe(true);
  });
  it("a claim is vacuous against the SCHEMA-ONLY extent, not the evidence: evidence that moves the field does not make it vacuous", () => {
    const moved = groundOf(DESK, [obs("a", "packDays", 1, 2)]);
    expect(readClaim(moved, { field: "packDays", extent: { lo: 1, hi: null } }).ok).toBe(true);
    expect(fault({ field: "packDays", extent: { lo: 0, hi: null } }, moved)).toStrictEqual({ kind: "vacuous-claim", field: "packDays" });
  });
});

describe("a differential fuzz of generated and corrupted claims against the reference", () => {
  const tally = { claims: 0, ok: 0, malformedField: 0, malformedExtent: 0, malformedBoth: 0, unknown: 0, vacuous: 0 };
  const CHUNKS = 20;
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    it(`seeds ${chunk * 50 + 1} to ${chunk * 50 + 50}`, () => {
      const problems: string[] = [];
      for (let seed = chunk * 50 + 1; seed < chunk * 50 + 51; seed++) {
        const rng = mulberry32(seed);
        const inst = genInstance(rng);
        const grounded = groundOf(inst.schema, inst.observations);
        const fields = oracleFields(inst.schema);
        const ids = inst.schema.fields.map((f) => f.id);
        for (let i = 0; i < 12; i++) {
          const field: unknown = chance(rng, 0.08) ? pick(rng, ["ghost", "", 5, null]) : pick(rng, ids);
          const lo = chance(rng, 0.3) ? null : int(rng, -3, 8);
          const hi = chance(rng, 0.3) ? null : int(rng, -3, 8);
          let extent: unknown = { lo, hi };
          if (chance(rng, 0.1)) extent = pick(rng, [null, 4, "x", [1], { lo: 1.5, hi: 2 }, { lo: 4, hi: 1 }, { lo: MAX_MAGNITUDE * 2, hi: null }]);
          const raw = { field, extent };
          const want = reference(raw, fields, ids);
          const read = readClaim(grounded, raw);
          tally.claims += 1;
          const got = read.ok ? { kind: "ok" } : read.fault;
          if (got.kind !== want.kind) problems.push(`seed ${seed}: ${JSON.stringify(raw)} is ${got.kind}, the reference says ${want.kind}`);
          else if (want.kind === "malformed" && JSON.stringify((got as { fields?: unknown }).fields) !== JSON.stringify(want.fields)) problems.push(`seed ${seed}: malformed places differ for ${JSON.stringify(raw)}`);
          if (want.kind === "ok") tally.ok += 1;
          else if (want.kind === "unknown-field") tally.unknown += 1;
          else if (want.kind === "vacuous-claim") tally.vacuous += 1;
          else if (want.fields.length === 2) tally.malformedBoth += 1;
          else if (want.fields[0] === "field") tally.malformedField += 1;
          else tally.malformedExtent += 1;
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} problems, the first five:\n${problems.slice(0, 5).join("\n")}`);
    });
  }
  it("the fuzz reached every verdict (needs every chunk above to have run)", () => {
    expect(tally.claims, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * 50 * 12);
    console.log(`readClaim fuzz: ${tally.claims} claims: ok ${tally.ok}, malformed field ${tally.malformedField}, malformed extent ${tally.malformedExtent}, malformed both ${tally.malformedBoth}, unknown-field ${tally.unknown}, vacuous-claim ${tally.vacuous}`);
    for (const [name, n] of Object.entries({ ok: tally.ok, field: tally.malformedField, extent: tally.malformedExtent, both: tally.malformedBoth, unknown: tally.unknown, vacuous: tally.vacuous })) expect(n, name).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Read-once.
// ---------------------------------------------------------------------------------------------------------

const THROW = Symbol.for("throw");

describe("every value the engine reads is read once: 25 first values at 4 places, each against 8 hostile later reads", () => {
  type Place = "field" | "extent" | "extent.lo" | "extent.hi";
  const PLACES: readonly Place[] = ["field", "extent", "extent.lo", "extent.hi"];

  /** The claim with `place` set to `value` (plain, or an accessor made from `probe`). */
  function build(place: Place, set: (target: object, key: string) => void): Record<string, unknown> {
    const extent: Record<string, unknown> = { lo: 1, hi: 3 };
    const claim: Record<string, unknown> = { field: "packDays", extent };
    if (place === "field") set(claim, "field");
    else if (place === "extent") set(claim, "extent");
    else set(extent, place === "extent.lo" ? "lo" : "hi");
    return claim;
  }
  const plain = (place: Place, value: unknown): Record<string, unknown> => build(place, (target, key) => void Object.defineProperty(target, key, { value, enumerable: true, writable: true }));

  const reads = { cases: 0, firsts: new Set<string>() };

  for (const place of PLACES) {
    for (const [name, first] of FIRST_VALUES) {
      it(`${place}: first read ${name}, then any hostile read, is read once and equals a plain input holding the first value`, () => {
        const want = readClaim(g, plain(place, first));
        for (const [laterName, later] of LATER_VALUES) {
          const probe = counted(first, later);
          const got = readClaim(g, build(place, (target, key) => defineCounted(target, key, probe)));
          expect(probe.reads(), `${place} read count (later: ${laterName})`).toBe(1);
          expect(got, `later: ${laterName}`).toStrictEqual(want);
          reads.cases += 1;
        }
        reads.firsts.add(`${place}/${name}`);
      });
    }

    it(`${place}: a first read that throws is hostile-input, in this package's words, and the later reads never happen`, () => {
      for (const later of [1, "x", null]) {
        const probe = counted(THROW, later);
        const got = readClaim(g, build(place, (target, key) => defineCounted(target, key, probe)));
        expect(probe.reads()).toBe(1);
        expect(got).toStrictEqual({
          ok: false,
          fault: { kind: "hostile-input", message: place === "field" ? "reading claim.field threw" : place === "extent" ? "reading claim.extent threw" : "reading the extent of the claim threw" },
        });
      }
    });
  }

  it("the table ran at every place with every first value (needs every case above to have run)", () => {
    expect(reads.firsts.size, "all cases ran: do not filter this file with -t").toBe(PLACES.length * FIRST_VALUES.length);
    expect(reads.cases).toBe(PLACES.length * FIRST_VALUES.length * LATER_VALUES.length);
    console.log(`readClaim read-once: ${reads.cases} (place, first value, later value) cases, each reading its place exactly once`);
  });

  it("all four places at once: each is read once, in the order field, extent, lo, hi, and nothing else is read", () => {
    const order: string[] = [];
    const extent = {};
    for (const key of ["lo", "hi"]) Object.defineProperty(extent, key, { enumerable: true, get: () => (order.push(key), key === "lo" ? 1 : 3) });
    const claim = {};
    Object.defineProperty(claim, "field", { enumerable: true, get: () => (order.push("field"), "packDays") });
    Object.defineProperty(claim, "extent", { enumerable: true, get: () => (order.push("extent"), extent) });
    Object.defineProperty(claim, "extra", { enumerable: true, get: () => (order.push("extra"), (() => { throw new Error("never read"); })()) });
    expect(readClaim(g, claim).ok).toBe(true);
    expect(order).toEqual(["field", "extent", "lo", "hi"]);
  });

  it("a Proxy over the claim sees exactly two gets (field, extent) and no has, ownKeys, descriptor or prototype trap; one over the extent sees exactly lo and hi", () => {
    const log: string[] = [];
    const proxyExtent = logged({ lo: 1, hi: 3 }, log);
    const proxy = logged({ field: "packDays", extent: proxyExtent }, log);
    expect(readClaim(g, proxy).ok).toBe(true);
    expect(log).toEqual(["get:field", "get:extent", "get:lo", "get:hi"]);
  });

  it("a revoked Proxy as the claim, or as the extent, is hostile-input, not a throw", () => {
    const dead = Proxy.revocable({}, {});
    dead.revoke();
    expect(readClaim(g, dead.proxy)).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading the claim threw" } });
    const deadExtent = Proxy.revocable({}, {});
    deadExtent.revoke();
    expect(readClaim(g, { field: "packDays", extent: deadExtent.proxy })).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading the extent of the claim threw" } });
  });

  it("a read that throws never leaks what it threw: the message is this package's own words", () => {
    for (const thrown of [new Error("SECRET-TOKEN-1"), "SECRET-TOKEN-2", { secret: "SECRET-TOKEN-3" }, Symbol("SECRET-TOKEN-4"), null, undefined]) {
      const claim = {};
      Object.defineProperty(claim, "field", { enumerable: true, get: () => { throw thrown; } });
      const read = readClaim(g, claim);
      expect(JSON.stringify(read)).not.toContain("SECRET");
      expect(read).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading claim.field threw" } });
    }
  });

  it("an extra property is neither read nor copied, even one whose getter throws", () => {
    const claim: Record<string, unknown> = { field: "packDays", extent: { lo: 1, hi: 3 } };
    Object.defineProperty(claim, "boom", { enumerable: true, get: () => { throw new Error("never read"); } });
    const read = readClaim(g, claim);
    expect(read).toStrictEqual({ ok: true, claim: { field: "packDays", extent: { lo: 1, hi: 3 } } });
  });

  it("a hostile read outranks malformed: a bad field and an extent whose lo getter throws is hostile-input, and the same input always gives the same answer", () => {
    const extent = {};
    Object.defineProperty(extent, "lo", { enumerable: true, get: () => { throw new Error("x"); } });
    const results = [1, 2, 3].map(() => readClaim(g, { field: 5, extent }));
    for (const r of results) expect(r).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading the extent of the claim threw" } });
  });
});

describe("the output: a fresh, deeply frozen claim that shares nothing with the input", () => {
  it("is frozen at every node, plain data, and not the input's extent object", () => {
    const input = { field: "packDays", extent: { lo: 1, hi: 3 } };
    const read = readClaim(g, input);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(unfrozenPaths(read)).toEqual([]);
    expect(nonPlainPaths(read)).toEqual([]);
    expect(read.claim).not.toBe(input);
    expect(read.claim.extent).not.toBe(input.extent);
    input.extent.lo = 99;
    input.field = "transitDays";
    expect(read.claim).toStrictEqual({ field: "packDays", extent: { lo: 1, hi: 3 } });
  });

  it("a refusal is frozen too: malformed.fields, and the whole result", () => {
    for (const raw of [{ field: 1, extent: 2 }, { field: "ghost", extent: { lo: 1, hi: 2 } }, { field: "packDays", extent: { lo: null, hi: null } }, null]) {
      const read = readClaim(g, raw);
      expect(unfrozenPaths(read), JSON.stringify(raw)).toEqual([]);
    }
  });

  it("-0 is read as 0, so two claims that are equal compare equal", () => {
    const read = readClaim(g, { field: "packDays", extent: { lo: -0, hi: 3 } });
    expect(read.ok && Object.is(read.claim.extent.lo, 0)).toBe(true);
  });

  it("a claim read twice gives equal claims that are different objects, whatever came in between", () => {
    const input = jsonCopy({ field: "deliveryDay", extent: { lo: 4, hi: null } });
    const first = readClaim(g, input);
    readClaim(g, { field: "packDays", extent: { lo: 1, hi: 1 } });
    const second = readClaim(g, input);
    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
  });
});

describe("derived fields can be claimed about, and the schema's own unit and order do not matter to reading", () => {
  it("a claim about a derived field whose operands are observed is read", () => {
    const grounded = groundOf(schemaOf(base("a"), base("b"), derived("sum", ["a", "b"])), [obs("o", "a", 1, 2)]);
    expect(readClaim(grounded, { field: "sum", extent: { lo: 5, hi: null } })).toStrictEqual({ ok: true, claim: { field: "sum", extent: { lo: 5, hi: null } } });
  });
});
