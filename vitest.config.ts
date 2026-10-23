import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React)
// because lib/ must stay framework-free. Same discipline as this project's
// infrastructure siblings (decision-engine, shadow-run, memory-ledger,
// agent-control-tower, adaptive-agent, autonomous-company-simulator).
//
// Every include glob below except "tests/**/*.test.ts" matches nothing until
// its milestone lands: the "pre-added-ahead-of-need" precedent the sibling
// projects' own vitest.config.ts files document. An empty glob costs
// nothing today, and this file never needs a second edit just to teach
// vitest where a later, already-planned milestone's tests live.
//   - "lib/**/*.test.ts"          — M1 (contracts) through M5 (entail)
//   - "app/**/*.test.ts"          — M2 (health route) / M8 (milestones drift guard)
//   - "domains/**/*.test.ts"      — M6 (order-desk domain)
//   - "components/**/*.test.ts"   — M8 (pure bridge, formatters)
//   - "components/**/*.test.tsx"  — M8 (renderToStaticMarkup render-smoke)
//   - "tests/**/*.test.ts"        — this repo's smoke and lockfile tests now;
//                                   M7's failure suite and M9's citations
//                                   test later
//
// The two components/** globs are the one thing that is NOT in every
// sibling. adaptive-agent's vitest.config.ts includes only lib/ app/
// domains/ tests/, so copying it verbatim would make this project's M8
// tests under components/order-desk/** silently never run: vitest reports
// "no test files" or simply skips them, and nothing goes red. The tree this
// file was copied from (autonomous-company-simulator) already carries both
// globs; they are kept here, at genesis, so M8 cannot hit that.
//
// `fileParallelism: false` is deliberately NOT set (plan section 12,
// deviation 2). agent-control-tower needs it only because its architecture
// tests write scratch files *inside lib/*, which collide when vitest runs
// test files in parallel worker processes. This project's architecture
// tests are specified to write scratch fixtures under os.tmpdir(), never
// inside lib/, so the default is kept; if a milestone ever chooses
// scratch-in-repo fixtures, add the option at that point, not before.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "domains/**/*.test.ts",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      "tests/**/*.test.ts",
    ],
    watch: false,
  },
});
