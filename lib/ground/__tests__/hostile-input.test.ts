import { describe, expect, it } from "vitest";
import { MAX_ID_LENGTH, MAX_MAGNITUDE } from "../../contracts/index.js";
import { ground, readSchema } from "../index.js";
import { ORDER_DESK, base, chance, derived, int, jsonCopy, mulberry32, obs, pick, schemaOf } from "./fixtures.js";
import type { Rng } from "./fixtures.js";

/**
 * `readSchema` and `ground` AGAINST INPUT THAT FIGHTS BACK. The claim under test (plan section 6, M4): "reads each
 * untrusted input exactly once into plain data", and neither function throws.
 *
 * HOW A READ-ONCE CLAIM IS SHOWN. For every place the engine reads, a getter stands in for the value. Its FIRST read
 * returns a value drawn from every class below (null, 0, -0, a negative, the maximum, one past it, NaN, both
 * infinities, a fraction, strings of every interesting length, a boolean, a bigint, a symbol, a function, an object,
 * an array, undefined, boxed primitives, an object whose coercions throw, and the valid values for that place); its
 * later reads are hostile: each of several other values, and a throw. Two things are asserted for every pair:
 *  - the getter was read exactly once, and
 *  - the result is the result the engine gives when the FIRST value is simply there (a plain property), so the value
 *    it checked and the value it used are the same one, whatever the second read would have said.
 * ADR 0003 records why the classes are all of them and not some: the M3 table covered only some, and a verifier
 * found ten edits that left it green. The classes were drawn from that list and extended, not from the code.
 *
 * What it cannot show: that these are all the ways to observe an object. It covers getters, an indexed getter on an
 * array, a Proxy that logs every trap, a revoked Proxy, and coercion hooks. Not: a getter on a prototype that is
 * installed after the call began, or a value that changes by some other side effect.
 */

const THROWS = Symbol("the getter throws on the first read");
const SECOND_THROWS = Symbol("the getter throws on every later read");

const coercionBomb = {
  valueOf(): never {
    throw new Error("valueOf was called");
  },
  toString(): never {
    throw new Error("toString was called");
  },
  [Symbol.toPrimitive](): never {
    throw new Error("toPrimitive was called");
  },
};

