# ADR 0005 — M5 entail: reading a claim once, ruling it by the table, assembling a Brief, rendering it as templates, and re-checking it from the carried evidence alone

- **Date:** 2026-11-09
- **Status:** proposed — written by the builder; not yet verified by an independent L4 pass
- **Phase / milestone:** M5 (BUILD, ENTAIL) — `lib/entail/**` and this file

Numbers below come from commands run in this session on the final `lib/` (the tallies are printed by the coverage tests and are fixed by seed). The Sabotage ledger quotes "N failed (files)" with no "passed" denominator, so adding a test later does not make a sentence stale. Counts of tests are quoted only where they say which run is meant ("Context" for the tree this milestone inherited, the control of the "Sabotage ledger", and "Timing"). What is quoted elsewhere are the constants a test is built on (seeds, instances, sizes) and the tallies. Test names are cited by file and title, never by line number.

## Context

`.genesis/PLAN.md` section 6, M5: the section 5 functions `readClaim`, `rule`, `answer`, `renderEntailment`, `renderBrief` and `recheck`, with the table of section 4.2 and the definitions of section 4.3. Ownership: `lib/entail/**` and this file. `git diff main -- . ':!lib/entail' ':!.genesis/decisions/0005-entail.md'` is empty. No file of `lib/contracts`, `lib/extent` or `lib/ground` was edited, and no dependency was added (`npm ci` only; the lockfile was not written).

**How this milestone started.** An earlier builder was stopped mid-edit. It left the branch `m5-entail` checked out with an untracked, uncommitted `lib/entail/` (seven sources and four test files plus `fixtures.ts`) and no commits. I did not trust it and did not discard it: I read every source, ran typecheck and the four tests, and found them sound (477 tests green). Two defects were in what it left, both fixed here: a stray `void fieldId;` and a wrong figure in a title in `partition.test.ts` (D16 is [136, 153], not [136, 152]), and one defect in a source that its tests did not reach: `recheck` threw a `RangeError` for a carried-evidence list whose `length` was 2**32 or more (Decision 6; row `E1` of the ledger). Everything else in the sources is as it was found. The five missing test files, the architecture test, the ledger and this ADR are mine.

## Decision 1 — files and public surface

**Files.** The six sources the plan lists (`read-claim rule answer render recheck index`), and one more, `plain.ts`, because the plan's list has no home for what several modules share: `deepFreeze`, the narrowing of a built list to the non-empty tuple type the contract wants (it throws on an empty one, an internal invariant), and three shape predicates (`isText`, `isRecord`, `isCount`). `lib/ground` has the same helpers and keeps them internal (its `index.ts` exports none), so writing them again here was cheaper than widening a frozen surface. The tests are the plan's nine files plus `fixtures.ts`. `architecture.test.ts` reads the plan's `Owns:` line, compares it with the inventory, and states that `plain.ts` is the one addition.

**Surface.** `index.ts` exports exactly the six functions and the eight types of the plan's `lib/entail` block. `architecture.test.ts` copies the plan's eight declarations into the test, compares the copy with the text of `.genesis/PLAN.md` (ignoring comments, spacing and a name prefix), and proves the engine's types and the six signatures identical to the copy at compile time. That last part is a `tsc` check (`npm run typecheck`), not a vitest assertion; row `T1` turns `tsc` red.

**The sibling graph is part of the design.** `recheck.ts` imports only `plain.ts` among its siblings, and `rule.ts`, `answer.ts` and `read-claim.ts` do not import `recheck.ts` or `render.ts`. The holder's checker therefore shares no ruling code with the ruler: what it shares with the engine is `lib/ground`'s public surface (`ground`, `extentOf`), `lib/extent`'s algebra and M1's guard, which are the layers below. `architecture.test.ts` scans for it (rule `sibling-not-allowed`) and sabotages the real files to show the scan fires; row `P7` and the describe "the real lib/ copied and sabotaged" in `architecture.test.ts`, which sabotages copies of the real files and expects each rule to fire on exactly the file named.

## Decision 2 — `readClaim`

