import type { Extent, Side } from "../contracts/index.js";
import { satisfiesHi, satisfiesLo } from "./subset.js";

/**
 * The sides of `tested` that `established` does not satisfy: the cut a `weakened` ruling has to name.
 *
 * A side of `tested` that is `null` claims nothing on that side, so it is never unmet, whatever `established`
 * says there. A bounded side is unmet when `established` is unbounded on it or sits past it. The answer is `[]`
 * exactly when `isSubset(established, tested)`, `["lo"]`, `["hi"]` or `["lo", "hi"]` otherwise, always in that
 * order, and always a new array (a caller that sorts or mutates it cannot affect the next call).
 */
export function unmetSides(established: Extent, tested: Extent): readonly Side[] {
  const unmet: Side[] = [];
  if (!satisfiesLo(established.lo, tested.lo)) unmet.push("lo");
  if (!satisfiesHi(established.hi, tested.hi)) unmet.push("hi");
  return unmet;
}
