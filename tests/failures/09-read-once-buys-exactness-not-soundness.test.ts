import { describe, expect, it } from "vitest";
import { ground } from "../../lib/ground/index.js";
import { baseField, groundOk, mulberry32, schemaOf, sumField } from "./helpers.js";

/**
 * KIND: PROVES THE RESTRICTION EARNS ITS KEEP, DISCLOSES THAT IT OVER-RESTRICTS (plan section 11, case 09).
 * TRACES TO: D4 (exact over a decidable fragment: integer extents over READ-ONCE sum trees).
 *
 * WHAT IS PROVED AND WHAT IS DISCLOSED.
 * (a) `ground` rejects the diamond (`x = a + b`, `y = a + c`, `z = x + y`, so `a` reaches `z` twice) as `operand-reused`
 *     naming `a`. The lib is never asked to propagate over a diamond.
 * (b) A hand-rolled interval propagator written INSIDE THIS TEST (plain numbers; it calls nothing in `lib/`) is run on the
 *     diamond against a brute-force enumerator written here too. On the diamond with `c <= 4`, `z` in [3, 7] and `b` in [0, 6]
 *     it reports `a` in [0, 7] where the enumerator says [0, 3]: propagation off a tree is SOUND BUT LOOSE. Over seeded random
 *     diamonds it is never unsound (no world's value lies outside its extents) and never misses an inconsistency, and it is
 *     looser than the enumerator in a stated share of instances. So what read-once buys is TIGHTNESS (the tightest entailed
 *     claim, D5) and the right to CLAIM complete conflict detection, not safety.
 * (c) `ground` also rejects `x = a + b`, `y = a + c` (`operand-reused`), although the same hand-rolled propagator is EXACT on
 *     it over the same kind of random instances: the rule is stricter than it needs to be, DISCLOSED and not relaxed. And the
 *     propagator is exact on a read-once tree, which is the control that shows the harness can tell exact from loose.
 *
 * WHAT WOULD MAKE THIS FAIL: (a) and (c): `ground` accepting a shared operand (the rule deleted or narrowed to the diamond: the
 * rejections go red); (b): nothing in `lib/` can turn it red, by design, because it runs no lib code; it is red if the
 * propagator became exact on the diamond (the loose example and `inexact > 0` go red) or if the enumerator disagreed with the
 * stated example. Its own teeth are the exact-on-a-tree control and the exact-on-shared control in the same file: a harness
 * that reported every instance loose, or every instance exact, would fail one of the three.
 */

type Interval = { lo: number; hi: number };

interface Model {
  readonly bases: readonly string[];
  readonly sums: readonly (readonly [string, readonly string[]])[];
  readonly names: readonly string[];
}

const DIAMOND: Model = { bases: ["a", "b", "c"], sums: [["x", ["a", "b"]], ["y", ["a", "c"]], ["z", ["x", "y"]]], names: ["a", "b", "c", "x", "y", "z"] };
const SHARED: Model = { bases: ["a", "b", "c"], sums: [["x", ["a", "b"]], ["y", ["a", "c"]]], names: ["a", "b", "c", "x", "y"] };
const TREE: Model = { bases: ["a", "b", "c"], sums: [["x", ["a", "b"]], ["z", ["x", "c"]]], names: ["a", "b", "c", "x", "z"] };

/** Bounds propagation, forward and backward over every sum, to a fixpoint. `undefined` when some domain is empty. */
function propagate(model: Model, cap: number, boxes: ReadonlyMap<string, Interval>): Map<string, Interval> | undefined {
  const window = 4 * cap;
  const domain = new Map<string, Interval>();
  for (const name of model.names) {
    const base = model.bases.includes(name);
    const box = boxes.get(name);
    const lo = Math.max(0, box?.lo ?? 0);
    const hi = Math.min(base ? cap : window, box?.hi ?? window);
    if (lo > hi) return undefined;
    domain.set(name, { lo, hi });
  }
  const get = (name: string): Interval => domain.get(name) as Interval;
  for (let pass = 0; pass < 200; pass += 1) {
    let moved = false;
    const narrow = (name: string, lo: number, hi: number): boolean => {
      const current = get(name);
      const next = { lo: Math.max(current.lo, lo), hi: Math.min(current.hi, hi) };
      if (next.lo > next.hi) return false;
      if (next.lo !== current.lo || next.hi !== current.hi) moved = true;
      domain.set(name, next);
      return true;
    };
    for (const [result, operands] of model.sums) {
      const sumLo = operands.reduce((total, name) => total + get(name).lo, 0);
      const sumHi = operands.reduce((total, name) => total + get(name).hi, 0);
      if (!narrow(result, sumLo, sumHi)) return undefined;
      for (const operand of operands) {
        const othersLo = operands.filter((o) => o !== operand).reduce((total, name) => total + get(name).lo, 0);
        const othersHi = operands.filter((o) => o !== operand).reduce((total, name) => total + get(name).hi, 0);
        if (!narrow(operand, get(result).lo - othersHi, get(result).hi - othersLo)) return undefined;
      }
    }
    if (!moved) return domain;
  }
  throw new Error("fixture: the propagator did not settle");
}

