# CURRENT

- **active_loop:** none recorded. M1 (contracts, `lib/contracts/**`) and M2 (deploy skeleton,
  `app/api/health/**`) are `done`; M3 to M9 are `todo` in this revision. The engine proper is not built:
  M1 is types and structural invariants only, and `lib/extent`, `lib/ground` and `lib/entail` do not
  exist. `.genesis/PLAN.md` (G0-G2) and the tooling skeleton are in place, a skeleton is deployed (see
  "What M2 adds"), and `app/page.tsx` is still the genesis placeholder. Each milestone is separate, with
  its own branch, its own PR, and its own independent (L4) verifier.

- **last updated:** 2026-10-24, in the `chore(genesis): mark M2 done` bookkeeping PR, after M2 passed
  independent L4 verification and merged (PR #3). The previous revision was the `mark M1 done` PR's
  (PR #2), written after M1 merged (PR #1), and the one before it was written immediately after genesis
  (repo scaffold, `.genesis/` ritual, README, two tests, CI workflow), before any milestone build had
  begun. Recorded honestly rather than implying progress that does not exist: a checkpoint that
  misstates status in either direction is worse than no checkpoint at all.

## Milestone state, as of this revision

| | Status | Where |
|---|---|---|
| M1 contracts | `done` | PR #1 → `c3eba1d` (squash-merged; the PR page still shows the pre-rewrite `1a7cf44`, see below); independent L4 APPROVE on the fourth review, after three fix rounds |
| M2 deploy | `done` | PR #3 → `d7aedb4` (squash-merged; the PR page shows the same SHA, see below); independent L4 APPROVE in round 2, after one fix round; live, see "What M2 adds" below |
| M3 extent algebra | `todo` | designed only |
| M4 ground | `todo` | designed only |
| M5 entail | `todo` | designed only |
| M6 domain (order desk) | `todo` | designed only |
| M7 failure suite | `todo` | designed only |
| M8 interactive demo | `todo` | designed only |
| M9 deliverables | `todo` | designed only |

`main` is the genesis base (the plan, tooling config, app shell, two tests, a CI workflow, the README and
the `.genesis/` ritual) plus three merged PRs: #1, M1 (`lib/contracts/**`, its tests, and
`.genesis/decisions/0001-contracts.md`); #2, `mark M1 done`, which edited only the two `.genesis/` files
(`git diff --stat c3eba1d f9cb2eb`); and #3, M2 (`app/api/health/**` with its tests,
`.genesis/decisions/0002-deploy.md`, and one changed line in `README.md`, the `Live:` line). `lib/`
holds only `contracts` and there is no `domains/`. The one route is `app/api/health`; it is deployed (see
"What M2 adds"). The engine directories are `lib/extent`, `lib/ground`, `lib/entail` (plus
`lib/contracts`), not the house-template names; if a brief says otherwise, `.genesis/PLAN.md` wins and
the builder flags the mismatch.

## `main` history was rewritten on 2026-10-24 (SHAs you may see on PR pages)

`main` was rewritten once, deliberately, to correct commit attribution. The 19 genesis commits carried
a work email address as author and committer, which GitHub's commits API attributed to a different
account (`vldmr-mawla`); they now carry `105279249+vladimir-mawla@users.noreply.github.com`, attributed
to `vladimir-mawla`. Only commit metadata changed, so the SHAs changed and the content did not.

GitHub's PR page for #1 still shows the pre-rewrite merge SHA. To match it against `git log`:

| PR | Merge SHA shown on the PR page (pre-rewrite) | SHA on `main` now |
|---|---|---|
| #1 M1 contracts | `1a7cf44` | `c3eba1d` |

The genesis tip moved the same way: `8943493` (the pre-rewrite parent of `1a7cf44`) is now `141f1cd`.

PR #2 and PR #3 need no pair: GitHub reports their merge commits as `f9cb2ebc55bd...` and `d7aedb4c770d...`
(`gh pr list --state all --json number,mergeCommit`), which are the SHAs on `main` now.

What was compared, and nothing more. The pre-rewrite commits are on no branch any more; they were read
by SHA from GitHub's commits API, which still serves them today and may not always.

