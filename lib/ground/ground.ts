import { fieldId } from "../contracts/index.js";
import type {
  Extent,
  FieldId,
  NonEmptyReadonlyArray,
  Observation,
  ObsId,
  RejectedObservation,
  Schema,
  SchemaFault,
} from "../contracts/index.js";
import { readObservations } from "./read-observation.js";
import { readSchema } from "./read-schema.js";
import { deepFreeze, nonEmpty } from "./plain.js";
import { shrink } from "./shrink.js";
import { constraintsOf, solve, structureOf, treesOf } from "./solve.js";
import type { Component, Structure } from "./solve.js";

export interface FieldExtent {
  readonly field: FieldId;
  readonly extent: Extent;
}

export type TreeState =
  | { readonly kind: "consistent"; readonly extents: NonEmptyReadonlyArray<FieldExtent> }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };

export interface Tree {
  readonly root: FieldId;
  readonly fields: NonEmptyReadonlyArray<FieldId>;
  readonly state: TreeState;
}

/**
 * Everything `ground` knows, as plain data: no closure, no `Map`, no hidden state, deep-frozen. `supportOf` and
 * `openEndsOf` are computed from it on demand, so a `Grounding` that went through JSON and back gives the same
 * answers.
 *
 * Order: `schema` keeps the order the author wrote the fields in (it is the validated copy). Everything else is
 * in a fixed order that does not depend on the order of anything in the input: `observations` by id, `baseline`
 * by field id, `trees` by root id, each tree's `fields` and extents by field id.
 */
export interface Grounding {
  readonly schema: Schema;
  readonly observations: readonly Observation[];
  readonly baseline: NonEmptyReadonlyArray<FieldExtent>;
  readonly trees: NonEmptyReadonlyArray<Tree>;
}

export type GroundFailure =
  | { readonly kind: "invalid-schema"; readonly fault: SchemaFault }
  | { readonly kind: "too-many-observations"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };

export type GroundResult =
  | { readonly ok: true; readonly grounding: Grounding; readonly rejected: readonly RejectedObservation[] }
  | { readonly ok: false; readonly failure: GroundFailure };

export type ExtentFailure =
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };

export type ExtentRead =
  | { readonly ok: true; readonly extent: Extent; readonly baseline: Extent }
  | { readonly ok: false; readonly failure: ExtentFailure };

/**
 * Ground a snapshot of untrusted observations against an untrusted schema. Every read of the input is guarded
 * (`readSchema`, `readObservations`), so a hostile value becomes a typed result; the throws I know of in this
 * package are internal invariant violations, such as a propagation that does not settle or a list that has to be
 * non-empty and is not. `hostile-input.test.ts` found no input that made it throw (a sample, not a proof).
 *
 * Both arguments are read exactly once (`readSchema`, `readObservations`: their comments say what each reads).
 * If the schema is refused the observations are never touched. Then, in this order: the schema-only extent `B`
 * of every field (propagation with no observation); intake of each observation, against `B`; and per tree the
 * extents `E` under the accepted observations, or, when some field's extent comes out empty, the tree is
 * `conflicted` and an irreducible core of observation ids is named.
 *
 * A TREE IS GROUNDED ON ITS OWN. A tree's state is computed from that tree's fields and the observations on
 * them and nothing else: another tree's observations are not an input to it. `locality.test.ts` checks, on generated
 * instances, that a conflict in one tree changes no answer about another. The price is the plan's case 03: a
 * conflicted tree is refused whole and never salvaged.
 *
 * THE CORE. For a conflicted tree it is found by deletion (`shrink`), asking "is what is left still
 * unsatisfiable?". It is irreducible (drop any one id and the rest is satisfiable) but it is not the only core and
 * not necessarily the smallest: two unrelated conflicts in one tree give one core and not both (plan case 04:
 * `k1 k2` and `m1 m2` give `m1 m2`), and fixing it can reveal the other. It has at least two members: an
 * observation alone either meets its field's `B`, and then has a world, or does not and was refused at intake as
 * `outside-baseline` (`single-observation.test.ts` checks this on generated instances; it is not a proof).
 */
