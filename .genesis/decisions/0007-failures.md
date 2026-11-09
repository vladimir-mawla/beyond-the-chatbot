# ADR 0007 — M7 failure suite: ten cases, each pinning a limit the engine has, each turned red by a control on the shipped source

- **Date:** 2026-11-09
- **Status:** proposed — written by the builder; not yet verified by an independent L4 pass
- **Phase / milestone:** M7 (BUILD, FAILURE SUITE) — `tests/failures/**` and this file

Numbers below come from commands run in this session on the final test files (head `ae7a736` when the ledger and the counts were taken; the commits after it add this file only). The sabotage ledger quotes "N failed (cases)" with no "passed" denominator. Test names are cited by file and title, never by line number. Where a sentence says a limit is "pinned", a named test pins it; otherwise it says "stated, not pinned by a test". Every list of things not seen is "examples, not a complete list".

## Context

`.genesis/PLAN.md` section 6, M7, with the ten cases of section 11. `main` was at `6ed1d55` (M1 to M6 done). Ownership: `tests/failures/**` (`01-…test.ts` to `10-…test.ts` and `helpers.ts`) and this file. No file of `lib/**`, `domains/**`, `app/**` or `scripts/**` was edited (`git diff --stat main -- lib domains app scripts` is empty, and every control below was restored with `git checkout` and checked clean before the next). No dependency was added (`npm ci` only). `.genesis/PLAN.md`, `DONE.html` and `CURRENT.md` are untouched.

## Decision 1 — files, and what each case may import