- The PR #1 merge pair, `1a7cf44` and `c3eba1d`: the same tree (`c819130`) and the same message. The
  parent differs, as it must. The API reports `verified: true` for `1a7cf44` and `verified: false` for
  `c3eba1d`: GitHub's signature on the squash commit covers its parent SHA, which changed, so it could
  not carry over.
- The 19 genesis commits, the pre-rewrite chain from `8943493` against the current chain from `141f1cd`,
  position by position: 19 of 19 have the same tree and the same full message. Only the author and
  committer email differ.

The sibling `autonomous-company-simulator` was rewritten the same way, and one of its SHAs is cited in
the dependency bullet below: its `next` 16.4.3 PR #1 merge commit, which this repository's dependency
versions were copied from, was `fc17afd` and is now `ab14763`. Compared through the same API: the same
tree (`f1255ae`), and messages that are identical except for one `Co-authored-by` line, whose email is
the attribution fix itself. `fc17afd` has no common ancestor with that repository's current `main`;
`ab14763` is an ancestor of it.

## What the scaffold does and does not prove

- **Proves, locally at genesis:** `npm ci` restores with the native bindings intact, `npm run typecheck`
  is clean, `npm test` runs 2 files / 6 tests, and `npm run build` succeeds under webpack. Whether CI
  passes is recorded by CI itself (the Actions tab), not asserted here.
