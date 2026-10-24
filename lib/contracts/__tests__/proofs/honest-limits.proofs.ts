import type { Brief } from "../../brief.js";
import type { Extent } from "../../bounds.js";
import type { Entailed } from "../../entailment.js";
import { fieldId, obsId, type FieldId } from "../../ids.js";
import type { Observation } from "../../observation.js";
import type { Operands, Schema } from "../../schema.js";
import { CUSTOMS, DELIVERY, ENTAILMENT_SAMPLES, PACK } from "../support/samples.js";

/**
 * HONEST LIMITS: values the types ADMIT but that are not meaningful, each a directive-free line (so the proof
 * harness requires it to compile under both tsconfigs). Each is the type system saying "yes" where a later layer
 * will say "no"; `honest-limits.test.ts` names that layer and the refusal for each, and runs the values.
 * Nothing in M1 refuses any of them, and the types cannot. Three are the plan's (section 6, M1 (d)); the rest
 * are the same shape of limit found while writing the types.
 */

// ---- 1. (plan) Extent admits lo > hi. M3 `checkExtent` is planned to refuse it: `inverted`. ----
export const inverted: Extent = { lo: 5, hi: 1 };
export const invertedNegative: Extent = { lo: 0, hi: -1 };

// ---- 1b. Extent admits what is not an integer or is out of range. M3 `checkExtent`: `bound-not-an-integer`, `bound-out-of-range`. ----
export const fractional: Extent = { lo: 1.5, hi: 2.5 };
export const notANumber: Extent = { lo: Number.NaN, hi: Number.NaN };
export const infinite: Extent = { lo: Number.NEGATIVE_INFINITY, hi: Number.POSITIVE_INFINITY };
export const beyondMagnitude: Extent = { lo: 0, hi: 2 ** 60 };

// ---- 2. (plan) fieldId("anything") admits any string. M4 `readSchema`/`ground` (`malformed`, `unknown-field`) and M5 `readClaim` (`unknown-field`). ----
export const emptyId: FieldId = fieldId("");
export const overlongId: FieldId = fieldId("x".repeat(10_000));
export const protoId: FieldId = fieldId("__proto__");
export const whitespaceId: FieldId = fieldId("  a b\n");

// ---- 3. (plan) Operands admits a repeated field. M4 `readSchema`: `operand-reused`. ----
export const repeated: Operands = [fieldId("a"), fieldId("a")];

// ---- 4. A Schema admits what is not a read-once forest. M4 `readSchema`: `duplicate-field`, `unknown-operand`, `operand-reused`, `rule-cycle`, `unit-mismatch`. ----
const a = fieldId("a");
const b = fieldId("b");
const z = fieldId("z");
export const brokenSchema: Schema = {
  fields: [
    { kind: "base", id: a, label: "a", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "base", id: a, label: "a again", unit: "days", baseline: { lo: 0, hi: null } }, // duplicate id
    { kind: "derived", id: z, label: "z", unit: "hours", sum: [a, fieldId("ghost")] }, // an operand no field declares, and a unit that differs
    { kind: "derived", id: b, label: "b", unit: "days", sum: [b, a] }, // a field that is its own operand: a cycle
  ],
};

// ---- 5. An Observation admits a quote that does not contain its numbers. M4 `ground`: `number-not-in-quote`. ----
export const quoteWithoutDigits: Observation = {
  id: obsId("x1"),
  field: PACK,
  extent: { lo: 7, hi: 9 },
  quote: "Packed and dispatched soon",
  source: "anywhere",
};

// ---- 6. An Entailment admits an `established` that is not inside `tested`, an `unmet` that is not the cut, and a support that certifies nothing. M5 `rule` builds them; M5 `recheck` re-derives them. ----
export const entailedOutsideTested: Entailed = {
  ...ENTAILMENT_SAMPLES.entailed,
  tested: { lo: null, hi: 3 },
  established: { lo: 40, hi: 90 },
  support: { lo: [], hi: [] },
};

// ---- 7. A Brief admits evidence that is not what its supports name, rejected indices out of range, and no schema to check against. M5 `answer` builds it; M5 `recheck` takes the holder's schema. ----
export const incoherentBrief: Brief = {
  answer: ENTAILMENT_SAMPLES.entailed,
  claims: [ENTAILMENT_SAMPLES.weakened, ENTAILMENT_SAMPLES.weakened],
  rejected: [{ index: 99, fault: { kind: "vacuous-claim", field: CUSTOMS } }],
  evidence: [],
};

// Keeps `DELIVERY` read: it is the field the entailed sample rules on.
export const rulesOn: FieldId = DELIVERY;
