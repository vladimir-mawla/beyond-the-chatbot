import {
  MAX_ID_LENGTH,
  MAX_MAGNITUDE,
  MAX_OBSERVATIONS,
  MAX_QUOTE_LENGTH,
  MAX_SOURCE_LENGTH,
  compareIds,
  fieldId,
  obsId,
} from "../contracts/index.js";
import type { Extent, Observation, ObservationFault, RejectedObservation } from "../contracts/index.js";
import { checkExtent, meet } from "../extent/index.js";
import { isCount, isRecord, isText, nonEmpty } from "./plain.js";

/** Why the observations as a whole could not be taken in. Both are `GroundFailure` variants, repeated so this file needs nothing from `ground.ts`. */
export type ObservationsFailure =
  | { readonly kind: "too-many-observations"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };

export type ObservationsRead =
  | { readonly ok: true; readonly accepted: readonly Observation[]; readonly rejected: readonly RejectedObservation[] }
  | { readonly ok: false; readonly failure: ObservationsFailure };

/** What was read from one element, before any of it is judged. */
type Slot =
  | { readonly kind: "hostile"; readonly message: string }
  | { readonly kind: "not-a-record" }
  | {
      readonly kind: "read";
      readonly id: unknown;
      readonly field: unknown;
      readonly extent: unknown;
      readonly quote: unknown;
      readonly source: unknown;
    };

/**
 * Take in the untrusted observations: every one is read once, judged, and either copied (`accepted`, sorted by
 * id) or refused with its position and the first rule it breaks (`rejected`, in input order). `baseline` is the
 * schema-only extent `B` of every field, so its keys are also the set of known fields.
 *
 * WHAT IS REFUSED BEFORE ANY ELEMENT IS READ, as a failure of the whole call, since there is no per-observation
 * place to put it: a value that is not an array, or whose length is unusable, is `hostile-input`; more than
 * `MAX_OBSERVATIONS` is `too-many-observations`, decided from the length alone (the elements are not read).
 *
 * EACH ELEMENT IS READ ONCE: the element itself, then `id`, `field`, `extent`, `quote`, `source`, in that order,
 * all five whatever their values; then `checkExtent` reads the extent's `lo` and `hi` once each, for every
 * observation whose element could be read and that is not a duplicate (a duplicate is refused before its extent
 * is looked at). Everything is judged from those single reads. A read that throws makes THAT observation `hostile-input` (the others are
 * unaffected) and its later properties are not read.
 *
 * THE RULES, per observation, first failing one wins, the plan's precedence:
 *  1. `duplicate-id`: its id (a valid-looking one) occurs on another observation. EVERY occurrence is refused,
 *     not "all but the first", because keeping one would let the order of the input choose which. Two observations
 *     with the same id are refused even if they agree.
 *  2. `malformed`: every offending property is named (sorted, no repeats): `id`, `field` and `quote` and `source`
 *     must be strings of 1 to `MAX_ID_LENGTH`, `MAX_ID_LENGTH`, `MAX_QUOTE_LENGTH`, `MAX_SOURCE_LENGTH` code
 *     units and `extent` must pass `checkExtent`. A value that is not a record is malformed in all five.
 *  3. `unknown-field`: no field of the schema has that id.
 *  4. `number-not-in-quote` (D8): every finite bound must equal, as an integer, some maximal run of ASCII digits
 *     in the quote, compared by absolute value, so the sign is never checked. `lo` is judged before `hi`, and the
 *     fault carries the first bound that fails. Plan D8 calls it the only fidelity check there is.
 *  5. `outside-baseline`: the extent and the field's `B` have no integer in common. Such an observation would
 *     make its tree unsatisfiable on its own; refusing it here is what lets a conflict always be a conflict
 *     BETWEEN observations. A single observation that meets `B` never conflicts alone, in one line: `B` is the set of
 *     values the field takes over all the schema's worlds, so a value in both `B` and the observation has a world.
 *     That `B` is that set is what the oracle tests check; `single-observation.test.ts` checks the theorem itself.
 *
 * `source` is read once, checked to be a string of 1 to `MAX_SOURCE_LENGTH` code units (otherwise the observation is `malformed`) and copied.
 * Nothing in this package decides anything from what a valid source says (plan D6); `order-independence.test.ts` relabels every valid source on
 * generated instances and no answer moves.
 */
export function readObservations(raw: unknown, baseline: ReadonlyMap<string, Extent>): ObservationsRead {
  const hostile = (message: string): ObservationsRead => ({ ok: false, failure: { kind: "hostile-input", message } });
  let isList: boolean;
  try {
    isList = Array.isArray(raw);
  } catch {
    return hostile("reading observations threw");
  }
  if (!isList) return hostile("observations is not an array");
  const list = raw as readonly unknown[];
  let length: unknown;
  try {
    length = list.length;
  } catch {
    return hostile("reading observations.length threw");
  }
  if (!isCount(length)) return hostile("observations has no usable length");
  if (length > MAX_OBSERVATIONS) return { ok: false, failure: { kind: "too-many-observations", count: length, max: MAX_OBSERVATIONS } };

  const slots: Slot[] = [];
  for (let index = 0; index < length; index++) slots.push(readSlot(list, index));

  // Ids that look like ids and occur more than once. A value that is not a valid id cannot be a duplicate of one.
  const seen = new Map<string, number>();
  for (const slot of slots) {
    if (slot.kind === "read" && isText(slot.id, MAX_ID_LENGTH)) seen.set(slot.id, (seen.get(slot.id) ?? 0) + 1);
  }

  const accepted: Observation[] = [];
  const rejected: RejectedObservation[] = [];
  slots.forEach((slot, index) => {
    const verdict = judge(slot, seen, baseline);
    if ("fault" in verdict) rejected.push({ index, fault: verdict.fault });
    else accepted.push(verdict.observation);
  });
  accepted.sort((a, b) => compareIds(a.id, b.id));
  return { ok: true, accepted, rejected };
}

