import { describe, expect, it } from "vitest";
import {
  MAX_DRAFT_CLAIMS,
  MAX_FIELDS,
  MAX_ID_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_MAGNITUDE,
  MAX_OBSERVATIONS,
  MAX_OPERANDS,
  MAX_QUOTE_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_UNIT_LENGTH,
} from "../limits.js";

/**
 * The ten bounds are INVENTED (`.genesis/PLAN.md` section 4.1), so a test cannot say they are right; it can
 * say they are the values the plan states and that the one relation the extent algebra leans on holds.
 * Changing a value is allowed, but it must be a deliberate edit of this table AND of the plan.
 */
const PLAN_VALUES: Readonly<Record<string, readonly [number, number]>> = {
  MAX_MAGNITUDE: [MAX_MAGNITUDE, 2 ** 40],
  MAX_FIELDS: [MAX_FIELDS, 64],
  MAX_OPERANDS: [MAX_OPERANDS, 8],
  MAX_OBSERVATIONS: [MAX_OBSERVATIONS, 64],
  MAX_DRAFT_CLAIMS: [MAX_DRAFT_CLAIMS, 32],
  MAX_ID_LENGTH: [MAX_ID_LENGTH, 128],
  MAX_LABEL_LENGTH: [MAX_LABEL_LENGTH, 64],
  MAX_UNIT_LENGTH: [MAX_UNIT_LENGTH, 16],
  MAX_SOURCE_LENGTH: [MAX_SOURCE_LENGTH, 64],
  MAX_QUOTE_LENGTH: [MAX_QUOTE_LENGTH, 280],
};

describe("the ten bounds", () => {
  for (const [name, [actual, planned]] of Object.entries(PLAN_VALUES)) {
    it(`${name} is ${planned}, a positive safe integer`, () => {
      expect(actual).toBe(planned);
      expect(Number.isSafeInteger(actual)).toBe(true);
      expect(actual).toBeGreaterThan(0);
    });
  }

  it("there are exactly ten", () => {
    expect(Object.keys(PLAN_VALUES)).toHaveLength(10);
  });

  it("a sum may not have more operands than the schema has fields", () => {
    expect(MAX_OPERANDS).toBeLessThanOrEqual(MAX_FIELDS);
  });

  it("MAX_MAGNITUDE * MAX_FIELDS is below 2**48 (the plan's figure) and far below Number.MAX_SAFE_INTEGER", () => {
    // The exact product is 2**46. This is the arithmetic the extent algebra's use of plain numbers rests on.
    expect(MAX_MAGNITUDE * MAX_FIELDS).toBe(2 ** 46);
    expect(MAX_MAGNITUDE * MAX_FIELDS).toBeLessThan(2 ** 48);
    // A margin of 64x: the product could grow 64-fold before an integer sum stopped being exact.
    expect(MAX_MAGNITUDE * MAX_FIELDS * 64).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
