import { fieldId, obsId, type FieldId, type ObsId } from "../../ids.js";

/**
 * Type-only proofs that the two brands are distinct from each other and from `string` (see
 * `support/proof-harness.ts`). Every declaration is exported so `noUnusedLocals` cannot satisfy a directive.
 */
const field = fieldId("packDays");
const obs = obsId("o1");

// @ts-expect-error TS2322 Type 'ObsId' is not assignable to type 'FieldId'
export const obsAsField: FieldId = obs;
// @ts-expect-error TS2322 Type 'FieldId' is not assignable to type 'ObsId'
export const fieldAsObs: ObsId = field;
// @ts-expect-error TS2322 Type 'string' is not assignable to type 'FieldId'
export const plainAsField: FieldId = "packDays";
// @ts-expect-error TS2322 Type 'string' is not assignable to type 'ObsId'
export const plainAsObs: ObsId = "o1";

// CONTROLS (no directive, so they must compile): an id is still a string wherever a string is wanted, which is
// what lets `compareIds(a: string, b: string)` take either brand. They show the errors above are about the
// brand and not about strings in general.
export const fieldAsString: string = field;
export const obsAsString: string = obs;
