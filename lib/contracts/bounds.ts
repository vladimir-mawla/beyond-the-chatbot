/**
 * One end of an integer extent: a number, or `null` for "unbounded on that side".
 *
 * `null` and never `undefined`, `Infinity` or a large sentinel: it survives JSON, it cannot be confused with
 * an absent field, and it can never be read as `0` by accident (`.genesis/PLAN.md` section 6, M3 "must refuse
 * `null` treated as `0` anywhere").
 */
export type Bound = number | null;

/**
 * An integer extent `[lo, hi]`; a `null` side is unbounded. Used for a schema's baseline, an observation, a
 * claim, and every `established` and `tested` extent an `Entailment` carries.
 *
 * HONEST LIMIT. THE TYPE CANNOT SAY WHAT THE EXTENT MEANS. It admits `lo > hi`, a non-integer, `NaN`,
 * `Infinity` and a magnitude above `MAX_MAGNITUDE`: all are plain `number`s. `{ lo: 5, hi: 1 }` compiles under
 * both tsconfigs (pinned in `__tests__/honest-limits.test.ts`). The plan assigns the refusal to M3's
 * `checkExtent` (`inverted`, `bound-not-an-integer`, `bound-out-of-range`), which is not built; until it is,
 * nothing in this repository refuses such a value, and a hand-built `Extent` is trusted by every reader.
 */
export interface Extent {
  readonly lo: Bound;
  readonly hi: Bound;
}

/** A side of an extent. */
export type Side = "lo" | "hi";
