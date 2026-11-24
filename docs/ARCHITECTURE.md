# Architecture: what each stage refuses, and why

This is the architecture as it is on `main` after M8 (commit `a4e1fea`), each refusal tied to the file that makes it and a test whose title says it. A citation is a backticked file path followed, on the same line, by one `›` and a quoted test title for each title cited. `tests/docs/citations.test.ts` checks that every cited file exists and that every cited title is in its file on a line that opens a test or a `describe`. It does not check that a sentence is what the cited test asserts; each citation here was chosen by reading the test's title and, for the ones a sentence leans on, its body, and that reading is a person's. Design decisions are cited as D1 to D11, the numbering of `.genesis/PLAN.md` section 3.

## The shape: one direction, four engine layers

```
lib/contracts  ->  lib/extent  ->  lib/ground  ->  lib/entail  ->  domains/order-desk
  types, ids,      intervals,       schema,          rule, answer,    the schema, four documents,
  guards, limits   sums, meet       observations,    recheck,         a stub drafter, the script
                                    bounds, support  render           and its oracle

        then, importing only the barrels (each layer's index.ts):
        components/order-desk/compute-demo-view.ts  (the one bridge)  ->  OrderDeskDemo.tsx  ->  app/page.tsx
        scripts/demo-order-desk.ts                                       (npm run demo:order-desk)
        app/api/health/route.ts                                          (imports lib/contracts only)
```

The arrows are the `from "..."` lines of the non-test sources on `main` after M8, read by hand for this document (the scans cited below pin parts of it, and say which). `lib/extent` imports `contracts`; `lib/ground` imports `contracts` and `extent`; `lib/entail` imports `contracts`, `extent` and `ground`; `domains/order-desk` imports `lib/contracts`, `lib/ground` and `lib/entail`, never `lib/extent`.

What enforces it, and how far:

- `lib/` as a whole: `lib/contracts/__tests__/architecture.test.ts` › "this repository: lib/ is a closed module graph and obeys the layer table" scans every `.ts` file under `lib/`, resolves relative specifiers to real files, allows no package import in library source, and fails on an upward import. The check is about imports, not purity.
- Each engine layer above `contracts` has its own scan and a pinned public surface: `lib/extent/__tests__/architecture.test.ts` › "the public surface of index.ts", `lib/ground/__tests__/architecture.test.ts` › "the public surface of index.ts: the six functions", `lib/entail/__tests__/architecture.test.ts` › "the public surface of index.ts: the six functions".
- `domains/order-desk`: `domains/order-desk/__tests__/architecture.test.ts` › "the real sources". What its scans do not see is pinned in the same file › "what the scans do NOT see (stated, and pinned so that the statement stays true)".
- The page: `components/order-desk/__tests__/architecture.test.ts` › "only compute-demo-view.ts imports lib/** or domains/**" is the one-bridge rule, and › "no banned hook, timer, clock, randomness, locale call, dynamic code" is the hook scan.
- No clock, randomness, network or model: `lib/contracts/__tests__/determinism.test.ts` › "this repository: no clock, randomness, network or model under lib/" scans the sources by syntax tree. Ways to reach a banned global that it does not see are listed, and pinned, in the same file › "THE DOCUMENTED LIMITS". `tests/failures/07-evidence-has-no-clock.test.ts` › "with the system clock moved a century either way" is the behavioural half: it moves the clock and the results do not move.

## The one path a question takes

The engine's only inputs are a schema, a list of observations and claims (D3). Nothing carries state from one call to the next.

1. `readSchema` and `ground` read the schema and the snapshot as untrusted input, each property once, and refuse what is faulty (Stages 2 and 3 below).
2. `ground` computes, for every field, the range the schema alone allows (the baseline), the range the evidence implies, a support (the observations that give each bound), the gaps (open ends) and, where the observations cannot all be true, a core.
3. `answer` rules the question and each draft claim with `rule` against those, into a `Brief` of `Entailment`s (Stage 4).
4. `renderBrief` turns a Brief into text; `recheck` re-derives each ruling from the evidence the Brief carries.

## Stage by stage

"Refuses" means "returns a typed fault or a weaker ruling, and says so". It does not mean "stops a caller from saying something else".

