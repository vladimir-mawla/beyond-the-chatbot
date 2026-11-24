# ADR 0009 — M9 deliverables: documents whose citations are checked by a test, a Loom script whose timing and on-screen strings are checked, and a click-path record that says who clicked

- **Date:** 2026-11-24
- **Status:** proposed — written by the builder; not yet reviewed by an independent L4 pass
- **Phase / milestone:** M9 (BUILD, DELIVERABLES) — `README.md`, `docs/ARCHITECTURE.md`, `docs/THESIS.md`, `docs/WALKTHROUGH.md`, `docs/NOTES.md`, `tests/docs/citations.test.ts` and this file

## Context

`.genesis/PLAN.md` section 6 (M9) asks for a README, an architecture document, a thesis of at most 300 words, a walkthrough (the Loom script) and a process record, plus a citations test, and says the milestone must refuse "a doc claim no test pins", a thesis over 300 words, a milestone marked done that `DONE.html` disagrees with, and restating a limit more strongly than a test pins it. The review history in `.genesis/checkpoints/CURRENT.md` shows documents as a recurring place for findings, so the decisions below are about making a sentence's evidence something a reader or a test can open. Command output for this milestone is in the pull request description, not here, so that no number in this file goes stale. `main` was at `a4e1fea` (M1 to M8 done, `next` 16.4.6). Ownership: `docs/**`, `README.md`, `tests/docs/**` and this file. `git diff --stat origin/main -- lib domains scripts components app tests/failures package.json package-lock.json .genesis/PLAN.md .genesis/DONE.html` is empty.

## Decision 1 — a citation is a path and its titles, and every title is checked

A citation is a backticked path under `lib/`, `domains/`, `components/`, `app/`, `tests/` or `scripts/` ending `.ts` or `.tsx`, followed on the same line by zero or more titles, each written ` › "title"`. `tests/docs/citations.test.ts` fails when a path does not exist, when a title is cited against a file that is not a test, when any title is not in the file, when a title occurs only on a line that does not open an `it`, `test` or `describe`, and when a title follows no path on its line. The plan words the check as "occurs as a substring of that file"; the last two clauses are stricter. A previous project's version checked only the first title after a path and said so; here every title is checked, which is why a document lists several titles for one path by repeating the form. Line numbers are not used anywhere: another test fails on `file.ts:123`. Titles are cited as prefixes where the full title carries a template placeholder.

What this does not do is stated at the head of the test file: it does not check that a cited test asserts what the sentence beside it says. That is a reading, and the L4 pass is where it happens.

## Decision 2 — the README lists every failure case, and a test says so

The plan: "Honest limits listing every M7 case". A test fails if a `tests/failures/NN-*.test.ts` file is not cited with a title in the README. Each limit is worded from that file's own header, not stronger, with its DISCLOSES or PROVES label as the header gives it. Limits of the rest of the repository are each labelled with where they are stated, and "not pinned by a test" where that is so.

## Decision 3 — the Loom script is performable, and its on-screen strings are rendered

The plan's outline (section 15) is a timed beat list. A beat in `docs/WALKTHROUGH.md` is a header with its slot, an `On screen [state]:` line and the narration. The test fails if the slots do not run on from 0:00, if the script runs past 1:30, if a beat is over 170 words a minute, or if the narration exceeds 230 words, and it renders `OrderDeskDemo` for each beat's state (`renderToStaticMarkup`, the same markup the server sends) and fails if a quoted on-screen string is absent or out of order. The test also checks that ticking o3 and then o4 from step 1 renders the same page as steps 4 and 5, because the script ticks. None of this measures anyone's speech or reads the deployed page after a click. The builder fetched the live server-rendered HTML for step 1 with `curl`, and the strings of the two beats at step 1 are in it, in order. The plan's outline names order "A-1042" and the word `bound-differs`; neither is on the page, so the script says what the page says. The outline's recheck beat is shown at step 4 because the forge is disabled at step 5.

## Decision 4 — the live click path is recorded with who did it

