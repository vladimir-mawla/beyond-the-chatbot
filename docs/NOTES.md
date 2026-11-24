# Process record

How this repository was built, as the project's own records state it. Where a sentence is about a milestone's review history it is taken from `.genesis/checkpoints/CURRENT.md` as of the mark-M8-done pull request (#17, merge commit `a4e1fea`) and is that file's account, not something re-measured here; the verifiers' reports are comments on the pull requests and are not in the repository. Where it is about M9, it was done in the M9 pull request, whose description holds the command output. Every number below is taken from `CURRENT.md` or the ADRs, and a place where the two differ is said.

## How the work was organised

The plan, `.genesis/PLAN.md`, divides the work into nine milestones, each one pull request on its own branch, each with its own ADR in `.genesis/decisions/`, and each reviewed by a verifier (L4) that is not the builder (L1) before a separate `chore(genesis): mark MN done` bookkeeping pull request. Directory ownership is the plan's table (section 6): a milestone may not edit another's paths, and the bookkeeping pull requests edit only `.genesis/DONE.html`, `.genesis/checkpoints/CURRENT.md` and a status line in `app/milestones.ts`. `app/milestones.test.ts` fails when the page's list of done milestones and `DONE.html` disagree. The ADR numbers follow the milestones: `0001` is M1 and `0009` is M9.

## The milestones

| | What | PR | Review, as `CURRENT.md`'s milestone table states it |
|---|---|---|---|
| M1 | contracts (`lib/contracts`) | #1 | APPROVE "on the fourth review, after three fix rounds" (see below: the same wording was found wrong for M3) |
| M2 | deploy skeleton, `/api/health` | #3 | APPROVE in round 2, after one fix round |
| M3 | extent algebra (`lib/extent`) | #5 | APPROVE on the third review, after two fix rounds (R1 reject of `a0a33e2`, R2 reject of `2caf41c`, R3 approve of `c6588b5`) |
| M4 | ground (`lib/ground`) | #7 | APPROVE at the fourth review, a targeted close at `43d1e64`, after three rejections (`a5d2cd3`, `296f3c6`, `e94cb97`, per ADR 0004) and one more fix, a one-sentence ADR correction that the close made its condition |
| M5 | entail (`lib/entail`) | #9 | four steps, not a fourth full pass: a full pass at `dda00a9` (request changes, docs only), a targeted close at `fcec2a3`, a targeted close at `f952e14`, then three edits approved at `5aaab0a` by the orchestrator's mechanical check on the verifier's statement, with no further verifier pass |
| M6 | the order desk (`domains/order-desk`) | #11 | four steps, not an approval by a verifier at the last head: a full pass at `3e63cf8` (five items, no behaviour defect), a targeted close at `ce20025`, then final edits at `a666e34` approved by the orchestrator's mechanical check |
| M7 | the failure suite | #13 | three steps, ending in an APPROVE of the head `d94fe74`; one earlier pass was stopped by the user before it reported |
| M8 | the interactive demo | #16 | four steps, not an approval by a verifier at the last head: a full pass at `c49b5d2` (documentation only), a targeted close at `dbf8fb5`, then final edits at `71e5e31` approved by the orchestrator's mechanical check |
| M9 | deliverables | the pull request that carries this file | reviewed after it is opened; not stated here |

The bookkeeping pull requests are #2, #4, #6, #8, #10, #12, #15 and #17 (the `next` 16.4.3 to 16.4.6 upgrade is #14, which came between M7 and its bookkeeping). `main` was rewritten once on 2026-10-24 to correct commit attribution; only metadata changed, and `CURRENT.md` has the table of pre-rewrite and current SHAs.

## Where the records disagree

- **M1's round count.** `CURRENT.md`'s table says "the fourth review, after three fix rounds". Its section on M3 records that the same words were wrong for M3 (the record showed three reviews and two fix rounds) and does not re-examine M1. This file did not re-measure M1 either.
- **How many pull requests had merged.** `CURRENT.md` says `main` is "plus sixteen merged PRs" and lists #1 to #16, after correcting an earlier "thirteen". The mark-M8-done pull request (#17) is itself merged at `a4e1fea`, so seventeen had merged by then.
- **What an ADR's Status line says.** All eight ADRs still read "proposed" and mostly "not yet verified by an independent L4 pass" (ADRs 0003 and 0004 say "has not been re-verified" after naming rejected passes), although `CURRENT.md` records every one of those milestones as reviewed and merged. `CURRENT.md` lists this as a known gap; the ADRs are frozen files and were not edited.
- **Test counts.** `CURRENT.md` gives 72 files and 3290 tests on `53d7ea0`; the same figures were seen on `a4e1fea` before M9, which changed no code that counts (the M9 count is in the pull request description).

## What the review history shows, and does not

By `CURRENT.md`'s table, M4 took four reviews and the most fix rounds, M1 four reviews as stated, M3 three, M2 two. Three milestones (M5, M6, M8) were closed by the orchestrator's mechanical check of the final edits and not by a verifier pass at the last head. In the records, the documents and comments that make a claim about the code were a recurring place for findings: the M5, M6 and M8 rows all end in prose edits, and M8's full pass is "documentation only". That is an observation about this one project's records, not a rate. It is the reason M9's checks are mechanical where they can be: `tests/docs/citations.test.ts` fails when a cited file is missing or any cited test title is not in its file, bounds the thesis by word count, and checks the Loom script's timing and its on-screen strings against the real component's markup.

## What M9 did

- Rewrote `README.md` (the claim, the live URL, the clean-clone commands, the honest limits listing each of the ten failure cases, and a note on the frozen files whose text has gone stale).
- Wrote `docs/ARCHITECTURE.md`, `docs/THESIS.md`, `docs/WALKTHROUGH.md` and this file, and `tests/docs/citations.test.ts`.
- Wrote ADR `0009-deliverables.md`.
- Edited no other file. Nothing under `lib/`, `domains/`, `scripts/`, `components/`, `app/` or `tests/failures/` was touched, and `.genesis/PLAN.md`, `.genesis/DONE.html` and `app/milestones.ts` were left to the mark-done pull request.
- Ran every command the README gives from a fresh clone and pasted the output into the pull request description.

## Deviations and gaps, stated

- **The Loom is not recorded.** The script is `docs/WALKTHROUGH.md`; recording it is a human step, as the plan says.
- **The live click path was checked by hand, not by the M9 builder.** It was driven by the orchestrating agent on 2026-11-24 against the deployment at `a4e1fea`, by DOM `click()` and not by mouse; the checkbox path was checked with real clicks by another agent on `53d7ea0`. What was not covered is in `docs/WALKTHROUGH.md`.
- **The plan's Loom outline is followed except where the page differs from it.** It names order "A-1042" and the word `bound-differs`; the page shows neither, so the script says what the page says (`docs/WALKTHROUGH.md`, section 2). The outline's recheck beat is at step 4, because the forge control is disabled at step 5.
- **The deployment's health commit will change** when this pull request is merged and Vercel redeploys `main`. The README quotes what it answered on 2026-11-24, dated.
- **Frozen files are not corrected.** The README names the classes of stale text and the searches that found them; the plan's rule is that a milestone may not edit another's paths.
- **The citation test is a check on form.** What it does not check is listed in its own header and in the README.
