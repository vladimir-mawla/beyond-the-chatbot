# CURRENT

- **active_loop:** none recorded. M1 (contracts, `lib/contracts/**`) is `done`; M2 to M9 are `todo` in
  this revision. The engine proper is not built: M1 is types and structural invariants only, and
  `lib/extent`, `lib/ground` and `lib/entail` do not exist. `.genesis/PLAN.md` (G0-G2) and the tooling
  skeleton are in place, and `app/page.tsx` is still the genesis placeholder. Each milestone is
  separate, with its own branch, its own PR, and its own independent (L4) verifier.

- **last updated:** 2026-10-24, in the `chore(genesis): mark M1 done` bookkeeping PR, after M1 passed
  independent L4 verification and merged (PR #1). The previous revision was written immediately after
  genesis (repo scaffold, `.genesis/` ritual, README, two tests, CI workflow), before any milestone
  build had begun. Recorded honestly rather than implying progress that does not exist: a checkpoint
  that misstates status in either direction is worse than no checkpoint at all.

## Milestone state, as of this revision

| | Status | Where |
|---|---|---|
| M1 contracts | `done` | PR #1 → `c3eba1d` (squash-merged); independent L4 APPROVE on the fourth review, after three fix rounds |
| M2 deploy | `todo` | designed only |
| M3 extent algebra | `todo` | designed only |
| M4 ground | `todo` | designed only |
| M5 entail | `todo` | designed only |
| M6 domain (order desk) | `todo` | designed only |
| M7 failure suite | `todo` | designed only |
| M8 interactive demo | `todo` | designed only |
| M9 deliverables | `todo` | designed only |

`main` is the genesis base (the plan, tooling config, app shell, two tests, a CI workflow, the README and
the `.genesis/` ritual) plus one merged PR: #1, M1 (`lib/contracts/**`, its tests, and
`.genesis/decisions/0001-contracts.md`). `lib/` holds only `contracts`; there is no `domains/`, no
health route, and no deploy. The engine directories are `lib/extent`, `lib/ground`, `lib/entail` (plus
`lib/contracts`), not the house-template names; if a brief says otherwise, `.genesis/PLAN.md` wins and
the builder flags the mismatch.

## What the scaffold does and does not prove

- **Proves, locally at genesis:** `npm ci` restores with the native bindings intact, `npm run typecheck`
  is clean, `npm test` runs 2 files / 6 tests, and `npm run build` succeeds under webpack. Whether CI
  passes is recorded by CI itself (the Actions tab), not asserted here.
- **`tests/smoke.test.ts`** pins that the `dev`/`build` scripts really pass `--webpack` and that
  `next.config.ts` really declares `experimental.extensionAlias` (it imports the config and reads the
  exported object rather than matching source text, because the config's own comment contains the word).
  It does **not** prove that a `.js`-suffixed import resolves in a build: that needs `lib/` and is
  covered by `npm run build` from M1. That Turbopack still cannot resolve such imports on `next@16.4.3`
  was taken from the hand-off brief and the sibling's comment; it was **not** re-run here.
- **`tests/lockfile.test.ts`** fails if `package-lock.json` has fewer than 80 `os`/`cpu` entries or has
  lost any of the 15 `@rolldown/binding-*`, `fsevents` or 11 `lightningcss-*` entries by name. Measured
  at genesis on a throwaway copy: `npm install --package-lock-only` under npm 11.5.1 exits 0 and takes
  the lockfile from 80 platform entries (215 packages) to 53 (188), removing exactly those 27; npm 10.9.9
  keeps all 80. The test does not detect other kinds of lockfile damage.
- **Does not prove anything about the engine.** There is none. Every plan claim is a design, not a result.
  The plan's own section 8 numbers come from a throwaway model that is not in this repository.
- `vercel.json` is committed and pinned to `npm ci` / `npm run build`, but **nothing tests it yet**: M2
  adds that test. Nothing has been deployed and `vercel` has not been run from this repo.

## Known gaps in this repository's own record, stated up front rather than discovered later

- `.genesis/decisions/` holds one decision record, `0001-contracts.md`, written by M1 (an ADR is written
  by the milestone that made the decisions it records). M2 to M9 have none yet. Its own `Status` line
  still reads "proposed ... not yet verified by an independent L4 pass", which is out of date now that
  M1 has had that pass. It is not edited here: the bookkeeping exception covers only `DONE.html` and
  this file.
- **Which model did this work.** The genesis commits carry `Co-Authored-By: Claude Sonnet 5.5`, the
  attribution of the agent that made them. The sibling repositories carry a fixed
  `Co-Authored-By: Claude Opus 5.5` string required by the account's commit rule, written regardless of
  which model did the work. So the trailer differs between this repo and its siblings, and neither
  string should be read as authorship evidence beyond itself.
- No live URL exists yet. The account's standing rule applies: deploy at milestone 2, never last. M2
  deploys a live skeleton second, not last, so this project does not repeat the previous project's gap.
- **Dependency versions were copied unchanged from autonomous-company-simulator `origin/main`
  (`fc17afd`, `next` 16.4.3) and `npm audit` still reports 4 findings (2 high, 2 moderate), none
  addressed.** `source-map-js` (high) is reachable through `next` -> `postcss`, so it is in the
  production tree; `vite` (high) and `vitest`/`@vitest/mocker` (moderate) are dev-only. They were not
  addressed at genesis because the plan says to copy the lockfile rather than regenerate it and a
  version bump is a stack decision for the coordinator, not for genesis. No assessment was made of
  whether any advisory is exploitable against this scaffold or against Vercel's runtime. `npm audit`
  was run read-only; the lockfile hash was identical before and after.
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
`.genesis/decisions/0001-contracts.md`.