Reads an untrusted claim once. The value is tested for being a record (an array is not one), then `field` and `extent` are read once each in that order, then `checkExtent` reads `lo` and `hi` once each. Everything is judged from those reads; nothing else is read, so an extra property whose getter throws is never touched. A read that throws gives `hostile-input` with a message made of this package's words (the thrown value is never looked at), and it outranks `malformed`, so the same input gives the same answer. Faults in the plan's precedence, `malformed` (both offending places named, in code-unit order, no repeats) over `unknown-field` over `vacuous-claim`; the vacuity test is against the schema-only extent `B` in `Grounding.baseline`, so it is judged for a field in a conflicted tree too and never depends on the evidence.

`readClaim` returns a fresh, deep-frozen `Claim` (the extent is `checkExtent`'s copy; `-0` is read as `0`). Tests: `claim-faults.test.ts`, "every fault row breaks only its own rule", the precedence rows, the id-length rows at `MAX_ID_LENGTH` and one past it (and in UTF-16 code units), a 12 000-claim differential fuzz against an independent reference, and the read-once table (25 first values at four places, each against eight hostile later reads).

## Decision 3 — `rule`: the table, and the one place the plan's sentence is not quite true

`rule` calls `readClaim` first, even though its parameter is typed (the plan asks for it, and a cast-built claim is the case), then applies section 4.2's table in the plan's precedence: `conflicted`, `ungrounded` (`E = B`), `entailed` (`E ⊆ C`), `contradicted` (`E ∩ C = ∅`), `weakened`. Every `Entailment` leaves through one function, `finish`, which runs `assertEntailmentWellFormed` and throws on a failure (an internal invariant) and then freezes. Everything is built fresh from copies, so nothing in the result is an object of the `Grounding` or of the claim.

**What the plan says that is not quite true.** Section 4.2: "For every non-vacuous claim the five rows are mutually exclusive and exhaustive." The `ungrounded` row (`E = B`) and the `contradicted` row (`E ∩ C = ∅`) both hold for a claim that is not vacuous and whose extent shares no integer with `B` while no observation moves the field (`x ≥ 0` baseline, no observation, claim `x ≤ -1`). `rule` rules it `ungrounded`, by the plan's own precedence; the other rows' preconditions are the plan's (`weakened` says `E ≠ B`). `partition.test.ts` evaluates the five rows as predicates over the brute-force oracle's `E`, `B` and `C` and asserts that at least one holds for every non-vacuous claim and that exactly one holds except for this case, which it counts: 873 of the 31 888 generated claims. The precedence of `ungrounded` over `contradicted` is therefore observable and guarded (row `R1`), while the precedence of `ungrounded` over `entailed` is not (an equivalent mutant: `E = B ⊆ C` is a vacuous claim, refused first; row `P10` is green and the argument is the plan's). The plan's own scope sentence says the second and not the first, which is consistent; its section 4.2 sentence is what is loose.

Tests: `rule-table.test.ts` (one-field rows with a neighbour row at each boundary, the plan's section 7 steps in full, the vacuity rows, and a full grid of 5 baselines × (no observation, one of 26 extents, or two of 8) × 26 claims against the oracle's relations), and `partition.test.ts` (8 000 generated instances with four claims each, against the brute-force oracle of `lib/ground`'s tests: kind, `tested`, `established`, `unmet`, the support of each side re-derived by the oracle, every core unsatisfiable with every strict subset satisfiable, open ends equal to the definition computed from the oracle's `E` and `B`, and one hand-worked case at 64 fields and 64 observations).

## Decision 4 — `answer` and `Brief.evidence`

`answer` rules the question first (through `rule`, so it is read once) and a rejected question fails the whole call as `question-rejected`, with the draft untouched. Then the draft: `Array.isArray`, then `length` once; not an array is `draft-not-an-array`; a read that throws or a length that is not a count is `hostile-input`; more than `MAX_DRAFT_CLAIMS` is `draft-too-long`, decided from the length alone (no element is read, so a Proxy that claims `2**32 - 1` elements costs nothing). Each element is read once, by index. An element whose read throws is refused, as a claim, with `hostile-input`; every other refusal is `rule`'s. Refused claims go to `Brief.rejected` with their position, ruled ones to `Brief.claims`; both keep draft order and together cover every position once.

`Brief.evidence` is exactly the observations that some ruling's support or core names, once each, sorted by id with `compareIds`, as fresh copies out of `Grounding.observations` (with their `quote` and `source`, so the Brief is self-contained). An `ungrounded` ruling names none. A named id that the grounding does not hold is an internal error and throws.

## Decision 5 — rendering is a fixed template over a ruling and the schema's labels

`renderEntailment` and `renderBrief` are pure templates: the words are the templates', the numbers are the bounds of the ruling's own extents, the ids are the ruling's own, and a label or unit is the schema's text printed as it is. Not printed, on purpose: an observation's `quote` and `source` (free text; `source` is never read by the engine), and the text of a refused draft claim (`unknown-field` would carry the draft's own hostile string). A field the schema does not declare is printed by its id, so rendering never throws for want of a label. A rendering does not check that a ruling is true; that is `recheck`'s job.

Two things a reader will notice. The word for a unit is the schema's, printed after the number whatever the number, so a bound of 1 reads "exactly 1 days" (the plan's samples use "days" too and never print a 1). And the `weakened` sentence names the cut as "the lower bound", "the upper bound" or "the lower and upper bound" ("Withheld: the …"), then the open ends as "No document bounds X from above", or "No quantity is named as missing" when `openEnds` is empty (plan case 06). The plan's sample sentences are labelled illustrative; `render-properties.test.ts` pins exact strings for every ruling of the six steps and the whole `renderBrief` of each.