/** First values that make sense at every place. */
const GENERIC_FIRSTS: readonly (readonly [string, unknown])[] = [
  ["null", null],
  ["0", 0],
  ["-0", -0],
  ["a negative", -1],
  ["the maximum magnitude", MAX_MAGNITUDE],
  ["minus the maximum magnitude", -MAX_MAGNITUDE],
  ["one past the maximum magnitude", MAX_MAGNITUDE + 1],
  ["NaN", Number.NaN],
  ["+Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["a fraction", 1.5],
  ["a small integer", 3],
  ["a string", "a"],
  ["the empty string", ""],
  ["a string of the longest allowed id", "x".repeat(MAX_ID_LENGTH)],
  ["a string one past it", "x".repeat(MAX_ID_LENGTH + 1)],
  ["true", true],
  ["false", false],
  ["a bigint", 5n],
  ["a symbol", Symbol("s")],
  ["a function", () => 1],
  ["an object", {}],
  ["an array", []],
  ["undefined", undefined],
  ["a boxed number", Object(1)],
  ["a boxed string", Object("a")],
  ["an object whose coercions throw", coercionBomb],
  ["a valid extent object", { lo: 1, hi: 2 }],
  ["a valid sum", ["a", "b"]],
  ["the kind base", "base"],
  ["the kind derived", "derived"],
  ["a read that throws", THROWS],
];

/** Later reads: hostile in several ways, always differing from a valid answer where they can. */
const LATER: readonly (readonly [string, unknown])[] = [
  ["NaN", Number.NaN],
  ["null", null],
  ["an object", {}],
  ["a string", "zzz"],
  ["undefined", undefined],
  ["a number out of range", 2 ** 41],
  ["a throw", SECOND_THROWS],
];

type Build = (put: (holder: Record<string | number, unknown>, key: string | number) => void) => unknown;
interface Place {
  readonly name: string;
  readonly build: Build;
  /** Values that are valid at this place, tried as first and as later reads too. */
  readonly valids: readonly unknown[];
}

interface Tally {
  runs: number;
  failures: string[];
}

/** Run one place against every pair of (first read, later read) and report what went wrong. */
function probe(place: Place, call: (raw: unknown) => unknown, isHostile: (result: unknown) => boolean, tally: Tally): void {
  const firsts: (readonly [string, unknown])[] = [...GENERIC_FIRSTS, ...place.valids.map((v, i): [string, unknown] => [`a valid value (${i})`, v])];
  const laters: (readonly [string, unknown])[] = [...LATER, ...place.valids.map((v, i): [string, unknown] => [`a valid value (${i})`, v])];
  for (const [firstName, first] of firsts) {
    const expected = first === THROWS ? undefined : JSON.stringify(call(place.build((holder, key) => void (holder[key] = first))));
    for (const [laterName, later] of laters) {
      let reads = 0;
      const raw = place.build((holder, key) => {
        Object.defineProperty(holder, key, {
          enumerable: true,
          configurable: true,
          get() {
            reads += 1;
            if (reads === 1) {
              if (first === THROWS) throw new Error("the first read throws");
              return first;
            }
            if (later === SECOND_THROWS) throw new Error("a later read throws");
            return later;
          },
        });
      });
      const result = call(raw);
      tally.runs += 1;
      const where = `${place.name}: first ${firstName}, later ${laterName}`;
      if (reads !== 1) tally.failures.push(`${where}: read ${reads} times`);
      else if (first === THROWS) {
        if (!isHostile(result)) tally.failures.push(`${where}: a first read that threw was not refused as hostile: ${JSON.stringify(result)}`);
      } else if (JSON.stringify(result) !== expected) tally.failures.push(`${where}: got ${JSON.stringify(result)} but the first value alone gives ${expected}`);
    }
  }
}

const hostileSchema = (r: unknown): boolean => (r as { fault?: { kind?: string } }).fault?.kind === "hostile-input";

/** a, b, t = a + b, c: `c` is an operand of nothing, `t` is derived. */
const fieldsList = (): Record<string, unknown>[] => [jsonCopy(base("a")), jsonCopy(base("b")), jsonCopy(derived("t", ["a", "b"])), jsonCopy(base("c"))] as unknown as Record<string, unknown>[];

describe("readSchema reads every place once: the first value is the one that is checked and the one that is used", () => {
  const places: Place[] = [];
  places.push({ name: "root.fields", build: (put) => { const raw: Record<string, unknown> = {}; put(raw, "fields"); return raw; }, valids: [fieldsList(), [jsonCopy(base("z"))]] });
  places.push({ name: "fields[3] (the element)", build: (put) => { const list = fieldsList(); put(list as unknown as Record<number, unknown>, 3); return { fields: list }; }, valids: [jsonCopy(base("c")), jsonCopy(base("q"))] });
  for (const [key, valids] of [
    ["kind", ["base"]],
    ["id", ["c", "q"]],
    ["label", ["a label"]],
    ["unit", ["days", "hours"]],
    ["baseline", [{ lo: 0, hi: null }, { lo: 5, hi: 9 }]],
    ["sum", [undefined, ["a", "b"]]],
  ] as const) {
    places.push({ name: `fields[3].${key} (a base field)`, build: (put) => { const list = fieldsList(); put(list[3] as Record<string, unknown>, key); return { fields: list }; }, valids });
  }
  for (const [key, valids] of [
    ["kind", ["derived"]],
    ["id", ["t", "u"]],
    ["label", ["a label"]],
    ["unit", ["days", "hours"]],
    ["baseline", [undefined, { lo: 0, hi: null }]],
    ["sum", [["a", "b"], ["b", "a"], ["a", "c"]]],
  ] as const) {
    places.push({ name: `fields[2].${key} (a derived field)`, build: (put) => { const list = fieldsList(); put(list[2] as Record<string, unknown>, key); return { fields: list }; }, valids });
  }
  for (const key of ["lo", "hi"]) {
    places.push({ name: `fields[3].baseline.${key}`, build: (put) => { const list = fieldsList(); put((list[3] as { baseline: Record<string, unknown> }).baseline, key); return { fields: list }; }, valids: [0, 5, null, -2] });
  }
  places.push({ name: "fields[2].sum[1] (an operand)", build: (put) => { const list = fieldsList(); put((list[2] as { sum: unknown[] }).sum as unknown as Record<number, unknown>, 1); return { fields: list }; }, valids: ["b", "a", "c"] });

  const tally: Tally = { runs: 0, failures: [] };
  for (const place of places) {
    it(place.name, () => {
      const here: Tally = { runs: 0, failures: [] };
      probe(place, readSchema, hostileSchema, here);
      tally.runs += here.runs;
      expect(here.failures).toEqual([]);
      expect(here.runs, "every pair was run").toBe((GENERIC_FIRSTS.length + place.valids.length) * (LATER.length + place.valids.length));
    });
  }

  it("covers every place readSchema reads: the root, the list, an element, its six properties for both kinds, a baseline's two sides, a sum's elements", () => {
    expect(places.map((p) => p.name)).toHaveLength(2 + 6 + 6 + 2 + 1);
  });
});

describe("ground reads every observation place once, and the observations list and its elements", () => {
  const SCHEMA = ORDER_DESK;
  const list = (): Record<string, unknown>[] => [jsonCopy(obs("a1", "packDays", 1, 2)), jsonCopy(obs("a2", "transitDays", 3, 5)), jsonCopy(obs("a3", "customsDays", 0, 2))] as unknown as Record<string, unknown>[];
  const hostileObservation = (r: unknown): boolean => {
    const result = r as { ok?: boolean; rejected?: { fault: { kind: string } }[]; failure?: { kind: string } };
    return result.ok === true ? (result.rejected ?? []).some((x) => x.fault.kind === "hostile-input") : result.failure?.kind === "hostile-input";
  };
  const places: Place[] = [];
  places.push({ name: "observations[1] (the element)", build: (put) => { const l = list(); put(l as unknown as Record<number, unknown>, 1); return l; }, valids: [jsonCopy(obs("a2", "transitDays", 3, 5)), jsonCopy(obs("q", "packDays", 0, 1))] });
  for (const [key, valids] of [
    ["id", ["a2", "q"]],
    ["field", ["transitDays", "packDays", "deliveryDay"]],
    ["extent", [{ lo: 3, hi: 5 }, { lo: 3, hi: 4 }]],
    ["quote", ["between 3 and 5 days", "3 days"]],
    ["source", ["a source"]],
  ] as const) {
    places.push({ name: `observations[1].${key}`, build: (put) => { const l = list(); put(l[1] as Record<string, unknown>, key); return l; }, valids });
  }
  for (const key of ["lo", "hi"]) {
    places.push({ name: `observations[1].extent.${key}`, build: (put) => { const l = list(); put((l[1] as { extent: Record<string, unknown> }).extent, key); return l; }, valids: [3, 5, null, 0] });
  }

  for (const place of places) {
    it(place.name, () => {
      const here: Tally = { runs: 0, failures: [] };
      probe(place, (raw) => ground(SCHEMA, raw), hostileObservation, here);
      expect(here.failures).toEqual([]);
      expect(here.runs, "every pair was run").toBe((GENERIC_FIRSTS.length + place.valids.length) * (LATER.length + place.valids.length));
    });
  }

  it("covers the element, its five properties and an extent's two sides", () => {
    expect(places).toHaveLength(1 + 5 + 2);
  });
});

describe("a length is read once, and the elements are read up to what it said and no further", () => {
  /** A Proxy over `target` that gives `first` then `later` for `length` and counts every other get. */
  const withLength = <T extends object>(target: T, lengths: { first: unknown; later: unknown }, seen: string[]): { proxy: T; lengthReads: () => number } => {
    let reads = 0;
    const proxy = new Proxy(target, {
      get(t, key, receiver) {
        if (key === "length") {
          reads += 1;
          return reads === 1 ? lengths.first : lengths.later;
        }
        if (typeof key === "string") seen.push(key);
        return Reflect.get(t, key, receiver);
      },
    });
    return { proxy, lengthReads: () => reads };
  };
  const LENGTHS: readonly unknown[] = [0, 1, 2, 3, 4, 5, 8, 9, 63, 64, 65, 66, 1000, 2 ** 32 - 1, 2 ** 53, Number.MAX_SAFE_INTEGER, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", null, undefined, {}, true];

  it("fields: one read of length for every first length, whatever the second one says; no element past MAX_FIELDS + 1 is read", () => {
    const failures: string[] = [];
    for (const first of LENGTHS) {
      for (const later of [0, 2, 2 ** 32 - 1, "x", undefined]) {
        const plainSeen: string[] = [];
        const plain = withLength(fieldsList(), { first, later: first }, plainSeen);
        const expected = JSON.stringify(readSchema({ fields: plain.proxy }));
        const seen: string[] = [];
        const probe = withLength(fieldsList(), { first, later }, seen);
        const got = JSON.stringify(readSchema({ fields: probe.proxy }));
        if (probe.lengthReads() !== 1) failures.push(`${String(first)}/${String(later)}: length read ${probe.lengthReads()} times`);
        if (got !== expected) failures.push(`${String(first)}/${String(later)}: ${got} but the first length alone gives ${expected}`);
        if (JSON.stringify(seen) !== JSON.stringify(plainSeen)) failures.push(`${String(first)}/${String(later)}: different elements read`);
        if (seen.length > 65 * 7) failures.push(`${String(first)}: ${seen.length} reads`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("a Proxy that claims 2**32 - 1 fields is read 65 times, not 4 billion, and is too-many-fields when what it gave was good", () => {
    const seen: string[] = [];
    const good = Array.from({ length: 65 }, (_, i) => jsonCopy(base(`b${i}`)));
    const { proxy } = withLength(good, { first: 2 ** 32 - 1, later: 0 }, seen);
    expect(readSchema({ fields: proxy })).toStrictEqual({ ok: false, fault: { kind: "too-many-fields", count: 2 ** 32 - 1, max: 64 } });
    expect(seen.filter((key) => /^\d+$/.test(key))).toEqual(Array.from({ length: 65 }, (_, i) => String(i)));
  });

  it("malformed outranks too-many-fields for an array of exactly 65 elements, and past that a malformed element beyond index 64 is not looked for", () => {
    const sixtyFive = Array.from({ length: 65 }, (_, i) => jsonCopy(base(`b${i}`))) as unknown as Record<string, unknown>[];
    (sixtyFive[64] as Record<string, unknown>)["kind"] = "oops";
    expect(readSchema({ fields: sixtyFive })).toStrictEqual({ ok: false, fault: { kind: "malformed", fields: ["fields[64].kind"] } });
    const sixtySix = [...sixtyFive, jsonCopy(base("late"))] as Record<string, unknown>[];
    (sixtySix[64] as Record<string, unknown>)["kind"] = "base";
    (sixtySix[65] as Record<string, unknown>)["kind"] = "oops";
    expect(readSchema({ fields: sixtySix })).toStrictEqual({ ok: false, fault: { kind: "too-many-fields", count: 66, max: 64 } });
  });

  it("a sum's length is read once, and elements are read only when the count is in range", () => {
    const failures: string[] = [];
    for (const first of [0, 1, 2, 3, 8, 9, 2 ** 32 - 1, -1, 1.5, "2", undefined]) {
      for (const later of [2, 0, 99, "x"]) {
        const seen: string[] = [];
        const list = fieldsList();
        const wrapped = withLength(["a", "b"], { first, later }, seen);
        (list[2] as { sum: unknown }).sum = wrapped.proxy;
        const plainSeen: string[] = [];
        const plainList = fieldsList();
        (plainList[2] as { sum: unknown }).sum = withLength(["a", "b"], { first, later: first }, plainSeen).proxy;
        const got = JSON.stringify(readSchema({ fields: list }));
        const expected = JSON.stringify(readSchema({ fields: plainList }));
        if (wrapped.lengthReads() !== 1) failures.push(`${String(first)}/${String(later)}: ${wrapped.lengthReads()} reads`);
        if (got !== expected) failures.push(`${String(first)}/${String(later)}: ${got} vs ${expected}`);
        if (typeof first === "number" && first > 8 && seen.length > 0) failures.push(`${String(first)}: elements were read for an out-of-range count`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("observations: one read of length for every first length; more than MAX_OBSERVATIONS reads no element at all", () => {
    const failures: string[] = [];
    for (const first of LENGTHS) {
      for (const later of [0, 2, 2 ** 32 - 1, "x", undefined]) {
        const plainSeen: string[] = [];
        const make = (): Record<string, unknown>[] => [jsonCopy(obs("a1", "packDays", 1, 2)), jsonCopy(obs("a2", "transitDays", 3, 5))] as unknown as Record<string, unknown>[];
        const expected = JSON.stringify(ground(ORDER_DESK, withLength(make(), { first, later: first }, plainSeen).proxy));
        const seen: string[] = [];
        const wrapped = withLength(make(), { first, later }, seen);
        const got = JSON.stringify(ground(ORDER_DESK, wrapped.proxy));
        if (wrapped.lengthReads() > 1) failures.push(`${String(first)}/${String(later)}: ${wrapped.lengthReads()} reads of length`);
        if (got !== expected) failures.push(`${String(first)}/${String(later)}: ${got} vs ${expected}`);
        if (typeof first === "number" && first > 64 && seen.length > 0) failures.push(`${String(first)}: elements were read`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("exactly which keys are read, in which order: a Proxy that logs every trap", () => {
  /** Wrap every object and array in `value` in a Proxy that logs `get:<path>` and any other trap by name. */
  function logged(value: unknown, log: string[], path = "$"): unknown {
    if (typeof value !== "object" || value === null) return value;
    const wrapped = Array.isArray(value) ? value.map((x, i) => logged(x, log, `${path}.${i}`)) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, logged(v, log, `${path}.${k}`)]));
    const note = (trap: string) => (): never => {
      log.push(`${trap}:${path}`);
      throw new Error(`unexpected ${trap}`);
    };
    return new Proxy(wrapped, {
      get(t, key, receiver) {
        log.push(`get:${path}${typeof key === "string" ? `.${key}` : "(symbol)"}`);
        return Reflect.get(t, key, receiver);
      },
      has: note("has"),
      ownKeys: note("ownKeys"),
      getOwnPropertyDescriptor: note("getOwnPropertyDescriptor"),
      getPrototypeOf: note("getPrototypeOf"),
      set: note("set"),
      defineProperty: note("defineProperty"),
      deleteProperty: note("deleteProperty"),
    });
  }

  it("readSchema: fields, its length, each element, the six properties in order, a baseline's lo and hi, a sum's length and elements; nothing else", () => {
    const log: string[] = [];
    const result = readSchema(logged(schemaOf(base("a"), derived("t", ["a", "b"]), base("b", 1, 5)), log));
    expect(result.ok).toBe(true);
    const props = ["kind", "id", "label", "unit", "baseline", "sum"];
    const expected = [
      "get:$.fields",
      "get:$.fields.length",
      "get:$.fields.0",
      ...props.map((p) => `get:$.fields.0.${p}`),
      "get:$.fields.0.baseline.lo",
      "get:$.fields.0.baseline.hi",
      "get:$.fields.1",
      ...props.map((p) => `get:$.fields.1.${p}`),
      "get:$.fields.1.sum.length",
      "get:$.fields.1.sum.0",
      "get:$.fields.1.sum.1",
      "get:$.fields.2",
      ...props.map((p) => `get:$.fields.2.${p}`),
      "get:$.fields.2.baseline.lo",
      "get:$.fields.2.baseline.hi",
    ];
    expect(log).toEqual(expected);
  });

  it("readSchema: the same keys are read, once each, when the schema is refused (a base field with a sum, an extent that is inverted, a bad id)", () => {
    const log: string[] = [];
    const bad = schemaOf(base("a"), derived("t", ["a", "b"]), base("b"));
    (bad.fields[0] as unknown as Record<string, unknown>)["sum"] = ["x", "y"];
    (bad.fields[2] as unknown as { baseline: { lo: number; hi: number } }).baseline = { lo: 5, hi: 1 };
    (bad.fields[1] as unknown as Record<string, unknown>)["id"] = 7;
    expect(readSchema(logged(bad, log))).toMatchObject({ ok: false, fault: { kind: "malformed" } });
    const counts = new Map<string, number>();
    for (const entry of log) counts.set(entry, (counts.get(entry) ?? 0) + 1);
    expect([...counts.values()].filter((n) => n !== 1)).toEqual([]);
    expect(log.every((entry) => entry.startsWith("get:"))).toBe(true);
  });

  it("ground: the list, its length, each element and its five properties, then each extent's lo and hi; nothing else", () => {
    const log: string[] = [];
    const result = ground(ORDER_DESK, logged([obs("a1", "packDays", 1, 2), obs("a2", "transitDays", 3, 5)], log));
    expect(result.ok).toBe(true);
    const props = ["id", "field", "extent", "quote", "source"];
    expect(log).toEqual([
      "get:$.length",
      "get:$.0",
      ...props.map((p) => `get:$.0.${p}`),
      "get:$.1",
      ...props.map((p) => `get:$.1.${p}`),
      "get:$.0.extent.lo",
      "get:$.0.extent.hi",
      "get:$.1.extent.lo",
      "get:$.1.extent.hi",
    ]);
  });

  it("ground: a duplicate's extent is never looked at, and a refused observation's properties are still each read once", () => {
    const log: string[] = [];
    ground(ORDER_DESK, logged([obs("same", "packDays", 1, 2), obs("same", "transitDays", 3, 5), obs("ok", "customsDays", 0, 2)], log));
    expect(log.filter((e) => e.includes(".extent.lo"))).toEqual(["get:$.2.extent.lo"]);
    expect(log.filter((e) => e.startsWith("get:$.1.")).length).toBe(5);
  });
});

describe("a read that throws, and what the refusal says", () => {
  const throwing = (path: string[], message: string) => {
    const raw = jsonCopy(schemaOf(base("a"), base("b"), derived("t", ["a", "b"]), base("c"))) as unknown as Record<string, any>;
    let holder: any = raw;
    for (const key of path.slice(0, -1)) holder = holder[key];
    Object.defineProperty(holder, path[path.length - 1] as string, {
      enumerable: true,
      get() {
        throw new Error(message);
      },
    });
    return raw;
  };
  const CASES: readonly [string[], string][] = [
    [["fields"], "reading fields threw"],
    [["fields", "3"], "reading fields[3] threw"],
    [["fields", "3", "kind"], "reading fields[3].kind threw"],
    [["fields", "3", "id"], "reading fields[3].id threw"],
    [["fields", "3", "label"], "reading fields[3].label threw"],
    [["fields", "3", "unit"], "reading fields[3].unit threw"],
    [["fields", "3", "baseline"], "reading fields[3].baseline threw"],
    [["fields", "3", "sum"], "reading fields[3].sum threw"],
    [["fields", "3", "baseline", "lo"], "reading fields[3].baseline threw"],
    [["fields", "3", "baseline", "hi"], "reading fields[3].baseline threw"],
    [["fields", "2", "sum", "1"], "reading fields[2].sum[1] threw"],
  ];
  for (const [path, message] of CASES) {
    it(`a getter that throws at ${path.join(".")}: hostile-input naming it, and no more of the input is read`, () => {
      const result = readSchema(throwing(path, "SECRET-THROWN-VALUE"));
      expect(result).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message } });
      expect(JSON.stringify(result)).not.toContain("SECRET");
    });
  }

  it("a throw outranks malformed: an earlier malformed field does not hide a later hostile read", () => {
    const raw = throwing(["fields", "3", "unit"], "x");
    (raw["fields"] as Record<string, unknown>[])[0]!["kind"] = "oops";
    expect(readSchema(raw)).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading fields[3].unit threw" } });
  });

  it("a revoked Proxy as the schema, as the list, as an element, and as a sum", () => {
    const revoked = (): unknown => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      return proxy;
    };
    const revokedArray = (): unknown => {
      const { proxy, revoke } = Proxy.revocable([], {});
      revoke();
      return proxy;
    };
    expect(readSchema(revoked())).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading schema threw" } });
    expect(readSchema({ fields: revokedArray() })).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading fields threw" } });
    expect(readSchema({ fields: [revoked()] })).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading fields[0] threw" } });
    const list = fieldsList();
    (list[2] as { sum: unknown }).sum = revokedArray();
    expect(readSchema({ fields: list })).toStrictEqual({ ok: false, fault: { kind: "hostile-input", message: "reading fields[2].sum threw" } });
  });

  it("a getter on a class prototype is read once per read, like an own property", () => {
    let reads = 0;
    class Holder {
      get fields(): unknown {
        reads += 1;
        return [jsonCopy(base("a"))];
      }
    }
    expect(readSchema(new Holder()).ok).toBe(true);
    expect(reads).toBe(1);
  });
});

describe("neither function ever throws, whatever it is given", () => {
  const JUNK: readonly unknown[] = [undefined, null, 0, -0, 1, -1, 1.5, Number.NaN, Infinity, -Infinity, "", "x", "fields", true, false, 5n, Symbol("s"), () => 1, [], {}, [[]], [{}], { fields: 1 }, { lo: 1 }, coercionBomb];

  /** A Proxy whose every trap throws, returns junk, or defers, chosen at random. */
  function chaos(rng: Rng, depth: number): unknown {
    const target = chance(rng, 0.5) ? [] : {};
    return new Proxy(target, {
      get(t, key, receiver) {
        const roll = rng();
        if (roll < 0.2) throw new Error("chaos");
        if (roll < 0.5) return pick(rng, JUNK);
        if (roll < 0.65 && depth < 3) return chaos(rng, depth + 1);
        return Reflect.get(t, key, receiver);
      },
      has() {
        throw new Error("has");
      },
      ownKeys() {
        throw new Error("ownKeys");
      },
      getPrototypeOf() {
        throw new Error("getPrototypeOf");
      },
    });
  }

  function junk(rng: Rng, depth: number): unknown {
    const roll = rng();
    if (roll < 0.3 || depth > 3) return pick(rng, JUNK);
    if (roll < 0.4) return chaos(rng, 0);
    if (roll < 0.7) return Array.from({ length: int(rng, 0, 5) }, () => junk(rng, depth + 1));
    const out: Record<string, unknown> = {};
    for (const key of ["fields", "kind", "id", "label", "unit", "baseline", "sum", "lo", "hi", "field", "extent", "quote", "source"]) if (chance(rng, 0.4)) out[key] = junk(rng, depth + 1);
    return out;
  }

  const seenJunk = { results: 0, kinds: new Set<string>() };
  for (let chunk = 0; chunk < 5; chunk++) {
    const from = chunk * 1000 + 1;
    it(`seeds ${from} to ${from + 999}: random values as the schema and as the observations: always a typed result, never a throw`, () => {
      for (let seed = from; seed < from + 1000; seed++) {
        const rng = mulberry32(seed);
        const raw = junk(rng, 0);
        const schema = readSchema(raw);
        expect(typeof schema.ok).toBe("boolean");
        const out = ground(chance(rng, 0.5) ? raw : ORDER_DESK, junk(rng, 0));
        expect(typeof out.ok).toBe("boolean");
        if (!schema.ok) seenJunk.kinds.add(schema.fault.kind);
        seenJunk.results += 2;
      }
    });
  }

  it("all 10 000 calls were made, and the junk reached malformed (needs the five tests above to have run)", () => {
    expect(seenJunk.results, "do not filter this file with -t").toBe(10000);
    expect(seenJunk.kinds.has("malformed")).toBe(true);
  });

  for (let chunk = 0; chunk < 5; chunk++) {
    const from = chunk * 1000 + 1;
    it(`seeds ${from} to ${from + 999}: a valid schema with random observation lists of junk elements: each element is accepted or refused, none throws`, () => {
      for (let seed = from; seed < from + 1000; seed++) {
        const rng = mulberry32(seed);
        const list = Array.from({ length: int(rng, 0, 6) }, () => (chance(rng, 0.2) ? obs(`o${int(rng, 0, 3)}`, pick(rng, ["packDays", "ghost"]), int(rng, -2, 4), int(rng, 4, 8)) : junk(rng, 0)));
        const out = ground(ORDER_DESK, list);
        if (out.ok) expect(out.rejected.length + out.grounding.observations.length).toBe(list.length);
      }
    });
  }
});
