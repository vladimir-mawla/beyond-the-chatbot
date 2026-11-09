import { MAX_ID_LENGTH, fieldId } from "../contracts/index.js";
import type { Claim, ClaimFault } from "../contracts/index.js";
import { checkExtent, isSubset } from "../extent/index.js";
import type { Grounding } from "../ground/index.js";
import { deepFreeze, isRecord, isText, nonEmpty } from "./plain.js";

export type ClaimRead = { readonly ok: true; readonly claim: Claim } | { readonly ok: false; readonly fault: ClaimFault };

/**
 * Read an untrusted claim (a draft claim or the user's question) once, into a fresh frozen `Claim`, or say why not.
 *
 * WHAT IS READ, AND HOW OFTEN. The value itself is tested for being a record (an array is not one), then `field`
 * and `extent` are read, once each and in that order, and then `checkExtent` reads the extent's `lo` and `hi` once
 * each. Everything is judged from those single reads. Nothing else is read: an extra property, even one whose getter
 * throws, is never touched. A read that throws stops the whole read and gives `hostile-input`, with a message made
 * only of this package's words (the thrown value is never looked at, so nothing it carries can reach the result);
 * it outranks `malformed`, so the same input gives the same answer. `Grounding` is not read as untrusted: it is
 * data `ground` built.
 *
 * THE FAULTS, first failing one wins (plan section 4.1: malformed > unknown-field > vacuous-claim):
 *  1. `malformed`: names every offending property among `field` and `extent` (sorted, no repeats). `field` must be a
 *     string of 1 to `MAX_ID_LENGTH` code units; `extent` must pass M3's `checkExtent`. A value that is not a record
 *     is malformed in both.
 *  2. `unknown-field`: no field of the schema has that id. Judged from `Grounding.baseline`, which holds an entry for
 *     every field of the validated schema.
 *  3. `vacuous-claim`: the field's schema-only extent `B` already lies inside the claim, so it rules nothing out. It
 *     is judged for a field in a conflicted tree too (`B` is in the `Grounding` either way), so a vacuous claim never
 *     reaches the ruling table, whatever the evidence is.
 */
export function readClaim(g: Grounding, raw: unknown): ClaimRead {
  const hostile = (message: string): ClaimRead => deepFreeze({ ok: false, fault: { kind: "hostile-input", message } });
  let record: boolean;
  try {
    record = isRecord(raw);
  } catch {
    return hostile("reading the claim threw");
  }
  if (!record) return deepFreeze({ ok: false, fault: { kind: "malformed", fields: ["extent", "field"] } });
  const object = raw as Record<string, unknown>;

  let field: unknown;
  let extent: unknown;
  try {
    field = object["field"];
  } catch {
    return hostile("reading claim.field threw");
  }
  try {
    extent = object["extent"];
  } catch {
    return hostile("reading claim.extent threw");
  }
  const checked = checkExtent(extent);
  if (!checked.ok && checked.reason === "hostile-input") return hostile("reading the extent of the claim threw");

  // In ascending code-unit order, so the list is sorted without a sort, and without repeats.
  const offending: string[] = [];
  if (!checked.ok) offending.push("extent");
  if (!isText(field, MAX_ID_LENGTH)) offending.push("field");
  if (!checked.ok || !isText(field, MAX_ID_LENGTH)) {
    return deepFreeze({ ok: false, fault: { kind: "malformed", fields: nonEmpty(offending, "the offending places of a malformed claim") } });
  }

  const entry = g.baseline.find((candidate) => candidate.field === field);
  if (entry === undefined) return deepFreeze({ ok: false, fault: { kind: "unknown-field", field } });
  if (isSubset(entry.extent, checked.extent)) return deepFreeze({ ok: false, fault: { kind: "vacuous-claim", field: fieldId(field) } });
  return deepFreeze({ ok: true, claim: { field: fieldId(field), extent: checked.extent } });
}
