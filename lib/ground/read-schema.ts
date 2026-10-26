import {
  MAX_FIELDS,
  MAX_ID_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_OPERANDS,
  MAX_UNIT_LENGTH,
  compareIds,
  fieldId,
} from "../contracts/index.js";
import type { Extent, FieldDecl, NonEmptyReadonlyArray, Operands, Schema, SchemaFault } from "../contracts/index.js";
import { checkExtent } from "../extent/index.js";
import { rootOf } from "./decl.js";
import { deepFreeze, isCount, isRecord, isText, nonEmpty } from "./plain.js";

export type SchemaRead =
  | { readonly ok: true; readonly schema: Schema }
  | { readonly ok: false; readonly fault: SchemaFault };

/** A field whose shape passed, still holding plain strings: ids become `FieldId`s only in the final copy. */
type Parsed =
  | { readonly kind: "base"; readonly id: string; readonly label: string; readonly unit: string; readonly baseline: Extent }
  | { readonly kind: "derived"; readonly id: string; readonly label: string; readonly unit: string; readonly sum: readonly string[] };

/** Runs one read of untrusted input. If it throws, reading stops for good (see `readSchema`). */
type Attempt = <T>(path: string, read: () => T) => T;

/** The `malformed` fault: the offending places, sorted in code-unit order (`compareIds`) and without repeats. */
function malformed(places: readonly string[]): SchemaFault {
  const unique = [...new Set(places)].sort(compareIds);
  return { kind: "malformed", fields: nonEmpty(unique, "the list of malformed places") };
}

/**
 * Turn an untrusted value into a validated `Schema`, or say why not. Every read of the input is guarded, so a
 * hostile value becomes a typed result; the throws I know of in this function are this package's own internal
 * invariants. (`hostile-input.test.ts` tries the classes of value listed there and 10 000 random calls of the two
 * functions; that is a sample, not a proof.)
 *
 * EACH UNTRUSTED VALUE IS READ ONCE. `raw.fields`; the `length` of that array; each element up to the bound
 * below; each of an element's six properties, `kind`, `id`, `label`, `unit`, `baseline`, `sum`, in that order and
 * all six whatever the kind (so a base field that carries a `sum` can be refused); a `sum`'s `length` and each of
 * its elements; and, through `checkExtent`, the `lo` and `hi` of a baseline. Everything is then judged from those
 * single reads, never from the input again, so a getter that answers differently the second time cannot make the
 * checked value differ from the copied one. Nothing else is touched (the trap-log test in `hostile-input.test.ts`
 * fails on a `has`, `ownKeys`, `getOwnPropertyDescriptor` or `getPrototypeOf` trap), and an unknown extra property is
 * neither refused nor copied (`schema-faults.test.ts`).
 *
 * A READ THAT THROWS stops the whole read: `hostile-input`, with a message made only of this package's own
 * words and the path of the read (never the thrown value, which is as untrusted as the input). It outranks
 * `malformed`: reads happen in a fixed order, so the same input gives the same answer.
 *
 * Shape problems are all collected before anything is refused (D11): `malformed` names every offending place,
 * as a path (`fields[2].unit`, `fields[0].sum[1]`), sorted by code unit and without repeats. The paths name
 * positions in THIS input, so they move when the fields are reordered. Then the
 * structural rules, first failing one wins, in the plan's precedence: `too-many-fields`, `duplicate-field`,
 * `unknown-operand`, `operand-reused`, `rule-cycle`, `unit-mismatch`. Where a rule fails in several places, the
 * fault names the smallest id (or id pair) in code-unit order, so reordering the fields cannot change which
 * place is reported.
 *
 * THE ELEMENT BOUND. A length is trusted only as far as `MAX_FIELDS + 1` reads: more elements than that are
 * never read, however many the array claims (a Proxy can claim 2**32 - 1). That keeps `malformed` outranking
 * `too-many-fields` for every array of up to `MAX_FIELDS + 1` elements, the first length that is too many, and for a longer
 * array whenever the malformed element is among the first `MAX_FIELDS + 1`; a malformed element at index `MAX_FIELDS + 1` or later
 * is not looked for.
 *
 * Choices the plan does not make, made here and pinned by tests: an id, a label and a unit are each 1 to
 * `MAX_ID_LENGTH`, `MAX_LABEL_LENGTH`, `MAX_UNIT_LENGTH` code units; a sum has 2 to `MAX_OPERANDS` operands (a
 * count outside that is `malformed` at `fields[i].sum`, the elements then unread); and an id is any such
 * string, including `__proto__`.
 */
