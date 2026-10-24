import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertEntailmentWellFormed } from "../integrity.js";
import { MAX_ID_LENGTH, MAX_MAGNITUDE } from "../limits.js";
import {
  beyondMagnitude,
  brokenSchema,
  emptyId,
  entailedOutsideTested,
  fractional,
  incoherentBrief,
  infinite,
  inverted,
  invertedNegative,
  notANumber,
  overlongId,
  protoId,
  quoteWithoutDigits,
  repeated,
  whitespaceId,
} from "./proofs/honest-limits.proofs.js";

/**
 * HONEST LIMIT TESTS (`.genesis/PLAN.md` section 6, M1 (d)). Each pins a value the M1 types ADMIT but that is not
 * meaningful, shows M1 does nothing about it, and names the later refusal the PLAN assigns to close it. They are
 * disclosures, not regression guards: they say what is true of M1 today, and stay true after M3-M5 land (those
 * layers refuse the value at THEIR boundary; the type and the mint functions here do not change).
 *
 * The three the plan names:
 *   Extent admits lo > hi            -> closed by M3 `checkExtent`, reason `inverted`
 *   fieldId("anything") admits any   -> closed by M4 `readSchema`/`ground` (`malformed`, `unknown-field`) and
 *                                       M5 `readClaim` (`unknown-field`)
 *   Operands admits a repeated field -> closed by M4 `readSchema`, `operand-reused`
 * None of M3-M5 is built when this is written, so "closed by" is the PLAN'S assignment, not a thing this
 * repository does yet. Every refusal name below is also checked to exist in the plan's own vocabulary.
 *
 * The compile half (that each value really is accepted by the type, under both tsconfigs) is the directive-free
 * lines of `proofs/honest-limits.proofs.ts`; this file runs them.
 */
const PLAN = readFileSync(join(import.meta.dirname, "..", "..", "..", ".genesis", "PLAN.md"), "utf8");

describe("the closing refusals named below are the plan's own, not invented here", () => {
  for (const token of [
    '"inverted"',
    '"bound-not-an-integer"',
    '"bound-out-of-range"',
    "operand-reused",
    "unknown-operand",
    "duplicate-field",
    "rule-cycle",
    "unit-mismatch",
    "number-not-in-quote",
    "unknown-field",
    "malformed",
    "vacuous-claim",
  ]) {
    it(`PLAN.md mentions ${token}`, () => {
      expect(PLAN).toContain(token);
    });
  }

  it("and assigns each to the layer this file says: checkExtent to M3, readSchema and ground to M4, readClaim to M5 (the plan's function-ownership table)", () => {
    expect(PLAN).toMatch(/^\| M3 \| .*`checkExtent`/m);
    expect(PLAN).toMatch(/^\| M4 \| .*`readSchema`/m);
    expect(PLAN).toMatch(/^\| M4 \| .*`ground`/m);
    expect(PLAN).toMatch(/^\| M5 \| .*`readClaim`/m);
  });
});

describe("HONEST LIMIT 1 (plan): Extent admits lo > hi; closed by M3 `checkExtent` (`inverted`)", () => {
  it("an inverted extent compiles and is an ordinary object", () => {
    expect(inverted).toEqual({ lo: 5, hi: 1 });
    expect(invertedNegative).toEqual({ lo: 0, hi: -1 });
    expect((inverted.lo as number) > (inverted.hi as number)).toBe(true);
  });

  it("and nothing in M1 refuses it: an `entailed` carrying it as `established` is well formed", () => {
    expect(assertEntailmentWellFormed({ ...entailedOutsideTested, established: inverted })).toEqual({ ok: true });
  });

  it("likewise a non-integer, NaN, an infinity and a magnitude past MAX_MAGNITUDE (M3 `checkExtent`: `bound-not-an-integer`, `bound-out-of-range`)", () => {
    expect(fractional).toEqual({ lo: 1.5, hi: 2.5 });
    expect(Number.isNaN(notANumber.lo)).toBe(true);
    expect(infinite.lo).toBe(Number.NEGATIVE_INFINITY);
    expect(infinite.hi).toBe(Number.POSITIVE_INFINITY);
    expect(beyondMagnitude.hi as number).toBeGreaterThan(MAX_MAGNITUDE);
    for (const extent of [fractional, notANumber, infinite, beyondMagnitude]) {
      expect(assertEntailmentWellFormed({ ...entailedOutsideTested, established: extent })).toEqual({ ok: true });
    }
  });
});

describe('HONEST LIMIT 2 (plan): fieldId("anything") admits any string; closed by M4 `readSchema`/`ground` and M5 `readClaim`', () => {
  it("returns every string unchanged: empty, overlong, a prototype name, whitespace", () => {
    expect(emptyId).toBe("");
    expect(overlongId).toHaveLength(10_000);
    expect(overlongId.length).toBeGreaterThan(MAX_ID_LENGTH);
    expect(protoId).toBe("__proto__");
    expect(whitespaceId).toBe("  a b\n");
  });

  it("and the plan does not say which layer enforces MAX_ID_LENGTH: this limit is stated, not assigned beyond 'M4/M5 intake'", () => {
    // `MAX_ID_LENGTH` is pinned by limits.test.ts; nothing here compares an id against it.
    expect(MAX_ID_LENGTH).toBe(128);
  });
});

describe("HONEST LIMIT 3 (plan): Operands admits a repeated field; closed by M4 `readSchema` (`operand-reused`)", () => {
  it("[a, a] compiles", () => {
    expect(repeated).toEqual(["a", "a"]);
    expect(repeated[0]).toBe(repeated[1]);
  });
});

describe("the same shape of limit, found while writing the types (each names its closer)", () => {
  it("a Schema admits a duplicate id, an unknown operand, a cross-unit sum and a cycle: M4 `readSchema` (`duplicate-field`, `unknown-operand`, `unit-mismatch`, `rule-cycle`)", () => {
    const ids = brokenSchema.fields.map((f) => f.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
    const derived = brokenSchema.fields.filter((f) => f.kind === "derived");
    expect(derived).toHaveLength(2);
    const selfReferential = derived.some((f) => f.sum.includes(f.id));
    expect(selfReferential).toBe(true);
  });

  it("an Observation admits a quote that does not contain its numbers: M4 `ground` (`number-not-in-quote`)", () => {
    expect(quoteWithoutDigits.extent).toEqual({ lo: 7, hi: 9 });
    expect(/\d/.test(quoteWithoutDigits.quote)).toBe(false);
  });

  it("an Entailment admits an `entailed` whose established extent is not inside tested, with no support: well formed to M1's guard, wrong to M5", () => {
    expect(entailedOutsideTested.kind).toBe("entailed");
    expect(assertEntailmentWellFormed(entailedOutsideTested)).toEqual({ ok: true });
  });

  it("a Brief admits claims and evidence that do not agree, a rejected index out of range, and carries no schema (by design: the holder supplies it to recheck)", () => {
    expect(incoherentBrief.evidence).toEqual([]);
    expect(incoherentBrief.claims).toHaveLength(2);
    expect(incoherentBrief.rejected[0]?.index).toBe(99);
    expect("schema" in incoherentBrief).toBe(false);
  });
});
