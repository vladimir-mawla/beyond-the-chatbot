# ADR 0002 — M2 deploy: a health endpoint that runs M1's guard, a pinned build, and what was and was not observed

- **Date:** 2026-10-24
- **Status:** proposed — written by the builder, not yet verified by an independent L4 pass
- **Phase / milestone:** M2 (BUILD, DEPLOY) — `app/api/health/**`, the single `Live:` line in `README.md`, and this file

Every number below was produced by a run in this session, in either the working checkout or a scratch clone
(never committed). Sabotage results are quoted as "N failed" plus the files, with no "passed" denominator, so
adding a test later does not make a sentence stale. Counts of tests are deliberately not quoted in this file.

## Context

`.genesis/PLAN.md` section 6, M2: deploy now, never last. `GET /api/health` runs `assertEntailmentWellFormed`
(M1) on four values, reports the commit Vercel built or the literal `"unknown (local dev)"`, and answers `503`
with `status: "degraded"` when any check fails. `vercel.json` belongs to the scaffold (G3), not to M2: this
milestone pins it with a test and does not edit it. Nothing under `lib/` is edited; `git diff main -- . ':!app/api/health'
':!README.md' ':!.genesis/decisions/0002-deploy.md'` is empty on this branch, checked after every commit.

## Decision 1 — four runs of M1's guard, each value complete and differing from a valid one in one field

| # | Value | The guard must say |
|---|---|---|
| 1 | a well-formed `conflicted` | `ok` |
| 2 | a well-formed `ungrounded` plus `established` | `unexpected-field` / `ungrounded` / `established` |
| 3 | a well-formed `weakened` with `unmet` set to `[]` | `empty-array` / `weakened` / `unmet` |
| 4 | a well-formed `conflicted` with `core` removed | `missing-field` / `conflicted` / `core` |

Two directions on purpose: 1 goes red if the guard becomes "reject everything", 2 to 4 go red if it becomes
"accept everything", and 2 to 4 each name a different cell of the guard's table.

**Why complete values and not bare literals.** M1's verifier found, and `integrity.ts`'s doc comment records,
that the guard reports the FIRST problem it finds and checks a variant's required fields before its forbidden
ones. `{ kind: "ungrounded", established }` therefore reports `missing-field` / `openEnds`, never the
`unexpected-field` the plan expects, and a check built from bare literals would be testing a different cell
than its name says. `checks.test.ts` pins both halves: the bare forms really do report the earlier fault, and
for each of 2 to 4, repairing the one named field leaves a value the guard accepts (a second fault would still
fail after the repair). That is what "exactly one field" means here, and it is as the guard sees it.

**How the faults are built.** By a cast, `as unknown as Entailment`. M1's ADR Decision 3 lists the routes by
which a value like these can reach `Entailment` (rows 1 and 13 are the cast; row 14 is the same `unmet: []` cell
reached through `any`; the list also has supertype widening, mutation after construction, a lying type guard
and parsed JSON). This route takes the cast and makes no claim that it is the only one.

**What this does not cover.** Three cells of the guard's table (one forbidden, one required, one non-empty) plus
one value that must pass whole. A guard that broke some other cell would not turn the endpoint red;
`lib/contracts/__tests__/integrity.test.ts` pins every cell. The endpoint is a smoke check that M1's guard still
behaves, in the deployed process, on the cells the plan chose.

**Shape of the answer.** `{ status, commit, checks: { contracts: { pass, failing, cases: [{ name, pass,
expected, actual }] } } }`. `checks.contracts.pass` is the plan's name for the aggregate; `failing` lists the
names of the failing cases, and each case carries both the expected and the actual verdict, so a `503` names
which check failed and what the guard said instead.

**Where the code is.** `app/api/health/checks.ts` holds the cases and `runCase`; `route.ts` is `GET` plus the two
exports. A Next route module may export only `GET`, the segment config and a few other names, so a seam that the
tests need (a case whose input construction throws) cannot be exported from `route.ts`.
`route.test.ts` pins that `route.ts` exports exactly `GET`, `dynamic` and `runtime`.

