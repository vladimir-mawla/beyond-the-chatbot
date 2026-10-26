import type { Extent, FieldDecl, Observation, Schema } from "../contracts/index.js";
import { compareIds } from "../contracts/index.js";
import { isSameExtent, meet, sumBackward, sumForward } from "../extent/index.js";
import { rootOf } from "./decl.js";

/**
 * What propagation needs to know about a schema that `readSchema` has already validated. Built from a `Schema`
 * (never from raw input) and never stored in the `Grounding`: the `Grounding` is plain data, and this is rebuilt
 * from its `schema` whenever a function needs it. `Map`s are fine here because nothing in it is returned.
 */
export interface Structure {
  /** Every declared field, by id. */
  readonly decls: ReadonlyMap<string, FieldDecl>;
  /** An operand to the derived field it is an operand of (read-once: a field has at most one). */
  readonly parent: ReadonlyMap<string, string>;
  /** Every field id, ascending in code-unit order. */
  readonly ids: readonly string[];
}

/** One observation as propagation sees it: a field and an extent. Ids, quotes and sources play no part. */
export interface Constraint {
  readonly field: string;
  readonly extent: Extent;
}

export type Solved =
  | {
      readonly kind: "consistent";
      /** The extent of every field of the tree, in the order of the `fields` argument. */
      readonly extents: ReadonlyMap<string, Extent>;
      /** Passes run, counting the last one, which changed nothing. Test and ADR evidence; never part of a result. */
      readonly passes: number;
    }
  | { readonly kind: "conflicted"; readonly passes: number };

/** A connected component of the sum rules: its root, and every field in it, ascending. */
export interface Component {
  readonly root: string;
  readonly members: readonly string[];
}

export function structureOf(schema: Schema): Structure {
  const decls = new Map<string, FieldDecl>();
  const parent = new Map<string, string>();
  for (const decl of schema.fields) {
    decls.set(decl.id, decl);
    if (decl.kind === "derived") for (const operand of decl.sum) parent.set(operand, decl.id);
  }
  return { decls, parent, ids: [...decls.keys()].sort(compareIds) };
}

/**
 * The trees of a validated schema: fields that are connected through sums, each with its root (the field that is
 * an operand of nothing), ordered by root id, members ascending. Every field is in exactly one, so a base field
 * that no sum mentions is a tree of one.
 *
 * It throws if a field has no root, which only a cyclic schema can cause and `readSchema` has refused those: the
 * throw is the plan's "internal invariant violation", not a result. It cannot loop either way, because `rootOf`
 * is bounded by the field count.
 */
export function treesOf(structure: Structure): readonly Component[] {
  const byRoot = new Map<string, string[]>();
  for (const id of structure.ids) {
    const root = rootOf(structure.parent, id, structure.ids.length);
    if (root === undefined) throw new Error(`lib/ground: internal invariant violated: ${id} has no root, so the schema has a cycle`);
    const members = byRoot.get(root);
    if (members === undefined) byRoot.set(root, [id]);
    else members.push(id);
  }
  return [...byRoot.entries()].sort(([a], [b]) => compareIds(a, b)).map(([root, members]) => ({ root, members }));
}

/** The observations as constraints, in the order given; only those whose id is in `keep` when `keep` is given. */
export function constraintsOf(observations: readonly Observation[], keep?: ReadonlySet<string>): Constraint[] {
  const out: Constraint[] = [];
  for (const observation of observations) {
    if (keep === undefined || keep.has(observation.id)) out.push({ field: observation.field, extent: observation.extent });
  }
  return out;
}

/**
 * Bounds propagation over one tree: the extent every field of `fields` is forced into by its own declaration (a
 * base field's baseline), by `constraints` (each one `meet`s into its field), and by the sum rules, run forward
 * and backward until nothing moves. `conflicted` as soon as any field's extent is empty.
 *
 * `fields` are the tree's ids and `constraints` are about those fields only. With no constraints the answer is
 * the schema-only extent `B` of every field; with the observations of the tree it is `E`.
 *
 * ONE PASS visits every derived field of the tree in ascending id order and, for each, narrows the sum to what
 * its operands allow (`sumForward`) and then each operand to what the sum allows (`sumBackward`). Narrowing is
 * monotone, so the order of visits changes how many passes it takes; the tests found no case where it changed where
 * it ends (the 64-field schema in three id orders, and the oracle on generated instances). The count is capped at `4 * (fields + 1) + 8`, the plan's bound (section 4.3), where `fields` is
 * the size of the tree being solved. ADR 0004 gives the pass counts measured on the deepest tree the contracts
 * allow, far below the cap. Running past the cap would mean the structure is not a tree, which `readSchema`
 * refuses, so it throws (an internal invariant violation) instead of returning something or looping.
 */
export function solve(structure: Structure, fields: readonly string[], constraints: readonly Constraint[]): Solved {
  const domains = new Map<string, Extent>();
  for (const id of fields) {
    const decl = structure.decls.get(id);
    if (decl === undefined) throw new Error(`lib/ground: internal invariant violated: ${id} is not declared`);
    domains.set(id, decl.kind === "base" ? { lo: decl.baseline.lo, hi: decl.baseline.hi } : { lo: null, hi: null });
  }
  for (const constraint of constraints) {
    const current = domains.get(constraint.field);
    if (current === undefined) throw new Error(`lib/ground: internal invariant violated: ${constraint.field} is not in the tree`);
    const narrowed = meet(current, constraint.extent);
    if (narrowed === undefined) return { kind: "conflicted", passes: 0 };
    domains.set(constraint.field, narrowed);
  }

  const derived: Extract<FieldDecl, { kind: "derived" }>[] = [];
  for (const id of fields) {
    const decl = structure.decls.get(id);
    if (decl !== undefined && decl.kind === "derived") derived.push(decl);
  }
  const bound = 4 * (fields.length + 1) + 8;
  for (let pass = 1; pass <= bound; pass++) {
    let moved = false;
    for (const decl of derived) {
      // Read the current extents once per rule; `operands` is updated in place as each one narrows.
      const [first, ...others] = decl.sum;
      const operands: [Extent, ...Extent[]] = [extentIn(domains, first), ...others.map((id) => extentIn(domains, id))];

      const sum = meet(extentIn(domains, decl.id), sumForward(operands));
      if (sum === undefined) return { kind: "conflicted", passes: pass };
      if (!isSameExtent(sum, extentIn(domains, decl.id))) moved = true;
      domains.set(decl.id, sum);

      for (const [index, id] of decl.sum.entries()) {
        const narrowed = meet(extentIn(domains, id), sumBackward(sum, operands, index));
        if (narrowed === undefined) return { kind: "conflicted", passes: pass };
        if (!isSameExtent(narrowed, extentIn(domains, id))) moved = true;
        domains.set(id, narrowed);
        operands[index] = narrowed;
      }
    }
    if (!moved) return { kind: "consistent", extents: domains, passes: pass };
  }
  throw new Error(`lib/ground: internal invariant violated: propagation over ${fields.length} fields did not settle in ${bound} passes`);
}

function extentIn(domains: ReadonlyMap<string, Extent>, id: string): Extent {
  const extent = domains.get(id);
  if (extent === undefined) throw new Error(`lib/ground: internal invariant violated: ${id} is not in the tree`);
  return extent;
}
