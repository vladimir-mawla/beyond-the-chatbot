import type { Conflicted, Contradicted, Entailed, Entailment, Ungrounded, Weakened } from "./entailment.js";

/**
 * Why a value is not a well-formed `Entailment`. The first three are the plan's (`.genesis/PLAN.md` 4.1);
 * `unknown-variant` is NOT in the plan and is the one deliberate addition: the plan's types fix
 * `variant: Entailment["kind"]`, which has no way to describe a value whose `kind` is none of the five (a
 * cast-built sixth variant, parsed JSON, `null`). Rather than let such a value pass, make the guard throw
 * from a function whose job is to return a verdict, or invent a `variant` for it, a fourth member reports
 * it. `found` is the offending `kind` when it is a string, otherwise the `typeof` of the value (or of its
 * `kind`), with `null` reported as "null". Flagged in the ADR as a deviation from the plan's type.
 */
export type EntailmentIntegrityError =
  | { readonly kind: "unexpected-field"; readonly variant: Entailment["kind"]; readonly field: string }
  | { readonly kind: "missing-field"; readonly variant: Entailment["kind"]; readonly field: string }
  | { readonly kind: "empty-array"; readonly variant: Entailment["kind"]; readonly field: string }
  | { readonly kind: "unknown-variant"; readonly found: string };

export type EntailmentIntegrity = { readonly ok: true } | { readonly ok: false; readonly error: EntailmentIntegrityError };

/**
 * THE TABLE. Plan section 6, M1: "required: entailed/contradicted: `established`, `support`; weakened:
 * `established`, `support`, `unmet` (non-empty), `openEnds` (array); ungrounded: `openEnds` (non-empty);
 * conflicted: `core` (non-empty). forbidden: entailed/contradicted: `unmet`, `openEnds`, `core`; weakened:
 * `core`; ungrounded: `established`, `support`, `unmet`, `core`; conflicted: `established`, `support`, `unmet`,
 * `openEnds`." Five fields times five variants is 25 cells, each either required or forbidden, plus the three
 * non-empty cells inside the required ones.
 *
 * `present`: not `undefined` and not `null`. `array`: an array (may be empty). `non-empty-array`: an array
 * with at least one element.
 */
type Shape = "present" | "array" | "non-empty-array";

const REQUIRED = {
  entailed: { established: "present", support: "present" },
  weakened: { established: "present", support: "present", unmet: "non-empty-array", openEnds: "array" },
  contradicted: { established: "present", support: "present" },
  ungrounded: { openEnds: "non-empty-array" },
  conflicted: { core: "non-empty-array" },
} as const satisfies Record<Entailment["kind"], Readonly<Record<string, Shape>>>;

const FORBIDDEN = {
  entailed: ["unmet", "openEnds", "core"],
  weakened: ["core"],
  contradicted: ["unmet", "openEnds", "core"],
  ungrounded: ["established", "support", "unmet", "core"],
  conflicted: ["established", "support", "unmet", "openEnds"],
} as const satisfies Record<Entailment["kind"], readonly string[]>;

/** The two fields every variant carries; checked after the table so the table's own precedence is what a caller sees first. */
const BASE_REQUIRED = ["field", "tested"] as const;

// ---- the tables are checked against the types at compile time ---------------------------------------------
// If a field is added to, removed from, or changed in a variant and this table is not told, `npm run
// typecheck` fails here. (The test file pins the same table independently, so a table that drifts from the
// PLAN, not only from the types, is caught at run time too.)
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type VariantField = "established" | "support" | "unmet" | "openEnds" | "core";
/** Fields the variant declares and does not make optional. */
type RequiredOf<V> = { [K in VariantField]: K extends keyof V ? ({} extends Pick<V, K> ? never : K) : never }[VariantField];
/** Fields the variant declares as `?: never`. */
type ForbiddenOf<V> = { [K in VariantField]: K extends keyof V ? (V extends { readonly [P in K]?: never } ? K : never) : never }[VariantField];
type ShapeOf<T> = T extends readonly [unknown, ...unknown[]] ? "non-empty-array" : T extends readonly unknown[] ? "array" : "present";
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type ShapesOf<V, R> = { [K in keyof R & keyof V]: ShapeOf<V[K]> };

type AllTrue<T extends readonly boolean[]> = T extends readonly [infer Head, ...infer Rest extends boolean[]]
  ? Head extends true
    ? AllTrue<Rest>
    : false
  : true;
/** `true` only if every line below holds for the variant `V` (whose `kind` is `K`). Written as a boolean, not as nested `Assert`s, because a constraint on a generic is not resolved until instantiation. */
type TableMatches<V, K extends Entailment["kind"]> = AllTrue<
  [
    // every required cell of the table is a required field of the type, and the reverse
    Equal<keyof (typeof REQUIRED)[K], RequiredOf<V>>,
    // every forbidden cell of the table is a `?: never` field of the type, and the reverse
    Equal<(typeof FORBIDDEN)[K][number], ForbiddenOf<V>>,
    // required and forbidden partition the five fields: all 5 cells of the variant are accounted for
    Equal<RequiredOf<V> | ForbiddenOf<V>, VariantField>,
    Equal<RequiredOf<V> & ForbiddenOf<V>, never>,
    // the shape the table demands (present / array / non-empty) is the shape the type declares
    Equal<ShapesOf<V, (typeof REQUIRED)[K]>, Mutable<(typeof REQUIRED)[K]>>,
  ]
