/**
 * The public surface of `lib/entail` (M5): the six functions of `.genesis/PLAN.md` section 5 and the eight types of its
 * section 4.1 `lib/entail/index.ts` block, and nothing else. `plain.ts` and every other helper are internal;
 * `__tests__/architecture.test.ts` pins this list.
 */
export { answer } from "./answer.js";
export type { AnswerFailure, AnswerResult } from "./answer.js";
export { readClaim } from "./read-claim.js";
export type { ClaimRead } from "./read-claim.js";
export { recheck } from "./recheck.js";
export type { NotReproduced, RecheckFinding, RecheckResult, Reproduction } from "./recheck.js";
export { renderBrief, renderEntailment } from "./render.js";
export { rule } from "./rule.js";
export type { RuleResult } from "./rule.js";