Properties, on 600 generated scenarios against a schema whose labels contain no digit: the text contains the tested extent, the established extent and every support id, the cut and every open end, every core id, and **the digit tokens of the text are a subset of the digit tokens of the ruling's own numbers and the ids it names**; for a Brief, plus the positions of its refusals. The extent wording is restated in the test, not imported, and the property has controls that fail it (a constant "typically 8 days" sentence, a dropped cut, a dropped id, a dropped open end).

## Decision 6 — `recheck`: what it does and what it does not certify

`recheck(schema, brief)` takes the HOLDER's schema and a Brief from anyone. It never sees the snapshot: it imports only `lib/ground`'s public surface, it has two parameters, and `architecture.test.ts` shows both (a third argument is not read; a different world in the same process changes nothing). Steps:

1. **Read the Brief once** into plain data (`answer`, `claims`, `evidence`, each once; each ruling's eight properties once each; the lengths and elements of the lists; each carried observation's five properties and its extent's two bounds). A read that throws, a value of the wrong shape, or a ruling that fails `assertEntailmentWellFormed` is `ok: false`, `hostile-input`, in this package's own words. `Brief.rejected` is never read (a refusal is a fault, not a ruling), and neither is an extra property. A weakened ruling's `openEnds` is read for being a list and for its length, and its entries are never read: nothing here reads an open end.
2. **Ground the carried evidence again**, so it passes intake a second time, digit-containment included. A schema or evidence `ground` refuses is `ok: false` with `ground`'s own failure.
3. **For each ruling**, a `Reproduction`: `ungrounded` is `uncertifiable-silence`, whatever else it says; a `conflicted` ruling's core must be carried, pass intake, and be unsatisfiable on its own; an `entailed`, `weakened` or `contradicted` ruling has each named id checked (`missing-evidence`, then `evidence-rejected`), then each side's bound re-derived from ONLY that side's support (`support-conflicted`, then `bound-differs`, lower side first), then the kind recomputed from the re-derived extent, `B` and the carried `tested` (`kind-differs`), and for `weakened` the cut (`unmet-differs`). The first failing step is the answer. `intact` is true when no finding is `not-reproduced`; silence does not make a Brief not intact.

**The limits, stated and not hidden. Pinned as results in `recheck.test.ts` ("the limits are pinned as results, not hidden"), except the two marked "Stated, not pinned by a test":**
- A Brief that drops a bound AND its support together claims silence on that side and is `reproduced` with the side in `silentSides`, unless the kind or the cut changes. On the generated Briefs: 968 such forgeries, 410 undetected, 528 change the kind and 30 change only the cut. The plan's model had 4 850 of 9 977 undetected; the proportion is different on a different generator and I do not claim the two are comparable. Stated, not pinned by a test: `silentSides` is a syntactic test (the side's support list is empty), not a semantic one: a forger who names in place of the dropped support an observation that is carried in `Brief.evidence` (an id that is not carried is `missing-evidence`), and sets the carried bound to what that observation alone gives, defeats it, and the Brief is `reproduced` with `silentSides: []`. For a bound dropped to the schema-only bound (the one an empty support is compared with), a carried observation that gives no tighter bound on that side needs no other change. A holder cannot rely on `silentSides` to find omissions.
- Stated, not pinned by a test: `recheck` does not bind a Brief to the question that was asked: `field` and `tested` are carried and never compared with any question, so a Brief re-labelled to a different claim whose ruling holds on the carried evidence is `reproduced`. Binding a Brief to its asker is outside `lib/entail` (plan section 10, "Considered and rejected", bullet "Cryptographic receipts on a `Brief`": an asker-binding is not provided; the plan assigns saying so to the README, which M9 rewrites and which does not yet say it).
- Fabricated observations are certified: authorship is asserted, not proved, which is why the quotes are carried (plan case 02). Tested by hand on step 4's customs observation invented as "exactly 0 days", and on a Brief whose three observations nobody wrote.
- An `ungrounded` ruling is never certified or refuted, even when the Brief's own evidence bounds the field.
- A weakened ruling's `openEnds` is not compared with anything.
- Rulings are checked one at a time. Two rulings about one field with different established extents are both reproduced; so are a "delivery at least 4" and a "delivery at most 3" that cannot both come from one subset.
- Observations that are carried and that no ruling names are grounded with the rest and otherwise not looked at, including a conflicting set.

