/**
 * The public surface of `domains/order-desk` (M6): the eight names `.genesis/PLAN.md` section 5 gives M6, and the types
 * and small helpers they need. `__tests__/architecture.test.ts` pins this list.
 */
export { FIELDS, ORDER_DESK_SCHEMA } from "./schema.js";
export type { FieldName } from "./schema.js";
export { OBSERVATIONS, SNAPSHOTS, observationsOf } from "./observations.js";
export type { ObservationName } from "./observations.js";
export { QUESTIONS } from "./questions.js";
export type { MenuQuestion } from "./questions.js";
export { MODEL_PRIORS, PRIOR_CUSTOMS_DAYS, PRIOR_PACK_DAYS, PRIOR_TRANSIT_DAYS, claimsOf, fluentDraft, renderFluent } from "./drafter.js";
export type { Basis, DrafterObservation, FluentDraft, Priors, Statement } from "./drafter.js";
export { CANON_SCRIPT, runScript } from "./script.js";
export type { ScriptFailure, ScriptRun, ScriptStep, StepRun } from "./script.js";