## Decision 2 — input construction and the guard call are both inside the `try`

A case that throws while it is built, or a guard that throws, is a failed check with its phase named
(`threw during input construction: ...` / `threw during guard: ...`), and the route answers `503`. The tempting
tidy-up is to hoist `build()` above the `try`; then the first throw escapes `GET`.

Tested twice, directly. `checks.test.ts` hands `runCase` a case whose `build` throws, and one whose value makes the
real guard throw (an object with a throwing `kind` getter: M1's doc comment says "a getter that throws makes it
throw"). `route.test.ts` mocks `fieldId` to throw and checks that `GET` still resolves to a `503` naming all four
checks with the phase, and mocks `obsId` to throw once and checks that exactly the first case fails.
Hoisting the `build()` call out of the `try` in a scratch clone: **5 failed** (`checks.test.ts` 3,
`route.test.ts` 2). An empty list of cases is not healthy (`pass` needs at least one case), since a check that ran
nothing cannot fail; `checks.test.ts` pins it.

Also run against a real dev server (see the log): a guard that throws, and a `fieldId` that throws, each gave
`503` with all four checks failing and the phase in `actual`.

## Decision 3 — the commit is read per request, and the fallback is a literal

`process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown (local dev)"`, evaluated inside `GET`. Never a SHA computed or
guessed. Mutation runs: reading it at module load instead is **3 failed** (`route.test.ts`); a 40-zero SHA as
the fallback is **1 failed** (`route.test.ts`).

An empty string is not special-cased: it would be reported as an empty string. I did not observe Vercel set the
variable to an empty string (every deploy below carried the full 40-character SHA), so I neither handle nor claim
anything about it.

## Decision 4 — `dynamic` and `runtime` are declared because the plan requires them; what a build did without `dynamic`

`export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"`. `route.test.ts` pins that both are
exported with those values (deleting `dynamic`: **2 failed**, `route.test.ts`; deleting `runtime`: **2 failed**;
`dynamic = "auto"`: **1 failed**). Because the test imports the route as a module, deleting the `dynamic` export
also fails `npm run typecheck` (`route.test.ts`, TS2339: the module has no `dynamic`).

**This ADR does not say the export is what makes the route dynamic.** In a scratch clone I deleted the `dynamic`
export and removed the `route.dynamic` line from the test, so that typecheck passed. Then:
- `npm run build` still printed `ƒ /api/health` (Dynamic), with no `prerender-manifest.json` entry and no
  prerendered body file for the route;
- `next start` with `VERCEL_GIT_COMMIT_SHA` set only in the environment of the `start` process (it was not set
  during the build) answered `200` with `commit` equal to that value.

With the export present, the build and the Vercel deploy also list `ƒ /api/health`. So on Next 16.4.3 neither probe
distinguishes the two; the export is a declared guard, and what it guards against (a future default that would
prerender a route handler) was not tested here.

## Decision 5 — what the `vercel.json` pin catches, stated by running it

`app/api/health/__tests__/vercel-config.test.ts` reads `vercel.json` as text, runs `JSON.parse`, and requires
exactly the two keys with exactly the two values. A table of synthetic texts is in the test, and the real file
was mutated in a scratch clone:

| Change to `vercel.json` | Result |
|---|---|
| an extra key (`"framework"`) | **2 failed**, `vercel-config.test.ts` |
| a wrong `buildCommand` | **2 failed**, `vercel-config.test.ts` |
| malformed JSON (a trailing comma) | **2 failed**, `vercel-config.test.ts` |
| keys reordered and the file reformatted (tabs, no final newline) | nothing fails |
| a key written twice, last value right | nothing fails |
| a key written twice, last value wrong | **2 failed**, `vercel-config.test.ts` |

So: reordering and reformatting pass; an extra key, a wrong value, a missing key and malformed JSON fail.
`JSON.parse` keeps the LAST value of a repeated key, so the test cannot see an earlier, different one. That is a
statement about the test, not about what Vercel does with a repeated key, which I did not run.

**What the deploy shows, and what it does not.** The build log of the production deploy has
`Running "install" command: npm ci...`, then `Running "npm run build"`, then `> next build --webpack` and
`▲ Next.js 16.4.3 (webpack)`. But `vercel link` printed `Local settings detected in vercel.json` and created the
project with the same two values stored as the project's own Install and Build commands (`vercel project inspect`
shows both). So this deploy does not distinguish "vercel.json said so" from "the project settings say so". I did
not run a deploy without `vercel.json`, and make no claim about what the preset would have done.

