import { fieldId, obsId } from "../../lib/contracts/index.js";
import type { Brief, Claim, Entailment, Extent, FieldDecl, FieldId, Observation, Schema } from "../../lib/contracts/index.js";
import { ground } from "../../lib/ground/index.js";
import type { Grounding } from "../../lib/ground/index.js";
import { answer, rule } from "../../lib/entail/index.js";
import { FIELDS, ORDER_DESK_SCHEMA } from "../../domains/order-desk/index.js";

/**
 * Shared builders for the failure suite (plan section 6, M7). Nothing here rules on anything: every ruling in a case comes
 * from `lib/*` called through its `index`, or from `domains/order-desk/index`, and a case asserts what the engine says.
 * A builder that throws is a broken fixture, never a finding.
 */

export { FIELDS, ORDER_DESK_SCHEMA };

/** A typed observation. `source` is a display label the engine never reads. */
export function obs(id: string, field: FieldId, lo: number | null, hi: number | null, quote: string, source = "a document"): Observation {
  return { id: obsId(id), field, extent: { lo, hi }, quote, source };
}

export const claim = (field: FieldId, lo: number | null, hi: number | null): Claim => ({ field, extent: { lo, hi } });

/** A base quantity with the order desk's baseline, `[0, unbounded)`, in days. */
export function baseField(id: string, label = id): FieldDecl {
  return { kind: "base", id: fieldId(id), label, unit: "days", baseline: { lo: 0, hi: null } };
}

/** A derived quantity: the sum of `operands`, in days. */
export function sumField(id: string, operands: readonly [string, string, ...string[]], label = id): FieldDecl {
  const [first, second, ...rest] = operands;
  return { kind: "derived", id: fieldId(id), label, unit: "days", sum: [fieldId(first), fieldId(second), ...rest.map(fieldId)] };
}

export function schemaOf(...fields: [FieldDecl, ...FieldDecl[]]): Schema {
  return { fields };
}

/** `ground` that must accept the schema and every observation. A refusal is a fixture bug. */
export function groundOk(schema: unknown, observations: unknown): Grounding {
  const result = ground(schema, observations);
  if (!result.ok) throw new Error(`fixture: ground refused the schema or the snapshot: ${JSON.stringify(result.failure)}`);
  if (result.rejected.length > 0) throw new Error(`fixture: ground refused observations: ${JSON.stringify(result.rejected)}`);
  return result.grounding;
}

/** `rule` that must give a ruling. */
export function ruleOk(g: Grounding, raw: unknown): Entailment {
  const ruled = rule(g, raw);
  if (!ruled.ok) throw new Error(`fixture: rule refused the claim: ${JSON.stringify(ruled.fault)}`);
  return ruled.entailment;
}

/** `answer` that must give a Brief. */
export function answerOk(g: Grounding, question: unknown, draft: unknown): Brief {
  const made = answer(g, question, draft);
  if (!made.ok) throw new Error(`fixture: answer refused the question or the draft: ${JSON.stringify(made.failure)}`);
  return made.brief;
}

/** A writable deep copy of plain data (the engine's results are frozen). The caller says which type it expects back. */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** `value` is inside `extent` (a `null` side is unbounded). Written here, not taken from the engine. */
export function inside(value: number, extent: Extent): boolean {
  return (extent.lo === null || value >= extent.lo) && (extent.hi === null || value <= extent.hi);
}

/** The maximal runs of ASCII digits in `text`, as strings. */
export function digitTokens(text: string): string[] {
  return text.match(/[0-9]+/g) ?? [];
}

/** A small seeded generator (mulberry32), so a failing instance can be replayed. Returns a function giving floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The four `deliveryDay` ids of the order desk, for brevity. */
export const DELIVERY = FIELDS.deliveryDay;
export const PACK = FIELDS.packDays;
export const TRANSIT = FIELDS.transitDays;
export const CUSTOMS = FIELDS.customsDays;
