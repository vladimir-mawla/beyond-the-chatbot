# ADR 0006 — M6 order desk: the stand-in drafter, the canonical script through the real engine, and a demo checked by an enumeration oracle

- **Date:** 2026-11-09
- **Status:** proposed — written by the builder; not yet verified by an independent L4 pass
- **Phase / milestone:** M6 (BUILD, DOMAIN) — `domains/order-desk/**`, `scripts/demo-order-desk.ts` and this file

Numbers below come from commands run in this session on the final tree. The sabotage ledger quotes "N failed (files)" with no "passed" denominator. Test names are cited by file and title, never by line number. Where a sentence says a limit is "pinned", a named test pins it; otherwise it says "stated, not pinned by a test".

## Context

`.genesis/PLAN.md` section 6, M6, with the scenario of section 7. `main` was at `cbb6c23` (M1 to M5 done). Ownership: `domains/order-desk/**`, `scripts/demo-order-desk.ts` and this file; `git diff --name-only origin/main..HEAD` lists nothing else. No file of `lib/**` was edited, no dependency was added (`npm ci` only), `.genesis/PLAN.md`, `DONE.html` and `CURRENT.md` are untouched.

## Decision 1 — files and public surface

The plan's six sources (`schema.ts observations.ts questions.ts drafter.ts script.ts index.ts`) plus one, `freeze.ts` (`deepFreeze`, used by the constants; the plan's list has no home for a shared helper; M5's `plain.ts` is the precedent). `index.ts` exports the plan's eight names (`CANON_SCRIPT`, `ORDER_DESK_SCHEMA`, `OBSERVATIONS`, `QUESTIONS`, `SNAPSHOTS`, `fluentDraft`, `renderFluent`, `runScript`) and seven more values (`FIELDS`, `MODEL_PRIORS`, `PRIOR_CUSTOMS_DAYS`, `PRIOR_PACK_DAYS`, `PRIOR_TRANSIT_DAYS`, `claimsOf`, `observationsOf`) and twelve types; `architecture.test.ts` ("the public surface") pins the list at run time and by the parser.

`FIELDS` is a frozen object of branded ids: a field is named through it, so `FIELDS.packDay` does not compile (`canon.test.ts`, "a misspelt field or document does not compile": four `@ts-expect-error`, checked by `npm run typecheck`). Every domain constant is deep-frozen (`canon.test.ts`, "the constants are frozen all the way down", which also writes through them and expects a `TypeError`).

## Decision 2 — the drafter

`drafter.ts` is the stand-in for a model. Its rule (written out in the file header and pinned value by value in `drafter.test.ts`):

- a base quantity with observations: `floor((greatest finite lo + least finite hi) / 2)`; one finite end alone is that end; none is the prior. Ends that cross (documents that do not overlap) are averaged by the same formula, with no special case;
- a base quantity with no observation: a model prior (`PRIOR_PACK_DAYS = 1`, `PRIOR_TRANSIT_DAYS = 4`, `PRIOR_CUSTOMS_DAYS = 2`), labelled "(typical)" in the paragraph with a note that it is a prior;
- `deliveryDay`: the same rule over the observations about it if there are any, else the sum of the three statements.

It imports from `lib/` only the types `Claim` and `FieldId`, and no value at all (the plan also allows `fieldId`; the drafter does not use it, and the architecture test is stricter than the plan on this point). Its one other import is this domain's `FIELDS`. **The plan's own wording conflicts with itself here**: it says the drafter states "the midpoint of the `meet`" of the extents, and also that it may import no engine function; `meet` is `lib/extent`'s. The drafter computes the intersection's ends inline, and the first sentence is read as describing the arithmetic, not the import.

