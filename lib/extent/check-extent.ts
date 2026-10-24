import { MAX_MAGNITUDE } from "../contracts/index.js";
import type { Bound, Extent, Side } from "../contracts/index.js";

/**
 * The verdict of `checkExtent`. `side` names the offending bound for the two `bound-*` reasons and is absent
 * for every other reason (not "present and undefined": `exactOptionalPropertyTypes` is on, and a test pins the
 * exact shape).
 */
export type ExtentCheck =
  | { readonly ok: true; readonly extent: Extent } // a fresh, read-once copy
  | {
      readonly ok: false;
      readonly reason: "not-an-object" | "bound-not-an-integer" | "bound-out-of-range" | "inverted" | "hostile-input";
      readonly side?: Side;
    };

type BoundRead =
  | { readonly ok: true; readonly bound: Bound }
  | { readonly ok: false; readonly reason: "bound-not-an-integer" | "bound-out-of-range" };

/**
 * One raw bound, already read. `null` is the ONLY spelling of "unbounded": `undefined` (a missing field) is not
 * an integer, so an extent with a side left out is refused instead of being read as unbounded, and nothing here
 * ever turns `null` into `0` (an unbounded side read as zero would turn "at least 4" into "exactly 4").
 *
 * The `typeof` test is deliberate: no coercion happens, so a boxed `new Number(3)`, a string `"3"`, a bigint
 * and an object with a `valueOf` are all refused and `valueOf` is never called.
 */
function readBound(value: unknown): BoundRead {
  if (value === null) return { ok: true, bound: null };
  // `Number.isInteger` is false for NaN and for both infinities, so those are refused here, as not-an-integer.
  if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false, reason: "bound-not-an-integer" };
  if (Math.abs(value) > MAX_MAGNITUDE) return { ok: false, reason: "bound-out-of-range" };
  // `-0 === 0`, so this turns -0 into 0. `Object.is(-0, 0)` is false (and so is vitest's `toEqual`), while
  // `-0 === 0` and `JSON.stringify` cannot tell them apart: without this, two extents that are equal could
  // compare unequal depending on how they are compared.
  return { ok: true, bound: value === 0 ? 0 : value };
}

/**
 * Turn an untrusted value into an `Extent`, or say why not. Never throws.
 *
 * THE VALUE IS READ ONCE. `raw.lo` and `raw.hi` are each read exactly one time, in that order, and everything
 * after that works on the two plain values and never touches `raw` again. A getter (or a Proxy `get` trap) that
 * answers differently on a second read therefore cannot make the checked value differ from the returned one:
 * the check and the copy are made from the same single read. Nothing else on `raw` is looked at, so an extra
 * property, a throwing getter on one, or an inherited one is never read.
 *
 * Precedence, first match wins: `not-an-object` (not an object, or an array) > `hostile-input` (reading a side
 * threw) > the `lo` bound (`bound-not-an-integer` before `bound-out-of-range`) > the same for `hi` > `inverted`.
 * Both sides are read before either is judged, so a refusal never depends on which side happened to be read
 * last.
 *
 * An array is refused as `not-an-object`: it is an object in JavaScript but not the `{ lo, hi }` record
 * `Extent` is, and without this it would be reported as a missing `lo`, which blames the wrong thing.
 */
export function checkExtent(raw: unknown): ExtentCheck {
  let rawLo: unknown;
  let rawHi: unknown;
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "not-an-object" };
    const record = raw as { readonly lo?: unknown; readonly hi?: unknown };
    rawLo = record.lo;
    rawHi = record.hi;
  } catch {
    // A getter, a Proxy trap, or `Array.isArray` on a revoked Proxy threw. Whatever was thrown, the input is
    // refused with one reason; the thrown value is not inspected (it is as untrusted as the input).
    return { ok: false, reason: "hostile-input" };
  }

  const lo = readBound(rawLo);
  if (!lo.ok) return { ok: false, reason: lo.reason, side: "lo" };
  const hi = readBound(rawHi);
  if (!hi.ok) return { ok: false, reason: hi.reason, side: "hi" };

  // `lo > hi` only means something when both sides are bounded: `{ lo: null, hi: -5 }` is a fine extent.
  if (lo.bound !== null && hi.bound !== null && lo.bound > hi.bound) return { ok: false, reason: "inverted" };
  return { ok: true, extent: { lo: lo.bound, hi: hi.bound } };
}