- **`tests/smoke.test.ts`** pins that the `dev`/`build` scripts really pass `--webpack` and that
  `next.config.ts` really declares `experimental.extensionAlias` (it imports the config and reads the
  exported object rather than matching source text, because the config's own comment contains the word).
  On its own it does **not** prove that a `.js`-suffixed import resolves in a build: that needs a file
  under `app/` to import `lib/`. Before M2 none did (and `tsconfig.json` excludes `lib/**/*`), so
  `npm run build` did not exercise `lib/` at all, M1 included. Checked then, on a throwaway copy of `main`
  at `c3eba1d`: with no import the build output contained no `lib/contracts` symbol; with one temporary
  `import * as contracts from "../lib/contracts/index.js"` in `app/page.tsx` the build succeeded and its
  output contained them. (M1's ADR says the same, in its scratch-build log E and plan observation 6; the
  earlier sentence here, that the build covers it "from M1", was wrong.)
  Since M2 a file does: `app/api/health/checks.ts` imports `../../../lib/contracts/index.js`, and
  `app/api/health/route.ts` imports `./checks`, so `npm run build` now has to resolve that import. Checked
  for this revision on `main` at `d7aedb4`, with `.next` deleted before every build: `npm run build` on the
  unmodified tree exited 0. On a throwaway copy, with the `experimental.extensionAlias` block removed from
  `next.config.ts`, it exited 1 with `Module not found: Can't resolve '../../../lib/contracts/index.js'`
  at `app/api/health/checks.ts`, and with the block put back it exited 0 again. On the same copy,
  `npx next build --turbopack` exited 1 with the same `Module not found` for the same import. So the
  build is now evidence for the alias and for the webpack pin, for this one import path. It is not
  evidence for anything `lib/` would do at runtime. Repeat the removal check from a deleted `.next`.
- **`tests/lockfile.test.ts`** fails if `package-lock.json` has fewer than 80 `os`/`cpu` entries or has
  lost any of the 15 `@rolldown/binding-*`, `fsevents` or 11 `lightningcss-*` entries by name. Measured
  at genesis on a throwaway copy: `npm install --package-lock-only` under npm 11.5.1 exits 0 and takes
  the lockfile from 80 platform entries (215 packages) to 53 (188), removing exactly those 27; npm 10.9.9
  keeps all 80. The test does not detect other kinds of lockfile damage.
- **Does not prove anything about the engine.** The scaffold has none. The only engine code is M1's
  contracts (types and structural invariants) and the health route that self-checks M1's guard (M2),
  covered in the next two sections; M3 to M5 are `todo`, so the extent algebra, grounding, propagation,
  ruling and recheck are still designs, not results. The plan's own section 8 numbers come from a
  throwaway model that is not in this repository.
- `vercel.json` is committed and pinned to `npm ci` / `npm run build`, and since M2 a test pins it:
  `app/api/health/__tests__/vercel-config.test.ts` requires exactly those two keys with exactly those two
  values. Checked on a throwaway copy of `main` at `d7aedb4`: adding a `"framework"` key made that file
  fail 2 tests, changing `buildCommand` to `next build` failed 2, and with the file restored it passed all
  26. The test pins the file's text only. Whether a Vercel build used `vercel.json` or the project's own
  stored Install and Build commands is a separate question that the deploy does not answer either (ADR
  0002, Decision 5). The project is deployed (see "What M2 adds").

## What M1 adds, and what was run to check it

- `npm ci && npm test` on a fresh clone of `main` at `c3eba1d` printed `Test Files  18 passed (18)` and
  `Tests  300 passed (300)`. By directory: `tests/` (the two genesis files) 2 files / 6 tests, the figure
  the first bullet above records at genesis, and `lib/contracts/__tests__/` 16 files / 294 tests.
  `npm run typecheck` and `npm run build` also exited 0 on that tree. The same four commands were run
  again on the `mark M1 done` branch (PR #2), whose merge commit `f9cb2eb` differs from `c3eba1d` only in
  the two `.genesis/` files that PR edited. These were that PR author's own runs, not the L4 verifier's.
- That is the whole claim. A count of passing tests says they pass, not that they are the right tests;
  judging that was the independent verification's job, and its verdict is in the milestone table above.
- M1 is the contracts only. M3 to M5 are `todo`, so nothing about folding evidence into extents,
  propagating bounds, ruling a claim or rechecking a certificate has been built or demonstrated.

## What M2 adds, and what was run to check it

- **A live deployment:** https://beyond-the-chatbot-xi.vercel.app. `/` is still the genesis placeholder
  (it serves "This project is in progress. There is no engine and no live demo yet"); `GET /api/health`
  is the only endpoint doing real work.
- **`/api/health` runs real self-checks against `lib/contracts`; it is not a liveness ping.** On every
  request it calls M1's `assertEntailmentWellFormed` on four values and compares the guard's answer with
  the expected one by name: a well-formed `conflicted` must be accepted (`ok`), and three values built by a
  cast must each be refused in a different cell of the guard's table: an `ungrounded` carrying
  `established` (`unexpected-field/ungrounded/established`), a `weakened` whose `unmet` is `[]`
  (`empty-array/weakened/unmet`) and a `conflicted` with no `core` (`missing-field/conflicted/core`). All
  four matching gives HTTP 200 and `"status":"ok"`; any mismatch, or a throw while building a value or
  calling the guard, gives HTTP 503 and `"status":"degraded"` (read from `route.ts` and `checks.ts`; the
  503 path is exercised by `route.test.ts`, not by the live endpoint). `commit` is
  `VERCEL_GIT_COMMIT_SHA` as Vercel sets it, or the literal `unknown (local dev)`.
- **`main` auto-deploys** to production through Vercel's GitHub integration. So the commit the live
  endpoint reports is the current `main`, and merging any PR, this one included, redeploys it. To check,
  compare `commit` in the response with `git rev-parse origin/main`. What was seen: the `Vercel` commit
  status on `d7aedb4` is `success` ("Deployment has completed") at 13:48:38 UTC, 39 seconds after PR #3
  merged at 13:47:59 UTC (`gh api repos/vladimir-mawla/beyond-the-chatbot/commits/d7aedb4c770d34248b3c34bc25584ed22cff94ff/status`). That
  is one deploy of one merge, not every deploy.
- **Observed 2026-10-24 at 13:52 UTC, before this PR:** `curl -i https://beyond-the-chatbot-xi.vercel.app/api/health`
  answered HTTP 200 with the body below. Its `commit` equalled `git rev-parse origin/main` at that moment
  (`d7aedb4`, M2's own merge commit), `checks.contracts.pass` was true, `failing` was empty, and each of the
  four cases had `pass` true and `actual` equal to `expected`.

  ```json
  {"status":"ok","commit":"d7aedb4c770d34248b3c34bc25584ed22cff94ff","checks":{"contracts":{"pass":true,"failing":[],"cases":[{"name":"well-formed-conflicted","pass":true,"expected":"ok","actual":"ok"},{"name":"ungrounded-carrying-established","pass":true,"expected":"unexpected-field/ungrounded/established","actual":"unexpected-field/ungrounded/established"},{"name":"weakened-with-empty-unmet","pass":true,"expected":"empty-array/weakened/unmet","actual":"empty-array/weakened/unmet"},{"name":"conflicted-missing-core","pass":true,"expected":"missing-field/conflicted/core","actual":"missing-field/conflicted/core"}]}}}
  ```

- **Tests:** `npm ci && npm test` on a fresh clone of `main` at `d7aedb4` printed `Test Files  21 passed (21)`
  and `Tests  363 passed (363)`. By directory: `tests/` (the two genesis files) 2 files / 6 tests,
  `lib/contracts/__tests__/` 16 files / 294 tests, and `app/api/health/__tests__/` 3 files / 63 tests
  (`checks.test.ts` 20, `route.test.ts` 17, `vercel-config.test.ts` 26). `npm run typecheck` and
  `npm run build` (from a deleted `.next`) also exited 0 on that tree. The same four commands were run again
  on the mark-done branch, which differs from `d7aedb4` only in the two `.genesis/` files this PR edits.
  These are this PR author's own runs, not the L4 verifier's.
- That is the whole claim. A count of passing tests says they pass, not that they are the right tests;
  judging that was the independent verification's job, and its verdict is in the milestone table above.
  The verifier's report is not in this repository: the round and verdict are as handed to this PR's
  author.
- **What the fix round changed**, as far as the repository shows. PR #3 had seven commits; the last,
  `74843f0`, changes ADR 0002 (Decision 1 and "Rejected alternatives") and one comment in
  `app/api/health/__tests__/checks.test.ts`, and no other file. `git diff` between the PR's head ref
  (`refs/pull/3/head`) and `main` is empty, so the squash commit's tree is the PR head's tree.
- **What this does not show.** One `curl` is one request at one time: it shows which commit Vercel served
  and that the four self-checks passed then, not that the deployment is unchanged since. `lib/extent`,
  `lib/ground` and `lib/entail` do not exist yet, so a green `/api/health` says nothing about them. By
  ADR 0002's own account (Decision 1) the four values exercise three cells of M1's guard and one whole
  value, not every cell, so a guard that broke another cell would not turn the endpoint red; M1's
  `integrity.test.ts` is what pins the rest.

## Known gaps in this repository's own record, stated up front rather than discovered later

- `.genesis/decisions/` holds two decision records, `0001-contracts.md` (M1) and `0002-deploy.md` (M2),
  each written by the milestone that made the decisions it records (an ADR is written by the milestone
  that made them). M3 to M9 have none yet. Both `Status` lines still read "proposed ... not yet verified
  by an independent L4 pass", which is out of date now that M1 and M2 have each had that pass. ADR 0002
  was also written before the merge: its Decision 7 says the integration will redeploy `main` and that
  the deploy of `main` "is not something this milestone verified", and its "What is not proven" list
  still has "That the `main` redeploy after merge is healthy". "What M2 adds" above is one observation of
  that redeploy, at one instant. Neither record is edited here: the bookkeeping exception covers only
  `DONE.html` and this file.
- **Which model did this work.** The genesis commits carry `Co-Authored-By: Claude Sonnet 5.5`, the
  attribution of the agent that made them. The sibling repositories carry a fixed
  `Co-Authored-By: Claude Opus 5.5` string required by the account's commit rule, written regardless of
  which model did the work. So the trailer differs between this repo and its siblings, and neither
  string should be read as authorship evidence beyond itself.
- The live URL (M2, above) serves a skeleton: `/` is the genesis placeholder and `/api/health`
  self-checks `lib/contracts` only. The interactive demo is M8 and is `todo`. The account's standing rule
  was deploy at milestone 2, never last; M2 did that, so this project does not repeat the previous
  project's gap.
- **Prose outside the bookkeeping exception is out of date and was not edited.** `README.md` still has the
  heading "Status: in progress, nothing built yet" and says "genesis scaffold only", "two small tests",
  "no engine code and no domain logic" and "all nine milestones are `todo`"; its `Live:` line is the one
  line M2 changed and is current. `.env.example` still says `app/api/health/route.ts` is "NOT BUILT
  YET". The README sentences have been wrong since M1 merged and the `.env.example` one since M2 did; ADR
  0002's plan observations 1 and 2 record the same two. `app/page.tsx` ("no engine and no live demo
  yet") is still accurate.
- **Dependency versions were copied unchanged from autonomous-company-simulator `origin/main`
  (`ab14763`, `next` 16.4.3) and `npm audit` still reports 4 findings (2 high, 2 moderate), none
  addressed.** `ab14763` was `fc17afd` before that repository's own 2026-10-24 history rewrite (see the
  note above); `.genesis/PLAN.md` is frozen genesis and still cites the old `fc17afd`, at lines 31, 746,
  759 and 792, so read those as `ab14763`. `source-map-js` (high) is reachable through `next` ->
  `postcss`, so it is in the production tree; `vite` (high) and `vitest`/`@vitest/mocker` (moderate)
  are dev-only. They were not addressed at genesis because the plan says to copy the lockfile rather
  than regenerate it and a version bump is a stack decision for the coordinator, not for genesis. No
  assessment was made of whether any advisory is exploitable against this scaffold or against Vercel's
  runtime. `npm audit` was run read-only; the lockfile hash was identical before and after.
- **The lockfile must not be rewritten with this machine's npm 11.5.1** (see the measurement above).
  After any lockfile change, compare the count of `os`/`cpu` entries before and after; the lockfile test
  now does that.
- **`tsconfig.json` (app/, components/) does not set `exactOptionalPropertyTypes`; `tsconfig.lib.json`
  does.** Copied unchanged from the sibling per the plan. The plan's `?: never` proofs live under
  `lib/` and are checked by the strict config. A file under `components/` is checked by the looser one
  only, so M8's bridge should consume `Entailment` values, not construct them. Not tested, not changed.
- **Lint covers almost nothing.** `eslint.config.mjs` ignores every `.ts`/`.tsx` file because
  `typescript-eslint` throws on TypeScript 7, so `npm run lint` checks the `.mjs` files only.
  `npm run typecheck` is the backstop for every TypeScript file, and CI runs it.

## Where this repository differs from a verbatim copy of its source

Verbatim: `.gitignore`, `next.config.ts`, `tsconfig.json`, `tsconfig.lib.json`, `eslint.config.mjs`,
`vercel.json`, `scripts/register-ts-loader.mjs`, `tests/smoke.test.ts`; `package-lock.json` differs in
exactly two lines (the `"name"` fields). Comment-only edits, with the executable lines diffed identical:
`vitest.config.ts`, `.github/workflows/ci.yml`, `scripts/ts-loader-hooks.mjs`, `app/globals.css`
(the sibling's comments named another project's milestones and decisions). Changed on purpose:
`package.json` (name, description, `demo:order-desk`), `.env.example`, `app/layout.tsx`, `app/page.tsx`,
`README.md`. New: `tests/lockfile.test.ts`, `.genesis/`. Added since genesis by M1 (PR #1), all new
files and none of the files above touched: `lib/contracts/**` (45 files) and
`.genesis/decisions/0001-contracts.md`. Added by M2 (PR #3): `app/api/health/**` (5 files: `route.ts`,
`checks.ts` and three test files) and `.genesis/decisions/0002-deploy.md`, all new, plus one edited
file, `README.md`, where the `Live:` line is the only line changed (`git diff --stat f9cb2eb d7aedb4`
lists it as 1 insertion and 1 deletion). Over `lib/`, `vercel.json`, `next.config.ts`, `package.json`,
`package-lock.json`, both `tsconfig*.json` and `.github/`, `git diff f9cb2eb d7aedb4` is empty.
