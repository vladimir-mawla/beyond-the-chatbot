import { obsId } from "../../lib/contracts/index.js";
import type { Observation, ObsId } from "../../lib/contracts/index.js";
import { deepFreeze } from "./freeze.js";
import { FIELDS } from "./schema.js";

/** The four documents, by the names a caller may use. `observationsOf(["o9"])` does not compile. */
export type ObservationName = "o1" | "o2" | "o3" | "o4";

/**
 * The four canonical observations of plan section 7, with their real quotes. The `source` is a display label the
 * engine never reads. Every bound's digits occur in its quote (the engine's digit-containment check accepts all four;
 * `canon.test.ts` runs `ground` on them).
 */
export const OBSERVATIONS: readonly Observation[] = deepFreeze([
  { id: obsId("o1"), field: FIELDS.packDays, extent: { lo: 1, hi: 2 }, quote: "Packed and dispatched within 1 to 2 days of the order", source: "Warehouse system" },
  { id: obsId("o2"), field: FIELDS.transitDays, extent: { lo: 3, hi: 5 }, quote: "Standard international transit takes 3 to 5 days", source: "Carrier SLA sheet" },
  { id: obsId("o3"), field: FIELDS.customsDays, extent: { lo: 0, hi: 2 }, quote: "Customs clearance takes 0 to 2 days", source: "Customs bulletin" },
  { id: obsId("o4"), field: FIELDS.deliveryDay, extent: { lo: 14, hi: 14 }, quote: "Courier tracking estimates delivery on day 14", source: "Courier tracking page" },
]);

/** The four scripted snapshots, as id sets (plan section 6 M6): `{o1,o2}`, `{o1,o2,o3}`, `{o1,o2,o3,o4}`, `{o1,o2,o4}`. */
export const SNAPSHOTS: readonly (readonly ObsId[])[] = deepFreeze([
  [obsId("o1"), obsId("o2")],
  [obsId("o1"), obsId("o2"), obsId("o3")],
  [obsId("o1"), obsId("o2"), obsId("o3"), obsId("o4")],
  [obsId("o1"), obsId("o2"), obsId("o4")],
]);

/**
 * The documents a snapshot names, in the order the snapshot names them, as the constants themselves (frozen). An id
 * that is not one of the four is skipped, so the result can be shorter than the input; the callers pass ids from
 * `SNAPSHOTS` or from the `ObservationName` type.
 */
export function observationsOf(names: readonly (ObservationName | ObsId)[]): readonly Observation[] {
  const found: Observation[] = [];
  for (const name of names) {
    const hit = OBSERVATIONS.find((observation) => observation.id === name);
    if (hit !== undefined) found.push(hit);
  }
  return found;
}
