import { describe, expect, it } from "vitest";
import { MAX_FIELDS, MAX_MAGNITUDE, fieldId } from "../../contracts/index.js";
import { extentOf, ground, openEndsOf, readSchema, supportOf } from "../index.js";
import { ORDER_DESK, base, derived, genInstance, mulberry32, numbersIn, obs, schemaOf } from "./fixtures.js";
import type { RawField } from "./fixtures.js";

/**
 * INTEGER-ONLY (plan section 6, M4: "every number in every produced structure is an integer"; M1: the absence of a
 * scalar such as a confidence is shown by behaviour, "every number in every `Entailment` is an integer", not by
 * scanning names). The structures this layer produces are the grounding, the refused observations, the failures,
 * and what `extentOf`, `supportOf` and `openEndsOf` return. Every number in every one of them, on 3000 generated
 * instances and at the largest magnitude the contracts allow, is a safe integer, finite, and never negative zero
 * (`Object.is(x, -0)` is false: an input `-0` leaves as `0`).
 *
 * What it does not show: that no later layer adds a fraction. That is M5's `Entailment`, with its own check.
 */

const bad = (value: unknown): string[] => numbersIn(value).filter((n) => !Number.isSafeInteger(n.value) || Object.is(n.value, -0)).map((n) => `${n.path} = ${String(n.value)}`);

const CHUNKS = 24;
const PER_CHUNK = 125;
const seen = { structures: 0, numbers: 0 };

describe("every number in every structure walked here is a safe integer, and none is -0", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: the grounding, the refusals, extentOf, supportOf and openEndsOf of every field`, () => {
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const inst = genInstance(mulberry32(seed));
        const r = ground(inst.schema, inst.observations);
        const outputs: unknown[] = [r];
        if (r.ok) {
          for (const entry of r.grounding.baseline) {
            const f = fieldId(entry.field);
            outputs.push(extentOf(r.grounding, f), supportOf(r.grounding, f), openEndsOf(r.grounding, f, ["lo", "hi"]));
          }
        }
        for (const out of outputs) {
          seen.structures += 1;
          seen.numbers += numbersIn(out).length;
          expect(bad(out), `seed ${seed}`).toEqual([]);
        }
      }
    });
  }

  it("enough structures and numbers were walked (needs every chunk above to have run)", () => {
    console.log(`integer-only: ${seen.structures} structures, ${seen.numbers} numbers, every one a safe integer and none -0`);
    expect(seen.structures, "all chunks ran: do not filter this file with -t").toBeGreaterThanOrEqual(10000);
    expect(seen.numbers).toBeGreaterThanOrEqual(30000);
  });

  it("the counts in a failure are integers too: too-many-fields, too-many-observations, and a repeated -0 in an input", () => {
    expect(bad(readSchema({ fields: Array.from({ length: MAX_FIELDS + 1 }, (_, i) => base(`b${i}`)) }))).toEqual([]);
    expect(bad(ground(ORDER_DESK, Array.from({ length: 65 }, (_, i) => obs(`o${i}`, "packDays", 0, 1))))).toEqual([]);
    const r = ground(ORDER_DESK, [{ id: "z", field: "packDays", extent: { lo: -0, hi: -0 }, quote: "0 days", source: "s" }]);
    if (!r.ok) throw new Error("failed");
    const e = extentOf(r.grounding, fieldId("packDays"));
    expect(e).toMatchObject({ ok: true, extent: { lo: 0, hi: 0 } });
    expect(bad(r)).toEqual([]);
    expect(Object.is(r.grounding.observations[0]!.extent.lo, -0)).toBe(false);
    const baseline = readSchema(schemaOf(base("a", -0, -0)));
    expect(baseline.ok && Object.is(baseline.schema.fields[0] && (baseline.schema.fields[0] as { baseline: { lo: number } }).baseline.lo, -0)).toBe(false);
  });
});

describe("at the largest magnitude the contracts allow, sums are exact", () => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const derivedIds = Array.from({ length: 32 }, (_, k) => `d${pad(k)}`);
  const fields: RawField[] = [...Array.from({ length: 32 }, (_, i) => base(`b${pad(i)}`, -MAX_MAGNITUDE, MAX_MAGNITUDE)), base("spare")];
  for (let k = 1; k <= 31; k++) fields.push(derived(derivedIds[k] as string, [k === 1 ? "b00" : (derivedIds[k - 1] as string), `b${pad(k)}`]));
  const schema = schemaOf(...fields);
  const quote = (v: number): string => `exactly ${Math.abs(v)} units`;

  it("32 base fields at +MAX_MAGNITUDE and the root observed far above: each running sum equals the BigInt sum", () => {
    // the base fields are observed at exactly MAX_MAGNITUDE; the running sum D_k is (k + 1) * MAX_MAGNITUDE, well past 2**40
    const list = Array.from({ length: 32 }, (_, i) => ({ id: `ob${pad(i)}`, field: `b${pad(i)}`, extent: { lo: MAX_MAGNITUDE, hi: MAX_MAGNITUDE }, quote: quote(MAX_MAGNITUDE), source: "s" }));
    const r = ground(schema, list);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    expect(r.rejected).toEqual([]);
    for (let k = 1; k <= 31; k++) {
      const e = extentOf(r.grounding, fieldId(derivedIds[k] as string));
      const exact = BigInt(k + 1) * BigInt(MAX_MAGNITUDE);
      expect(e.ok && BigInt(e.extent.lo as number), `D${k} lo`).toBe(exact);
      expect(e.ok && BigInt(e.extent.hi as number), `D${k} hi`).toBe(exact);
    }
    // the largest value anywhere is 32 * 2**40 = 2**45, below 2**46 = MAX_MAGNITUDE * MAX_FIELDS and far below 2**53
    const e = extentOf(r.grounding, fieldId(derivedIds[31] as string));
    expect(e.ok && e.extent.hi).toBe(2 ** 45);
    expect(2 ** 45).toBeLessThan(MAX_MAGNITUDE * MAX_FIELDS);
    expect(bad(r)).toEqual([]);
  });

  it("and at -MAX_MAGNITUDE on every base field, with a loose observation that is not refused", () => {
    const list = Array.from({ length: 32 }, (_, i) => ({ id: `ob${pad(i)}`, field: `b${pad(i)}`, extent: { lo: -MAX_MAGNITUDE, hi: -MAX_MAGNITUDE }, quote: quote(-MAX_MAGNITUDE), source: "s" }));
    const r = ground(schema, list);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const e = extentOf(r.grounding, fieldId(derivedIds[31] as string));
    expect(e.ok && BigInt(e.extent.lo as number)).toBe(-32n * BigInt(MAX_MAGNITUDE));
    expect(bad(r)).toEqual([]);
  });
});