The plan says the click-to-re-render path is verified by hand against the live URL and recorded in `docs/WALKTHROUGH.md`. The orchestrating agent did the check on 2026-11-24 against the deployment at `a4e1fea`, driving the scripted-step buttons by DOM `click()` in the Claude desktop app's browser pane, not by mouse; the checkbox path was checked with real clicks by another agent on `53d7ea0`. `docs/WALKTHROUGH.md` copies the record and attributes it exactly, and lists what was not covered (phone width, dark theme, keyboard-only use, other browsers and the custom-question builder, as examples). The builder of M9 clicked nothing, and the document says so.

## Decision 5 — the thesis is a prediction, and the word count is the whole file

`docs/THESIS.md` argues a two-year future in the plan's terms (section 14), states a claim that can be wrong and what would falsify it, and says what the repository does and does not show. Present-tense statements about the world are scoped with "as I read it". The test counts words as `wc -w` does over the whole file, heading included, so the number reported in the pull request is the number the test checks. The plan's seed was 275 words; this file is longer and says what it adds (a paragraph on what the repository shows, with the limits that cite cases 01, 02, 07 and 08).

## Decision 6 — frozen files stay stale, and the README says which and why

Earlier milestones' files contain forward-looking text that was true when written ("not built", `Status: proposed`). The plan gives each milestone its own paths, so M9 does not edit them. The README states the classes from two `git grep` patterns, quoted in full, at the fixed commit `a4e1fea`, with the line and file counts each returned, and says the list is what the searches found and not a proof that no other line is stale. It also says that `CURRENT.md`'s Known-gaps section carries lines from before M8, so that file is not offered as a description of the current state. This ADR's own Status line is in the first class.

## Decision 7 — the architecture document is a table of refusals, each with a file and a test title

`docs/ARCHITECTURE.md` follows a question through the stages in the order the engine runs them and gives, for each, what it refuses, why (the plan's decisions D1 to D11), the file and a test title. The module graph in it was read from the `from "..."` lines of the non-test sources on `main` after M8; the scans that enforce parts of it are named, with what each does not see. Where a limit is the subject (a cast, a drafter's import), the citation is the test whose title states that limit.

## Decision 8 — the dependency list in the README is checked against `package.json`

A test compares the README's two dependency lines with the keys of `dependencies` and `devDependencies`, so a package added or removed fails the documents until they are updated.

## Falsifiability log

Each edit was made in the working tree, `npx vitest run tests/docs --reporter=verbose` was run, the failing tests were recorded, and the edit was reverted (`git status` clean after each).

| Edit | Result |
|---|---|
| `git mv` of a cited failure-case file (case 03) | 2 failed: README citation problem, `each is cited in README.md with a title` |
| a cited title changed in the README (case 04, `m1 m2` to `m1 m3`) | 1 failed: README citation problem |
| the SECOND title after a path changed (case 02, `(c) ...right digits` to `wrong digits`) | 1 failed: README citation problem |
| `recheck.ts` cited as `recheck.ts:71` | 1 failed: no `file:123` form |
| six words appended to the thesis (301 words) | 1 failed: thesis at most 300 words |
| case 10's citation removed from the README | 1 failed: each failure case is cited |
| an on-screen string changed to one the page does not render | 1 failed: on-screen strings |
| two on-screen strings swapped | 1 failed: on-screen strings (not in the stated order) |
| beat 1's narration padded to 29 words in 10 s | 1 failed: slots and words a minute |
| a title with no path before it | 1 failed: README citation problem |
| `react-dom` dropped from the README's list | 1 failed: dependency lists |
| control: no edit | 30 passed |

The checker's own teeth, on a synthetic tree under the OS temporary directory, are the `TEETH` block of the test file.

## Not verified, and what is stated and not pinned by a test

- That any sentence of the documents is what the test beside it asserts: read by the builder, not checked by a program. The README's first paragraph, the Stack paragraph and the architecture document's prose around the tables are not cited sentence by sentence.
- The Loom: not recorded. The narration bound is on text.
- The deployed page after this pull request merges: the health commit will change; the README quotes the earlier one and dates it.
- The architecture document's module graph is not tested as a whole: `lib/` is (the closed-graph scan), and the rest is the narrower scans of `domains/` and `components/` plus the builder's reading of the import lines.
- Strings of the later Loom beats were checked against rendered markup, not against the deployed page.
