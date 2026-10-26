import type { Extent, FieldId, NonEmptyReadonlyArray, Observation, ObsId, Side, Support } from "../contracts/index.js";
import { isSubset } from "../extent/index.js";
import { treeContaining } from "./ground.js";
import type { ExtentFailure, Grounding, Tree } from "./ground.js";
import { deepFreeze, nonEmpty } from "./plain.js";
import { shrink } from "./shrink.js";
import { constraintsOf, solve, structureOf } from "./solve.js";
import type { Structure } from "./solve.js";

export type SupportRead =
  | { readonly ok: true; readonly support: Support }
  | { readonly ok: false; readonly failure: ExtentFailure };

/** What re-solving one tree needs, rebuilt from the `Grounding` alone each time it is asked for. */
export interface Context {
  readonly structure: Structure;
  /** The tree's field ids, ascending. */
  readonly members: readonly string[];
  /** The accepted observations about those fields. */
  readonly observations: readonly Observation[];
  /** The extent of every field of the tree under all of those observations. */
  readonly full: ReadonlyMap<string, Extent>;
}

/** Re-derive what is needed to solve `tree`. Throws if the `Grounding` records a tree as consistent and it is not (an internal invariant; not seen for a `Grounding` that `ground` built). */
export function contextOf(g: Grounding, tree: Tree): Context {
  const structure = structureOf(g.schema);
  const members: readonly string[] = tree.fields;
  const inTree = new Set(members);
  const observations = g.observations.filter((observation) => inTree.has(observation.field));
  const full = solve(structure, members, constraintsOf(observations));
  if (full.kind !== "consistent") throw new Error("lib/ground: internal invariant violated: a tree recorded as consistent is unsatisfiable");
  return { structure, members, observations, full: full.extents };
}

/**
 * The support of one side of one field's extent: an irreducible set of observations that still gives that bound.
 *
 * Start from every observation about the tree and drop them one at a time, smallest id first (`shrink`), keeping a
 * drop when the field's extent, re-solved from what is left, is still inside "this bound and nothing said about
 * the other side" (`isSubset`, so the comparison is the extent algebra's own, not a new one). What survives is a
 * certificate: with only those observations the bound is the same (it is irreducible, so with any one of them
 * missing it is looser: checked against the oracle on generated instances, argued in `shrink`). `[]` means no observation is needed: the bound is the schema's own, or it is unbounded.
 * That includes a bound an observation states but the schema already implies: dropping that observation changes
 * nothing, so it is not in the support.
 *
 * Why only a subset of the tree is ever solved: observations on other trees cannot move this one, so they are not
 * in the pool and cannot be in a support.
 */
export function supportSide(context: Context, field: string, side: Side): ObsId[] {
  const target = context.full.get(field);
  if (target === undefined) throw new Error(`lib/ground: internal invariant violated: ${field} is not in its own tree`);
  // "At least as tight as `target` on `side`": inside the extent that says only `target`'s bound on that side.
  const wanted: Extent = side === "lo" ? { lo: target.lo, hi: null } : { lo: null, hi: target.hi };
  return shrink(
    context.observations.map((observation) => observation.id),
    (subset) => {
      const solved = solve(context.structure, context.members, constraintsOf(context.observations, new Set(subset)));
      // A subset of a satisfiable set of observations is satisfiable, so a conflict here is a bug in the propagation.
      if (solved.kind !== "consistent") throw new Error("lib/ground: internal invariant violated: a subset of satisfiable observations conflicts");
      const now = solved.extents.get(field);
      return now !== undefined && isSubset(now, wanted);
    },
  );
}

/**
 * The support of both sides of `field`'s extent, or why there is none: `unknown-field`, or `conflicted` with the
 * tree's core (a refused tree has no extent, so no support). Computed from `g` alone on every call.
 */
export function supportOf(g: Grounding, field: FieldId): SupportRead {
  const tree = treeContaining(g, field);
  if (tree === undefined) return deepFreeze({ ok: false, failure: { kind: "unknown-field", field } });
  if (tree.state.kind === "conflicted") {
    const core: NonEmptyReadonlyArray<ObsId> = nonEmpty([...tree.state.core], "a core");
    return deepFreeze({ ok: false, failure: { kind: "conflicted", core } });
  }
  const context = contextOf(g, tree);
  return deepFreeze({ ok: true, support: { lo: supportSide(context, field, "lo"), hi: supportSide(context, field, "hi") } });
}
