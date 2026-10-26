import { describe, expect, it } from "vitest";
import { fieldId } from "../../contracts/index.js";
import type { Extent } from "../../contracts/index.js";
import { extentOf, ground, openEndsOf, supportOf } from "../index.js";
import type { Grounding } from "../index.js";
import { ORDER_DESK, base, canon, derived, genInstance, mulberry32, obs, oracleFields, refIntake, schemaOf } from "./fixtures.js";
import type { RawObservation, RawSchema } from "./fixtures.js";
import { oracleBaselines, oracleComponents } from "./oracle.js";

/**
 * LOCALITY (plan section 6, M4: "a conflict in one tree changing any answer in another"; plan D6 and failure case
 * 03). A tree is grounded on its own, so nothing about one tree can reach another. Two properties, over generated
 * instances with more than one tree:
 *  1. INDEPENDENCE: each tree's answers inside the full schema are byte-identical to the answers of a schema made
 *     of that tree's fields alone with only the observations about them: its tree record, the baseline and the
 *     extent, support and open ends of every one of its fields, its accepted observations and the faults of the
 *     ones refused. Instances where two observations share an id are left out (intake looks at every id of the
 *     snapshot at once, so `duplicate-id` refuses both, wherever they are), and the count left out is printed.
 *  2. PERTURBATION: pin two disjoint points on one base field of tree T, so that T is conflicted, and every answer
 *     about every other tree is byte-identical to what it was before.
 * Then the plan's case 03 by hand: the order desk's step-5 conflict beside a refund tree.
 *
 * It does not show that no OTHER shared thing exists between trees (a module-level cache would be one; the
 * architecture test pins that no source has module-level state).
 */

const CHUNKS = 6;
const PER_CHUNK = 300;
const SIDES = [["lo"], ["hi"], ["lo", "hi"]] as const;

/** Everything the engine says about the fields of one tree, as one string. */
function treeAnswers(g: Grounding, treeFields: readonly string[]): string {
  const out: unknown[] = [g.trees.find((t) => t.fields.includes(fieldId(treeFields[0] as string)))];
  for (const f of treeFields) {
    out.push(g.baseline.find((b) => b.field === f), extentOf(g, fieldId(f)), supportOf(g, fieldId(f)));
    for (const sides of SIDES) out.push(openEndsOf(g, fieldId(f), sides));
  }
  out.push(g.observations.filter((o) => treeFields.includes(o.field)));
  return JSON.stringify(out);
}

const tally = { instances: 0, skippedForRepeatedIds: 0, comparedTrees: 0, conflictedAmongThem: 0, perturbed: 0, perturbedOthers: 0 };

