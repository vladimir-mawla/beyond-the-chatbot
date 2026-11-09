import type { Claim } from "../../lib/contracts/index.js";
import { deepFreeze } from "./freeze.js";
import { FIELDS } from "./schema.js";

export interface MenuQuestion {
  /** What the menu shows. */
  readonly label: string;
  /** The question as the engine reads it: a claim, ruled like any other. */
  readonly claim: Claim;
}

/**
 * The five-item question menu of plan section 6 M6, in the plan's order: `delivery <= 12`, `delivery >= 4`,
 * `delivery <= 3`, `customs <= 3`, `delivery = 14`. Numbers are in days after the order.
 */
export const QUESTIONS: readonly MenuQuestion[] = deepFreeze([
  { label: "delivery ≤ 12", claim: { field: FIELDS.deliveryDay, extent: { lo: null, hi: 12 } } },
  { label: "delivery ≥ 4", claim: { field: FIELDS.deliveryDay, extent: { lo: 4, hi: null } } },
  { label: "delivery ≤ 3", claim: { field: FIELDS.deliveryDay, extent: { lo: null, hi: 3 } } },
  { label: "customs ≤ 3", claim: { field: FIELDS.customsDays, extent: { lo: null, hi: 3 } } },
  { label: "delivery = 14", claim: { field: FIELDS.deliveryDay, extent: { lo: 14, hi: 14 } } },
]);
