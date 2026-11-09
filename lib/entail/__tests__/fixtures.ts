import { MAX_MAGNITUDE } from "../../contracts/index.js";
import type { Brief, Entailment, Extent, Observation, Schema } from "../../contracts/index.js";
import { ground } from "../../ground/index.js";
import type { Grounding } from "../../ground/index.js";
import { base, derived, genInstance, mulberry32, schemaOf } from "../../ground/__tests__/fixtures.js";
import type { Instance, RawField, RawSchema } from "../../ground/__tests__/fixtures.js";

export { CANON, base, canon, chance, derived, genClaims, genInstance, int, mulberry32, obs, oracleFields, pick, refExtent, schemaOf, shuffled, ORDER_DESK, jsonCopy, nonPlainPaths, unfrozenPaths, numbersIn } from "../../ground/__tests__/fixtures.js";
export type { Instance, RawField, RawObservation, RawSchema } from "../../ground/__tests__/fixtures.js";

/**
 * Shared test support for `lib/entail`: the order desk with labels a reader would write (so rendered sentences read as
 * the plan's samples do), a few builders for claims and for the plan's section 7 steps, a way to turn a `Brief` into a
 * tampered copy, and the getter and Proxy probes the read-once tables are made of.
 *
 * What is reused, and from where, so no oracle is written twice: the generator, the raw builders and the structural
 * walkers are `lib/ground/__tests__/fixtures.ts`; the brute-force oracle is `lib/ground/__tests__/oracle.ts`. Nothing
 * here imports a source of `lib/entail`.
 */

// ---------------------------------------------------------------------------------------------------------
// The order desk, labelled.
// ---------------------------------------------------------------------------------------------------------

const labelled = (field: RawField, label: string): RawField => ({ ...field, label });

/** The schema of plan section 7 with human labels: `packing`, `transit`, `customs clearance`, `delivery`. */
export const DESK: RawSchema = schemaOf(
  labelled(base("packDays"), "packing"),
  labelled(base("transitDays"), "transit"),
  labelled(base("customsDays"), "customs clearance"),
  labelled(derived("deliveryDay", ["packDays", "transitDays", "customsDays"]), "delivery"),
);

/** `ground` that must succeed; the schema the tests pass is valid. */
export function groundOf(schema: unknown, observations: unknown): Grounding {
  const result = ground(schema, observations);
  if (!result.ok) throw new Error(`fixture did not ground: ${JSON.stringify(result.failure)}`);
  return result.grounding;
}

export const claim = (field: string, lo: number | null, hi: number | null): { field: string; extent: { lo: number | null; hi: number | null } } => ({ field, extent: { lo, hi } });

/** The plan's section 7 steps: which of o1..o4 are in the snapshot, the question, the draft, and what each ruling's kind is. */
export interface Step {
  readonly number: number;
  readonly ids: readonly ("o1" | "o2" | "o3" | "o4")[];
  readonly question: ReturnType<typeof claim>;
  readonly questionKind: Entailment["kind"];
  readonly draft: readonly ReturnType<typeof claim>[];
  readonly draftKinds: readonly Entailment["kind"][];
}

