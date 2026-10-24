import { runContractChecks } from "./checks";

/**
 * `GET /api/health` (`.genesis/PLAN.md` section 6, M2): runs the contract self-checks of `./checks.ts` on every
 * request and says so in the status code. 200 with `status: "ok"` only if all four pass; 503 with
 * `status: "degraded"` if any check fails, throws, or fails to build its input. A bare 200 would be a
 * liveness ping, which the plan refuses.
 *
 * `dynamic = "force-dynamic"` and `runtime = "nodejs"` are what the plan requires this route to declare, and
 * `route.test.ts` pins both. They are DECLARED INTENT, not the thing this route relies on: on Next 16.4.3 the
 * ADR (`.genesis/decisions/0002-deploy.md`, Decision 4) records what a build and a start were observed to do
 * with the `dynamic` export deleted. The route reads `process.env` inside `GET`, per request, never at import
 * time, so the commit it reports is the one in the running process's environment.
 *
 * A route module may export only `GET`, the segment config and a few other names; the checks, and the seam
 * the tests use, are in `./checks.ts` for that reason (`route.test.ts` pins the export list).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reported when Vercel did not set the variable (local dev, `next start` outside Vercel). Never replaced by a guessed SHA. */
const UNKNOWN_COMMIT = "unknown (local dev)";

export function GET(): Response {
  const contracts = runContractChecks();
  const body = {
    status: contracts.pass ? "ok" : "degraded",
    // Read per request, here, and not at module load. Set by Vercel on a deployment; absent locally.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? UNKNOWN_COMMIT,
    checks: { contracts },
  };
  // Fail closed: the status code carries the verdict, so a monitor that only reads the code sees a degraded service.
  return Response.json(body, { status: contracts.pass ? 200 : 503 });
}