export function readSchema(raw: unknown): SchemaRead {
  const abort = { path: "schema" }; // thrown by identity when a read throws, so no other error is ever caught here
  const attempt: Attempt = (path, read) => {
    try {
      return read();
    } catch {
      abort.path = path;
      throw abort;
    }
  };
  try {
    return readUnguarded(raw, attempt);
  } catch (thrown) {
    if (thrown !== abort) throw thrown;
    return deepFreeze({ ok: false, fault: { kind: "hostile-input", message: `reading ${abort.path} threw` } });
  }
}

function readUnguarded(raw: unknown, attempt: Attempt): SchemaRead {
  const refuse = (fault: SchemaFault): SchemaRead => deepFreeze({ ok: false, fault });

  if (!attempt("schema", () => isRecord(raw))) return refuse(malformed(["schema"]));
  const rawFields = attempt("fields", () => (raw as { readonly fields?: unknown }).fields);
  if (!attempt("fields", () => Array.isArray(rawFields))) return refuse(malformed(["fields"]));
  const list = rawFields as readonly unknown[];
  const length = attempt("fields.length", () => list.length);
  if (!isCount(length) || length === 0) return refuse(malformed(["fields"]));

  const places: string[] = [];
  const parsed: Parsed[] = [];
  const take = Math.min(length, MAX_FIELDS + 1);
  for (let i = 0; i < take; i++) {
    const field = readField(attempt, list, i, places);
    if (field !== undefined) parsed.push(field);
  }
  if (places.length > 0) return refuse(malformed(places));
  if (length > MAX_FIELDS) return refuse({ kind: "too-many-fields", count: length, max: MAX_FIELDS });

  const fault = structuralFault(parsed);
  if (fault !== undefined) return refuse(fault);
  return deepFreeze({ ok: true, schema: copyOf(parsed) });
}

/** Read and judge field `i`; `undefined` (with the offending places pushed) when any of it is malformed. */
function readField(attempt: Attempt, list: readonly unknown[], i: number, places: string[]): Parsed | undefined {
  const at = `fields[${i}]`;
  const element = attempt(at, () => list[i]);
  if (!attempt(at, () => isRecord(element))) {
    places.push(at);
    return undefined;
  }
  const record = element as Record<string, unknown>;
  const kind = attempt(`${at}.kind`, () => record["kind"]);
  const id = attempt(`${at}.id`, () => record["id"]);
  const label = attempt(`${at}.label`, () => record["label"]);
  const unit = attempt(`${at}.unit`, () => record["unit"]);
  const baseline = attempt(`${at}.baseline`, () => record["baseline"]);
  const sum = attempt(`${at}.sum`, () => record["sum"]);

  const before = places.length;
  if (kind !== "base" && kind !== "derived") places.push(`${at}.kind`);
  if (!isText(id, MAX_ID_LENGTH)) places.push(`${at}.id`);
  if (!isText(label, MAX_LABEL_LENGTH)) places.push(`${at}.label`);
  if (!isText(unit, MAX_UNIT_LENGTH)) places.push(`${at}.unit`);

  let checkedBaseline: Extent | undefined;
  let operands: readonly string[] | undefined;
  if (kind === "base") {
    // `checkExtent` reads `lo` and `hi` once each. A throw there is the same hostile read as any other.
    const verdict = attempt(`${at}.baseline`, () => {
      const result = checkExtent(baseline);
      if (!result.ok && result.reason === "hostile-input") throw new Error("the baseline could not be read");
      return result;
    });
    if (verdict.ok) checkedBaseline = verdict.extent;
    else places.push(`${at}.baseline`);
    if (sum !== undefined) places.push(`${at}.sum`);
  } else if (kind === "derived") {
    operands = readOperands(attempt, at, sum, places);
    if (baseline !== undefined) places.push(`${at}.baseline`);
  }
  if (places.length > before) return undefined;

  // Every check above passed, so these are the strings and the kind that were read, narrowed by `isText`.
  const named = { id: id as string, label: label as string, unit: unit as string };
  if (kind === "base" && checkedBaseline !== undefined) return { kind: "base", ...named, baseline: checkedBaseline };
  if (kind === "derived" && operands !== undefined) return { kind: "derived", ...named, sum: operands };
  return undefined;
}

/** A `sum`: an array of 2 to `MAX_OPERANDS` ids. Elements are read only when the count is acceptable. */
function readOperands(attempt: Attempt, at: string, sum: unknown, places: string[]): readonly string[] | undefined {
  const place = `${at}.sum`;
  if (!attempt(place, () => Array.isArray(sum))) {
    places.push(place);
    return undefined;
  }
  const operands = sum as readonly unknown[];
  const count = attempt(`${place}.length`, () => operands.length);
  if (!isCount(count) || count < 2 || count > MAX_OPERANDS) {
    places.push(place);
    return undefined;
  }
  const read: string[] = [];
  let sound = true;
  for (let j = 0; j < count; j++) {
    const operand = attempt(`${place}[${j}]`, () => operands[j]);
    if (isText(operand, MAX_ID_LENGTH)) read.push(operand);
    else {
      places.push(`${place}[${j}]`);
      sound = false;
    }
  }
  return sound ? read : undefined;
}