export const STEPS: readonly Step[] = [
  {
    number: 1,
    ids: ["o1", "o2"],
    question: claim("deliveryDay", null, 12),
    questionKind: "weakened",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2), claim("deliveryDay", 7, 7)],
    draftKinds: ["weakened", "weakened", "ungrounded", "weakened"],
  },
  {
    number: 2,
    ids: ["o1", "o2"],
    question: claim("deliveryDay", 4, null),
    questionKind: "entailed",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2), claim("deliveryDay", 7, 7)],
    draftKinds: ["weakened", "weakened", "ungrounded", "weakened"],
  },
  {
    number: 3,
    ids: ["o1", "o2"],
    question: claim("deliveryDay", null, 3),
    questionKind: "contradicted",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2), claim("deliveryDay", 7, 7)],
    draftKinds: ["weakened", "weakened", "ungrounded", "weakened"],
  },
  {
    number: 4,
    ids: ["o1", "o2", "o3"],
    question: claim("deliveryDay", null, 12),
    questionKind: "entailed",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 1, 1), claim("deliveryDay", 6, 6)],
    draftKinds: ["weakened", "weakened", "weakened", "weakened"],
  },
  {
    number: 5,
    ids: ["o1", "o2", "o3", "o4"],
    question: claim("deliveryDay", null, 12),
    questionKind: "conflicted",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 1, 1), claim("deliveryDay", 6, 6)],
    draftKinds: ["conflicted", "conflicted", "conflicted", "conflicted"],
  },
  {
    number: 6,
    ids: ["o1", "o2", "o4"],
    question: claim("customsDays", null, 3),
    questionKind: "contradicted",
    draft: [claim("packDays", 1, 1), claim("transitDays", 4, 4), claim("customsDays", 2, 2), claim("deliveryDay", 14, 14)],
    draftKinds: ["weakened", "weakened", "contradicted", "entailed"],
  },
];

// ---------------------------------------------------------------------------------------------------------
// Briefs as plain data, and tampering with one.
// ---------------------------------------------------------------------------------------------------------

/** A `Brief` from the engine, or a thrown error: for tests that need one and do not test `answer`. */
export type BriefMaker = (g: Grounding, question: unknown, draft: unknown) => Brief;

/** A deep, mutable copy of a (frozen) value, through JSON. Every `Brief` and `Entailment` is plain data, so nothing is lost. */
export const thaw = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The same `Brief` with the ruling at `position` replaced by `change(thawed ruling)`. */
export function tampered(brief: Brief, position: "answer" | number, change: (ruling: Record<string, unknown>) => void): Brief {
  const copy = thaw(brief) as unknown as { answer: Record<string, unknown>; claims: Record<string, unknown>[] };
  change(position === "answer" ? copy.answer : (copy.claims[position] as Record<string, unknown>));
  return copy as unknown as Brief;
}

/** Every ruling of a `Brief` with its position: the answer, then each claim. */
export function rulingsOf(brief: Brief): { position: "answer" | number; ruling: Entailment }[] {
  return [{ position: "answer", ruling: brief.answer }, ...brief.claims.map((ruling, position) => ({ position, ruling }))];
}

export type { Brief, Entailment, Extent, Observation, Grounding, Schema };

// ---------------------------------------------------------------------------------------------------------
// Getter, Proxy and throwing probes.
// ---------------------------------------------------------------------------------------------------------

/** First values drawn from each class the lead asked for, plus the places a number can go wrong. `kind` says what a plain input holding it alone is. */
export const FIRST_VALUES: readonly (readonly [string, unknown])[] = [
  ["null", null],
  ["zero", 0],
  ["negative zero", -0],
  ["one", 1],
  ["negative", -5],
  ["the maximum magnitude", MAX_MAGNITUDE],
  ["its negative", -MAX_MAGNITUDE],
  ["one past the maximum", MAX_MAGNITUDE + 1],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["a fraction", 1.5],
  ["a valid id", "packDays"],
  ["an id that is not a field", "ghost"],
  ["the empty string", ""],
  ["a boolean", true],
  ["a bigint", 1n],
  ["a symbol", Symbol("probe")],
  ["undefined", undefined],
  ["an object", {}],
  ["an array", []],
  ["a function", () => 1],
  ["a valid extent", { lo: 3, hi: 5 }],
  ["a vacuous extent", { lo: null, hi: null }],
  ["an inverted extent", { lo: 5, hi: 3 }],
];