Ten case files and `helpers.ts`. Every case imports only the `index` of a `lib/*` layer and `domains/order-desk/index` (plan: "each against the public API"). `lib/ground/__tests__/oracle.ts`, which the plan lets M7 import read-only, is not imported: the three enumerators the cases need (case 09's two, the arithmetic tables of case 06) are small and written in the file that uses them, so a case's oracle shares no code with the engine and none with M4's. `helpers.ts` builds fixtures and calls the engine through its barrels; it rules nothing (`inside`, `digitTokens` and `mulberry32` are the only functions with logic, and none touches the engine).

Each file's header states `KIND`, `TRACES TO` (the D#), and `WHAT WOULD MAKE THIS FAIL`, as the plan asks, and adds a paragraph `SCALE AND LAYER` where the limit was already pinned by an earlier milestone (Decision 2).

## Decision 2 — the plan's "none restates an M3–M5 test" reads as true of the sketches, not of the repository, so each case adds a layer or a scale

Section 11 closes: "none restates an M3–M5 test". At the time of the plan that was a statement about the sketches. The builders of M4 and M5 then pinned most of the ten limits themselves, by hand: case 01's rejected `[0, 7]` (M4 `observation-faults.test.ts`, the row about "a quote of 0 to 2 read as 0 to 7"); case 02's forged omission, fabricated observations and ungrounded silence (M5 `recheck.test.ts`: "a Brief that drops a bound and its support together claims silence and is reproduced…", "fabricated observations are certified…", "an ungrounded ruling is never certified or refuted…"); case 03 (M4 `locality.test.ts`, "plan case 03, by hand"); case 04 (M4 `core.test.ts`, "plan case 04…"); case 05 (M4 `support-certificate.test.ts`, "plan case 05 by hand…"); case 06 (M4 `open-ends.test.ts`, "plan case 06 (a)" and "(b)"); and the digit property of case 10 (M5 `render-properties.test.ts`, on 600 generated scenarios). M7's rule "restating an M3–M5 test without new scale or a new layer" is therefore met case by case, and each file's `SCALE AND LAYER` paragraph says how. The new ground, by case:

| Case | Already pinned at | M7 adds |
|---|---|---|
| 01 | the `[0, 7]` refusal (M4) | the three accepted mis-extractions, which no earlier test pins, each ruled `entailed`, reproduced by `recheck`, and false in a stated world |
| 02 | by hand and on generated Briefs (M5) | the same limits on the six real Briefs of the domain's canonical script: every non-null bound of every supported ruling tightened and loosened by 1, every weakened ruling's `unmet` replaced by every other cut, with the count of tamperings asserted |
| 03 | `lib/ground` by hand and generated (M4) | the Brief a user meets (text, evidence, `recheck`), and all 16 subsets of `o1..o4` |
| 04 | `lib/ground` by hand (M4) | the Brief and `recheck` (a second core and a non-irreducible one are both certified), and six disjoint conflicts resolved one by one |
| 05 | `lib/ground` by hand (M4) | the Brief, the sentence and `recheck`, and all 24 ways of naming the four documents |
| 06 | by hand (M4, M5) | the sentence the user reads, and a sweep over 350 customs fills against a stated table |
| 07 | M1's determinism guard (a source scan) | arities of every function of the four barrels, the clock moved by a century and in monthly steps, and the clock read counted |
| 08 | 600 generated relabelings (M4 `order-independence.test.ts`) | all 80 domain states, with the stand-in's draft, at the Brief, text and `recheck` layer, and the cost half |
| 09 | `operand-reused` refusals (M4 `schema-faults.test.ts`) | the hand-rolled propagator and the enumerator, which no earlier test has |
| 10 | the digit property (M5) | the 80 states as the user sees them, plus the denylist, which M5 does not have |

## Decision 3 — the cases, their tests, and what turns each red

Each case below lists test titles (file and title; the ledger in Decision 5 shows what each control did). "Half" means one of the sentences of the plan's row.

- **01 `01-extraction-fidelity-is-not-closed`.** Titles: "customs 'takes 0 to 2 days' read as [0, 7] is refused…", "the lower bound is judged too…", "the honest reading of the same quote, [0, 2], is accepted", the three mis-extractions ("a direction flip…", "a dropped bound…", "a semantic slip…"), and "the same engine rules the honest extractions differently…". "False in the world meant" is a value the quote's author meant (2, 5 and 7), checked by `inside` in `helpers.ts`, which does not call the engine. Controls: C01a (the guard's half that holds), C01b-flip, C01b-drop, C01b-slip (the guard made stricter, one mis-extraction each), C01c (`recheck` flags the accepted cases), C01d (the guard made too strict: the honest reading is refused).
- **02 `02-recheck-cannot-certify-silence-or-fabrication`.** Half 1: the five hand tamperings, the unmet flip, and the three sweeps over the canonical Briefs. Half 2: "(a) a supported upper bound dropped together with its support…", "(b) a forged `ungrounded`…", "(c) evidence replaced by invented documents…", and "(c, the contrast)". The assertions are `recheck`'s typed results (`not-reproduced { bound-differs … }`, `unmet-differs`, `reproduced { silentSides }`, `uncertifiable-silence`, `evidence-rejected`), as the plan asks; there is no assertion about what a caller "should" do. Controls: C02a (bounds not compared), C02b (`unmet` not compared), C02c (an empty support flagged), C02d (an ungrounded ruling certified), C01a (digit-containment: the contrast).
- **03 `03-a-conflict-silences-its-whole-tree`.** Locality half: "LOCALITY…" (rulings, `extentOf`, `supportOf`, trees), "LOCALITY, in one Brief…", "ACROSS ALL 16 SUBSETS…". Cost half: "THE COST…", "the conflict is joint…", "AT THE BRIEF…". Controls: C03a (the conflict leaks across trees), C03b (a salvage: the named core dropped and the rest grounded).
- **04 `04-a-core-not-the-core`.** "two disjoint minimal conflicts in one tree…", "AT THE BRIEF…", "recheck certifies the OTHER core too…", "AT SCALE: six disjoint conflicts…". Controls: C04a (descending deletion), C04b (no deletion), C05b (input order reaches the pool).
- **05 `05-support-is-irreducible-not-minimum`.** "the plan's pair…", "AT THE BRIEF…", "NOT MINIMUM… IRREDUCIBLE…", "ALL 24 NAMINGS…". Controls: C04a, C05a (a cardinality-minimising deletion: both orders tried, the smaller kept), C05b, C04b.
- **06 `06-a-named-gap-is-a-place-not-a-promise`.** Half (a): "(a) with o1 o2 o3 and 'delivery at most 5'…". Half (b): "(b) the starting point…", "(b) the same filled gap, three kinds…", "(b) SWEPT…". Controls: C06a (open ends listed for every leaf), C06b (`contradicted` never ruled), C06c (an arithmetic slip in `sumForward`), C01b-drop (the sweep's point fills).
- **07 `07-evidence-has-no-clock`.** "every function every lib layer exports has the arity of its row…", "with the system clock moved a century either way…", "a recalled or expired observation entails exactly what the unmarked one does…". Controls: C07a (a function gains an `asOf`), C07b (observations expire in the year 2100), C07c (the engine reads a quote for the word RECALLED). The plan's "and by M1's determinism guard" is cited in the header (M1's `determinism.test.ts`, "this repository: no clock, randomness, network or model under lib/ > finds nothing") and not re-run: this file may import only the barrels and the domain.
- **08 `08-no-trust-order-between-sources`.** "METAMORPHIC: over all 80 states and five relabelings…" and "THE COST…". Control: C08a (observations from a "A forum" source refused at intake), which turns both red: the relabelling half and the conflict half.
- **09 `09-read-once-buys-exactness-not-soundness`.** "(a) ground rejects the diamond…", "(b) the plan's example…", "(b) over 8 000 seeded random diamonds…", "(c) ground also rejects x = a + b, y = a + c…", "the control: the same propagator and enumerator agree exactly on a read-once tree…". Controls: C09a (the `operand-reused` check disabled) for (a) and (c); C09b and C09c (the test's own propagator mutated, Decision 5) for the three tests that run no lib code.
- **10 `10-render-checks-digits-not-meaning`.** Fixtures cover all five variants, all four refusal kinds and the 400 rulings of the 80 states ("the fixtures cover every variant…"); the digit property is checked per ruling and per Brief, the denylist separately, and the blind spots on literal strings ("a number added as a digit…", "…as a listed word…", "…as a word the list lacks… passes BOTH", "the denylist matches whole words only…"). Controls: C10a (`Typically 2 days.` added), C10b (`a couple of days` added), C10d (`Typically 97 days.` added), C10c (`a handful of days` added: the limit), C10e to C10h (the test's own checks mutated), C11a (the coverage of the section 7 steps).

## Decision 4 — readings of the plan, and where the plan and the build differ

- **Case 02, "tightening or loosening a bound that still cites its support → `not-reproduced { bound-differs }`".** True of every tampering that leaves a well-formed extent. In the sweep over the six canonical Briefs, 76 tamperings were applied (each non-null bound of each entailed, weakened or contradicted ruling, by +1 and by −1); 74 are `bound-differs` as the plan says, and 2 (`entailed` `[14, 14]` of step 6 with its lower end raised to 15 or its upper end lowered to 13) leave an inverted extent, so the whole Brief is refused as `ok: false`, `hostile-input`, by `recheck`'s shape guard before any finding exists. Test: "every bound of every supported ruling, tightened or loosened by 1…". A reading, not a correction: the plan sentence is about a bound that is still an extent.
- **Case 09, the numbers.** The plan's figures ("0 inexact of 20 000", "3 529 of 30 000") are quoted there as "on the model" and come from its own generator. This case runs its own seeded generator (cap 6, 8 000 instances per family) and quotes its own counts: diamond 757 inexact of 3016 consistent instances, never unsound, never missed an inconsistency; the shared-operand schema 0 inexact of 3563; the read-once tree 0 inexact of 4154. The direction of each figure agrees with the plan's; the numbers are not the same numbers and are not meant to be.
- **Case 07, "asserted on the function arities and by M1's determinism guard".** The arity half is a table over every function the four barrels export (a function added without a row is red). The guard half is cited, not re-run (Decision 3, 07).
- **`npm test -- failures`.** The plan's command, run as written, also selects `domains/order-desk/__tests__/script-failures.test.ts` (M6; the filter is a substring of the path). 11 files, 68 tests: 10 files and 60 tests are M7's. `npm test -- tests/failures` selects M7's alone.
- **Plan section 11, case 03: "every claim about `refundDay`".** Five claims are pinned (about `refundDay`, `returnWindowDays` and `restockDays`, covering entailed, weakened, contradicted and ungrounded); that is examples, not every claim, and the 16-subset test varies the evidence rather than the claim.
- **Read-once getters.** The lesson asks for them where a case feeds hostile objects. No case here tests hostile input (the plan puts generic hostile input in M3 to M5); the one hostile object, a draft claim with a throwing `extent` getter in case 10's fixture of refusals, exists to produce a `hostile-input` refusal for rendering, and the fixture asserts it was read exactly once.

## Decision 5 — the sabotage ledger

Each control was applied to the tree by a scratch script that replaces one string (it fails if the string is not found exactly once), runs `vitest run tests/failures --reporter=json`, restores with `git checkout -- lib domains app scripts tests`, and aborts if `lib domains app scripts` is dirty. The control (unedited) is 0 failed. "N failed" counts test cases in `tests/failures`; the digits after are the case files that had a failed test. A control that goes red outside its own case is shown as it happened.

| Row | File | Edit | Result |
|---|---|---|---|
| C01a | `lib/ground/read-observation.ts` | digit-containment off (`firstBoundNotInQuote` never reports) | 4 failed (01 ×3, 02 ×1) |
| C01b-flip | same | refuse a quote containing "at most" read with a lower bound and no upper | 1 failed (01) |
| C01b-drop | same | refuse a point read from a quote containing " to " | 2 failed (01, 06) |
| C01b-slip | same | refuse a quote containing "business" | 2 failed (01 ×2) |
| C01c | `lib/entail/recheck.ts` | every non-conflicted ruling is `not-reproduced { unmet-differs }` | 17 failed (01, 02, 03, 05, 06) |
| C01d | `lib/ground/read-observation.ts` | the digit runs of a quote keep only the first number | 41 failed (all but 09) |
| C02a | `recheck.ts` | the bound comparison disabled | 6 failed (02) |
| C02b | `recheck.ts` | the `unmet` comparison disabled | 2 failed (02) |
| C02c | `recheck.ts` | a ruling with an empty support side is `not-reproduced` | 8 failed (01, 02, 03, 05) |
| C02d | `recheck.ts` | an `ungrounded` ruling is `reproduced` | 2 failed (02) |
| C03a | `lib/ground/ground.ts` | `extentOf` answers `conflicted` for every field once any tree is conflicted | 4 failed (03) |
| C03b | `ground.ts` | after a conflict, drop the named core's observations and ground the rest | 12 failed (02, 03, 04, 08, 10) |
| C04a | `lib/ground/shrink.ts` | deletion in descending id order | 7 failed (04, 05) |
| C04b | `shrink.ts` | no deletion (the pool is returned whole) | 31 failed (01, 02, 03, 04, 05, 06, 08, 10) |
| C05a | `shrink.ts` | the smaller of the ascending and descending deletions | 4 failed (05) |
| C05b | `shrink.ts`, `read-observation.ts` | the sorts removed, so input order reaches the pool | 6 failed (04, 05, 06) |
| C06a | `lib/ground/open-ends.ts` | every leaf listed for an unmet side, supported or not | 5 failed (03, 06) |
| C06b | `lib/entail/rule.ts` | `contradicted` never ruled | 7 failed (02, 03, 06, 10) |
| C06c | `lib/extent/sum.ts` | `sumForward`'s upper bound off by one | 12 failed (02, 05, 06, 07) |
| C07a | `rule.ts` | `rule` gains an optional third parameter, `asOf` | 1 failed (07) |
| C07b | `read-observation.ts` | every observation dropped when `Date.now()` is after 2100-01-01 | 1 failed (07) |
| C07c | `read-observation.ts` | an observation whose quote contains "RECALLED" refused | 1 failed (07) |
| C08a | `read-observation.ts` | an observation whose source starts with "A forum" refused | 2 failed (08) |
| C09a | `lib/ground/read-schema.ts` | the `operand-reused` check disabled | 2 failed (09): the diamond is then accepted, and the shared-operand schema throws an internal invariant error ("a is not in the tree") |
| C10a | `lib/entail/render.ts` | every ruling's text gets " Typically 2 days." | 3 failed (06; 10 ×2: the per-ruling digit property, and the test that the renderer equals its literal sentence); the per-Brief digit property stays green, because each of the 80 demo Briefs carries a 2 somewhere (checked by a probe) |
| C10d | same | " Typically 97 days." | 4 failed (06; 10 ×3: both digit properties and the renderer-equals-literal test) |
| C10b | same | " It usually takes a couple of days." | 3 failed (06; 10 ×2: the denylist and the renderer-equals-literal test); the digit properties stay green |
| C10c | same | " It usually takes a handful of days." | 2 failed (06, 10 ×1): neither the digit properties nor the denylist go red (the limit); the failures are the exact sentence of case 06 and the test that the renderer equals the literal |
| C09b | `tests/failures/09-…test.ts` | the test's own propagator has no backward pass | 4 failed (09) |
| C09c | same | the test's own propagator is over-tight on `a` by 1 | 4 failed (09) |
| C10e | `tests/failures/10-…test.ts` | the test's own denylist loses "couple" | 1 failed (10) |
| C10f | same | the test's own digit check sees nothing | 2 failed (10) |
| C10g | same | the test's own denylist matches substrings | 2 failed (10) |
| C10h | same | the test's own denylist gains "handful" | 1 failed (10) |
| C11a | `domains/order-desk/script.ts` | `runScript` drafts from no documents | 1 failed (10) |

35 controls. Across all of them, every one of the suite's 60 tests is red at least once (the union was computed from the per-control results, not read). The plan asks for at least five real sabotages: every case 01 to 10 has at least one control on the shipped source, except the in-file coverage of case 09's three harness tests and case 10's four blind-spot tests, which have none on `lib/` by design (they run no lib code) and are covered by C09b, C09c and C10e to C10h, mutations of the test's own checker. A mutation of a test is not a sabotage of shipped source; it shows that the test would notice its own checker changing, and nothing more.

## Timing

Three ambient runs of the whole suite (67 files, 3109 tests, 0 failed each), then one with 20 `yes > /dev/null` started beside it (killed afterwards; none left), per-test durations from `vitest --reporter=json`. The machine was shared (the 1-minute load average was already above 20 before the loaded run started, so the "loaded" figure is a loaded machine with 20 more).

- Slowest M7 tests ambient: case 09's three sweeps, 634 ms, 737 ms and 660 ms for the slowest in each run. Slowest M7 test outside case 09: case 08's metamorphic test, 239 ms, 336 ms and 303 ms.
- Loaded: case 09's slowest sweep 2214 ms (44% of the 5 s default); case 08's metamorphic test 990 ms (20%). CI is about three times slower than this machine.
- Case 09's three sweeps therefore carry an explicit 30 s timeout (`SWEEP_TIMEOUT_MS`, with its justification in the file). The work was not reduced: the counts quoted in the case are what its tests assert. Everything else keeps the default 5 s, and its slowest loaded figure is 20% of it.

## What is not proven

- Every case pins one limit by the examples it names, not the limit in general: case 01's three mis-extractions are examples of a boundary the digit check cannot guard; case 03's five refund claims, case 04's two pair-structures, and case 05's four-document route are instances.
- A control is one edit to one place. It shows the case notices that edit. It does not show the case notices every way the limit could change.
- Case 07's behavioural half moves the clock with `vi.useFakeTimers` and counts `Date.now` and `performance.now`; a clock read some other way (`new Date()` with no argument, `process.hrtime`) is not counted, stated, not pinned. M1's determinism guard, which scans for such names, is cited, not run here.
- Case 08's relabelings are five; a source-keyed rule on a label none of them uses would not be seen. The conflict half asserts no preference for one pair of labels.
- Case 10's two checks are a digit scan and a list. "A denylist is only as good as its list": "a handful", "a fortnight" and "thirty" pass it (pinned). The per-Brief digit check is weaker than the per-ruling one (C10a), because the allowed digits are those of the whole Brief; it is kept for the positions of refusals, which a single ruling does not carry.
- Cases 04 and 05 are about which core and which support the engine names; neither says which one a user would want.
- Case 09's propagator is a hand-rolled bounds propagation over three small families (a diamond, a shared operand, a tree); "exact on a shared operand" is observed on 3563 consistent random instances of cap 6, not proved, and not claimed beyond them.
- The ledger above was produced by a scratch script that is not in the repository (this milestone owns `tests/failures/**` and this file only). Each row names the file and the edit, so it can be repeated by hand.