/** The smaller of two ids, in code-unit order. */
function smaller(a: string, b: string): string {
  return compareIds(a, b) <= 0 ? a : b;
}

/** The first failing structural rule, in the plan's order, or `undefined`. Pure, over fields that passed their shape check. */
function structuralFault(fields: readonly Parsed[]): SchemaFault | undefined {
  // duplicate-field: the smallest id that is declared more than once.
  const declared = new Map<string, Parsed>();
  let duplicate: string | undefined;
  for (const field of fields) {
    if (declared.has(field.id)) duplicate = duplicate === undefined ? field.id : smaller(duplicate, field.id);
    else declared.set(field.id, field);
  }
  if (duplicate !== undefined) return { kind: "duplicate-field", field: duplicate };

  // unknown-operand: the smallest (result, operand) pair whose operand no field declares.
  let unknown: { result: string; operand: string } | undefined;
  for (const field of fields) {
    if (field.kind !== "derived") continue;
    for (const operand of field.sum) {
      if (declared.has(operand)) continue;
      const candidate = { result: field.id, operand };
      if (unknown === undefined || compareIds(candidate.result, unknown.result) < 0 || (candidate.result === unknown.result && compareIds(candidate.operand, unknown.operand) < 0)) {
        unknown = candidate;
      }
    }
  }
  if (unknown !== undefined) return { kind: "unknown-operand", ...unknown };

  // operand-reused (read-once): the smallest field that is an operand twice, in one sum or in two.
  const uses = new Map<string, number>();
  const parent = new Map<string, string>();
  for (const field of fields) {
    if (field.kind !== "derived") continue;
    for (const operand of field.sum) {
      uses.set(operand, (uses.get(operand) ?? 0) + 1);
      parent.set(operand, field.id);
    }
  }
  let reused: string | undefined;
  for (const [operand, count] of uses) if (count > 1) reused = reused === undefined ? operand : smaller(reused, operand);
  if (reused !== undefined) return { kind: "operand-reused", operand: reused };

  // rule-cycle: with read-once holding, every field has at most one parent, so walking up from a field never reaches
  // a root exactly when the field is on a cycle or feeds into one. `rootOf` is bounded by the field count. The fault names the
  // smallest field that is ON a cycle: a field that merely feeds into one (a tail) is not named.
  let cyclic: string | undefined;
  for (const field of fields) {
    if (rootOf(parent, field.id, fields.length) !== undefined) continue;
    if (onCycle(parent, field.id, fields.length)) cyclic = cyclic === undefined ? field.id : smaller(cyclic, field.id);
  }
  if (cyclic !== undefined) return { kind: "rule-cycle", field: cyclic };

  // unit-mismatch: the smallest (result, operand) pair whose units differ.
  let mismatch: { result: string; operand: string } | undefined;
  for (const field of fields) {
    if (field.kind !== "derived") continue;
    for (const operand of field.sum) {
      if (declared.get(operand)?.unit === field.unit) continue;
      const candidate = { result: field.id, operand };
      if (mismatch === undefined || compareIds(candidate.result, mismatch.result) < 0 || (candidate.result === mismatch.result && compareIds(candidate.operand, mismatch.operand) < 0)) {
        mismatch = candidate;
      }
    }
  }
  if (mismatch !== undefined) return { kind: "unit-mismatch", ...mismatch };
  return undefined;
}

/** Is `start` itself on a cycle of `parent` links? After `limit` steps the walk is on the cycle, if there is one. */
function onCycle(parent: ReadonlyMap<string, string>, start: string, limit: number): boolean {
  let current = start;
  for (let step = 0; step < limit; step++) {
    const next = parent.get(current);
    if (next === undefined) return false;
    current = next;
    if (current === start) return true;
  }
  return false;
}

/** The validated copy: fresh objects and arrays only, in the order the author wrote the fields. */
function copyOf(fields: readonly Parsed[]): Schema {
  const decls: FieldDecl[] = fields.map((field): FieldDecl => {
    const named = { id: fieldId(field.id), label: field.label, unit: field.unit };
    if (field.kind === "base") return { kind: "base", ...named, baseline: { lo: field.baseline.lo, hi: field.baseline.hi } };
    return { kind: "derived", ...named, sum: operandsOf(field.sum) };
  });
  const list: NonEmptyReadonlyArray<FieldDecl> = nonEmpty(decls, "the validated field list");
  return { fields: list };
}

function operandsOf(ids: readonly string[]): Operands {
  const [first, second, ...rest] = ids;
  if (first === undefined || second === undefined) throw new Error("lib/ground: internal invariant violated: a sum with fewer than two operands passed validation");
  return [fieldId(first), fieldId(second), ...rest.map(fieldId)];
}