/** Hostile values a second read would give. A `throw` marker means the second read throws. */
export const LATER_VALUES: readonly (readonly [string, unknown])[] = [
  ["NaN", Number.NaN],
  ["null", null],
  ["an object", { lo: 0, hi: 0 }],
  ["a string", "later"],
  ["undefined", undefined],
  ["a number out of range", MAX_MAGNITUDE * 4],
  ["a valid id", "deliveryDay"],
  ["a throw", Symbol.for("throw")],
];

/**
 * An accessor property that returns `first` on its first read and `later` on every read after that (or throws, if
 * `later` is `Symbol.for("throw")`), counting the reads. `first` may itself be `Symbol.for("throw")`.
 */
export function counted(first: unknown, later: unknown): { readonly get: () => unknown; readonly reads: () => number } {
  let n = 0;
  const THROW = Symbol.for("throw");
  return {
    get: () => {
      n += 1;
      const value = n === 1 ? first : later;
      if (value === THROW) throw new Error(`hostile read ${n}`);
      return value;
    },
    reads: () => n,
  };
}

/** Define `key` on `target` as an enumerable accessor made from `probe`. */
export function defineCounted(target: object, key: string | number, probe: { readonly get: () => unknown }): void {
  Object.defineProperty(target, key, { enumerable: true, configurable: true, get: probe.get });
}

/** A Proxy over `target` that logs every trap it sees (`get:name`, `has:name`, `ownKeys`, ...), for the exact-read tests. */
export function logged<T extends object>(target: T, log: string[]): T {
  return new Proxy(target, {
    get: (t, key, receiver) => {
      log.push(`get:${String(key)}`);
      return Reflect.get(t, key, receiver);
    },
    has: (t, key) => {
      log.push(`has:${String(key)}`);
      return Reflect.has(t, key);
    },
    ownKeys: (t) => {
      log.push("ownKeys");
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor: (t, key) => {
      log.push(`getOwnPropertyDescriptor:${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    getPrototypeOf: (t) => {
      log.push("getPrototypeOf");
      return Reflect.getPrototypeOf(t);
    },
  });
}

/** Digit tokens of a text: its maximal runs of ASCII digits, as strings. */
export const digitTokens = (text: string): string[] => text.match(/[0-9]+/g) ?? [];

// ---------------------------------------------------------------------------------------------------------
// One generated scenario: a grounding, a question and a draft with refusals in it.
// ---------------------------------------------------------------------------------------------------------

export interface Scenario {
  readonly seed: number;
  readonly instance: Instance;
  readonly grounding: Grounding;
  readonly question: unknown;
  readonly draft: readonly unknown[];
}

/**
 * The scenario of one seed: `genInstance`'s schema and snapshot (the observations that are not hostile, so it always
 * grounds), a question about one field, and a draft of up to eight claims of which about a fifth are refused (`null`,
 * or a field the schema lacks). The same draw as `answer.test.ts` makes, so a seed means one scenario everywhere.
 */
export function scenarioOf(seed: number): Scenario {
  const rng = mulberry32(seed);
  const instance = genInstance(rng);
  const accepted = instance.observations.filter((_, i) => !instance.hostile.has(i));
  const grounding = groundOf(instance.schema, accepted);
  const names = instance.schema.fields.map((f) => f.id);
  const draft: unknown[] = [];
  const size = Math.floor(rng() * 9);
  for (let i = 0; i < size; i++) {
    const roll = rng();
    const field = names[Math.floor(rng() * names.length)] as string;
    const lo = rng() < 0.3 ? null : Math.floor(rng() * 9) - 1;
    const hi = rng() < 0.3 ? null : (lo ?? 0) + Math.floor(rng() * 6);
    if (roll < 0.1) draft.push(null);
    else if (roll < 0.2) draft.push({ field: "ghost", extent: { lo, hi } });
    else draft.push({ field, extent: { lo, hi } });
  }
  const question = { field: names[Math.floor(rng() * names.length)], extent: { lo: Math.floor(rng() * 5), hi: null } };
  return { seed, instance, grounding, question, draft };
}