describe("on the generated instances, a tree's answers do not depend on any other tree", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: independence, and perturbation by a conflict in one tree`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const inst = genInstance(mulberry32(seed));
        const fields = oracleFields(inst.schema);
        const components = oracleComponents(fields);
        if (components.length < 2) continue;
        tally.instances += 1;
        const ref = refIntake(inst.schema, inst.observations, inst.hostile);
        if (ref.verdicts.some((v) => v.verdict === "duplicate-id")) {
          tally.skippedForRepeatedIds += 1;
          continue;
        }
        const full = ground(inst.schema, inst.observations);
        if (!full.ok) throw new Error(`seed ${seed}: ground failed`);
        const fieldsOf = (component: readonly string[]) => inst.schema.fields.filter((f) => component.includes(f.id));
        const mine = (component: readonly string[]) => inst.observations.map((o, index) => ({ o, index })).filter(({ o }) => typeof o.field === "string" && component.includes(o.field));

        for (const component of components) {
          const part = mine(component);
          const alone = ground({ fields: fieldsOf(component) }, part.map(({ o }) => o));
          if (!alone.ok) throw new Error(`seed ${seed}: ground of one tree failed`);
          tally.comparedTrees += 1;
          if (alone.grounding.trees[0]!.state.kind === "conflicted") tally.conflictedAmongThem += 1;
          if (treeAnswers(full.grounding, component) !== treeAnswers(alone.grounding, component)) problems.push(`seed ${seed}: the answers about ${component.join(",")} differ from the same tree grounded alone`);
          const facesInFull = part.map(({ index }) => full.rejected.find((r) => r.index === index)?.fault);
          const facesAlone = part.map((_, i) => alone.rejected.find((r) => r.index === i)?.fault);
          if (JSON.stringify(facesInFull) !== JSON.stringify(facesAlone)) problems.push(`seed ${seed}: the faults of the observations about ${component.join(",")} differ`);
        }

        // perturbation: make one consistent tree conflicted and look at the others
        const baselines = oracleBaselines(fields);
        for (const component of components) {
          const tree = full.grounding.trees.find((t) => t.fields.includes(fieldId(component[0] as string)));
          if (tree === undefined || tree.state.kind !== "consistent") continue;
          const target = component.find((id) => {
            const b = baselines.get(id) as Extent;
            return inst.schema.fields.find((f) => f.id === id)?.kind === "base" && (b.lo === null || b.hi === null || b.hi - b.lo >= 1);
          });
          if (target === undefined) continue;
          const b = baselines.get(target) as Extent;
          const at = b.lo ?? (b.hi as number) - 1;
          const twice: RawObservation[] = [obs("zz-c1", target, at, at), obs("zz-c2", target, at + 1, at + 1)];
          const after = ground(inst.schema, [...inst.observations, ...twice]);
          if (!after.ok) throw new Error(`seed ${seed}: ground failed after the perturbation`);
          const hit = after.grounding.trees.find((t) => t.fields.includes(fieldId(target)));
          if (hit?.state.kind !== "conflicted") {
            problems.push(`seed ${seed}: two disjoint points did not conflict ${target}`);
            continue;
          }
          tally.perturbed += 1;
          for (const other of components) {
            if (other === component) continue;
            tally.perturbedOthers += 1;
            if (treeAnswers(full.grounding, other) !== treeAnswers(after.grounding, other)) problems.push(`seed ${seed}: a conflict in ${component.join(",")} changed an answer about ${other.join(",")}`);
          }
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("both properties were exercised on trees that were conflicted and trees that were not (needs every chunk above to have run)", () => {
    console.log(
      `locality: ${tally.instances} instances with more than one tree (${tally.skippedForRepeatedIds} left out for a repeated observation id); ${tally.comparedTrees} trees compared with themselves grounded alone, ${tally.conflictedAmongThem} of them conflicted; ${tally.perturbed} conflicts forced, each against ${tally.perturbedOthers} other trees in all`,
    );
    expect(tally.instances, "all chunks ran: do not filter this file with -t").toBeGreaterThanOrEqual(CHUNKS * PER_CHUNK * 0.3);
    expect(tally.comparedTrees).toBeGreaterThanOrEqual(1500);
    expect(tally.conflictedAmongThem).toBeGreaterThanOrEqual(200);
    expect(tally.perturbed).toBeGreaterThanOrEqual(1000);
    expect(tally.perturbedOthers).toBeGreaterThanOrEqual(1000);
  });
});

describe("plan case 03, by hand: a conflict silences its whole tree and touches no other", () => {
  const schema: RawSchema = schemaOf(...ORDER_DESK.fields, base("returnWindowDays"), base("restockDays"), derived("refundDay", ["returnWindowDays", "restockDays"]));
  const refund = [obs("r1", "returnWindowDays", 14, 30), obs("r2", "restockDays", 1, 3)];
  const f = fieldId;

  it("the order desk's step-5 evidence turns every field of the order-desk tree conflicted and leaves every field of the refund tree byte-identical", () => {
    const without = ground(schema, [...canon("o1", "o2"), ...refund]);
    const withConflict = ground(schema, [...canon("o1", "o2", "o3", "o4"), ...refund]);
    if (!without.ok || !withConflict.ok) throw new Error("failed");

    // before: a perfectly well-grounded claim about packDays
    expect(extentOf(without.grounding, f("packDays"))).toMatchObject({ ok: true, extent: { lo: 1, hi: 2 } });
    // after: no extent for any of the four, and the same core for each
    for (const field of ["packDays", "transitDays", "customsDays", "deliveryDay"]) {
      expect(extentOf(withConflict.grounding, f(field)), field).toStrictEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
      expect(supportOf(withConflict.grounding, f(field)), field).toStrictEqual({ ok: false, failure: { kind: "conflicted", core: ["o1", "o2", "o3", "o4"] } });
      expect(openEndsOf(withConflict.grounding, f(field), ["lo", "hi"]), field).toStrictEqual([]);
    }
    // the refund tree: nothing moved
    const refundFields = ["returnWindowDays", "restockDays", "refundDay"];
    expect(treeAnswers(withConflict.grounding, refundFields)).toBe(treeAnswers(without.grounding, refundFields));
    expect(extentOf(withConflict.grounding, f("refundDay"))).toMatchObject({ ok: true, extent: { lo: 15, hi: 33 } });
    expect(supportOf(withConflict.grounding, f("refundDay"))).toStrictEqual({ ok: true, support: { lo: ["r1", "r2"], hi: ["r1", "r2"] } });
    expect(withConflict.grounding.trees.map((t) => t.state.kind)).toEqual(["conflicted", "consistent"].sort((a, b) => (a === "conflicted" ? 0 : 1) - (b === "conflicted" ? 0 : 1)));
  });
});
