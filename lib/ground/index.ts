/**
 * The public surface of `lib/ground` (M4): the six functions of `.genesis/PLAN.md` section 5 and the types of its
 * section 4.1 `lib/ground/index.ts` block, and nothing else. `solve`, `shrink` and every other helper are
 * internal (the plan calls the first two internal); `__tests__/architecture.test.ts` pins this list.
 */
export { declOf } from "./decl.js";
export { extentOf, ground } from "./ground.js";
export type { ExtentFailure, ExtentRead, FieldExtent, GroundFailure, GroundResult, Grounding, Tree, TreeState } from "./ground.js";
export { openEndsOf } from "./open-ends.js";
export { readSchema } from "./read-schema.js";
export type { SchemaRead } from "./read-schema.js";
export { supportOf } from "./support.js";
export type { SupportRead } from "./support.js";
