/**
 * The public surface of `lib/extent` (M3): the seven functions of `.genesis/PLAN.md` section 5 and the
 * `ExtentCheck` type `checkExtent` returns, and nothing else. `satisfiesLo` and `satisfiesHi` are shared
 * between two source files and deliberately not exported here. `__tests__/architecture.test.ts` pins this list.
 */
export { checkExtent } from "./check-extent.js";
export type { ExtentCheck } from "./check-extent.js";
export { meet } from "./meet.js";
export { isSameExtent, isSubset } from "./subset.js";
export { unmetSides } from "./unmet.js";
export { sumBackward, sumForward } from "./sum.js";