### Stage 0: contracts (`lib/contracts`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| an `ungrounded` or `conflicted` ruling carrying an `established` extent, a `weakened` one without `unmet`, and the other forbidden or missing fields of each variant: they do not compile | a ruling's fields are decided by its kind, so a wrong combination is a type error (D1, D2) | `lib/contracts/entailment.ts` | `lib/contracts/__tests__/type-proofs.test.ts` › "every proof file fails to compile for exactly the stated reasons"; each `?: never` is shown to matter by deleting it in a copy: `lib/contracts/__tests__/never-sabotage.test.ts` › "each deleted alone from a copy of lib/contracts" |
| the same combinations when a value is built by a cast that the type system lets through | a cast defeats the type, so a run-time guard names the field | `lib/contracts/integrity.ts` (`assertEntailmentWellFormed`) | `lib/contracts/__tests__/residual-routes.test.ts` › "every route the type system leaves open reaches the run-time guard" |
| a sixth kind of `Entailment` that no `switch` handles | the vocabulary is closed, so a `switch` over it can be checked for exhaustiveness: adding a variant turns the exhaustiveness proofs red | `lib/contracts/entailment.ts` and `assertNeverEntailment` | `lib/contracts/__tests__/entailment.test.ts` › "the exhaustiveness proofs react when a union grows, and only the right lines do" |
| a file in `lib/` that is not TypeScript, or an import that goes up a layer or out of `lib/` | the engine must be a closed module graph | tests only (a scan over `lib/`) | `lib/contracts/__tests__/file-inventory.test.ts` › "this repository: lib/ holds only .ts files"; the graph test cited under "What enforces it" |

The types have limits the tests state. A plain `as Entailment` of a contaminated value compiles under `tsconfig.lib.json` and is refused under `tsconfig.json`: `lib/contracts/__tests__/residual-routes.test.ts` › "a plain `x as Entailment` (no `unknown`) compiles under tsconfig.lib.json and is refused under tsconfig.json". An explicit `established: undefined` is the reverse: › "an explicit `established: undefined` compiles under tsconfig.json (no exactOptionalPropertyTypes) and is refused under tsconfig.lib.json". A key that is no field of any variant is not caught by the guard; the same file marks it "NOT CAUGHT" in its table of routes. The health route (`app/api/health/route.ts`) runs four cases of the guard and answers 503 when one fails; it checks the contracts guard and no other layer (`app/api/health/__tests__/route.test.ts` › "the degraded branch: 503, status degraded, and the failing check is named").

### Stage 1: extent algebra (`lib/extent`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| an extent that is inverted, not an integer, or past `MAX_MAGNITUDE` | every later sum must stay exact, so the inputs are bounded (D4) | `lib/extent/check-extent.ts` | `lib/extent/__tests__/check-extent.test.ts` › "bound-not-an-integer: names the side"; `lib/extent/__tests__/boundaries.test.ts` › "checkExtent at MAX_MAGNITUDE: N is accepted, N + 1 is refused, on each side and each sign" |
| reading a caller's object twice | a getter or a proxy that answers differently the second time could split the value checked from the value used | `lib/extent/check-extent.ts` | `lib/extent/__tests__/hostile-input.test.ts` › "each side is read exactly once, lo then hi"; › "the checked value is the returned value" |
| a sum that rounds | an unbounded side must stay unbounded, and the largest sum the contracts allow must be exact | `lib/extent/sum.ts` | `lib/extent/__tests__/boundaries.test.ts` › "sumForward over"; `lib/extent/__tests__/sum-exactness.test.ts` › "sumForward, by hand" |
| an unbounded side read as zero | `null` is not `0` | `lib/extent/meet.ts`, `lib/extent/subset.ts`, `lib/extent/unmet.ts` | `lib/extent/__tests__/meet-subset.test.ts` › "the table: every null/non-null relation on the lower side times every one on the upper side"; `lib/extent/__tests__/unmet.test.ts` › "null is not 0: an unbounded established side fails a bounded tested side, whatever that bound is" |