export function ground(rawSchema: unknown, rawObservations: unknown): GroundResult {
  const read = readSchema(rawSchema);
  if (!read.ok) return fail({ kind: "invalid-schema", fault: read.fault });
  const schema = read.schema;
  const structure = structureOf(schema);
  const components = treesOf(structure);

  const baselineOf = new Map<string, Extent>();
  for (const component of components) {
    const solved = solve(structure, component.members, []);
    if (solved.kind !== "consistent") throw new Error("lib/ground: internal invariant violated: the schema alone is unsatisfiable");
    for (const [id, extent] of solved.extents) baselineOf.set(id, extent);
  }

  const intake = readObservations(rawObservations, baselineOf);
  if (!intake.ok) return fail(intake.failure);

  const baseline = structure.ids.map((id) => ({ field: fieldId(id), extent: copyOf(extentOfField(baselineOf, id)) }));
  const trees = components.map((component) => grounded(structure, component, intake.accepted));
  const grounding: Grounding = {
    schema,
    observations: intake.accepted,
    baseline: nonEmpty(baseline, "the baseline"),
    trees: nonEmpty(trees, "the trees"),
  };
  return deepFreeze({ ok: true, grounding, rejected: intake.rejected });
}

function fail(failure: GroundFailure): GroundResult {
  return deepFreeze({ ok: false, failure });
}

function copyOf(extent: Extent): Extent {
  return { lo: extent.lo, hi: extent.hi };
}

function extentOfField(extents: ReadonlyMap<string, Extent>, id: string): Extent {
  const extent = extents.get(id);
  if (extent === undefined) throw new Error(`lib/ground: internal invariant violated: no extent for ${id}`);
  return extent;
}

/** One tree under the accepted observations that are about its fields. */
function grounded(structure: Structure, component: Component, accepted: readonly Observation[]): Tree {
  const members = new Set(component.members);
  const own = accepted.filter((observation) => members.has(observation.field));
  const fields = nonEmpty(component.members.map(fieldId), "a tree's fields");
  const solved = solve(structure, component.members, constraintsOf(own));
  if (solved.kind === "consistent") {
    const extents = component.members.map((id) => ({ field: fieldId(id), extent: copyOf(extentOfField(solved.extents, id)) }));
    return { root: fieldId(component.root), fields, state: { kind: "consistent", extents: nonEmpty(extents, "a tree's extents") } };
  }
  const core = shrink(
    own.map((observation) => observation.id),
    (subset) => solve(structure, component.members, constraintsOf(own, new Set(subset))).kind === "conflicted",
  );
  return { root: fieldId(component.root), fields, state: { kind: "conflicted", core: nonEmpty(core, "a core") } };
}

/** The tree that holds `field`, or `undefined`. Shared by `extentOf`, `supportOf` and `openEndsOf`; not exported from the package. */
export function treeContaining(g: Grounding, field: FieldId): Tree | undefined {
  return g.trees.find((tree) => tree.fields.includes(field));
}

/**
 * The extent the observations leave `field`, and the schema-only extent `B`. A field no schema declares is
 * `unknown-field`; a field in a conflicted tree is `conflicted` with that tree's core (the whole tree is refused,
 * so there is no extent for any of its fields).
 */
export function extentOf(g: Grounding, field: FieldId): ExtentRead {
  const tree = treeContaining(g, field);
  if (tree === undefined) return deepFreeze({ ok: false, failure: { kind: "unknown-field", field } });
  if (tree.state.kind === "conflicted") return deepFreeze({ ok: false, failure: { kind: "conflicted", core: nonEmpty([...tree.state.core], "a core") } });
  const established = tree.state.extents.find((entry) => entry.field === field);
  const schemaOnly = g.baseline.find((entry) => entry.field === field);
  if (established === undefined || schemaOnly === undefined) throw new Error(`lib/ground: internal invariant violated: no extent recorded for ${field}`);
  return deepFreeze({ ok: true, extent: copyOf(established.extent), baseline: copyOf(schemaOnly.extent) });
}
