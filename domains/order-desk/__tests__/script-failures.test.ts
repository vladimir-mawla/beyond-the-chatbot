import { afterEach, describe, expect, it, vi } from "vitest";
import { CANON_SCRIPT, runScript } from "../index.js";

/**
 * THE FOUR FAILURE ROUTES OF `runScript` that the canonical constants cannot reach: the engine refusing the schema or a
 * snapshot, rejecting an observation, refusing an answer, or failing to re-check. Each is reached by wrapping the engine's
 * own function so that it returns what its contract allows for that failure, and each is asserted to be reported with the
 * step number and the engine's own value, not thrown. With no override the wrappers pass through to the real functions
 * (the control: the first test).
 */
const hooks = vi.hoisted(() => ({
  realGround: undefined as undefined | ((...args: unknown[]) => unknown),
  ground: undefined as undefined | ((...args: unknown[]) => unknown),
  answer: undefined as undefined | ((...args: unknown[]) => unknown),
  recheck: undefined as undefined | ((...args: unknown[]) => unknown),
  /** The schema argument of every `recheck` call, in order. */
  recheckSeen: [] as unknown[],
}));

vi.mock("../../../lib/ground/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/ground/index.js")>();
  hooks.realGround = (...args) => real.ground(...(args as Parameters<typeof real.ground>));
  return { ...real, ground: (...args: Parameters<typeof real.ground>) => (hooks.ground !== undefined ? hooks.ground(...args) : real.ground(...args)) };
});
vi.mock("../../../lib/entail/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/entail/index.js")>();
  return {
    ...real,
    answer: (...args: Parameters<typeof real.answer>) => (hooks.answer !== undefined ? hooks.answer(...args) : real.answer(...args)),
    recheck: (...args: Parameters<typeof real.recheck>) => (hooks.recheckSeen.push(args[0]), hooks.recheck !== undefined ? hooks.recheck(...args) : real.recheck(...args)),
  };
});

afterEach(() => {
  hooks.ground = undefined;
  hooks.answer = undefined;
  hooks.recheck = undefined;
  hooks.recheckSeen = [];
});

describe("runScript reports an engine failure with its step, and does not throw", () => {
  it("control: with the wrappers passing through, the canonical script runs", () => {
    expect(runScript(CANON_SCRIPT).ok).toBe(true);
  });

  it("ground refusing the snapshot is `ground-failed`, carrying the engine's failure", () => {
    const failure = { kind: "too-many-observations", count: 65, max: 64 };
    hooks.ground = () => ({ ok: false, failure });
    expect(runScript(CANON_SCRIPT)).toEqual({ ok: false, failure: { kind: "ground-failed", step: 1, failure } });
  });

  it("an observation rejected at intake is `observation-rejected` with the rejections, not a silently smaller snapshot", () => {
    const rejected = [{ index: 0, fault: { kind: "number-not-in-quote", value: 3 } }];
    hooks.ground = (...args) => ({ ...(hooks.realGround!(...args) as object), rejected });
    expect(runScript(CANON_SCRIPT)).toEqual({ ok: false, failure: { kind: "observation-rejected", step: 1, rejected } });
  });

  it("answer refusing is `answer-failed` with the engine's failure, at the step that failed", () => {
    const failure = { kind: "draft-too-long", count: 33, max: 32 };
    hooks.answer = () => ({ ok: false, failure });
    expect(runScript(CANON_SCRIPT)).toEqual({ ok: false, failure: { kind: "answer-failed", step: 1, failure } });
  });

  it("recheck refusing is `recheck-failed` with the engine's failure", () => {
    const failure = { kind: "hostile-input", message: "m" };
    hooks.recheck = () => ({ ok: false, failure });
    expect(runScript(CANON_SCRIPT)).toEqual({ ok: false, failure: { kind: "recheck-failed", step: 1, failure } });
  });

  it("a Brief that recheck does not find intact is carried through as it is: `intact` false and the engine's own findings, not a constant", () => {
    const findings = [{ position: "answer", result: { kind: "not-reproduced", reason: { kind: "unmet-differs" } } }];
    hooks.recheck = () => ({ ok: true, intact: false, findings });
    const result = runScript([CANON_SCRIPT[0]!]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0]!.intact).toBe(false);
    expect(result.steps[0]!.findings).toEqual(findings);
  });

  it("renders and rechecks over the engine's validated schema, not the domain constant", () => {
    const relabel = (schema: any) => ({ ...schema, fields: schema.fields.map((f: any) => (f.id === "customsDays" ? { ...f, label: "CUSTOMS-FROM-ENGINE" } : f)) });
    hooks.ground = (...args) => {
      const result: any = hooks.realGround!(...args);
      return { ...result, grounding: { ...result.grounding, schema: relabel(result.grounding.schema) } };
    };
    const run = runScript([CANON_SCRIPT[0]!]);
    if (!run.ok) throw new Error("the run failed");
    expect(run.steps[0]!.rendered).toContain("CUSTOMS-FROM-ENGINE");
    expect((hooks.recheckSeen[0] as any).fields.find((f: any) => f.id === "customsDays").label).toBe("CUSTOMS-FROM-ENGINE");
  });

  it("the failure is reported at the step that fails, after the steps before it ran (ground refuses the four-document snapshot only: step 5)", () => {
    hooks.ground = (...args) => ((args[1] as unknown[]).length === 4 ? { ok: false, failure: { kind: "hostile-input", message: "fifth" } } : hooks.realGround!(...args));
    expect(runScript(CANON_SCRIPT)).toEqual({ ok: false, failure: { kind: "ground-failed", step: 5, failure: { kind: "hostile-input", message: "fifth" } } });
  });
});