### Stage 2: ground, reading the schema and the observations (`lib/ground`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| a schema that is not a read-once sum forest: a repeated field, an unknown operand, a reused operand, a cycle, a unit mismatch | exactness holds on that fragment only (D4) | `lib/ground/read-schema.ts` | `lib/ground/__tests__/schema-faults.test.ts` › "every schema fault: the fixture breaks only its own rule, and repairing it is accepted"; › "every subset of the seven rules: the engine reports the first by the plan"; `tests/failures/09-read-once-buys-exactness-not-soundness.test.ts` › "(a) ground rejects the diamond" |
| an observation whose bound is not a digit run of its own quote, or that lies outside the schema's baseline | the extractor is outside the trust boundary, and digit-containment is the one fidelity check (D8) | `lib/ground/read-observation.ts` | `lib/ground/__tests__/observation-faults.test.ts` › "every observation fault: the fixture breaks only its own rule, and repairing it is accepted"; › "digit-containment accepts what the plan's rule accepts, and no more, in every case tried here" |
| reading a caller's list, or an element of it, twice | the same reason as Stage 1 (D11) | `lib/ground/read-schema.ts`, `lib/ground/read-observation.ts` | `lib/ground/__tests__/hostile-input.test.ts` › "readSchema reads every place once: the first value is the one that is checked and the one that is used" |
| a support that does not reproduce its bound, or that has a member it could do without | support is a certificate found by deletion, not a claim (D7) | `lib/ground/support.ts`, `lib/ground/shrink.ts` | `lib/ground/__tests__/support-certificate.test.ts` › "the supports of the generated instances are certificates, checked by the oracle" |
| a conflict resolved by choosing a source | an unsatisfiable tree is refused whole and an irreducible core is named (D6) | `lib/ground/solve.ts` | `lib/ground/__tests__/core.test.ts` › "the cores of the generated instances are irreducible, unsatisfiable and exactly D7"; `lib/ground/__tests__/locality.test.ts` › "plan case 03, by hand: a conflict silences its whole tree and touches no other" |
| an answer that depends on the order in which things were given | the result must be a function of the sets, not of input order | `lib/ground/ground.ts` | `lib/ground/__tests__/order-independence.test.ts` › "the grounding does not depend on the order of observations, fields, or operands" |
| a result that shares memory with its input, or can be written to | evidence is immutable (D9) | `lib/ground/plain.ts` (`deepFreeze`) | `lib/ground/__tests__/immutability.test.ts` › "on the generated instances and the hand-built cases, everything the public functions return is deeply frozen" |

What `ground` is held to, beyond refusing: its extents and conflicts equal a brute-force enumeration of the worlds on generated instances (`lib/ground/__tests__/oracle-exactness.test.ts` › "the engine against brute-force world enumeration on generated instances"); adding an observation with a fresh id never widens an established extent, and the exception for a repeated id is pinned, not hidden (`lib/ground/__tests__/monotonicity.test.ts` › "the exception, pinned: an observation whose id repeats an earlier one takes the earlier one out"). Those are checks against an oracle written in the test, on seeded instances; they are not proofs.

### Stage 3: entail, ruling a claim (`lib/entail`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| a claim about a field that does not exist, a malformed extent, or a vacuous claim | a chatbot would answer; the gate returns a typed fault, in a fixed precedence (D11) | `lib/entail/read-claim.ts` | `lib/entail/__tests__/claim-faults.test.ts` › "the precedence malformed > unknown-field > vacuous-claim, one row per pair" |
| a ruling whose kind is not decided by how the evidence-implied extent E, the schema-only extent B and the claim C relate | the kind is set inclusion, with no score (D3, D5) | `lib/entail/rule.ts` | `lib/entail/__tests__/rule-table.test.ts` › "one-field rows: each is exactly one relation of E, B and C, and its neighbour is the next"; `lib/entail/__tests__/partition.test.ts` › "the engine's ruling equals the oracle's on generated instances, and every field of it is checked" |
| a draft that is lost whole when one claim is faulty | every draft position is in `claims` or in `rejected`, once, in draft order | `lib/entail/answer.ts` | `lib/entail/__tests__/answer.test.ts` › "a draft that mixes rulings and faults: every position is in claims or in rejected once, in draft order" |
| a ruling that depends on a source label | there is no trust order (D6) | `lib/entail/rule.ts`, `lib/ground/ground.ts` | `lib/entail/__tests__/partition.test.ts` › "two metamorphic checks on 300 generated instances: relabelling every source and reversing the snapshot change no ruling"; `tests/failures/08-no-trust-order-between-sources.test.ts` › "METAMORPHIC" |
| returning a ruling that fails the contracts guard | such a ruling is an internal invariant violation, thrown and not returned (D11) | `lib/entail/rule.ts` | `lib/entail/__tests__/integrity.test.ts` › "with the guard mocked to fail, rule throws for each kind it builds" |
| text that carries a number the ruling does not | prose is a one-way projection (D1) | `lib/entail/render.ts` | `lib/entail/__tests__/render-properties.test.ts` › "on generated scenarios every rendering holds the ruling"; and the limit, in `tests/failures/10-render-checks-digits-not-meaning.test.ts` › "THE DENYLIST, separately" |
| a Brief whose bound has been changed while it still cites its support | support is a certificate a holder can re-derive (D7) | `lib/entail/recheck.ts` | `lib/entail/__tests__/recheck.test.ts` › "a bound changed by one is caught as bound-differs, with the side and both values" |

