import { describe, expect, it } from "vitest";
import { fieldId } from "../../contracts/index.js";
import type { Extent } from "../../contracts/index.js";
import { oracleMeet } from "../../extent/__tests__/fixtures.js";
import { ground, readSchema } from "../index.js";
import { solve, structureOf, treesOf } from "../solve.js";
import { ORDER_DESK, genInstance, int, mulberry32, obs, oracleFields, pick, schemaOf, base, derived } from "./fixtures.js";
import { oracleBaselines, oracleTreeOf } from "./oracle.js";

/**
 * THE SINGLE-OBSERVATION THEOREM (plan section 4.3: "a single observation that meets its field's computed
 * baseline never conflicts by itself"; section 6, M4: "an observation that meets its field's `B` never conflicts
 * alone; one that does not always does"). It is what lets `outside-baseline` be refused at intake with no
 * conflict machinery, and what makes every core at least two observations.
 *
 * Three views of it, over generated schemas and random extents, with the oracle as the judge of "meets `B`":
 *  - the propagation itself (`solve`, internal) with exactly one constraint: conflicted exactly when the extent has
 *    no integer in common with `B(field)`, and the brute-force enumeration agrees about whether a world exists;
 *  - `ground` with one observation: accepted (and its tree consistent) exactly when it meets `B`, refused as
 *    `outside-baseline` otherwise;
 *  - every core `ground` finds on the generated instances has at least two members.
 * The counts of each side are printed so that neither is vacuous.
 */

const CHUNKS = 40;
const PER_CHUNK = 50;
const seen = { singles: 0, meets: 0, misses: 0, conflictedTrees: 0, smallestCore: Number.POSITIVE_INFINITY, coresChecked: 0 };

describe("one observation never conflicts unless it misses B, and always does if it misses B", () => {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const from = chunk * PER_CHUNK + 1;
    it(`seeds ${from} to ${from + PER_CHUNK - 1}: solve, the oracle and ground agree on whether one observation conflicts`, () => {
      const problems: string[] = [];
      for (let seed = from; seed < from + PER_CHUNK; seed++) {
        const rng = mulberry32(seed);
        const inst = genInstance(rng);
        const fields = oracleFields(inst.schema);
        const baselines = oracleBaselines(fields);
        const read = readSchema(inst.schema);
        if (!read.ok) throw new Error("the generator made a bad schema");
        const structure = structureOf(read.schema);
        const components = treesOf(structure);
        for (let k = 0; k < 3; k++) {
          const field = pick(rng, fields).id;
          const lo = chance(rng) ? null : int(rng, -3, 8);
          const hi = lo === null ? (chance(rng) ? null : int(rng, -3, 8)) : chance(rng) ? null : lo + int(rng, 0, 6);
          const extent: Extent = { lo, hi };
          const b = baselines.get(field) as Extent;
          const meets = oracleMeet(extent, b) !== undefined;
          seen.singles += 1;
          if (meets) seen.meets += 1;
          else seen.misses += 1;

          // the propagation
          const component = components.find((c) => c.members.includes(field));
          if (component === undefined) throw new Error("no tree");
          const solved = solve(structure, component.members, [{ field, extent }]);
          if ((solved.kind === "conflicted") !== !meets) problems.push(`seed ${seed}: solve says ${solved.kind} for ${JSON.stringify(extent)} on ${field} whose B is ${JSON.stringify(b)}`);
          // the enumeration
          const world = oracleTreeOf(fields, [{ id: "x", field, extent }], field).exists;
          if (world !== meets) problems.push(`seed ${seed}: the oracle says world=${world} but the extent ${meets ? "meets" : "misses"} B`);
          // ground, with a quote that holds the digits, so that only the baseline can refuse it
          const digits = [lo, hi].filter((x): x is number => x !== null).map((x) => String(Math.abs(x)));
          const r = ground(inst.schema, [{ id: "x", field, extent, quote: digits.length > 0 ? `${digits.join(" and ")} days` : "no figure", source: "s" }]);
          if (!r.ok) throw new Error("ground failed");
          const verdict = r.rejected[0]?.fault.kind ?? "accepted";
          if (meets) {
            if (verdict !== "accepted") problems.push(`seed ${seed}: an observation that meets B was ${verdict}`);
            if (r.grounding.trees.some((t) => t.state.kind === "conflicted")) problems.push(`seed ${seed}: an observation that meets B conflicted alone`);
          } else if (verdict !== "outside-baseline") problems.push(`seed ${seed}: an observation that misses B was ${verdict}`);
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("every core ground finds has at least two members (3000 instances)", () => {
    for (let seed = 20001; seed <= 23000; seed++) {
      const r = ground(...asArgs(genInstance(mulberry32(seed))));
      if (!r.ok) continue;
      for (const tree of r.grounding.trees) {
        if (tree.state.kind !== "conflicted") continue;
        seen.conflictedTrees += 1;
        seen.coresChecked += 1;
        seen.smallestCore = Math.min(seen.smallestCore, tree.state.core.length);
      }
    }
    expect(seen.conflictedTrees).toBeGreaterThanOrEqual(500);
    expect(seen.smallestCore).toBe(2);
  });

  it("both sides were exercised, and the counts are printed (needs every chunk above to have run)", () => {
    console.log(`single observations: ${seen.singles} (${seen.meets} meet B and never conflicted; ${seen.misses} miss B and always did); ${seen.coresChecked} cores, the smallest has ${seen.smallestCore} members`);
    expect(seen.singles, "all chunks ran: do not filter this file with -t").toBe(CHUNKS * PER_CHUNK * 3);
    expect(seen.meets).toBeGreaterThanOrEqual(2000);
    expect(seen.misses).toBeGreaterThanOrEqual(300);
  });
});

function asArgs(inst: ReturnType<typeof genInstance>): [unknown, unknown] {
  return [inst.schema, inst.observations];
}
function chance(rng: () => number): boolean {
  return rng() < 0.4;
}

describe("by hand", () => {
  it("an observation on a derived field that meets its computed baseline never conflicts: B(t) = [6, 8] and 8 meets it", () => {
    const schema = schemaOf(base("a", 2, 3), base("b", 4, 5), derived("t", ["a", "b"]));
    const r = ground(schema, [obs("k", "t", 8, 20)]);
    expect(r.ok && r.rejected).toEqual([]);
    expect(r.ok && r.grounding.trees[0]!.state.kind).toBe("consistent");
    expect(ground(schema, [obs("k", "t", 9, 20)])).toMatchObject({ ok: true, rejected: [{ index: 0, fault: { kind: "outside-baseline", field: "t" } }] });
  });

  it("two observations that each meet B can conflict, and the core is both: the smallest core is two", () => {
    const r = ground(ORDER_DESK, [obs("a", "packDays", 5, 5), obs("b", "packDays", 0, 3)]);
    if (!r.ok) throw new Error("failed");
    expect(r.rejected).toEqual([]);
    expect(r.grounding.trees.find((t) => t.fields.includes(fieldId("packDays")))?.state).toStrictEqual({ kind: "conflicted", core: ["a", "b"] });
  });
});
