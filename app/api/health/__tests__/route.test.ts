import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entailment, EntailmentIntegrity } from "../../../../lib/contracts/index.js";
import * as contracts from "../../../../lib/contracts/index.js";
import * as route from "../route";
import { GET } from "../route";

/**
 * `GET /api/health`, called directly, both branches. `lib/contracts/index.js` is mocked with the REAL
 * `assertEntailmentWellFormed`, `fieldId` and `obsId` wrapped so a test can make one of them lie or throw;
 * in `beforeEach` every wrapper is put back to the real function, so a test that does not touch them runs the
 * real guard end to end.
 *
 * What each test would catch is named in the test. `checks.test.ts` covers the four cases themselves.
 */
vi.mock("../../../../lib/contracts/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/contracts/index.js")>();
  return {
    ...real,
    assertEntailmentWellFormed: vi.fn(real.assertEntailmentWellFormed),
    fieldId: vi.fn(real.fieldId),
    obsId: vi.fn(real.obsId),
  };
});

const guard = vi.mocked(contracts.assertEntailmentWellFormed);
const mintField = vi.mocked(contracts.fieldId);
const mintObs = vi.mocked(contracts.obsId);

const CASE_NAMES = ["well-formed-conflicted", "ungrounded-carrying-established", "weakened-with-empty-unmet", "conflicted-missing-core"] as const;
type CaseName = (typeof CASE_NAMES)[number];

interface Body {
  readonly status: string;
  readonly commit: string;
  readonly checks: {
    readonly contracts: {
      readonly pass: boolean;
      readonly failing: readonly string[];
      readonly cases: readonly { readonly name: string; readonly pass: boolean; readonly expected: string; readonly actual: string }[];
    };
  };
}

async function call(): Promise<{ readonly status: number; readonly body: Body; readonly contentType: string | null }> {
  const response = await GET();
  return { status: response.status, body: (await response.json()) as Body, contentType: response.headers.get("content-type") };
}

beforeEach(async () => {
  const real = await vi.importActual<typeof import("../../../../lib/contracts/index.js")>("../../../../lib/contracts/index.js");
  guard.mockImplementation(real.assertEntailmentWellFormed);
  mintField.mockImplementation(real.fieldId);
  mintObs.mockImplementation(real.obsId);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what the module exports", () => {
  it("declares force-dynamic and the nodejs runtime", () => {
    // The plan requires both. This pins that they are declared, not what Next does with them: the ADR records
    // what a build was observed to do when the `dynamic` export was deleted.
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.runtime).toBe("nodejs");
  });

  it("exports exactly GET, dynamic and runtime: the checks' seam cannot leak into the route module, which Next would reject", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
  });
});

describe("the healthy branch (the real guard)", () => {
  it("answers 200, status ok, and all four checks passing with the plan's verdicts", async () => {
    const { status, body, contentType } = await call();
    expect(status).toBe(200);
    expect(contentType).toContain("application/json");
    expect(body.status).toBe("ok");
    expect(body.checks.contracts.pass).toBe(true);
    expect(body.checks.contracts.failing).toEqual([]);
    expect(body.checks.contracts.cases).toEqual([
      { name: "well-formed-conflicted", pass: true, expected: "ok", actual: "ok" },
      { name: "ungrounded-carrying-established", pass: true, expected: "unexpected-field/ungrounded/established", actual: "unexpected-field/ungrounded/established" },
      { name: "weakened-with-empty-unmet", pass: true, expected: "empty-array/weakened/unmet", actual: "empty-array/weakened/unmet" },
      { name: "conflicted-missing-core", pass: true, expected: "missing-field/conflicted/core", actual: "missing-field/conflicted/core" },
    ]);
  });

  it("runs the guard on every request, four times each: it is not computed once at import", async () => {
    guard.mockClear();
    await call();
    expect(guard).toHaveBeenCalledTimes(4);
    await call();
    expect(guard).toHaveBeenCalledTimes(8);
  });
});