What `recheck` does not refuse is also pinned: a supported bound dropped together with its support, and evidence replaced by invented documents with the right digits, both come back as reproduced (`tests/failures/02-recheck-cannot-certify-silence-or-fabrication.test.ts` › "(a) a supported upper bound dropped together with its support is reproduced"; › "(c) evidence replaced by invented documents with the right digits is reproduced"). An `ungrounded` ruling is never certified, because an absence cannot be checked from a subset of the evidence (`lib/entail/__tests__/recheck.test.ts` › "honest Briefs: everything the engine rules is certified, silence is not").

### Stage 4: the order desk (`domains/order-desk`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| a drafter that has the engine | the drafter stands in for a model that does not (D2, D10) | `domains/order-desk/drafter.ts` | `domains/order-desk/__tests__/architecture.test.ts` › "the drafter's whole lib import is the two types Claim and FieldId from contracts" |
| a canonical run the oracle disagrees with | the demo's numbers are enumerated, not asserted | `domains/order-desk/script.ts`, `scripts/demo-order-desk.ts` | `domains/order-desk/__tests__/demo.test.ts` › "agrees with the engine on all 80 states (16 snapshots by the 5 questions), by enumeration, in one run of 80 steps" |
| a conflict that picks a document | step 5 refuses all five rulings with one core | `domains/order-desk/script.ts` | `domains/order-desk/__tests__/script.test.ts` › "the headline: step 5 refuses all five rulings with the same four-document core, and no ruling there carries an extent" |
| a run that remembers the step before | each step is a fresh grounding | `domains/order-desk/script.ts` | `domains/order-desk/__tests__/script.test.ts` › "the steps in the reverse order give each step exactly the result it had in order" |

### Stage 5: the page (`components/order-desk`, `app/page.tsx`)

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| showing a ruling the engine did not just produce | no pre-baked transcript: the page renders what `computeDemoView` returns | `components/order-desk/compute-demo-view.ts` | `components/order-desk/__tests__/compute-demo-view.test.ts` › "plan check (1): all 16 subsets x all 5 menu questions = 80 states, against the oracle" |
| hiding the chatbot column when the system refuses | the two columns are the point | `components/order-desk/OrderDeskDemo.tsx` | `components/order-desk/__tests__/OrderDeskDemo.render.test.tsx` › "when the system refuses, the chatbot column is still there" |
| a forged Brief passing recheck | the forge raises an upper bound by one and keeps its support | `components/order-desk/compute-demo-view.ts` (`forgeTarget`) | `components/order-desk/__tests__/compute-demo-view.test.ts` › "in every state where the control is enabled, forging makes recheck report bound-differs for that ruling; elsewhere it is disabled" |
| asserting the headline conflict | the pairwise line is computed by `ground` on every pair, triple and the whole set | `components/order-desk/compute-demo-view.ts` (`pairwiseOf`) | `components/order-desk/__tests__/compute-demo-view.test.ts` › "with all four documents: 6 of 6 pairs consistent, 4 of 4 triples consistent, all four conflicted" |
| hooks and timers in the page | the state is one reducer | `components/order-desk/OrderDeskDemo.tsx` | the hook scan cited under "What enforces it" |
| a milestone list that disagrees with `DONE.html` | one status, two files | `app/milestones.ts` | `app/milestones.test.ts` › "claims exactly the same milestones done in both places" |

What no test pins here: which action a control dispatches, and what a browser shows after a click. `docs/WALKTHROUGH.md` records one by-hand check of the live page and says what it did not cover.

### Stage 6: build and deploy

| Refuses | Why | Where | Pinned by |
|---|---|---|---|
| a build that falls back to Turbopack | the engine's `.js`-suffixed imports need webpack and `extensionAlias` | `next.config.ts`, `vercel.json` | `tests/smoke.test.ts` › "declares experimental.extensionAlias mapping .js to .ts/.tsx/.js"; `app/api/health/__tests__/vercel-config.test.ts` › "parses to exactly the pinned object" |
| a lockfile that has silently lost its platform binaries | `npm ci` still exits 0 on one | `package-lock.json` | `tests/lockfile.test.ts` › "keeps all 15 @rolldown/binding-* entries, by name" |

## Ten limits, one place

The ten failure cases are listed, with what each pins, in the README's "Honest limits".