Two things are invented and disclosed. The plan names only `PRIOR_CUSTOMS_DAYS = 2`; the pack and transit priors are needed so that the drafter is total over all sixteen snapshots M8 offers (the canonical snapshots never use them), and equal what the canonical documents give. The crossed-ends rule is the other. `fluentDraft` also takes an optional third argument, `priors`, defaulting to `MODEL_PRIORS`, so that a test can vary a prior (a plan extension; the plan's signature has two parameters).

The question is carried in the draft so that the paragraph can answer it, and never changes a statement (`drafter.test.ts`, "the question does not change a single statement"). The draft is `{question, statements: [4 x {claim, basis}]}`: one record per quantity, no index-paired arrays. `renderFluent` is a fixed template over the draft; it prints the stated numbers and the template's words, no id, label, source or other free text (a quantity it has no phrase for prints as "that quantity"); `drafter.test.ts` checks, over all 80 states, that every number it prints is a stated value and that "typical" appears exactly when some statement rests on a prior.

**The drafter's inputs are not an untrusted read place**: they are this package's own constants or a subset of them, typed. What it produces goes to the engine as `unknown`, and the engine reads it as untrusted. So the "read-once" table of the sibling milestones has no place here; `runScript` reads each of a step's three numbers once into a local and treats an index that is not an integer inside the menu as a typed failure (`script.test.ts`, "a script step whose indexes are outside the menus fails ...", with NaN, +-Infinity, 2**40, a fraction, strings and inherited names).

Section 7's step 5 gives delivery as 14 in the drafter (a direct document exists), where M5's fixture has 6 for that step. The kinds are the same (all conflicted); the drafter's rule decides, and `drafter.test.ts` ("the plan's section 7 drafter column") pins 14.

## Decision 3 — `runScript`, and what it does not do

`script.ts` composes the engine's public functions (`ground`, `answer`, `renderBrief`, `recheck`) over the constants and stops at the first failure with a typed `ScriptFailure` naming the step; it rules nothing. Six failure kinds: two for an out-of-range index, and four wrapping the engine's own refusals. The canonical constants cannot reach the engine-refusal four, so `script-failures.test.ts` reaches them by wrapping the engine's function (`vi.mock`) to return what its contract allows, and has a control with the wrappers passing through.

`script.test.ts` pins, for the six steps of section 7: the kind of all five rulings of each step against a table written from the plan (`KINDS`); every ruling in full (`RULINGS`), which was read off the first run and then checked by hand against section 7 (so it pins the output; the independent check of kinds and extents is the demo's oracle); the `Brief.evidence` ids; the `recheck` findings; the exact rendered Briefs of steps 1 and 5 and the question lines of all six; determinism; and that the steps run in reverse order give each step the result it had in order (a stale-state check, since two runs of the same order agree trivially). Tallies over the 30 rulings: entailed 3, weakened 16, contradicted 3, ungrounded 3, conflicted 5.

## Decision 4 — the demo, and its oracle

`scripts/demo-order-desk.ts` runs the script and prints, per step, the chatbot's paragraph, the rendered Brief and the `recheck` findings, then exits non-zero unless: the script ran; every ruling's kind equals the oracle's and every `established` extent equals the oracle's extent for that quantity, and a conflicted ruling's core is unsatisfiable by the oracle; `recheck.intact` on every Brief; all five kinds were observed. (Stronger than the plan: the plan asks for the extents; the kinds and the core are added.) A thrown run is reported as `FAIL: the run threw: ...` and exits 1. The core check says the core is unsatisfiable, not that it is irreducible.

**The oracle** (between two marker comments in the script) lists every world: three base quantities in `[0, cap]` with `cap = 40`, delivery their sum, each inside every observation's extent. An upper side is unbounded exactly when widening the window to 41 moves it (the rule of M3/M4, plan section 8 defect 9); lower sides are never unbounded because the baseline is 0. It imports nothing and calls nothing; the script imports only the domain's index. 40 is larger than every finite constant in the canon (the largest is 14), an argument, not a test; the oracle throws if a world exists in one window and not the other.

**The independence check** (`demo.test.ts`, "the oracle region of the demo script does not call the engine") is a parsed scan of the region: every identifier in it must be declared inside the region, be a property name, or be one of `Math Infinity Error Record undefined`; a dynamic `import()`, a `require`, or an `import` inside it is a finding; the markers must exist exactly once, in order. It has a fixture per form it claims (an imported function called, an imported name merely referenced, a renamed import, a namespace import, an alias declared outside the region, `globalThis`, `Function`, `eval`, `Object`, `process`, a dynamic import, `require`) and a control of plain local code. **Not seen, stated and pinned by the test "what it does NOT see"**: an engine function passed into an oracle function as a parameter, and the code outside the region that builds the oracle's inputs (here `observationsFor`, which reads the domain constants `OBSERVATIONS` by id). Other evasions (a method reached through a global the allow-list permits, prototype tampering) are stated, not pinned.

**Why the demo's tests start a child process.** `verifyRun` and `reportOf` are in `scripts/`, a layer above `domains/`, and M1's closed-graph scan (which runs over the domain's own test files) reports a static import upward as `upward-layer-import`. Nor can a test live in `scripts/` (not in vitest's `include` globs, which are G3's) or `tests/` (not M6's). So `demo.test.ts` calls them in a child Node process, passing runs as JSON on stdin; a `ScriptRun` is plain data, so the round trip loses nothing. The cost is that the tests are slower (below) and that the exported functions are exercised out of process; the spawn tests have an explicit 30 s timeout (the default is 5 s).

**Teeth for the exit contract** (`demo.test.ts`): tampered copies of the real run, one test per clause (a changed established lower end, upper end, an end made unbounded, a derived `[7, 10]` changed; a kind swapped five ways; a vacuous tested extent; `intact` false at steps 1, 3, 6; each of the five kinds removed from the run; a satisfiable core and a core naming an unknown document; a snapshot changed under the Brief; a conflicted ruling where a world exists); a control of all 80 states (16 snapshots x 5 questions) passing; and the real program over fresh copies of the source with the engine sabotaged (below). The program prints identical bytes twice (`demo.test.ts`, "exits 0 on the real engine, and prints the same bytes twice").

## Decision 5 — what the domain may not do

`architecture.test.ts` scans the seven sources (parsed): imports only a sibling or `lib/{contracts,ground,entail}/index.js` (so never `lib/extent`, never a file inside a layer); the values each file may take from a layer, every allowance used by some source; the sibling graph, every edge used; the drafter's whole lib import is `type { Claim, FieldId }`; no object literal whose `kind` property is a variant name (identifier key, string key, no-substitution template, wrapped in parentheses, `as` or `satisfies`); no bound read (`.lo`, `.hi`, `["lo"]`, a destructured `lo` or `hi`) in any source but the drafter; no top-level `let` or `var`. A synthetic tree has one violation per file. **Not seen, pinned by the test "what the scans do NOT see"**: a computed key, an alias, a shorthand, a spread, `Object.assign`, `JSON.parse`, a class field and a substituted template that build a variant name; a bound read through a variable key or `Object.values`. A destructured parameter `{ lo }` is seen (a control). The drafter is exempt from the bound rule because it computes stated values (midpoints) from observations' ends; what keeps it from being an engine is that it imports none, which the import rule checks. M1's whole-repository graph scan and determinism guard run over the domain from `architecture.test.ts` and are asserted to have parsed every source and test file.

## Findings the build produced

1. **The plan's claim "changing `PRIOR_CUSTOMS_DAYS` moves only the drafter column, no `Entailment` does" is true for the kind, established extent, support and core of every ruling when the customs prior is 1 to 6** (`script.test.ts`, "the engine does not read the prior", 6 steps x 6 priors x 4 claims, and the question's ruling untouched), **and not quite true outside that range, both pinned**: a prior of 0 changes the *cut* of step 1's customs ruling (its `openEnds` loses the lower side, because the claim "exactly 0" already satisfies the floor), and a prior of 7 to 10 makes step 6's customs claim fall inside the derived `[7, 10]`, so that one claim's kind goes from `contradicted` to `weakened`; 6 and 11 do not. In every case `tested` follows the claim. The engine reads the claim it is given, and the prior is only a number in the claim.
2. **Sabotage of `sumBackward`'s sign.** Flipping only the upper-bound line (`hi - other.lo` to `hi + other.lo`) makes the program exit non-zero with the oracle's lines all at step 6, as the plan says (`demo.test.ts`, "sumBackward's upper-bound sign flipped"): `established {"lo":7,"hi":18} differs from the oracle's {"lo":7,"hi":10}`; and "recheck is not intact" at step 6. Flipping the lower-bound line, alone or with the upper, never reaches the oracle: `lib/ground`'s own propagation guard throws ("did not settle"), and the demo reports it as a thrown run and exits non-zero.
3. The 80 states of M8's exhaustive check (16 subsets x 5 menu questions) already all answer, with `recheck` intact, and agree with the oracle (`demo.test.ts`, "agrees with the engine on all 80 states"); this is M6's evidence about the domain, not M8's.

## Sabotage ledger

Each edit applied to the final tree, `vitest run domains lib/contracts` (M1's suite is included because its repository-wide scans read `domains/`), file restored; the control (unedited) is 0 failed. "N failed" plus the files with a failed test or a collection failure. `tsc` is `npm run typecheck`'s lib half, quoted only where the edit also changed it. `P` rows are the plan's own.

| Row | File | Edit | Result |
|---|---|---|---|
| `P1` | `lib/extent/sum.ts` (in a fresh copy of the source) | `sumBackward`'s upper-bound sign flipped (plan) | the program exits non-zero; every FAIL line is at step 6 (`demo.test.ts`, "sumBackward's upper-bound sign flipped") |
| `P2` | `drafter.ts` | `PRIOR_CUSTOMS_DAYS` 2 to 3 (plan) | 10 failed (drafter, script) |
| `P3` | `script.ts` | the domain builds an object literal whose `kind` is `"entailed"` | 1 failed (architecture) |
| `P4` | `drafter.ts` | the drafter imports `meet` from `lib/extent` | 3 failed (architecture) |
| `P5` | `schema.ts` | `FIELDS` typed as `Record<string, FieldId>` (a misspelling compiles) | 0 failed; tsc: 12 errors (the four `@ts-expect-error` proofs and what depends on them) |
| `D1` | `drafter.ts` | midpoint truncates toward zero | 2 failed (drafter) |
| `D2` | `drafter.ts` | lower end of the meet is the least `lo` | 3 failed (drafter) |
| `D3` | `drafter.ts` | upper end of the meet is the greatest `hi` | 3 failed (drafter) |
| `D4` | `drafter.ts` | delivery is always the sum | 9 failed (drafter, script) |
| `D6` | `drafter.ts` | the question changes a statement | 5 failed (drafter, script) |
| `D7` | `drafter.ts` | the paragraph always says Yes | 3 failed (drafter, script) |
| `D8` | `drafter.ts` | a prior is not labelled "(typical)" | 2 failed (drafter, script) |
| `D9` | `drafter.ts` | a stated value is a lower bound only | 13 failed (drafter, script) |
| `D11` | `drafter.ts` | the drafter imports the value `fieldId` (the plan allows it) | 2 failed (architecture) |
| `D12` | `drafter.ts` | the prior note is never printed | 2 failed (drafter, script) |
| `S1` | `script.ts` | `intact` a constant true | 2 failed (demo, script-failures) |
| `S2` | `script.ts` | render over `ORDER_DESK_SCHEMA` instead of the engine's validated copy | **0 failed** |
| `S3` | `script.ts` | no integer check on the snapshot index | 1 failed (script) |
| `S4` | `script.ts` | a rejected observation ignored | 1 failed (script-failures) |
| `S5` | `script.ts` | the drafter is shown no documents | 5 failed (script) |
| `S6` | `script.ts` | draft claims not sent to the engine | 16 failed (demo, script) |
| `S7` | `script.ts` | recheck over `ORDER_DESK_SCHEMA` instead of the validated copy | **0 failed** |
| `S9` | `script.ts` | the domain reads a bound | 1 failed (architecture) |
| `S10` | `script.ts` | imports `lib/extent` | 3 failed (architecture) |
| `S11` | `script.ts` | imports a file inside `lib/ground` | 4 failed (architecture) |
| `O1` | `observations.ts` | o1's quote loses the digit 2 | 26 failed (canon, demo, script, script-failures) |
| `O2` | `observations.ts` | the second snapshot loses o3 | 13 failed (canon, demo, drafter, script) |
| `O3` | `observations.ts` | o4's extent 13 against a quote saying 14 | 24 failed (canon, demo, drafter, script, script-failures) |
| `O4` | `observations.ts` | `observationsOf` keeps an unknown id as `undefined` | 2 failed (canon) |
| `Q1` | `questions.ts` | the first question says 13 | 5 failed (canon, script) |
| `Q2` | `questions.ts` | the customs question is about packing | 10 failed (canon, demo, drafter, script) |
| `C1` | `schema.ts` | delivery's sum drops customs | 28 failed (canon, demo, script) |
| `C2` | `schema.ts` | customs has a floor of 1 | 15 failed (canon, demo, script) |
| `F1` | `freeze.ts` | `deepFreeze` does not freeze children | 4 failed (canon, drafter, script) |
| `M1` | demo | ignores `recheck.intact` | 3 failed (demo) |
| `M2` | demo | does not require all five kinds | 2 failed (demo) |
| `M3` | demo | does not compare established extents | 3 failed (demo) |
| `M4` | demo | does not compare kinds | 5 failed (demo) |
| `M5` | demo | does not check a conflict's core | 2 failed (demo) |
| `M6` | demo | the oracle never reports an unbounded side | 10 failed (demo) |
| `M7` | demo | the oracle has no `ungrounded` row | 11 failed (demo) |
| `M8` | demo | the oracle region mentions an import (`void runScript`) | 1 failed (demo) |
| `M9` | demo | the oracle window is 3, not 40 | 10 failed (demo) |
| `M10` | demo | a failed verification does not set the exit code | 4 failed (demo) |
| `M11` | demo | the oracle's begin marker renamed | 2 failed (demo) |
| `M12` | demo | `ALL_KINDS` drops `conflicted` | 5 failed (demo) |
| `M13` | demo | a thrown run is rethrown, not reported | 1 failed (demo) |
| `M14` | demo | the oracle's containment is strict on the lower end | 12 failed (demo) |

`P1` is a test, not a failure count: `demo.test.ts` sabotages a copy of the engine and runs the real program, and the test passes when the program fails as described (Finding 2). Two rows are green and each is argued: `S2` and `S7` replace the engine's validated copy of the schema by the domain's constant, which `readSchema` returned equal to the constant (`canon.test.ts`, "is accepted by readSchema, and the copy it returns equals the constant"), so the two programs differ in no observable value (an equivalent mutant; no test distinguishes them, and none could while the schema is a constant). `P5` is a typecheck-only guard: the vitest run is green because types are erased, and CI's `npm run typecheck` step is what turns red. Some rows also print one `tsc` error from an unused variable the edit left; those are not the guard.

## Timing

Three ambient runs of the whole suite, then one with 20 `yes > /dev/null` (killed afterwards; none left), per-test durations from `vitest --reporter=json`, `AI_AGENT` and `CLAUDECODE` unset. The machine was shared; the load average at the start of the loaded run was 25.

- The slowest M6 test with the **default** 5 s timeout: 395 ms ambient (`architecture.test.ts`, "the closed module graph ..."), 265 ms in the loaded run (the stricter-drafter-rule test); the 40% line is 2 s.
- The slowest M6 tests overall are the child-process tests of `demo.test.ts`, each with an **explicit** 30 s timeout: 1.05 s ambient (the real program twice), 2.15 s in the loaded run ("agrees with the engine on all 80 states"). CI is about 3 times slower than local; the explicit timeout leaves a factor above 10 on the worst loaded figure.
- The whole suite was green in all four runs (3044 tests, 57 files).

## Plan wording and neighbours, flagged (the plan was not edited)

- The `meet` sentence (Decision 2). The pack and transit priors and the crossed-ends rule are not in the plan. The optional `priors` parameter is not in the plan.
- "`recheck.intact` on every Brief" in the demo is met; the plan's M8 text says a verifier diffs the page's conflict block "with the last scripted step"; the last scripted step here is step 6 (customs), and the conflict is step 5. The demo prints the rendered Brief, not a pairwise table; the pairwise line ("6 of 6 pairs consistent ...") is M8's and is not in this demo's output, and M8 may not edit `scripts/`.
- The plan's "flip `sumBackward`'s sign" has two lines to flip; Finding 2.

## Rejected alternatives

- A drafter that calls `meet` from `lib/extent`: the plan forbids it (the gate in a costume).
- `fluentDraft` returning bare `Claim[]`: the paragraph then could not say which values are priors, or answer the question.
- Importing the script statically from the domain's test: refused by M1's layer scan (Decision 4).
- A `vi.mock` of the engine for the demo's exit-code tests: rejected for a sabotaged copy run as a real process, which also exercises the loader, the exit code and the output.
- Making the oracle cheaper than enumeration (interval arithmetic): that is the engine's algorithm; the oracle exists to not be it.

## What is not proven

- `RULINGS` in `script.test.ts` pins the output of the first run, hand-checked against section 7's table; a misreading shared by the table and the engine would be in both. The oracle is the independent check, and it covers the kind and the established extent, not supports, cuts or open ends.
- The oracle's cap (40) is argued to be above every finite bound in the canon, and the oracle throws if two windows disagree on whether a world exists; a window that is too small and still holds a world is caught only by the unbounded-side rule.
- The independence scan is by name and sees the forms listed in Decision 4 only. The "no `Entailment` literal" and "no bound read" scans see the forms listed in Decision 5 only.
- The drafter is checked against a restatement of its own rule (600 generated observation lists, longest 8, tallies in the test's output: crossed ends 243, one-sided 352, no finite end 46, a prior used 793 times, a sum 256, a direct delivery 344, a negative value 176), and against the plan's table; "a chatbot would say this" is not something a test can show.
- The paragraphs are not claimed grammatical in general. `renderFluent` prints no free text; `renderBrief` (M5) prints ids and schema labels as given, and `lib/entail` does not escape them (M5's disclosed limit): the demo's output has no id that is not one of `o1` to `o4` or a field label this domain wrote.
- Not claimed: that a real model would do what the drafter does.