/** Every assignment of the base fields in [0, cap]; the derived ones are the sums. The extent each name takes over the worlds that satisfy every box, or `undefined`. */
function enumerate(model: Model, cap: number, boxes: ReadonlyMap<string, Interval>): Map<string, Interval> | undefined {
  const extents = new Map<string, Interval>();
  const values = new Map<string, number>();
  const walk = (index: number): void => {
    if (index < model.bases.length) {
      for (let v = 0; v <= cap; v += 1) {
        values.set(model.bases[index] as string, v);
        walk(index + 1);
      }
      return;
    }
    for (const [result, operands] of model.sums) values.set(result, operands.reduce((total, name) => total + (values.get(name) as number), 0));
    for (const name of model.names) {
      const box = boxes.get(name);
      const v = values.get(name) as number;
      if (box !== undefined && (v < box.lo || v > box.hi)) return;
    }
    for (const name of model.names) {
      const v = values.get(name) as number;
      const seen = extents.get(name);
      extents.set(name, seen === undefined ? { lo: v, hi: v } : { lo: Math.min(seen.lo, v), hi: Math.max(seen.hi, v) });
    }
  };
  walk(0);
  return extents.size === 0 ? undefined : extents;
}

interface Tally {
  instances: number;
  consistent: number;
  unsound: number;
  missedInconsistency: number;
  inexact: number;
}

function sweep(model: Model, cap: number, seed: number, instances: number): Tally {
  const random = mulberry32(seed);
  const int = (max: number): number => Math.floor(random() * (max + 1));
  const tally: Tally = { instances, consistent: 0, unsound: 0, missedInconsistency: 0, inexact: 0 };
  for (let i = 0; i < instances; i += 1) {
    const boxes = new Map<string, Interval>();
    for (const name of model.names) {
      if (random() < 0.6) {
        const top = model.bases.includes(name) ? cap : 4 * cap;
        const lo = int(top);
        boxes.set(name, { lo, hi: Math.min(top, lo + int(top)) });
      }
    }
    const truth = enumerate(model, cap, boxes);
    const propagated = propagate(model, cap, boxes);
    if (truth === undefined) {
      if (propagated !== undefined) tally.missedInconsistency += 1;
      continue;
    }
    tally.consistent += 1;
    if (propagated === undefined) {
      tally.unsound += 1;
      continue;
    }
    let unsound = false;
    let exact = true;
    for (const name of model.names) {
      const t = truth.get(name) as Interval;
      const p = propagated.get(name) as Interval;
      if (t.lo < p.lo || t.hi > p.hi) unsound = true;
      if (t.lo !== p.lo || t.hi !== p.hi) exact = false;
    }
    if (unsound) tally.unsound += 1;
    else if (!exact) tally.inexact += 1;
  }
  return tally;
}

/** Counts of the seeded sweeps below (cap 6, seeds 9, 10 and 11), read off a run: they change only if the generator or the propagator does. */
const DIAMOND_CONSISTENT = 3016;
const DIAMOND_INEXACT = 757;
const SHARED_CONSISTENT = 3563;
const TREE_CONSISTENT = 4154;

const refusal = (operand: string) => ({ ok: false, failure: { kind: "invalid-schema", fault: { kind: "operand-reused", operand } } });

describe("09 read-once buys exactness, not soundness", () => {
  it("(a) ground rejects the diamond x = a + b, y = a + c, z = x + y as operand-reused naming a, and accepts the read-once tree", () => {
    const diamond = schemaOf(baseField("a"), baseField("b"), baseField("c"), sumField("x", ["a", "b"]), sumField("y", ["a", "c"]), sumField("z", ["x", "y"]));
    expect(ground(diamond, [])).toEqual(refusal("a"));
    const tree = schemaOf(baseField("a"), baseField("b"), baseField("c"), sumField("x", ["a", "b"]), sumField("z", ["x", "c"]));
    expect(groundOk(tree, []).trees.map((t) => t.root)).toEqual(["z"]);
  });

  it("(b) the plan's example: on the diamond with c <= 4, z in [3, 7] and b in [0, 6] the propagator reports a in [0, 7] and the enumerator says [0, 3]", () => {
    const boxes = new Map<string, Interval>([
      ["c", { lo: 0, hi: 4 }],
      ["z", { lo: 3, hi: 7 }],
      ["b", { lo: 0, hi: 6 }],
    ]);
    expect(propagate(DIAMOND, 20, boxes)?.get("a")).toEqual({ lo: 0, hi: 7 });
    expect(enumerate(DIAMOND, 20, boxes)?.get("a")).toEqual({ lo: 0, hi: 3 });
  });

  it("(b) over 8 000 seeded random diamonds the propagator is never unsound and never misses an inconsistency, and is looser than brute force in a stated share", () => {
    const tally = sweep(DIAMOND, 6, 9, 8000);
    expect(tally).toEqual({ instances: 8000, consistent: DIAMOND_CONSISTENT, unsound: 0, missedInconsistency: 0, inexact: DIAMOND_INEXACT });
    expect(tally.inexact).toBeGreaterThan(0);
  });

  it("(c) ground also rejects x = a + b, y = a + c as operand-reused naming a, although the propagator is exact on it over 8 000 random instances", () => {
    const shared = schemaOf(baseField("a"), baseField("b"), baseField("c"), sumField("x", ["a", "b"]), sumField("y", ["a", "c"]));
    expect(ground(shared, [])).toEqual(refusal("a"));
    const tally = sweep(SHARED, 6, 10, 8000);
    expect(tally).toEqual({ instances: 8000, consistent: SHARED_CONSISTENT, unsound: 0, missedInconsistency: 0, inexact: 0 });
  });

  it("the control: the same propagator and enumerator agree exactly on a read-once tree, so the harness can tell exact from loose", () => {
    const tally = sweep(TREE, 6, 11, 8000);
    expect(tally).toEqual({ instances: 8000, consistent: TREE_CONSISTENT, unsound: 0, missedInconsistency: 0, inexact: 0 });
    expect(tally.consistent).toBeGreaterThan(1000);
  });
});
