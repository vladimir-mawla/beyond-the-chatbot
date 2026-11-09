import { fieldId } from "../../lib/contracts/index.js";
import type { Schema } from "../../lib/contracts/index.js";
import { deepFreeze } from "./freeze.js";

/**
 * The four quantities of the order desk (plan section 6 M6 and section 7), as typed ids. `FIELDS.packDay` (a misspelling)
 * does not compile, which is how "a misspelt field must not compile" is met: a field is named through this object or
 * not at all. Days after the order.
 */
export const FIELDS = Object.freeze({
  packDays: fieldId("packDays"),
  transitDays: fieldId("transitDays"),
  customsDays: fieldId("customsDays"),
  deliveryDay: fieldId("deliveryDay"),
});

export type FieldName = keyof typeof FIELDS;

/**
 * Three base quantities (unit `days`, baseline `[0, unbounded)`) and `deliveryDay`, their sum (derived: it declares no
 * baseline). The labels are the schema's text, which `renderEntailment` prints as given.
 */
export const ORDER_DESK_SCHEMA: Schema = deepFreeze({
  fields: [
    { kind: "base", id: FIELDS.packDays, label: "packing time", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "base", id: FIELDS.transitDays, label: "transit time", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "base", id: FIELDS.customsDays, label: "customs clearance", unit: "days", baseline: { lo: 0, hi: null } },
    { kind: "derived", id: FIELDS.deliveryDay, label: "delivery (days from order)", unit: "days", sum: [FIELDS.packDays, FIELDS.transitDays, FIELDS.customsDays] },
  ],
});
