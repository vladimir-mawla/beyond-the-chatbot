import { describe, expect, it } from "vitest";
import { fieldId, obsId } from "../../../lib/contracts/index.js";
import type { Schema } from "../../../lib/contracts/index.js";
import { ground, readSchema } from "../../../lib/ground/index.js";
import { FIELDS, OBSERVATIONS, ORDER_DESK_SCHEMA, QUESTIONS, SNAPSHOTS, observationsOf } from "../index.js";
import type { FieldName } from "../index.js";
import { isDeepFrozen } from "./fixtures.js";

/**
 * THE DATA of plan section 7: the schema, the four documents, the four snapshots, the question menu. Each is pinned
 * literally (so a changed number or quote is a red test, not a silent edit), accepted by the real engine, and frozen.
 */

describe("the schema of plan section 7", () => {
  it("is three base quantities in days (baseline [0, unbounded)) and deliveryDay, their sum, with no baseline of its own", () => {
    const [pack, transit, customs, delivery, ...rest] = ORDER_DESK_SCHEMA.fields;
    expect(rest).toEqual([]);
    for (const [field, id, label] of [
      [pack, "packDays", "packing time"],
      [transit, "transitDays", "transit time"],
      [customs, "customsDays", "customs clearance"],
    ] as const) {
      expect(field).toEqual({ kind: "base", id, label, unit: "days", baseline: { lo: 0, hi: null } });
    }
    expect(delivery).toEqual({ kind: "derived", id: "deliveryDay", label: "delivery (days from order)", unit: "days", sum: ["packDays", "transitDays", "customsDays"] });
    expect(delivery !== undefined && "baseline" in delivery).toBe(false);
  });

  it("is accepted by readSchema, and the copy it returns equals the constant", () => {
    const read = readSchema(ORDER_DESK_SCHEMA);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.schema).toEqual(ORDER_DESK_SCHEMA);
  });

  it("FIELDS names exactly the four quantities, and each is the id the schema declares", () => {
    expect(Object.keys(FIELDS)).toEqual(["packDays", "transitDays", "customsDays", "deliveryDay"]);
    expect(ORDER_DESK_SCHEMA.fields.map((f) => f.id)).toEqual(Object.values(FIELDS));
    for (const [name, id] of Object.entries(FIELDS)) expect(id).toBe(fieldId(name));
  });
});

describe("the four documents o1 to o4, with the plan's quotes", () => {
  const expected = [
    ["o1", "packDays", 1, 2, "Packed and dispatched within 1 to 2 days of the order", "Warehouse system"],
    ["o2", "transitDays", 3, 5, "Standard international transit takes 3 to 5 days", "Carrier SLA sheet"],
    ["o3", "customsDays", 0, 2, "Customs clearance takes 0 to 2 days", "Customs bulletin"],
    ["o4", "deliveryDay", 14, 14, "Courier tracking estimates delivery on day 14", "Courier tracking page"],
  ] as const;

  it("carry the plan's extents, quotes and display sources, in id order", () => {
    expect(OBSERVATIONS.map((o) => [o.id, o.field, o.extent.lo, o.extent.hi, o.quote, o.source])).toEqual(expected);
  });

  it("all four pass the engine's intake (digit-containment included): ground rejects none of them, and the four together form one conflicted tree", () => {
    const g = ground(ORDER_DESK_SCHEMA, OBSERVATIONS);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.rejected).toEqual([]);
    expect(g.grounding.observations.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4"]);
    expect(g.grounding.trees).toHaveLength(1);
    expect(g.grounding.trees[0]?.state).toEqual({ kind: "conflicted", core: ["o1", "o2", "o3", "o4"] });
  });

  it("observationsOf returns the constants themselves, in the order asked, and skips an id that is not one of the four", () => {
    expect(observationsOf(["o3", "o1"])).toEqual([OBSERVATIONS[2], OBSERVATIONS[0]]);
    expect(observationsOf(["o4"])[0]).toBe(OBSERVATIONS[3]);
    expect(observationsOf([])).toEqual([]);
    expect(observationsOf([obsId("o9"), obsId("o2")])).toEqual([OBSERVATIONS[1]]);
  });
});

describe("the four snapshots and the five questions", () => {
  it("SNAPSHOTS are {o1,o2}, {o1,o2,o3}, {o1,o2,o3,o4}, {o1,o2,o4}", () => {
    expect(SNAPSHOTS).toEqual([["o1", "o2"], ["o1", "o2", "o3"], ["o1", "o2", "o3", "o4"], ["o1", "o2", "o4"]]);
  });

  it("QUESTIONS are the plan's menu, in the plan's order, as claims", () => {
    expect(QUESTIONS.map((q) => [q.label, q.claim.field, q.claim.extent.lo, q.claim.extent.hi])).toEqual([
      ["delivery ≤ 12", "deliveryDay", null, 12],
      ["delivery ≥ 4", "deliveryDay", 4, null],
      ["delivery ≤ 3", "deliveryDay", null, 3],
      ["customs ≤ 3", "customsDays", null, 3],
      ["delivery = 14", "deliveryDay", 14, 14],
    ]);
  });
});

describe("the constants are frozen all the way down", () => {
  it("every node of the schema, the observations, the snapshots, the questions and FIELDS is frozen", () => {
    for (const [name, value] of Object.entries({ ORDER_DESK_SCHEMA, OBSERVATIONS, SNAPSHOTS, QUESTIONS, FIELDS })) expect(isDeepFrozen(value), name).toBe(true);
  });

  it("writing through one throws (the module is strict), at three depths, and the constant is unchanged", () => {
    const before = JSON.stringify([ORDER_DESK_SCHEMA, OBSERVATIONS, SNAPSHOTS, QUESTIONS]);
    expect(() => {
      (OBSERVATIONS[0] as { quote: string }).quote = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (OBSERVATIONS[0]?.extent as { lo: number }).lo = 99;
    }).toThrow(TypeError);
    expect(() => {
      (SNAPSHOTS[0] as unknown as string[]).push("o9");
    }).toThrow(TypeError);
    expect(() => {
      (QUESTIONS[0]?.claim.extent as { hi: number }).hi = 1;
    }).toThrow(TypeError);
    expect(JSON.stringify([ORDER_DESK_SCHEMA, OBSERVATIONS, SNAPSHOTS, QUESTIONS])).toBe(before);
  });

  it("isDeepFrozen can say no: a thawed copy and a value with one unfrozen child are both refused", () => {
    expect(isDeepFrozen(JSON.parse(JSON.stringify(OBSERVATIONS)))).toBe(false);
    expect(isDeepFrozen(Object.freeze({ inner: { x: 1 } }))).toBe(false);
    expect(isDeepFrozen(Object.freeze({ inner: Object.freeze({ x: 1 }) }))).toBe(true);
  });
});

describe("a misspelt field or document does not compile", () => {
  it("FIELDS.packDay, a name outside FieldName, and an id outside ObservationName are type errors", () => {
    // @ts-expect-error `packDay` is not a field: the misspelling is a compile error, not a run-time `unknown-field`.
    const misspelt = FIELDS.packDay;
    expect(misspelt).toBeUndefined();
    // @ts-expect-error "transit" is not a FieldName.
    const notAName: FieldName = "transit";
    expect(notAName).toBe("transit");
    // @ts-expect-error "o9" is not an ObservationName.
    expect(observationsOf(["o9"])).toEqual([]);
    // @ts-expect-error a bare string is not a FieldId (it is branded).
    const bare: Schema["fields"][number]["id"] = "packDays";
    expect(bare).toBe("packDays");
  });
});
