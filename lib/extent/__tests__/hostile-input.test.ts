import { describe, expect, it } from "vitest";
import { checkExtent } from "../index.js";

/**
 * `checkExtent` against input that fights back. The claim under test, from `.genesis/PLAN.md` section 6 M3:
 * "each field of the raw object is read EXACTLY ONCE into a fresh copy", and it never throws. A read is counted
 * with a getter and, for the stronger claim that NOTHING ELSE on the raw value is touched, with a Proxy that
 * logs every trap it receives.
 *
 * What a test here cannot show: that every way JavaScript has of observing an object is covered. It covers the
 * ones below (getters on the object and on its prototype, Proxy traps, coercion hooks, a thrown value, a revoked
 * Proxy); it does not claim more.
 */

const GETS = ["get:lo", "get:hi"];

/** A Proxy that logs every trap it is given, so a test can say exactly what was touched. */
function logged(target: object, log: string[], onGet?: (key: string | symbol) => unknown): object {
  const note =
    (name: string) =>
    (...args: unknown[]): unknown => {
      const key = args[1];
      log.push(typeof key === "string" ? `${name}:${key}` : typeof key === "symbol" ? `${name}:${String(key.description)}(symbol)` : name);
      return undefined;
    };
  const handler: ProxyHandler<object> = {
    get(t, key, receiver) {
      note("get")(t, key);
      return onGet === undefined ? Reflect.get(t, key, receiver) : onGet(key);
    },
    has(t, key) {
      note("has")(t, key);
      return Reflect.has(t, key);
    },
    ownKeys(t) {
      note("ownKeys")(t);
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, key) {
      note("getOwnPropertyDescriptor")(t, key);
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    getPrototypeOf(t) {
      note("getPrototypeOf")(t);
      return Reflect.getPrototypeOf(t);
    },
    isExtensible(t) {
      note("isExtensible")(t);
      return Reflect.isExtensible(t);
    },
    set(t, key) {
      note("set")(t, key);
      return true;
    },
    defineProperty(t, key) {
      note("defineProperty")(t, key);
      return true;
    },
    deleteProperty(t, key) {
      note("deleteProperty")(t, key);
      return true;
    },
  };
  return new Proxy(target, handler);
}

describe("each side is read exactly once, lo then hi", () => {
  it("a getter on each side: one read each, in that order, for a valid extent", () => {
    const reads: string[] = [];
    const raw = {
      get lo() {
        reads.push("lo");
        return 1;
      },
      get hi() {
        reads.push("hi");
        return 2;
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(reads).toEqual(["lo", "hi"]);
  });

  it("still one read each when the extent is refused afterwards (a bad lo, an inverted pair, a bad hi)", () => {
    for (const [lo, hi] of [
      [1.5, 2],
      [5, 1],
      [1, Number.NaN],
      [2 ** 41, 2 ** 41],
    ] as const) {
      const reads: string[] = [];
      const raw = {
        get lo() {
          reads.push("lo");
          return lo;
        },
        get hi() {
          reads.push("hi");
          return hi;
        },
      };
      expect(checkExtent(raw).ok).toBe(false);
      expect(reads, `${lo}, ${hi}`).toEqual(["lo", "hi"]);
    }
  });

  it("a Proxy sees exactly two traps, get:lo and get:hi: no has, ownKeys, descriptor, prototype or toPrimitive probe", () => {
    const log: string[] = [];
    expect(checkExtent(logged({ lo: 3, hi: 4 }, log))).toStrictEqual({ ok: true, extent: { lo: 3, hi: 4 } });
    expect(log).toEqual(GETS);
  });

  it("the same two traps and no others when the Proxy's values make the extent invalid", () => {
    for (const target of [{ lo: 1.5, hi: 2 }, { lo: 5, hi: 1 }, {}, { lo: null, hi: "x" }]) {
      const log: string[] = [];
      expect(checkExtent(logged(target, log)).ok).toBe(false);
      expect(log, JSON.stringify(target)).toEqual(GETS);
    }
  });

  it("a getter on the PROTOTYPE (a class instance) is read once per side too", () => {
    let loReads = 0;
    let hiReads = 0;
    class Instance {
      get lo(): number {
        loReads += 1;
        return -4;
      }
      get hi(): number {
        hiReads += 1;
        return 4;
      }
    }
    expect(checkExtent(new Instance())).toStrictEqual({ ok: true, extent: { lo: -4, hi: 4 } });
    expect([loReads, hiReads]).toEqual([1, 1]);
  });

  it("a value that is not an object is refused without reading anything (nothing to read)", () => {
    let reads = 0;
    // `defineProperties`, not `Object.assign`: assign would call the getters itself while copying them.
    const fn = Object.defineProperties(() => 0, {
      lo: {
        get() {
          reads += 1;
          return 1;
        },
      },
      hi: {
        get() {
          reads += 1;
          return 2;
        },
      },
    });
    expect(checkExtent(fn)).toStrictEqual({ ok: false, reason: "not-an-object" });
    expect(reads).toBe(0);
  });
});

describe("the checked value is the returned value: a getter that answers differently the second time cannot split them", () => {
  /** A side that returns `first` once and `later` on every read after that. */
  function flipping(first: unknown, later: unknown): { read: () => unknown; count: () => number } {
    let n = 0;
    return {
      read: () => {
        n += 1;
        return n === 1 ? first : later;
      },
      count: () => n,
    };
  }

  it("valid on the first read, garbage afterwards: accepted, and the copy holds the FIRST values", () => {
    const lo = flipping(1, Number.NaN);
    const hi = flipping(2, -99);
    const raw = {
      get lo() {
        return lo.read();
      },
      get hi() {
        return hi.read();
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect([lo.count(), hi.count()]).toEqual([1, 1]);
  });

  it("garbage on the first read, valid afterwards: refused (a second look would have accepted it)", () => {
    const lo = flipping(1.5, 1);
    const hi = flipping(2, 2);
    const raw = {
      get lo() {
        return lo.read();
      },
      get hi() {
        return hi.read();
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: false, reason: "bound-not-an-integer", side: "lo" });
    expect([lo.count(), hi.count()]).toEqual([1, 1]);
  });

  it("inverted on the first reads, ordered afterwards: refused", () => {
    const lo = flipping(5, 0);
    const hi = flipping(1, 9);
    const raw = {
      get lo() {
        return lo.read();
      },
      get hi() {
        return hi.read();
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: false, reason: "inverted" });
  });

  it("through a Proxy whose get trap changes its answer on the second read of a key", () => {
    const seen = new Map<string | symbol, number>();
    const raw = logged({}, [], (key) => {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      if (key === "lo") return n === 1 ? 10 : Number.POSITIVE_INFINITY;
      if (key === "hi") return n === 1 ? 20 : Number.NaN;
      return undefined;
    });
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 10, hi: 20 } });
    expect([...seen.entries()]).toEqual([
      ["lo", 1],
      ["hi", 1],
    ]);
  });

  it("the returned extent is plain data: own value properties, ordinary prototype, no getter left behind", () => {
    const raw = {
      get lo() {
        return 1;
      },
      get hi() {
        return 2;
      },
    };
    const result = checkExtent(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.getPrototypeOf(result.extent)).toBe(Object.prototype);
    for (const side of ["lo", "hi"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(result.extent, side);
      expect(descriptor).toMatchObject({ writable: true, enumerable: true, configurable: true });
      expect(descriptor).not.toHaveProperty("get");
      expect(descriptor).toHaveProperty("value");
    }
  });
});

describe("a read that throws is `hostile-input`, never a throw", () => {
  const THROWN: readonly (readonly [string, () => never])[] = [
    [
      "an Error",
      () => {
        throw new Error("boom");
      },
    ],
    [
      "a string",
      () => {
        throw "boom";
      },
    ],
    [
      "null",
      () => {
        throw null;
      },
    ],
    [
      "undefined",
      () => {
        throw undefined;
      },
    ],
    [
      "a symbol",
      () => {
        throw Symbol("boom");
      },
    ],
    [
      "an object whose own getters throw too (it is never inspected)",
      () => {
        throw {
          get message(): string {
            throw new Error("inspected");
          },
          get stack(): string {
            throw new Error("inspected");
          },
          toString(): string {
            throw new Error("inspected");
          },
        };
      },
    ],
  ];
  for (const [name, thrower] of THROWN) {
    it(`lo throws ${name}`, () => {
      const raw = {
        get lo(): number {
          return thrower();
        },
        hi: 2,
      };
      expect(checkExtent(raw)).toStrictEqual({ ok: false, reason: "hostile-input" });
    });
    it(`hi throws ${name}`, () => {
      const raw = {
        lo: 1,
        get hi(): number {
          return thrower();
        },
      };
      expect(checkExtent(raw)).toStrictEqual({ ok: false, reason: "hostile-input" });
    });
  }

  it("when lo throws, hi is never read; when hi throws, lo was read once", () => {
    let hiReads = 0;
    expect(
      checkExtent({
        get lo(): number {
          throw new Error("x");
        },
        get hi() {
          hiReads += 1;
          return 2;
        },
      }),
    ).toStrictEqual({ ok: false, reason: "hostile-input" });
    expect(hiReads).toBe(0);

    let loReads = 0;
    expect(
      checkExtent({
        get lo() {
          loReads += 1;
          return 1;
        },
        get hi(): number {
          throw new Error("x");
        },
      }),
    ).toStrictEqual({ ok: false, reason: "hostile-input" });
    expect(loReads).toBe(1);
  });

  it("hostile-input outranks a bad value on the other side: the throw is reported, not the fraction", () => {
    expect(
      checkExtent({
        lo: 1.5,
        get hi(): number {
          throw new Error("x");
        },
      }),
    ).toStrictEqual({ ok: false, reason: "hostile-input" });
  });

  it("a Proxy whose get trap throws", () => {
    const raw = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
      },
    );
    expect(checkExtent(raw)).toStrictEqual({ ok: false, reason: "hostile-input" });
  });

  it("a REVOKED Proxy: even asking whether it is an array throws, and that is hostile-input too", () => {
    const { proxy, revoke } = Proxy.revocable({ lo: 1, hi: 2 }, {});
    revoke();
    expect(() => Array.isArray(proxy)).toThrow(TypeError); // the premise: the very first question throws
    expect(checkExtent(proxy)).toStrictEqual({ ok: false, reason: "hostile-input" });

    const arrayProxy = Proxy.revocable([], {});
    arrayProxy.revoke();
    expect(checkExtent(arrayProxy.proxy)).toStrictEqual({ ok: false, reason: "hostile-input" });
  });

  it("a Proxy of an array is an array: not-an-object, with no read of lo or hi", () => {
    const log: string[] = [];
    expect(checkExtent(logged([], log))).toStrictEqual({ ok: false, reason: "not-an-object" });
    expect(log).toEqual([]);
  });
});

describe("no coercion: a value is a number or it is refused, and its hooks are never called", () => {
  it("valueOf, toString and Symbol.toPrimitive on a bound are not called", () => {
    const called: string[] = [];
    const sneaky = {
      valueOf: () => {
        called.push("valueOf");
        return 1;
      },
      toString: () => {
        called.push("toString");
        return "1";
      },
      [Symbol.toPrimitive]: () => {
        called.push("toPrimitive");
        return 1;
      },
    };
    expect(checkExtent({ lo: sneaky, hi: null })).toStrictEqual({ ok: false, reason: "bound-not-an-integer", side: "lo" });
    expect(checkExtent({ lo: null, hi: sneaky })).toStrictEqual({ ok: false, reason: "bound-not-an-integer", side: "hi" });
    expect(called).toEqual([]);
  });

  it("a boxed number, a numeric string and a bigint are refused, not unwrapped", () => {
    expect(checkExtent({ lo: Object(1), hi: null }).ok).toBe(false);
    expect(checkExtent({ lo: "1", hi: null }).ok).toBe(false);
    expect(checkExtent({ lo: 1n, hi: null }).ok).toBe(false);
  });

  it("the raw value itself is never coerced: an object with throwing toString/valueOf is still just read", () => {
    const raw = {
      lo: 1,
      hi: 2,
      toString(): string {
        throw new Error("coerced");
      },
      valueOf(): number {
        throw new Error("coerced");
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
  });
});

describe("only lo and hi are looked at", () => {
  it("a throwing getter on an extra key is never triggered", () => {
    let triggered = false;
    const raw = {
      lo: 1,
      hi: 2,
      get quote(): string {
        triggered = true;
        throw new Error("read");
      },
      get toJSON(): () => string {
        triggered = true;
        throw new Error("read");
      },
      get then(): () => void {
        triggered = true;
        throw new Error("read");
      },
    };
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(triggered).toBe(false);
  });

  it("an own `__proto__` key from JSON.parse is data, not a prototype: the result is unaffected and nothing is polluted", () => {
    const raw: unknown = JSON.parse('{"__proto__": {"lo": 9, "hi": 99}, "lo": 1, "hi": 2}');
    expect(checkExtent(raw)).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(({} as { lo?: unknown }).lo).toBeUndefined();
  });

  it("a prototype-polluting key in the result's source cannot reach the result", () => {
    const result = checkExtent(JSON.parse('{"lo": 1, "hi": 2, "constructor": {"prototype": {"lo": 7}}}'));
    expect(result).toStrictEqual({ ok: true, extent: { lo: 1, hi: 2 } });
    expect(({} as { lo?: unknown }).lo).toBeUndefined();
  });
});

describe("it never throws, whatever it is given", () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const MESSY: readonly unknown[] = [
    undefined,
    null,
    0,
    -0,
    NaN,
    Infinity,
    "",
    "lo",
    Symbol("s"),
    10n,
    {},
    [],
    () => {},
    class {},
    new Date(0),
    new Map([["lo", 1]]),
    new Set([1]),
    /lo/u,
    Promise.resolve(),
    new Error("e"),
    Object.create(null),
    new Proxy({}, {}),
    new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
        has() {
          throw new Error("trap");
        },
        ownKeys() {
          throw new Error("trap");
        },
      },
    ),
    revoked.proxy,
    { lo: {}, hi: [] },
    { lo: () => 1, hi: () => 2 },
    { get lo(): number { throw new Error("g"); } },
  ];
  it("returns an ok boolean verdict for every one of them", () => {
    for (const value of MESSY) {
      const result = checkExtent(value);
      expect(typeof result.ok).toBe("boolean");
    }
  });
});