/** Read element `index` and its five properties, once each. Only a throw from a read is caught here. */
function readSlot(list: readonly unknown[], index: number): Slot {
  const abort = { what: "element" }; // thrown by identity, so nothing but a failed read is turned into `hostile`
  const attempt = <T>(what: string, read: () => T): T => {
    try {
      return read();
    } catch {
      abort.what = what;
      throw abort;
    }
  };
  try {
    const element = attempt("element", () => list[index]);
    if (!attempt("element", () => isRecord(element))) return { kind: "not-a-record" };
    const record = element as Record<string, unknown>;
    return {
      kind: "read",
      id: attempt("id", () => record["id"]),
      field: attempt("field", () => record["field"]),
      extent: attempt("extent", () => record["extent"]),
      quote: attempt("quote", () => record["quote"]),
      source: attempt("source", () => record["source"]),
    };
  } catch (thrown) {
    if (thrown !== abort) throw thrown;
    return { kind: "hostile", message: `reading ${abort.what} threw` };
  }
}

function judge(
  slot: Slot,
  seen: ReadonlyMap<string, number>,
  baseline: ReadonlyMap<string, Extent>,
): { readonly observation: Observation } | { readonly fault: ObservationFault } {
  if (slot.kind === "hostile") return { fault: { kind: "hostile-input", message: slot.message } };
  // Not a record: nothing can be read from it, so all five properties are the offending ones (already in code-unit order).
  if (slot.kind === "not-a-record") return { fault: { kind: "malformed", fields: ["extent", "field", "id", "quote", "source"] } };

  if (isText(slot.id, MAX_ID_LENGTH) && (seen.get(slot.id) ?? 0) > 1) return { fault: { kind: "duplicate-id", id: slot.id } };

  const extent = checkExtent(slot.extent);
  if (!extent.ok && extent.reason === "hostile-input") return { fault: { kind: "hostile-input", message: "reading extent threw" } };
  const bad: string[] = [];
  if (!isText(slot.id, MAX_ID_LENGTH)) bad.push("id");
  if (!isText(slot.field, MAX_ID_LENGTH)) bad.push("field");
  if (!extent.ok) bad.push("extent");
  if (!isText(slot.quote, MAX_QUOTE_LENGTH)) bad.push("quote");
  if (!isText(slot.source, MAX_SOURCE_LENGTH)) bad.push("source");
  if (bad.length > 0) return { fault: { kind: "malformed", fields: nonEmpty([...new Set(bad)].sort(compareIds), "the malformed properties") } };

  // Every check above passed, so these are the values that were read, narrowed by `isText` and `checkExtent`.
  const id = slot.id as string;
  const field = slot.field as string;
  const quote = slot.quote as string;
  const source = slot.source as string;
  if (!extent.ok) throw new Error("lib/ground: internal invariant violated: an extent that failed checkExtent was not reported");

  const known = baseline.get(field);
  if (known === undefined) return { fault: { kind: "unknown-field", field } };
  const missing = firstBoundNotInQuote(extent.extent, quote);
  if (missing !== undefined) return { fault: { kind: "number-not-in-quote", value: missing } };
  if (meet(extent.extent, known) === undefined) return { fault: { kind: "outside-baseline", field: fieldId(field) } };

  return {
    observation: { id: obsId(id), field: fieldId(field), extent: { lo: extent.extent.lo, hi: extent.extent.hi }, quote, source },
  };
}

/** The first finite bound of `extent`, `lo` before `hi`, whose absolute value is not a digit run of `quote`. */
function firstBoundNotInQuote(extent: Extent, quote: string): number | undefined {
  const runs = digitRuns(quote);
  for (const bound of [extent.lo, extent.hi]) {
    if (bound !== null && !runs.has(Math.abs(bound))) return bound;
  }
  return undefined;
}

/**
 * The integer value of each maximal run of ASCII digits (`0` to `9` and nothing else: not Arabic-Indic or
 * full-width digits) in `quote`. `"3 to 5 days"` gives {3, 5}; `"1,000"` gives {1, 0} (a thousands separator ends
 * a run, so the bound 1000 is not found in it: refused, and disclosed in ADR 0004); `"3.5"` gives {3, 5}.
 * Leading zeros do not matter (`"007"` is 7). A run with more digits than `MAX_MAGNITUDE` has cannot equal any
 * bound `checkExtent` lets through, so it is skipped rather than converted: `Number` is exact up to that length.
 */
function digitRuns(quote: string): ReadonlySet<number> {
  const longest = String(MAX_MAGNITUDE).length;
  const values = new Set<number>();
  let start = -1;
  for (let i = 0; i <= quote.length; i++) {
    const code = i < quote.length ? quote.charCodeAt(i) : -1;
    const isDigit = code >= 48 && code <= 57;
    if (isDigit && start < 0) start = i;
    if (!isDigit && start >= 0) {
      const run = quote.slice(start, i).replace(/^0+(?=[0-9])/, "");
      if (run.length <= longest) values.add(Number(run));
      start = -1;
    }
  }
  return values;
}
