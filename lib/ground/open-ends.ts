import { compareIds, fieldId } from "../contracts/index.js";
import type { FieldId, OpenEnd, Side } from "../contracts/index.js";
import { treeContaining } from "./ground.js";
import type { Grounding } from "./ground.js";
import { deepFreeze } from "./plain.js";
import { contextOf, supportSide } from "./support.js";
import type { Structure } from "./solve.js";

/**
 * Where a claim about `field` is missing evidence, for the sides the caller says are unmet (M5 passes
 * `unmetSides(E, C)`): for each such side whose support for `field` is empty, every BASE field in `field`'s
 * subtree whose own support for that side is empty.
 *
 * It is a place and not a promise. "Empty support" means no observation is needed for that bound: it is the
 * schema's own or it is unbounded. So a floor the schema implies (a duration is at least 0) is an open end on
 * the lower side even though the number is known, because no document stands behind it. Naming an end says where
 * evidence is missing, not what it will say (plan case 06); bounding every listed upper end bounds the
 * field's upper side unless the tree turns conflicted (a property the tests check against the brute-force oracle,
 * not a proof).
 *
 * Only sides in `sides` are ever listed, and each once, however many times it is repeated or in what order
 * (anything that is not `"lo"` or `"hi"` is ignored). `[]` for a field the schema does not declare and for a
 * field in a conflicted tree (there is no extent to be missing evidence for). The answer is ordered by field id,
 * then `lo` before `hi`. It does not depend on `sides`' order or on the order of anything in the input.
 */
export function openEndsOf(g: Grounding, field: FieldId, sides: readonly Side[]): readonly OpenEnd[] {
  const tree = treeContaining(g, field);
  if (tree === undefined || tree.state.kind === "conflicted") return deepFreeze([]);
  const wanted: Side[] = [];
  for (const side of ["lo", "hi"] as const) if (sides.includes(side)) wanted.push(side);
  if (wanted.length === 0) return deepFreeze([]);

  const context = contextOf(g, tree);
  const leaves = baseFieldsUnder(context.structure, field);
  const ends: OpenEnd[] = [];
  for (const side of wanted) {
    if (supportSide(context, field, side).length > 0) continue;
    for (const leaf of leaves) {
      if (supportSide(context, leaf, side).length === 0) ends.push({ field: fieldId(leaf), side });
    }
  }
  ends.sort((a, b) => compareIds(a.field, b.field) || (a.side === b.side ? 0 : a.side === "lo" ? -1 : 1));
  return deepFreeze(ends);
}

/**
 * The base fields at or below `field` (`field` itself when it is a base field), ascending. Follows operands with a
 * visited set, so a hand-built cyclic schema ends the walk instead of looping.
 */
function baseFieldsUnder(structure: Structure, field: string): string[] {
  const visited = new Set<string>();
  const found: string[] = [];
  const pending = [field];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (visited.has(next)) continue;
    visited.add(next);
    const decl = structure.decls.get(next);
    if (decl === undefined) continue;
    if (decl.kind === "base") found.push(next);
    else pending.push(...decl.sum);
  }
  return found.sort(compareIds);
}