describe("the commit it reports", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";

  it("is VERCEL_GIT_COMMIT_SHA when it is set", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    expect((await call()).body.commit).toBe(SHA);
  });

  it("is read per request, not captured at import: changing it between two calls changes the answer", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    expect((await call()).body.commit).toBe("a".repeat(40));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "b".repeat(40));
    expect((await call()).body.commit).toBe("b".repeat(40));
  });

  it('is the literal "unknown (local dev)" when it is unset, and never a SHA-shaped guess', async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    expect(process.env.VERCEL_GIT_COMMIT_SHA).toBeUndefined();
    const { body } = await call();
    expect(body.commit).toBe("unknown (local dev)");
    expect(body.commit).not.toMatch(/^[0-9a-f]{40}$/);
  });

  it("is reported on the degraded branch too", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    guard.mockImplementation(() => ({ ok: false, error: { kind: "unknown-variant", found: "x" } }));
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.commit).toBe(SHA);
  });
});

describe("the degraded branch: 503, status degraded, and the failing check is named", () => {
  /**
   * For each case, a guard that gives the WRONG verdict for that case's input and the real verdict for the
   * other three. Shows that the four inputs are told apart, that exactly one flipped check is reported, and
   * that it is the right one.
   */
  const lies: readonly (readonly [CaseName, (input: Entailment) => EntailmentIntegrity | undefined])[] = [
    ["well-formed-conflicted", (e) => (e.kind === "conflicted" && "core" in e ? { ok: false, error: { kind: "missing-field", variant: "conflicted", field: "core" } } : undefined)],
    ["ungrounded-carrying-established", (e) => (e.kind === "ungrounded" ? { ok: true } : undefined)],
    ["weakened-with-empty-unmet", (e) => (e.kind === "weakened" ? { ok: true } : undefined)],
    ["conflicted-missing-core", (e) => (e.kind === "conflicted" && !("core" in e) ? { ok: true } : undefined)],
  ];

  it.each(lies)("a wrong verdict on %s alone: 503 naming only that check", async (name, lie) => {
    const real = await vi.importActual<typeof import("../../../../lib/contracts/index.js")>("../../../../lib/contracts/index.js");
    guard.mockImplementation((input) => lie(input) ?? real.assertEntailmentWellFormed(input));
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.contracts.pass).toBe(false);
    expect(body.checks.contracts.failing).toEqual([name]);
    expect(body.checks.contracts.cases.filter((c) => !c.pass).map((c) => c.name)).toEqual([name]);
  });

  it("a guard that accepts everything fails the three checks that expect a fault", async () => {
    guard.mockImplementation(() => ({ ok: true }));
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.contracts.failing).toEqual(["ungrounded-carrying-established", "weakened-with-empty-unmet", "conflicted-missing-core"]);
  });

  it("a guard that rejects everything fails the one check that expects ok", async () => {
    guard.mockImplementation(() => ({ ok: false, error: { kind: "unknown-variant", found: "x" } }));
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.checks.contracts.failing).toEqual([...CASE_NAMES]);
    expect(body.checks.contracts.cases[0]?.actual).toBe("unknown-variant/x");
  });

  it("a guard that THROWS is a 503 with the phase named, not a rejected promise or a 500", async () => {
    guard.mockImplementation(() => {
      throw new Error("guard exploded");
    });
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.contracts.failing).toEqual([...CASE_NAMES]);
    expect(body.checks.contracts.cases.map((c) => c.actual)).toEqual(Array(4).fill("threw during guard: guard exploded"));
  });

  it("INPUT CONSTRUCTION that throws is a 503 too: hoisting the build out of the try turns this red", async () => {
    // `fieldId` is called while each case builds its input, before the guard runs. If `build()` were called
    // outside `runCase`'s `try`, this `await GET()` would reject instead of resolving to a 503.
    mintField.mockImplementation(() => {
      throw new Error("could not mint a field id");
    });
    guard.mockClear();
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.contracts.failing).toEqual([...CASE_NAMES]);
    expect(body.checks.contracts.cases.map((c) => c.actual)).toEqual(Array(4).fill("threw during input construction: could not mint a field id"));
    expect(guard).not.toHaveBeenCalled();
  });

  it("input construction that throws in ONE case fails that case only", async () => {
    // `obsId` is used by the conflicted and weakened inputs; fail it once, for the first call only (the
    // well-formed conflicted, which builds first), and every other case builds normally.
    mintObs.mockImplementationOnce(() => {
      throw new Error("first mint fails");
    });
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(body.checks.contracts.failing).toEqual(["well-formed-conflicted"]);
    expect(body.checks.contracts.cases[0]?.actual).toBe("threw during input construction: first mint fails");
  });
});