>;
export type EntailmentTableMatchesTypes = [
  Assert<TableMatches<Entailed, "entailed">>,
  Assert<TableMatches<Weakened, "weakened">>,
  Assert<TableMatches<Contradicted, "contradicted">>,
  Assert<TableMatches<Ungrounded, "ungrounded">>,
  Assert<TableMatches<Conflicted, "conflicted">>,
  Assert<Equal<(typeof BASE_REQUIRED)[number], Exclude<keyof Entailment, "kind" | VariantField>>>,
];

function isKind(kind: unknown): kind is Entailment["kind"] {
  return typeof kind === "string" && Object.hasOwn(REQUIRED, kind);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * The run-time check for what the types cannot close (an `as unknown as` cast, an implicit `any` such as
 * `JSON.parse`, a value widened to a supertype, a mutation after construction): given something claimed to be
 * an `Entailment`, it reports the FIRST problem found, in this order:
 *   1. `unknown-variant`: not an object, or a `kind` that is none of the five;
 *   2. the variant's REQUIRED fields, in table order: `missing-field` (absent, `undefined`, `null`, or, for an
 *      array field, not an array) or `empty-array` (a non-empty field holding `[]`);
 *   3. the variant's FORBIDDEN fields, in table order: `unexpected-field`;
 *   4. the two common fields `field` and `tested`: `missing-field`.
 * The plan's three self-checks for M2's health route are each one cell of this table, so none depends on
 * the order (plan section 6, M2).
 *
 * A FORBIDDEN field counts as present if the KEY is there at all: `field in value`, which sees an own
 * property, an inherited one (from the prototype), an accessor, a non-enumerable one and a property whose
 * value is `undefined`. The last is a decision, not an accident. `tsconfig.json` has no
 * `exactOptionalPropertyTypes`, so under it `established?: never` ACCEPTS `established: undefined`
 * (`tsconfig.lib.json` rejects it). A reader that tested `value[field] !== undefined` would then call such a
 * value well formed, while `Object.keys`, `in`, a spread and `structuredClone` all still see the key. The
 * guard sides with the key: a variant that does not own a field does not have the key, full stop, and a
 * builder that writes `{ ..., established: cond ? x : undefined }` is told. (A guard that used only
 * `Object.hasOwn` would also flag it, but would miss a field inherited from a prototype, which `value.field`
 * would still read; `in` is a superset.) Pinned in `__tests__/integrity.test.ts`.
 *
 * WHAT IT DOES NOT CATCH, at full strength:
 *  - It checks PRESENCE and array-ness only. A present field of the wrong kind (`established: 42`, a `support`
 *    that is not `{lo, hi}`, an `unmet` of `["sideways"]`, a `core` of numbers) passes; so does an array with
 *    holes. `Extent` validity (`lo <= hi`, integers) is M3's.
 *  - It checks no relation between fields: not that `unmet` is exactly the sides of `tested` that
 *    `established` fails, not that `established` is inside `tested` for `entailed`, not that a `support`
 *    reproduces a bound, not that a `core` has two members or is unsatisfiable. Those are M4's and M5's.
 *  - It flags only the fields named in the table, not an arbitrary extra key: an `Entailment` with an
 *    unrelated `note` field passes.
 *  - A required array field holding a non-array (a string, an object) is reported as `missing-field`: the
 *    plan's error type has no `wrong-type` member and none was added.
 *  - It does not defend against a hostile object. It is not total: a getter that throws makes it throw, and a
 *    `Proxy` whose `has`/`get` traps lie is believed. Hostile input is read ONCE into plain data at M3-M5's
 *    intake; this guard is run on values the engine built itself.
 *
 * `.genesis/PLAN.md` section 5 has M5's `rule` call this on every `Entailment` it returns and throw on
 * `ok: false`, and M2's health route run it on four hand-built values; neither is built yet.
 */
export function assertEntailmentWellFormed(e: Entailment): EntailmentIntegrity {
  const value: unknown = e;
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: { kind: "unknown-variant", found: value === null ? "null" : typeof value } };
  }
  const record = value as Readonly<Record<string, unknown>>;
  const kind = record["kind"];
  if (!isKind(kind)) {
    return { ok: false, error: { kind: "unknown-variant", found: typeof kind === "string" ? kind : typeof kind } };
  }

  for (const [field, shape] of Object.entries(REQUIRED[kind]) as [string, Shape][]) {
    const present = record[field];
    if (!isPresent(present)) return { ok: false, error: { kind: "missing-field", variant: kind, field } };
    if (shape === "present") continue;
    if (!Array.isArray(present)) return { ok: false, error: { kind: "missing-field", variant: kind, field } };
    if (shape === "non-empty-array" && present.length === 0) {
      return { ok: false, error: { kind: "empty-array", variant: kind, field } };
    }
  }
  for (const field of FORBIDDEN[kind]) {
    if (field in record) return { ok: false, error: { kind: "unexpected-field", variant: kind, field } };
  }
  for (const field of BASE_REQUIRED) {
    if (!isPresent(record[field])) return { ok: false, error: { kind: "missing-field", variant: kind, field } };
  }
  return { ok: true };
}