## Decision 6 — Turbopack, run both ways, and the served-chunk check

Controls in a scratch clone of this branch, `rm -rf .next` before each build:

1. `npx next build --turbopack` with `app/api` present: exit 1, `Turbopack build failed`, `./app/api/health/checks.ts:1:1`
   `Module not found: Can't resolve '../../../lib/contracts/index.js'`. With the import written without `.js`
   (so only `lib/`'s own imports are in play): exit 1, 5 errors, the first
   `./lib/contracts/index.ts:36:1 Can't resolve './entailment.js'`.
2. `app/api` removed (`git rm -r`), `npx next build --turbopack`: exit 0, `▲ Next.js 16.4.3 (Turbopack)`, and a
   `turbopack-*.js` chunk. Served by `next start`, the home page loads six chunks (one named `turbopack-*.js`), and
   the string `turbopack` is in `index.html` and in five of the six chunks.
3. The deployed webpack build: the home page loads five chunks, including `webpack-<hash>.js`, the string
   `turbopack` is in none of them nor in the HTML, and `webpackChunk_N_E` is in four of them.

So the check "no `turbopack` string in the served chunks" was seen to fail on a Turbopack build and pass on this
one. Two cautions. The failed build in (1) still left chunk files in `.next/static/chunks`, including a
`turbopack-*.js` with the same name as the one in (2), so a directory listing after a build is not evidence that
the build succeeded; the exit code is. And the chunks checked are the ones the HOME page serves: the route's own
server bundle is not served over HTTP, so this checks the build's bundler, not the route's runtime chunk.

## Decision 7 — deploy procedure, and the integration that follows the merge

Each production deploy is made from a fresh `git clone -b m2-deploy` of the pushed head, with
only `.vercel/project.json` copied in, `git status --short` empty before `vercel deploy --prod --yes`, and then
`commit` in the live response compared with `git rev-parse HEAD` of that clone. A deploy from a working tree
(the CLI uploads files while `VERCEL_GIT_COMMIT_SHA` reads `HEAD`) is how the two come apart, and is refused. The
SHA of each deploy is in the PR body, not here, because a commit cannot name itself.

`vercel link` created the project and connected the GitHub repository in one step. It has two side effects, both
undone straight away and checked: it appends a bare `.env*` to the tracked `.gitignore` (which would re-ignore
`.env.example`; reverted with `git checkout -- .gitignore`) and writes `.env.local` with a `VERCEL_OIDC_TOKEN`
(deleted without printing it). `.vercel/` is ignored by `.gitignore`; no `.env*` other than `.env.example` is
tracked.

**The Git integration also builds what is pushed, and that was not what the task expected.** Observed: the first
push of this branch after `vercel link` was built by the integration with target `production`, although the project's
production branch is `main` (read from the project settings): the project had no production deployment yet, and
the result was two production deployments of the same commit, the integration's and my CLI deploy made 20 seconds
later; both served that commit. The next push was built as a `preview`. The project's protection is
`ssoProtection: all_except_custom_domains`: the production alias answers publicly (no redirect), while a
deployment-specific URL, the branch alias and the project alias on the team scope each answer `302` to
`vercel.com/sso-api`. So the public URL is the production alias only, and a preview of this branch cannot be curled
without a Vercel login.

**After this PR merges, the integration redeploys `main`.** The live `commit` will then be the merge commit, not a
commit of this branch. The checks above are about the CLI deploys of this branch; the integration's deploy of
`main` is not something this milestone verified.

## Rejected alternatives

- **A bare liveness `{ ok: true }`**: the plan refuses it; it can never fail.
- **Building the three faults from bare literals**: see Decision 1; they report the wrong cell.
- **Exporting `runCase` from `route.ts` for the tests**: Next rejects unknown route exports.
- **Editing `vercel.json`**: it is the scaffold's file; M2 pins it.
- **Reading the SHA from `git rev-parse` locally**: a local value can disagree with what is deployed, and the
  plan says never a guessed SHA.
- **Special-casing an empty `VERCEL_GIT_COMMIT_SHA`**: a case nobody asked for and I did not observe; see Decision 3.

## What is not proven

- That the cells chosen are the right ones, or that the guard is correct in the others: M1's tests own that.
- That `dynamic = "force-dynamic"` changes anything on Next 16.4.3 (Decision 4).
- That `vercel.json`, rather than the project's stored settings, is what drove the deploy (Decision 5).
- What Vercel does with a repeated key in `vercel.json`, or with an empty `VERCEL_GIT_COMMIT_SHA`.
- That the `main` redeploy after merge is healthy (Decision 7).
- That the alias never serves an older deployment briefly after a deploy: it was re-requested after about 10
  seconds and about a minute at the final head, which shows those two instants and nothing about the window between.

## Falsifiability log

**Dev-server sabotage** (scratch clone, `next dev --webpack`, ports 3471 to 3477, one bounded server each: pid file,
at most 30 readiness polls, kill, `lsof -ti:<port> | xargs kill`, port confirmed free; every edit reverted with
`git checkout -- .`, status empty):

| Break | Where | Answer |
|---|---|---|
| none | | `200`, `ok`, commit `unknown (local dev)` |
| wrong expected value for check 1 | route's case table | `503`, failing `well-formed-conflicted`, actual `ok` |
| `"established"` dropped from `FORBIDDEN.ungrounded` | guard's table | `503`, failing `ungrounded-carrying-established`, actual `ok` |
| `unmet` branch disabled for `weakened` (the plan's own sabotage) | guard | `503`, failing `weakened-with-empty-unmet`, actual `ok` |
| early `return { ok: true }` for `conflicted` | guard | `503`, failing `conflicted-missing-core`, actual `ok` |
| the guard throws | guard | `503`, all four failing, `threw during guard: ...` |
| `fieldId` throws | `lib/contracts/ids.ts` | `503`, all four failing, `threw during input construction: ...` |

Each of the first four turns exactly one check red. The early return for `conflicted` leaves check 1 green (it
expects `ok`) and turns only check 4 red, so check 1 was broken with a wrong expected value in the route's table;
`route.test.ts` also breaks it with a mocked guard that rejects a well-formed `conflicted`.

**Test mutations** (same scratch clone), "N failed":

| Mutation | Failed |
|---|---|
| `build()` hoisted out of the `try` | 5: `checks.test.ts` 3, `route.test.ts` 2 |
| `dynamic` export deleted | 2: `route.test.ts` |
| `runtime` export deleted | 2: `route.test.ts` |
| `dynamic = "auto"` | 1: `route.test.ts` |
| SHA read at module load | 3: `route.test.ts` |
| fabricated SHA as the fallback | 1: `route.test.ts` |
| always `200` | 10: `route.test.ts` |
| `status` always `"ok"` | 7: `route.test.ts` |
| `vercel.json`: extra key / wrong value / trailing comma / repeated key with a wrong last value | 2 each: `vercel-config.test.ts` |

## Plan observations (found by building; the plan is frozen and was not edited)

1. **`.env.example` is stale.** It says the health route is "milestone M2, NOT BUILT YET". It is G3's file, so M2 did
   not edit it.
2. **README prose around the `Live:` line is stale** ("genesis scaffold only", "no engine code"): the plan lets M2 change
   one line; M9 rewrites the rest.
3. **"No `turbopack` string in the served runtime chunk"** (plan, M2): the route's server chunk is not served. The
   check that can be run is on the chunks the home page serves (Decision 6).
4. **"`checks.contracts.pass: true`"** (plan, M2 check): implemented as an aggregate `pass` over per-case results.
5. **"Needs a Vercel account — a human step"**: done through an existing CLI login; the link and deploy output is in
   the PR body.