**A defect the read-once table found.** `readBrief` handed `ground` `new Array(evidenceCount)` when the carried evidence was longer than `MAX_OBSERVATIONS`, so that `ground` could refuse from the length alone. `new Array(n)` throws a `RangeError` for `n` of 2**32 or more, and a Proxy's `length` can say that (`isCount` admits any safe integer). `recheck` therefore threw on a hostile Brief, which D11 forbids. The earlier builder's tests did not reach it (its read-once table for `recheck` did not exist yet). It now hands `ground` an empty Proxy array that says the length; `recheck.test.ts` ("an evidence length of 2**32 or more ...") pins 2**32 - 1, 2**32, 2**40 and `Number.MAX_SAFE_INTEGER` with the exact reads (`length` once, nothing else), and row `E1` shows the old code fails it.

## Decision 7 — the tests, by layer, and what the generators reached

1. **Tables**: `claim-faults.test.ts`, `rule-table.test.ts`, `answer.test.ts`, `render-properties.test.ts` (exact strings), `recheck.test.ts` (each `NotReproduced` reason by hand, with the exact result).
2. **Oracle properties**: `partition.test.ts` (8 000 instances; the tallies below), `recheck.test.ts` (a differential fuzz of 17 tamperings, 8 per scenario on 600 scenarios, answered as the brute-force oracle and `lib/ground`'s reference intake say), `claim-faults.test.ts` (12 000 claims against an independent reference).
3. **Properties of the output**: `immutability.test.ts` (600 generated instances: deep freeze by `Object.isFrozen` AND by trying to write at every node, plain data by JSON round trip, no object shared with the `Grounding`, the question, the draft or the Brief, which are themselves deeply frozen so that a write by the engine would throw), `render-properties.test.ts`, the bound and cut tamper tables of `recheck.test.ts`.
4. **Read-once**: at every untrusted read place, a first value from each class (null, 0, -0, 1, a negative, `MAX_MAGNITUDE` and its negative, one past it, `NaN`, ±`Infinity`, a fraction, ids, a boolean, a bigint, a symbol, `undefined`, an object, an array, a function, valid and inverted extents, and for `recheck` a throw and a revoked Proxy) followed by a hostile second value, asserting both that the place was read once and that the result equals the one a constant first value gives. `readClaim`: 4 places. `answer`: the draft's `length` (14 first values, including `2**32 - 1`) and every element (25 first values). `recheck`: 124 places of one Brief that holds every kind of ruling, 27 first values, 3 later values (10 044 cases), plus a separate table showing that the entries of an `openEnds` list are read zero times.
5. **The integrity gate both ways** (`integrity.test.ts`): `assertEntailmentWellFormed` mocked to fail makes `rule` throw for each of the five kinds (asked once per ruling, never for a refusal), and a cast-built contaminated value (one fault each) is refused by the real guard and, inside a Brief, by `recheck` as `hostile-input`.

**What the generators reached** (printed by the coverage tests, fixed by seed): partition: deepest tree 3 levels, 3 453 instances with more than one tree, cores of size 2 to 5 (2, 3 and 4 asserted at 20 or more each), 16 906 supports checked of which 14 484 sides are non-empty, `weakened` with no open end 2 087 and with some 1 112, ungrounded with 1, 2, 3 and 4 or more open ends (3 037, 1 285, 155, 247). Generated supports reach 4 ids in `partition.test.ts` (M4's generator) and 3 in the `recheck` and `render-properties` generators; the largest hand-worked support is 32; between 4 and 32 nothing is claimed. A Brief reached 9 rulings generated and 33 at the maximum, hand-worked.

## Sabotage ledger

Method. Each edit is made to a copy of the final tree (a copy under `/private/tmp` with `node_modules` linked, synced from the committed `lib/` and checked identical with `diff -r`), `vitest run lib/entail` is run, and the file is put back. The control, the same copy unmodified, is 0 failed in 1150 tests (9 files). Results are "N failed" plus the test files that have a failed test, with no "passed" denominator. Every row was run on the final `lib/entail` (the last edit to a test was followed by a full re-run). The plan's seven items are `P1` to `P7` (its `††` counts are instances on a model and are not comparable); `P8` to `P10` are the plan's "must refuse" sentences; the rest are mine.

| Row | File | Edit | Result |
|---|---|---|---|
| `P1` | `rule.ts` | the contradicted row is never taken (`E ∩ C = ∅` falls through to `weakened`)  (plan: `nocontradicted`) | 409 failed (answer, integrity, partition, recheck, render-properties, rule-table) |
| `P2` | `rule.ts` | the ungrounded row is never taken (`E = B` falls through)  (plan: `noungrounded`) | 417 failed (answer, integrity, partition, recheck, render-properties, rule-table) |
| `P3` | `rule.ts` | a `weakened` ruling carries the tested extent as `established`  (plan: `weakenedkeepsdraft`) | 428 failed (partition, recheck, render-properties, rule-table) |
| `P4` | `rule.ts` | a `weakened` ruling's `unmet` is always both sides  (plan: `unmetall`) | 413 failed (partition, recheck, render-properties, rule-table) |
| `P5` | `render.ts` | `entailed` text gains a constant 'Typically 2 days.'  (plan: render adds a constant number) | 33 failed (render-properties) |
| `P6` | `recheck.ts` | the bound comparison is deleted, so only the kind is compared  (plan: `recheck` compares only `kind`) | 116 failed (recheck) |
| `P7` | `recheck.ts` | `recheck.ts` imports `../ground/solve.js`, a file inside `lib/ground`  (plan: `recheck` reads the snapshot; the architecture test) | 11 failed (architecture) |
| `P8` | `read-claim.ts` | the `vacuous-claim` rejection is deleted  (plan: pinned by a table fixture) | 705 failed (answer, claim-faults, immutability, partition, recheck, render-properties, rule-table) |
| `P9` | `rule.ts` | `finish` does not act on a failed `assertEntailmentWellFormed`  (plan: an `Entailment` that fails the guard) | 6 failed (integrity) |
| `P10` | `rule.ts` | `entailed` is tested before `ungrounded`  (plan: stated unobservable) | **0 failed** |
| `R1` | `rule.ts` | `contradicted` is tested before `ungrounded` | 339 failed (partition, recheck, rule-table) |
| `R2` | `rule.ts` | a conflicted ruling's core is `extentOf`'s array, not a copy of it | **0 failed** |
| `R3` | `rule.ts` | a ruling's support is `supportOf`'s object, not a copy of it | **0 failed** |
| `N1` | `answer.ts` | `Brief.evidence` is not sorted by id | 20 failed (answer) |
| `N2` | `answer.ts` | `Brief.evidence` also carries every observation the rulings do not name | 22 failed (answer, recheck) |
| `N3` | `answer.ts` | a conflicted ruling names no observation, so its core is not carried | 71 failed (answer, recheck) |
| `N4` | `answer.ts` | `Brief.evidence` holds the `Grounding`'s own observation objects | 89 failed (answer, immutability) |
| `N5` | `answer.ts` | a refusal's `index` is one too high | 24 failed (answer, render-properties) |
| `N6` | `answer.ts` | `draft-too-long` at `MAX_DRAFT_CLAIMS` instead of one past it | 1 failed (answer); `recheck.test.ts` fails to collect, because its maximum-size Brief is built when the file loads |
| `N7` | `answer.ts` | each draft element is read twice | 26 failed (answer) |
| `D1` | `render.ts` | the `weakened` sentence does not name the withheld bound | 37 failed (render-properties) |
| `D2` | `render.ts` | the `weakened` sentence prints the tested extent where it says what the evidence establishes | 38 failed (render-properties) |
| `D3` | `render.ts` | the `weakened` sentence drops its open ends | 31 failed (render-properties) |
| `D4` | `render.ts` | the `conflicted` sentence names only the first id of the core | 27 failed (render-properties) |
| `C1` | `recheck.ts` | a side's bound is re-derived from both sides' support, not only its own | 75 failed (recheck) |
| `C2` | `recheck.ts` | an `ungrounded` ruling is `reproduced` | 117 failed (recheck) |
| `C3` | `recheck.ts` | `silentSides` is never filled | 124 failed (recheck) |
| `C4` | `recheck.ts` | a core that is satisfiable is not `core-satisfiable` | 60 failed (recheck) |
| `C5` | `recheck.ts` | a carried observation that failed intake is used as if it had passed | 101 failed (recheck) |
| `C6` | `recheck.ts` | `intact` is always true | 124 failed (recheck) |
| `C7` | `recheck.ts` | the recomputed kind is not compared with the carried one | 70 failed (recheck) |
| `C8` | `recheck.ts` | a `weakened` ruling's `unmet` is not compared | 58 failed (recheck) |
| `C9` | `recheck.ts` | `Brief.rejected` is read | 2 failed (recheck) |
| `C10` | `recheck.ts` | a carried ruling is not shown to `assertEntailmentWellFormed` | 10 failed (integrity, recheck) |
| `E1` | `recheck.ts` | the code before this milestone's fix: `new Array(evidenceCount)` for a carried list longer than the cap | 3 failed (recheck) |
| `X1` | `plain.ts` | `isText` accepts the empty string | 98 failed (claim-faults, recheck) |
| `X2` | `plain.ts` | `deepFreeze` does not freeze children | 70 failed (claim-faults, immutability) |


**The three that are green, and why each is an equivalence or a plan statement, with the evidence.**
- `P10` (`entailed` before `ungrounded`): the plan says it is unobservable through the public API and does not claim to guard it. The only claims for which both rows hold are those with `E = B ⊆ C`, which are exactly the vacuous ones, and `readClaim` refuses them first (the table fixture of `P8` pins that). The run agrees: 0 failed. `R1`, the other order, is not equivalent and is red.
- `R2` and `R3`: `rule` copies the core and the support that `extentOf` and `supportOf` return. Those functions already return fresh, frozen arrays on every call (`extentOf` builds `[...tree.state.core]`, and `supportOf` computes the support again from the `Grounding` on each call), so the copy in `rule` is a second line of defence against a changed lower layer, not an observable one. The identity check in `immutability.test.ts` ("on the generated instances, everything the public functions return is deeply frozen, plain, and shares nothing with its inputs") compares every node of every output with every object of the `Grounding` on 600 instances, 213 of which hold a conflicted ruling, and stays green with the copies removed: nothing is shared either way. A test that would turn red needs a `ground` that aliases; `lib/ground` is frozen.

**Type edits** (checked with `npx tsc -p tsconfig.lib.json --noEmit` on the same copy, restored after each; each turns `tsc` red in `architecture.test.ts`, on the `Assert<Equal<...>>` lines): `T1` adds an optional property `note` to `RecheckFinding` (3 errors); `T2` gives `answer` a fourth optional parameter (1 error); `T3` gives `recheck` a third optional parameter `snapshot` (1 error). These three were run on the sources as committed, before the last test edits; no source changed after them.

**One row that went red more widely than its edit.** `N6` fails one test in `answer.test.ts`, and `recheck.test.ts` fails to load (its maximum-size Brief of 32 draft claims is built at collection time and the edited `answer` refuses it). The load failure is the same cause, not a second finding.

## Timing

Measured with `vitest run --reporter=json` (per-test durations), `AI_AGENT` and `CLAUDECODE` unset, on the final tests (2915 tests in 51 files for the whole suite, 1150 in 9 files for `lib/entail`). The machine was shared with other sessions throughout, so the 1-minute load average at the start of each run is in the table; it lags, and the figures say more about that load than about the tests. The brief for this milestone asked that nothing take more than about 40% of the 5 s timeout, which is 2 s. I did not measure CI before writing this; the pull request records it. The 20 `yes > /dev/null` processes are my own stress (started by one command and killed with `pkill -x yes`; `pgrep -x yes` found none before, 20 while they ran, and none after).

| Run | Load at start | Wall | Slowest `lib/entail` test | Slowest test of all |
|---|---|---|---|---|
| whole suite, ambient, run a | 11.1 | 16.7 s | 479 ms (`architecture`, a copied `lib/` with a sabotaged file) | 1514 ms (M1 `never-sabotage`) |
| whole suite, ambient, run b | 15.4 | 16.9 s | 410 ms (`architecture`, the same group) | 1744 ms (M1 `never-sabotage`) |
| whole suite, ambient, run c | 17.2 | 16.7 s | 558 ms (`architecture`, the same group) | 1333 ms (M1 `never-sabotage`) |
| whole suite, 20 `yes` added | 16.3 | 39.8 s | **980 ms** (`claim-faults`, a 10-seed chunk of the differential fuzz) | 980 ms (the same test) |

What was done about durations. The first full runs, on the first version of the tests, at a load of 25 to 37, had these longer than 1 s: one 25-seed chunk of the `recheck` fuzz (1230 ms), one 50-seed chunk of the `claim-faults` fuzz (1113 ms), one 20-place chunk of the `recheck` read-once table (1027 ms) and, in one of three runs, the `partition` test that ruled six claims at the 64-field maximum (1214 ms in that run, 420 and 445 ms in the other two). They were cut: the `recheck` fuzz to 6 seeds per test, the read-once table to 8 places, the `claim-faults` fuzz to 10 seeds, `partition` to 25 instances per chunk and the maximum-size claims to one test each, `immutability` to 10 seeds. **No timeout was raised and none was set on a generated-instance test** (`vitest.config.ts` is the scaffold's; the one timeout in `lib/entail` is a 2 s guard in `architecture.test.ts` on a test that must end).

In every ambient run the slowest `lib/entail` tests are the scans of `architecture.test.ts` (a copy of the whole `lib/` and a parse of it); the generated-instance tests are below 400 ms there.

## Plan wording and neighbours, flagged (the plan was not edited)

1. **Section 4.2's partition sentence** ("for every non-vacuous claim the five rows are mutually exclusive and exhaustive") is true only in the plan's precedence order: `ungrounded` and `contradicted` both hold for a non-vacuous claim that shares no integer with `B` when no observation moves the field (873 of 31 888 generated claims). Decision 3.
2. **`recheck` and a ruling about an undeclared field.** `RecheckResult`'s failure type is `GroundFailure`, which has no per-ruling reason, so a Brief whose ruling names a field the schema does not declare makes the whole Brief unusable (`hostile-input`, "brief.answer names a field the schema does not declare"), not one `not-reproduced` finding. A choice, not the plan's.
3. **`NotReproduced`** has no kind for "the carried ruling is malformed", so a ruling that fails `assertEntailmentWellFormed` while being read is also `hostile-input` for the whole Brief.
4. **`silentSides` of a `conflicted` ruling** is `[]` (it has no bounds); the plan's comment defines it for bounds with empty support.
5. **`Brief.evidence` carries `quote` and `source`** (it must, for `recheck` to re-run intake with digit-containment); `render` never prints either.
6. **The wording of a unit** ("exactly 1 days"): Decision 5.
7. **A `weakened`'s `openEnds`** is read for its length and its entries are never read, so a forged open-end list is not detected (stated by the plan: "an absence is never certified").

## Rejected alternatives

- **Having `recheck` call `rule` or `readClaim`** to recompute kinds: it would make the checker share the ruler's code and a bug in the ruler would certify itself. `recheck` recomputes the kind with a four-line precedence of its own, built from M3's `isSameExtent`, `isSubset` and `meet`, and the sibling-graph scan forbids the import.
- **Comparing carried `openEnds` with a recomputed list** in `recheck`: the plan says an absence is not certified, and the recomputation would need the snapshot to be meaningful.
- **Refusing the whole Brief when a ruling's evidence fails intake**: the failure type has no place for it, and it hides which ruling is bad. It is a per-ruling `evidence-rejected` with the fault.
- **Sorting `Brief.evidence` by input order or by first use**: sorting by id is what the plan says and what makes the Brief independent of the question order.
- **Rendering the evidence list** (quotes and sources) in `renderBrief`: free text, and `source` is never read by the engine. Left out on purpose.
- **A shared `Map` of observations by id in `answer`**: `Array.find` over at most 64 observations is simpler and there is no module state.

## What is not proven

- That the oracle's window argument is right for every tree: inherited from M4 (ADR 0004, "What is not proven"), and `partition.test.ts` and the `recheck` fuzz inherit its limits: 28 of 8 000 partition instances are not given to the oracle for cost, and 557 are given to it but not for the subset checks; 5 of 600 are skipped by the recheck fuzz.
- Generated supports reach 4 ids in `partition.test.ts` (M4's generator) and 3 in the `recheck` and `render-properties` generators; the largest hand-worked support is 32; between 4 and 32 nothing is claimed.
- Observation ids and field ids are printed as given; they are free text too (1 to 128 units), so an id containing a newline forges a line in the rendering. `lib/entail` does not escape them.
- That the `recheck` fuzz's reference is independent of the engine's step order. The extents and the intake verdicts are the oracle's and `lib/ground`'s reference; the order of steps and the choice of the reason are restated from the plan by me, in `referenceFinding`, so a misreading of the plan would be in both.
- That `support-conflicted` is reachable by a tampering: the fuzz does not ask it (a positive ruling's tree is consistent, so no change of the ids puts a conflict inside one tree's support); it is built by hand once, on two sides.
- That the read-once table covers every hostile later value: 8 for `readClaim` and `answer`, 3 for `recheck`.
- That the rendering is grammatical in general (Decision 5).
- That `lib/entail` stays deterministic outside what M1's guard scans: the guard bans `Date`, `Math.random` and `localeCompare` in `lib/` sources, and the sources contain none.
- That the sabotage ledger covers every possible edit: it shows these edits go red (the exceptions are explained in the ledger), not that no edit goes green.
- That timing holds on another machine or under another load; that CI passes on the pushed branch (see the pull request).

## Falsifiability log

```
git diff main -- . ':!lib/entail' ':!.genesis/decisions/0005-entail.md'      # empty after every commit
npm ci
npm run typecheck
npm test -- lib/entail                                       # the plan's check for M5
env -u AI_AGENT -u CLAUDECODE npx vitest run lib/entail      # prints the tallies quoted in Decision 7
npm test                                                     # M1 to M5 together
```
