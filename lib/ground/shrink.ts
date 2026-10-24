import { compareIds } from "../contracts/index.js";
import type { ObsId } from "../contracts/index.js";

/**
 * Deletion minimisation: from `pool`, drop observation ids one at a time while `holds` stays true of what is
 * left, and return the survivors in ascending order. `holds` is "this subset still reproduces the bound" for a
 * support and "this subset is still unsatisfiable" for a core; it must be true of the whole pool.
 *
 * WHY ASCENDING ID ORDER. Which irreducible subset comes out depends on the order the drops are tried in, so the
 * order has to be a function of the evidence and nothing else. The plan's D7 fixes it: try the smallest id
 * first (`compareIds`, code-unit order, never `localeCompare`, which depends on the host's locale). The pool is
 * sorted here, whatever order the caller built it in, so neither input order nor object identity can reach the
 * answer. Early ids are the ones dropped first, so the survivors lean toward the LATEST ids: with the same
 * evidence under two id schemes the certificate can differ (plan case 05).
 *
 * WHY IRREDUCIBLE AND NOT MINIMUM. A drop that `holds` rejects stays rejected PROVIDED `holds` is monotone in
 * the set: the observation was needed given everything then in the set, and the set only shrinks afterwards, so
 * a later drop cannot make it unnecessary again. For a support that is "fewer observations never tighten a
 * bound"; for a core it is "fewer observations never make a satisfiable set unsatisfiable". Given that, when the
 * loop ends removing any single survivor breaks `holds`: the result is irreducible. (The tests do not rely on
 * this argument: they check every support and core they generate against a brute-force oracle.) It is not the
 * smallest such set, because greedy deletion commits to the first route that works: with a one-observation
 * route whose id sorts last and a three-observation route whose ids sort first, the three-observation route
 * survives, though it is larger (plan case 05).
 *
 * It returns a fresh array and never touches `pool`.
 */
export function shrink(pool: readonly ObsId[], holds: (subset: readonly ObsId[]) => boolean): ObsId[] {
  const kept = [...pool].sort(compareIds);
  for (const id of [...kept]) {
    const without = kept.filter((other) => other !== id);
    if (holds(without)) kept.splice(0, kept.length, ...without);
  }
  return kept;
}
