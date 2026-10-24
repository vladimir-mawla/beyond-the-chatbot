/**
 * The ten bounds of the engine (`.genesis/PLAN.md` section 4.1). Every one is INVENTED, not derived from
 * anything, and is disclosed as such; each is a number so a boundary test can probe N and N+1.
 *
 * Nothing in M1 enforces any of them. The plan assigns exactly one cap to a layer by name: M3's `checkExtent`
 * refuses a bound with `|v| > MAX_MAGNITUDE`, and M3's tests probe N and N+1 for it. For `MAX_FIELDS`,
 * `MAX_OBSERVATIONS` and `MAX_DRAFT_CLAIMS` it names faults that carry a `max` (`too-many-fields`,
 * `too-many-observations`, `draft-too-long`) but not the constant, and for `MAX_OPERANDS` and the five length
 * caps it names no layer, so this file assigns those no layer either. `__tests__/limits.test.ts` pins the
 * values and the relations between them (below); it cannot say that a later milestone enforces them.
 *
 * THE ONE RELATION THAT MATTERS. Plan section 8F argues that propagation sums at most `MAX_FIELDS` extents
 * whose finite sides are at most `MAX_MAGNITUDE` in absolute value, so every intermediate value stays below
 * `MAX_MAGNITUDE * MAX_FIELDS = 2**46` (the plan says "below 2**48"; 2**46 is the exact product and is
 * within that), itself far below `Number.MAX_SAFE_INTEGER = 2**53 - 1`. That is the reason the extent
 * algebra can use plain `number` instead of `BigInt`. M1 pins the product against those two limits; the
 * argument that propagation never sums more than that is M3's to check against `BigInt` and is not built.
 * It is a property of THESE values: raising either one without rechecking it is how an integer sum silently
 * stops being exact.
 */

/** Largest absolute value of a finite bound. */
export const MAX_MAGNITUDE: number = 2 ** 40;
/** Most fields a schema may declare. */
export const MAX_FIELDS: number = 64;
/** Most operands one sum may have. */
export const MAX_OPERANDS: number = 8;
/** Most observations one snapshot may hold. */
export const MAX_OBSERVATIONS: number = 64;
/** Most claims a draft may hold. */
export const MAX_DRAFT_CLAIMS: number = 32;
/** Longest `FieldId` or `ObsId`, in UTF-16 code units. */
export const MAX_ID_LENGTH: number = 128;
/** Longest field label. */
export const MAX_LABEL_LENGTH: number = 64;
/** Longest unit name. */
export const MAX_UNIT_LENGTH: number = 16;
/** Longest `Observation.source`. */
export const MAX_SOURCE_LENGTH: number = 64;
/** Longest `Observation.quote`. */
export const MAX_QUOTE_LENGTH: number = 280;
