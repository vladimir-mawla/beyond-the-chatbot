# ADR 0004 — M4 ground: reading an untrusted schema and snapshot once, solving each tree on its own, and what was and was not checked

- **Date:** 2026-10-26
- **Status:** proposed — written by the builder, not yet verified by an independent L4 pass
- **Phase / milestone:** M4 (BUILD, GROUND) — `lib/ground/**` and this file

Every number below was produced by a run in this session. Sabotage results are quoted as "N failed" plus the files,
with no "passed" denominator, so adding a test later does not make a sentence stale. Counts of tests are deliberately
not quoted. What is quoted are the constants a test is built on (seeds, instances, sizes) and the tallies the
coverage tests print; they come from fixed seeds, so they are the same on every run until the generator or a
seed count changes, and they were re-measured after the last test was added.

## Context

`.genesis/PLAN.md` section 6, M4: the section 5 functions `readSchema`, `ground`, `extentOf`, `supportOf`,
`openEndsOf`, `declOf` and the internal `solve` and `shrink`, with the definitions of section 4.3 (baseline `B`, `E`,
propagation and its pass bound, support and core by deletion in ascending id order, open ends, digit-containment).
Ownership: `lib/ground/**` and this file. `git diff main -- . ':!lib/ground' ':!.genesis/decisions/0004-ground.md'`
was empty after every commit on this branch. No file of `lib/contracts`, `lib/extent` or anything outside the two
owned paths was edited, and every earlier test and scan (M1's closed module graph, determinism guard, file
inventory, layer table; M2's; M3's) passes with `lib/ground` present. No dependency was added; the lockfile was not
written (`npm ci` only).

## Decision 1 — files, public surface, and the order of everything the grounding keeps

**Files.** The nine sources the plan lists (`read-schema read-observation solve shrink support open-ends decl ground
index`), and one more, `plain.ts`, because the plan's list has no home for what three modules share: `deepFreeze`,
the narrowing of a built list to the non-empty tuple type the contract wants (it throws on an empty one, an internal
invariant), and the three shape predicates (`isText`, `isRecord`, `isCount`). The tests are the plan's fourteen
files plus `fixtures.ts` and `oracle.ts`. `architecture.test.ts` pins the inventory and states that `plain.ts` is
the one addition.

**Surface.** `index.ts` exports exactly the six functions and the ten types of the plan's `lib/ground` block, and
`solve` and `shrink`, which the plan calls internal, are not on it. `architecture.test.ts` copies the plan's ten
declarations into the test, compares the copy with the text of `.genesis/PLAN.md` (ignoring comments, spacing and a
name prefix), and proves the engine's types and the six signatures identical to the copy at compile time. That last
part is a `tsc` check (`npm run typecheck`), not a vitest assertion; three edits that break it (rows `T1` to `T3`
below) each turn `tsc` red.

**Order.** `Grounding.schema` is the validated copy and keeps the order the author wrote the fields and operands in.
Everything else is in an order that does not depend on the order of anything in the input: `observations` by id,
`baseline` by field id, `trees` by root id, each tree's `fields` and extents by field id, a core by id, a support by
id, open ends by field id then `lo` before `hi`; `rejected` is by position in the input, because its `index` is that
position. `order-independence.test.ts` checks each list against its stated order on generated instances, and checks
that the schema copy is the one place the input order survives. All ids are ordered with M1's `compareIds` (UTF-16
code unit), never `localeCompare` (M1's determinism guard bans it under `lib/`, and a test builds a core and a
support that a locale-aware sort would choose differently).

## Decision 2 — `readSchema`: every value read once, one fault per refusal

**What is read, and how often.** `raw.fields`; its `length`; each element up to the bound below; for an element that
is a record, six properties, `kind` `id` `label` `unit` `baseline` `sum`, in that order and all six whatever the
kind (a base field that carries a `sum` has to be seen to be refused); a `sum`'s `length` and its elements; and,
through M3's `checkExtent`, a baseline's `lo` and `hi`. Each is read once into a local and judged from that read.
Nothing else is touched: `hostile-input.test.ts` wraps a schema in a Proxy that logs every trap and asserts the log
is exactly those `get`s, in that order, and that a refusal reads the same keys once each. An extra property on the
input is never read, so it is neither refused nor copied. An inherited property is read (it is what `record["id"]`
reads); that is not tested with a mutated `Object.prototype`, because it would mutate a global.

**A read that throws** stops the whole read: `hostile-input`, with `reading <path> threw`, a message made only of
this package's words and the path of the read (a test puts a secret in the thrown value and checks it is not in the
result). It outranks `malformed`: reads happen in a fixed order, so the same input gives the same answer.

**Shape problems** are all collected: `malformed.fields` is the list of offending places as paths
(`fields[2].unit`, `fields[0].sum[1]`), sorted by code unit (so `fields[10]` comes before `fields[2]`, pinned) and
without repeats. The plan says "sorted, deduped" and does not say what the strings are; these are mine. The
paths name positions in this input, so unlike every other fault they move when fields are reordered. The dedupe cannot
be observed: no input produces the same path twice, so removing it is an equivalent edit and no test guards it.

**Structural rules**, first failing one wins, in the plan's order: `too-many-fields`, `duplicate-field`,
`unknown-operand`, `operand-reused`, `rule-cycle`, `unit-mismatch`. Where a rule fails in several places the fault
names the smallest id (or the smallest pair, result first), so reordering the fields cannot change which place is
reported; each of the five is pinned. A cycle is named by a field ON it, not by one that merely feeds it (a row has
a tail that sorts first and is not named).

**The element bound.** A length is trusted only as far as `MAX_FIELDS + 1` reads: more elements than that are never
read, however many the array claims (a Proxy can claim `2**32 - 1`; a test counts 65 index reads). This keeps
`malformed` above `too-many-fields` exactly for an array of up to 65 elements, the first length that is too many;
past that, a malformed element beyond index 64 is not looked for (both sides pinned). The plan says "all offending
fields"; that is all of them among the elements read.

**Choices the plan does not make**, each pinned by a boundary test (N accepted, N + 1 refused):

- an id, a label and a unit are strings of 1 to `MAX_ID_LENGTH`, `MAX_LABEL_LENGTH`, `MAX_UNIT_LENGTH` code units. The
  plan gives the three lengths and assigns them to no layer (M1's `limits.ts` says so); an empty string is refused
  because accepting it is a case nobody asked for;
- a sum has 2 to `MAX_OPERANDS` operands, and a count outside that is `malformed` at `fields[i].sum`, the elements
  then unread. The plan declares `MAX_OPERANDS` and assigns it to no layer, and M3's ADR notes that M3 does not
  enforce it and tests 63 operands directly; nothing in this layer lets a sum that long through;
- an id is any such string, `__proto__` and `constructor` included: nothing here keys a plain object by an id.

## Decision 3 — intake: the plan's precedence, every occurrence of a repeated id, digit-containment

Each observation is read once (the element, then `id` `field` `extent` `quote` `source`, all five whatever their
values), then `checkExtent` reads the extent's `lo` and `hi` once each for every observation whose element could be read
and that is not a duplicate. A read that throws makes that one observation `hostile-input` and the others carry on. The
whole call fails only when the observations are not an array or have no usable length (`hostile-input`) or there are more
than `MAX_OBSERVATIONS` (`too-many-observations`, from the length alone, no element read). The plan's `GroundFailure` has no
kind for "not an array" other than `hostile-input`, so that is what it is.

Precedence per observation, first failing rule wins: `duplicate-id` > `malformed` > `unknown-field` >
`number-not-in-quote` > `outside-baseline`.

- **`duplicate-id`** refuses every occurrence of a repeated id (a valid-looking one), including two that agree, because
  keeping one would let the input order choose which. A consequence the plan does not state: adding an observation whose id
  repeats an earlier one removes the earlier one from the snapshot and can WIDEN `E` (the first run of `monotonicity.test.ts` found
  it, on a generated instance). Monotonicity holds for observations with a fresh id; `monotonicity.test.ts` states the property that way, counts the
  repeated-id steps without comparing them, and pins one by hand.
- **`malformed`** names every offending property among `id` `field` `extent` `quote` `source`; an element that is not a record
  is malformed in all five. `id` and `field` are 1 to `MAX_ID_LENGTH`, `quote` 1 to `MAX_QUOTE_LENGTH`, `source` 1 to
  `MAX_SOURCE_LENGTH` code units (the plan gives `MAX_QUOTE_LENGTH` and `MAX_SOURCE_LENGTH` and assigns them to no layer). The
  maximum of each is accepted in a test and one more is refused.
- **`number-not-in-quote`** (plan D8): every finite bound must equal, as an integer, some maximal run of ASCII digits of the
  quote, compared by absolute value; `lo` is judged before `hi` and the fault carries the first that fails. So the sign is not
  checked, a decimal point or a thousands separator ends a run (`"1,000"` does not contain 1000, `"3.5"` holds 3 and 5), leading
  zeros do not matter, and only `0` to `9` are digits (every ASCII code unit from 0 to 127 is tried in a test; Arabic-Indic,
  fullwidth, superscript and Devanagari digits are not digits). A run longer than `MAX_MAGNITUDE` has digits is skipped, not
  converted. This is the only fidelity check there is (plan D8); the plan's case 01 shows what it lets through.
- **`outside-baseline`**: the extent and the field's computed `B` share no integer. It is refused at intake so that a conflict
  is always between observations.
- `source` is read once, checked to be a string of 1 to `MAX_SOURCE_LENGTH` code units (an observation whose source is not one is refused as
  `malformed`, so the shape of a source decides whether an observation is accepted), and copied. Its value is read for nothing else, so nothing
  decides anything from what a valid source says (plan D6). `order-independence.test.ts` relabels every valid source on generated instances and no
  answer moves.

## Decision 4 — propagation, and the pass bound

`solve` narrows every field of one tree with M3's `meet`, `sumForward` and `sumBackward` to a fixpoint, and says
`conflicted` when any extent is empty; a base field starts at its baseline and a derived field at `{null, null}`. A pass visits
every derived field of the tree in ascending id order, forward then each operand backward, updating in place. Passes are capped at
the plan's `4 * (fields + 1) + 8`, where `fields` is the size of the tree being solved (the plan's wording, "`fields`", does not say
tree or schema; the tree gives the smaller bound), and an overrun throws.

M4 composes M3's algebra and does not repeat it: `architecture.test.ts` scans the sources with the parser and fails on any `<`
`<=` `>` `>=` `+` `-` applied directly to a property named `lo` or `hi`, and on an import of any extent function other than the six
used. That scan does not see an extent compared through a local variable.

One branch of `solve` is never taken and, I believe, cannot be: the empty `meet` in the backward step (row `M32` below left
the suite green). The argument, which no test shows: the forward step has just narrowed the sum to something inside what its
operands allow, and then an operand's backward bound is `sum.lo - (others' hi)` to `sum.hi - (others' lo)`, which can only miss that
operand if the sum already lay outside `sumForward`; the same holds after earlier operands narrow, because each narrowing keeps the
bound it was narrowed from. It is kept as the plan's rule ("an empty domain anywhere makes that tree conflicted") rather than
deleted.

## Decision 5 — support and core by deletion, and why the survivors are the later ids

`shrink` takes a pool of observation ids, sorts a copy (ascending code-unit order, whatever order the caller built it in),
and tries to drop each in turn, keeping a drop while a predicate stays true of what is left. For a core the predicate is "still
unsatisfiable"; for the support of one side of one field it is "the field's extent, re-solved from what is left, is still inside the
extent that says only the full bound on that side" (M3's `isSubset`, so the comparison is the algebra's own).

- **Why ascending.** Which irreducible subset comes out depends on the order the drops are tried in, so the order has to be a
  function of the evidence alone (plan D7). The smallest id is tried first, so the survivors lean toward the LATEST ids.
- **Irreducible, not minimum.** If the predicate is monotone in the set (for a support, fewer observations never tighten a bound;
  for a core, fewer never make a satisfiable set unsatisfiable), a drop that fails once would fail again, so no survivor can be
  removed: the result is irreducible. Greedy deletion commits to the first route that works, so it is not the smallest: with a
  one-observation route whose id sorts last and a three-observation route whose ids sort first, the three-observation route
  survives (plan case 05; a test with both id schemes, and the same evidence with the input reversed, and a core where a
  conflict of two observations sits beside one of three and the three is named). The tests do not lean on the monotonicity
  argument: every support and core they generate is checked against the brute-force oracle.
- **A bound the schema already gives needs no evidence.** The support of `customsDays`' lower side with an observation that
  says `0` is `[]`, because dropping that observation changes nothing. So a floor is an open end on the lower side though the
  number is known (Decision 6).
- **A single observation that meets `B` never conflicts alone**, which is why `outside-baseline` can be refused at intake and
  why a core has at least two members. `single-observation.test.ts` checks the theorem three ways (propagation, enumeration, `ground`)
  and that every core found has at least two members; it is a check on generated instances, not a proof.
- **Cost.** `supportOf` re-solves the tree once per candidate drop, twice (both sides), from the `Grounding` alone; there is no
  cache, because the plan says there is no hidden state and the architecture test forbids module-level state. The cost at the
  largest schema the contracts allow (64 fields, 64 observations, 31 levels deep) is measured under "Timing", on one schema and a busy
  machine, and is not a bound.

## Decision 6 — open ends are a place, not a promise

`openEndsOf(g, field, sides)` lists, for each distinct requested side whose support for `field` is empty, every base field under
`field` whose own support for that side is empty. `[]` for a field the schema does not declare and for a field in a conflicted tree.
"Empty support" means no observation is needed for that bound: it is the schema's own or it is unbounded. So a schema floor
counts as an open end (the plan's step 4 has `customsDays` `[0, 2]` with a lower support of `[]`), and naming an end says where
evidence is missing, not what it will say (plan case 06, three outcomes of filling one gap, worked by hand). Only requested sides
appear, each once, in field then `lo`-before-`hi` order, whatever the order or repeats of `sides`. The plan does not fix that order.
`open-ends.test.ts` checks soundness, completeness, sufficiency on `hi` and exactness (the list equals the definition computed from
the oracle's supports); the "unless the tree turns conflicted" exception of the sufficiency property was reached in two checks.

## Decision 7 — what the functions return

Everything a public function returns is deep-frozen, refusals included, and `immutability.test.ts` tries to write at every node
(a new key, an overwrite, a push) rather than trusting `Object.isFrozen`. The `Grounding` is plain data: it survives JSON
unchanged, and a copy that has been through JSON gives identical answers from `extentOf`, `supportOf` and `openEndsOf`. `extentOf`
returns fresh frozen copies (not objects inside the grounding), so a caller holding one holds nothing of the grounding. `declOf` is a
lookup: it returns the declaration object in the schema it was given. Every raw object is only read property by property into
primitives or fresh copies, so nothing the input owns can end up in an output; the test shows it by identity.

## Decision 8 — the three test layers, the generator, and what each shows

**Layer 1, tables, masking-aware** (`schema-faults.test.ts`, `observation-faults.test.ts`). Each row is a broken input and its
repair. For every row four things are checked by code that is not the code under test: the engine gives exactly the expected
fault; the repair is accepted whole (so a second, masked defect would still be refused); an independent reference validator,
written for the test file with a different algorithm (Kahn's ordering for cycles, `BigInt` digit runs, `B` from the oracle),
sees exactly the one rule in the broken input and none in the repair; and the two differ in the declared number of places.
All 128 subsets of the seven structural schema rules are built from disjoint defects, and the engine must name the first of the
plan's precedence while the reference sees exactly the subset. A differential fuzz corrupts generated schemas and compares
the engine's fault, and the malformed places, with the reference; every kind but `hostile-input` was reached (the tally is printed:
`unknown-operand` the least, 17 against a floor of 15 that the test asserts) and `hostile-input` has its own table in `hostile-input.test.ts`.
This is the layer that holds the three refusals the plan says properties miss: rows `P10a` to `P10c` below.

**Layer 2, oracle exactness** (`oracle-exactness.test.ts`). `oracle.ts` lists every world of a tree, with unboundedness decided by
whether widening the window moves the bound (M3's rule; plan section 8, defect 9). The window is one more than the sum, over every
(field, side), of the absolute value of the tightest finite constant, which bounds any finite bound a read-once tree can
produce along a path; if it were ever too small a world would exist in one window and not the next and the oracle throws.
The generator (`mulberry32`, 2 to 4 base fields, 0 to 3 sum rules built read-once, 0 to 7 observations plus an evidence-rich
mode and a conflict-seeding mode, ids from shuffled pools, about 5% of observations corrupted in one of the ways intake
refuses) was run over 8 000 instances. The coverage test prints, from the final run:

- trees by depth (instances): no rule 1467, one level 4113, two levels 2145, three levels 247; the deepest generated tree is
  three levels and the most fields in one tree is 7; 3453 instances have more than one tree;
- 13 095 trees, 9 650 consistent and 3 445 conflicted, with cores of size 2 (2782), 3 (532), 4 (121) and 5 (10);
- intake verdicts other than accepted: `duplicate-id` 388, `hostile-input` 228, `malformed` 644, `number-not-in-quote` 438,
  `outside-baseline` 2332, `unknown-field` 200;
- 31 888 claims (four per instance) classified by the plan's table from the oracle's extents: conflicted 9798, contradicted
  2377, entailed 3465, ungrounded 4724, weakened 3199, and 8325 vacuous (`B` already inside the claim), and the engine's extents
  classify every one the same way;
- 28 of the 8 000 instances were not given to the oracle because listing their worlds was too costly (they were half of its
  time); their intake is still checked. The most worlds one tree listed in its larger window was 136 458.

Mismatches: none. **That is a measurement on this generator, with two to four base fields and small constants; the oracle cannot
list 2**32 worlds.** What it cannot show is covered by the next paragraph and by "What is not proven".

**Hand-worked at the largest sizes the contracts allow**, with closed forms worked out by arithmetic in the test and not by the
oracle: a schema of exactly 64 fields (32 base fields, 31 sums nested 31 levels deep, a spare base field) with exactly 64
observations, every extent equal to the closed form `[F + max(0, k - 27), F + min(k + 1, 14)]` (with `F = k(k + 1) / 2`) in three
id orders, ascending bottom-up, top-down and a shuffle, so the order of propagation is as awkward as it gets; propagation
settled in 18, 27 and 17 passes against the bound of 264; a sum of `MAX_OPERANDS` operands; a core of 33 observations
(32 upper bounds and the root's lower bound, every one needed) in a 64-field, 64-observation schema; and the longest support, 32
(the root's upper bound needs all 32 base observations; its lower bound needs 31, because `b00`'s lower bound is the schema's own
floor of 0, which I got wrong when I first wrote the expectation and the test showed). Also the canonical scenario of plan section 7
at this layer (E, support, open ends and core of steps 1, 4, 5 and 6, and "every pair and every triple of the four documents is consistent"
by the oracle and by the engine).

**Layer 3, properties**, each over generated instances with the oracle as judge where the plan says so:

- *monotonicity*: 17 911 prefix steps; E never widens for an observation with a fresh id, a conflicted tree stays conflicted, B does
  not move, and an entailed or contradicted ruling moves only to itself or conflicted (every such move was reached). The 108
  steps that repeated an earlier id are counted and not compared (Decision 3);
- *order independence*: 2 400 instances reversed and shuffled twice; observations, fields and operands; supports and open ends
  too, with `sides` shuffled and repeated; `source` relabelled on 600 more;
- *locality*: 757 instances with more than one tree; each tree's answers equal that tree grounded alone (1 845 trees, 296 of them
  conflicted) and a forced conflict in one tree leaves every other tree byte-identical (1 413 conflicts forced). Instances where two
  observations share an id across trees were left out and counted (20): `duplicate-id` is the one place an id crosses a tree;
- *single observation*: 6 000 single observations, 5 328 that meet `B` (never conflicted) and 672 that miss it (always refused),
  36 not given to the enumeration for cost; the smallest of 1 284 cores has 2 members;
- *support certificate*: 14 932 bounds on 2 827 instances (173 skipped as too costly for the oracle), 6 645 with a non-empty support,
  each checked four ways against the oracle; sizes 0: 8287, 1: 5750, 2: 809, 3: 83, 4: 3. **The longest support the generated instances
  reach is 4**, because the richest instances are the costliest for the oracle; the longest the contracts allow is the hand-worked 32;
- *core*: 612 cores on 1 420 instances (80 skipped), sizes 2: 506, 3: 86, 4: 20, 2 420 strict subsets given to the oracle, each core also
  compared with D7's deletion run by the oracle; the largest core tested is the hand-worked 33;
- *open ends*: 15 147 requests on 1 899 instances (101 skipped), 9 030 with at least one end, 6 912 `lo` and 6 892 `hi` ends listed, soundness,
  completeness and exactness each checked against the oracle's supports, and 2 781 sufficiency checks on `hi`, of which two ended conflicted (so the
  exception "unless the tree turns conflicted" was reached, twice);
- *integer only*: 40 254 structures and 77 158 numbers, each a safe integer and none `-0`; and 32 base fields at plus and minus
  `MAX_MAGNITUDE` give running sums equal to `BigInt` arithmetic (the largest is `2**45`);
- *immutability*: 600 instances, every node refusing a write.

**The read-once tables** (`hostile-input.test.ts`): 32 first-value classes (the last is a read that throws), listed in the test: null, 0, -0, a
negative, the maximum magnitude and its negative, one past it, NaN, both infinities, a fraction, a small integer, strings of 1, 128 and 129
characters and the empty string, both booleans, a bigint, a symbol, a function, an object, an array, undefined, a boxed number and a boxed
string, an object whose `valueOf`, `toString` and `Symbol.toPrimitive` all throw, a valid extent, a valid sum and the two kinds, plus the valid
values for the place being probed. They are tried at each place the engine reads (the root's `fields`; an element; its six properties on a base field and on a derived one; a baseline's `lo`
and `hi`; a sum's elements; an observation's element and its five properties; an extent's `lo` and `hi`), each against seven later reads
(NaN, null, an object, a string, undefined, a number out of range, a throw) and the valid values for that place. For every pair the
getter must have been read once and the result must equal what a plain input holding the first value alone gives; a first read that
throws must be `hostile-input`. Lengths are probed through a Proxy the same way. The table cannot show that these are all the ways
to observe an object; it covers getters, an indexed getter, Proxy traps, a revoked Proxy and coercion hooks.

## Sabotage ledger

Each edit below was applied as an exact-match replacement that the script first counted to occur once (or the stated number of times), the
suite was run, and the file was written back byte for byte; `git status --porcelain -- lib` was empty after every row. The suite run per edit
was `lib/ground` and M1's closed-module-graph, determinism and file-inventory tests (the earlier tests that read `lib/ground`); the earlier
tests that do not read it were not run per edit, and the whole suite, M1 to M3 included, was run clean on the final code (see "Timing" and
the pull request). The edits ran in a scratch copy of the working tree whose `lib/` was identical (`diff -r`) to the branch at `6ddfdca`
(the later commits are this ADR and the wording of one comment in `monotonicity.test.ts`); the scripts that built and applied them are in the session's scratch directory, not in the repository. Counts
are tests that failed, by file; the two control rows are an edit that changes nothing, at the start and at the end of the run. `P` rows are the
plan's ten (item 10 is three rows), `M` rows are mine and edit the library, `O` rows edit the test support (the oracle, the reference
intake, the generator, a table's edit counter) instead of the library, and `T` rows edit the library in a way that breaks the plan's types.

The plan's `††` figures count failing INSTANCES out of 2 000 on its throwaway model; the counts here are failing TESTS in this repository.
They are not comparable and neither confirms the other. What does compare is the shape: items 1 to 9 are caught by the properties and
the oracle layer in many files, and deleting `operand-reused`, `rule-cycle` or `unit-mismatch` (rows `P10a` to `P10c`) is caught only by
`schema-faults.test.ts`, with one test in `observation-faults.test.ts` (that `ground` carries a schema fault as `invalid-schema`), both of
them table-driven; no property test and no oracle test goes red for them.

| # | Edit | Result |
|---|---|---|
| C0 | CONTROL: an edit that changes nothing | **0 failed** |
| P1 | drop backward propagation (sumBackward replaced by 'no information') | **344 failed**: open-ends 80, oracle-exactness 164, support-certificate 100 |
| P2 | drop forward propagation (sumForward replaced by 'no information') | **436 failed**: architecture 2, core 25, integer-only 2, locality 1, monotonicity 3, observation-faults 2, open-ends 83, oracle-exactness 165, order-independence 1, single-observation 48, support-certificate 104 |
| P3 | no deletion-shrink: return the full pool | **253 failed**: core 54, immutability 1, open-ends 83, oracle-exactness 6, order-independence 2, support-certificate 107 |
| P4 | core = the first two ids of the tree's observations | **62 failed**: core 57, locality 1, oracle-exactness 3, order-independence 1 |
| P5 | support computed for the wrong side | **190 failed**: open-ends 83, oracle-exactness 2, order-independence 1, support-certificate 104 |
| P6a | unsorted pool: the accepted observations are kept in input order, not sorted by id | **212 failed**: observation-faults 1, oracle-exactness 160, order-independence 51 |
| P6b | unsorted pool, inside shrink: the pool is not sorted before deletion | **2 failed**: support-certificate 2 |
| P7 | open ends by 'null side' instead of 'empty support' | **84 failed**: open-ends 82, oracle-exactness 2 |
| P8 | open ends over every side instead of the requested (unmet) ones | **82 failed**: open-ends 82 |
| P9 | a conflict marks every tree | **393 failed**: core 52, locality 7, open-ends 76, oracle-exactness 159, support-certificate 99 |
| P10a | delete the operand-reused refusal | **7 failed**: observation-faults 1, schema-faults 6 |
| P10b | delete the rule-cycle refusal | **10 failed**: observation-faults 1, schema-faults 9 |
| P10c | delete the unit-mismatch refusal | **6 failed**: observation-faults 1, schema-faults 5 |
| M01 | digit-containment off: every bound counts as found | **230 failed**: core 10, observation-faults 14, open-ends 21, oracle-exactness 145, support-certificate 40 |
| M02 | digit-containment compares the signed bound | **437 failed**: core 21, locality 6, observation-faults 5, open-ends 77, oracle-exactness 160, single-observation 80, support-certificate 88 |
| M03 | repeated id: the later occurrence wins (the earlier is refused, the last is kept) | **222 failed**: core 8, hostile-input 1, monotonicity 1, observation-faults 8, open-ends 18, oracle-exactness 117, order-independence 39, support-certificate 30 |
| M04 | repeated id is not refused at all | **237 failed**: core 10, hostile-input 1, monotonicity 1, observation-faults 8, open-ends 25, oracle-exactness 117, order-independence 36, support-certificate 39 |
| M05 | precedence: malformed is checked before duplicate-id | **5 failed**: hostile-input 1, observation-faults 1, oracle-exactness 3 |
| M06 | outside-baseline refusal removed | **476 failed**: core 50, monotonicity 1, observation-faults 5, open-ends 78, oracle-exactness 160, single-observation 82, support-certificate 100 |
| M07 | deletion order descending instead of ascending | **173 failed**: core 57, locality 1, oracle-exactness 5, order-independence 3, single-observation 1, support-certificate 106 |
| M08 | an id is read twice in readSchema and the second read is the one copied | **3 failed**: hostile-input 3 |
| M09 | an observation's id is read twice and the second read is kept | **14 failed**: hostile-input 14 |
| M10 | deepFreeze freezes only the top object | **27 failed**: immutability 26, schema-faults 1 |
| M11 | deepFreeze skips arrays' elements (objects inside arrays stay writable) | **27 failed**: immutability 26, schema-faults 1 |
| M12 | localeCompare in shrink's sort | **121 failed**: determinism 5, architecture 1, core 47, order-independence 3, support-certificate 65 |
| M13 | the parent walk's bound is one short: rootOf gives up one step early | **10 failed**: architecture 1, locality 7, observation-faults 2 |
| M14 | the cycle test gives up after 2 steps | **4 failed**: schema-faults 4 |
| M15 | the pass bound is 4 passes | **8 failed**: architecture 2, core 2, oracle-exactness 3, support-certificate 1 |
| M16 | rejected index off by one | **229 failed**: locality 6, monotonicity 1, observation-faults 61, oracle-exactness 160, single-observation 1 |
| M17 | extentOf returns the schema-only extent as the extent | **177 failed**: immutability 1, integer-only 2, locality 1, monotonicity 4, open-ends 2, oracle-exactness 167 |
| M18 | supportOf swaps the two sides | **107 failed**: oracle-exactness 2, order-independence 1, support-certificate 104 |
| M19 | open ends sorted by side only, not by field | **78 failed**: open-ends 78 |
| M20 | open ends listed for a conflicted tree | **192 failed**: immutability 26, integer-only 25, locality 8, open-ends 82, oracle-exactness 1, order-independence 50 |
| M21 | too-many-observations off by one (>= instead of >) | **6 failed**: core 1, observation-faults 1, oracle-exactness 3, support-certificate 1 |
| M22 | too-many-fields off by one (>= instead of >) | **14 failed**: core 2, integer-only 2, oracle-exactness 4, schema-faults 4, support-certificate 2 |
| M23 | a sum may have MAX_OPERANDS - 1 operands only | **3 failed**: oracle-exactness 2, schema-faults 1 |
| M24 | a text of exactly the maximum length is refused | **3 failed**: observation-faults 2, schema-faults 1 |
| M25 | an empty text is accepted | **171 failed**: core 2, locality 1, observation-faults 8, open-ends 14, oracle-exactness 116, schema-faults 8, support-certificate 22 |
| M26 | readSchema rethrows everything it catches, its own abort token included, so hostile-input is never returned | **37 failed**: hostile-input 36, observation-faults 1 |
| M27 | unknown-operand names the largest pair, not the smallest | **1 failed**: schema-faults 1 |
| M28 | rule-cycle names the first field found on a cycle, not the smallest | **2 failed**: schema-faults 2 |
| M29 | rule-cycle names a field that merely feeds a cycle (the tail) as well | **7 failed**: observation-faults 1, schema-faults 6 |
| M30 | propagation ignores an empty meet when an observation is applied | **511 failed**: core 44, immutability 20, integer-only 25, locality 7, monotonicity 51, open-ends 78, oracle-exactness 160, order-independence 45, single-observation 81 |
| M31 | propagation ignores an empty meet in the forward step | **372 failed**: core 46, immutability 1, locality 1, monotonicity 53, open-ends 63, oracle-exactness 162, single-observation 46 |
| M32 | propagation ignores an empty meet in the backward step | **0 failed** |
| M33 | support: every drop is accepted (isSubset replaced by true) | **197 failed**: locality 1, open-ends 83, oracle-exactness 6, order-independence 2, support-certificate 105 |
| M34 | observations that are not an array are an empty snapshot | **6 failed**: observation-faults 6 |
| M35 | a source is not checked | **163 failed**: core 6, hostile-input 1, observation-faults 7, open-ends 13, oracle-exactness 116, support-certificate 20 |
| M36 | a quote of any length is accepted | **1 failed**: observation-faults 1 |
| M37 | a run of digits is not stripped of leading zeros before its length is judged | **1 failed**: observation-faults 1 |
| M38 | any character from '/' to '9' counts as a digit | **1 failed**: observation-faults 1 |
| M41 | an accepted observation keeps the raw extent object it was read from | **6 failed**: hostile-input 4, immutability 1, integer-only 1 |
| M42 | supportOf computes the support from a different tree's observations (all observations, not the tree's) | **296 failed**: core 1, immutability 26, integer-only 25, locality 8, open-ends 81, oracle-exactness 3, order-independence 50, support-certificate 102 |
| T1 | ExtentRead's baseline becomes optional | `tsc`: **4 errors** in architecture, oracle-exactness (TS2344, TS2345) |
| T2 | openEndsOf returns a mutable array | `tsc`: **1 errors** in architecture (TS2344) |
| T3 | Tree.fields loses its non-empty tuple type | `tsc`: **7 errors** in architecture (TS2344) |
| M43 | the observation list's length is read again in the loop | the test worker ran out of memory (exit 1); no assertion failed |
| M44 | the field list's length is read again for the element bound | **6 failed**: hostile-input 6 |
| M45 | a sum's length is read again in the operand loop | **3 failed**: hostile-input 3 |
| M46 | raw.fields is read twice and the second read is the list used | **10 failed**: hostile-input 10 |
| M47 | open ends: the field's own support is not consulted | **82 failed**: open-ends 81, oracle-exactness 1 |
| M48 | open ends: only the field itself, never the base fields under it | **84 failed**: open-ends 83, oracle-exactness 1 |
| M49 | open ends: the walk down a sum stops after one level | **70 failed**: open-ends 70 |
| M50 | trees ordered by root descending | **2 failed**: locality 1, order-independence 1 |
| M51 | field ids in descending order | **161 failed**: oracle-exactness 160, order-independence 1 |
| M52 | rootOf answers the start field when it cannot find a root | **12 failed**: architecture 2, observation-faults 1, schema-faults 9 |
| M53 | shrink returns its survivors in descending order | **171 failed**: core 57, locality 1, oracle-exactness 5, order-independence 3, single-observation 1, support-certificate 104 |
| M54 | the validated schema is sorted by id instead of kept in the author's order | **4 failed**: immutability 1, order-independence 1, schema-faults 2 |
| M55 | Tree.root is the smallest member instead of the field that is an operand of nothing | **1 failed**: order-independence 1 |
| M56 | baseline entries in schema order, not by id | **50 failed**: order-independence 50 |
| O1 | the oracle's window is half the sum of the constants (too small) | **474 failed**: core 49, open-ends 81, oracle-exactness 162, single-observation 81, support-certificate 101 |
| O2 | the oracle never reports a value set with a hole (call site removed) | **1 failed**: oracle-exactness 1 |
| O3 | the hole predicate always says no | **2 failed**: oracle-exactness 2 |
| O4 | classify names contradicted and weakened the wrong way round | **57 failed**: monotonicity 52, oracle-exactness 5 |
| O5 | the oracle calls a side unbounded when it reaches the window's edge, not when widening moves it | **295 failed**: open-ends 55, oracle-exactness 160, support-certificate 80 |
| O6 | the oracle's deletion runs in descending id order | **150 failed**: core 50, support-certificate 100 |
| O7 | the oracle's memo ignores which observations were kept | **180 failed**: open-ends 80, support-certificate 100 |
| O8 | the reference intake finds every bound in every quote | **211 failed**: core 4, observation-faults 11, open-ends 21, oracle-exactness 146, support-certificate 29 |
| O9 | the reference intake puts malformed before duplicate-id | **4 failed**: observation-faults 1, oracle-exactness 3 |
| O10 | the edit counter of the tables always says no edits | **106 failed**: observation-faults 34, schema-faults 72 |
| O11 | the schema reference validator never sees a cycle | **7 failed**: schema-faults 7 |
| O12 | the generator corrupts no observation | **2 failed**: monotonicity 1, oracle-exactness 1 |
| O13 | the generator seeds no conflict | **1 failed**: core 1 |
| O14 | the exactness test's extent comparison always says equal | **0 failed** |
| C1 | CONTROL again, at the end of the run | **0 failed** |

Three rows are not "N failed".

- **`M32` left the suite green.** It makes the propagation ignore an empty `meet` in the backward step. Decision 4 argues that branch cannot be
  reached, and disabling it changes no test result, so I count it as an equivalent edit and not as a test I failed to write; that is an
  argument and a null result, not a proof.
- **`M43` crashed the test worker** with an out-of-memory error rather than failing an assertion: reading the observation list's length again in
  the loop lets a Proxy that claims `2**32 - 1` elements run the loop for ever. It is red, and it is red because the hostile-input tests feed
  exactly that.
- **`O14` is green by construction.** With a correct engine, a comparison that always says "equal" changes nothing. Whether the comparison fires is
  shown by the rows that break the engine and turn the exactness tests red (`P1`, `P2`, `M17`), not by this one. I did not separate which of that
  test's several checks (the extent comparison, the classification of claims, the intake verdicts) each of those rows goes red through. I ran
  `O14` to see, and it is in the table so that it is not a row I left out.

The `O` rows are the answer to M3's finding that an oracle check had never been shown to fire: the hole detector and the two-window check are
killed by tests that feed them a value that makes them fire (`O2`, `O3`), and the table of rulings (`O4`) by its own fourteen rows.

## Timing

Measured with `vitest run --reporter=json` (per-test durations), `AI_AGENT` and `CLAUDECODE` unset, after the last test was added. **The machine
was never idle**: other sessions were running work on it throughout (its load average, 1 minute on 10 cores, was between 7 and 25 at the start of
the runs below and above 60 at other times in the session), so the figures say more about the load than about the tests. The default timeout (5 s)
applies to one test, the project's rule is no more than about 40% of it (2 s) at CI load, and CI's runners are about 2 times slower than a quiet
local run.

| Run | Load at start | Wall | Slowest `lib/ground` test |
|---|---|---|---|
| `lib/ground` alone, ambient, run 1 | 7.7 | 6.4 s | 235 ms (M1's module-graph scan, run over these files) |
| `lib/ground` alone, ambient, run 2 | 7.3 | 6.1 s | 284 ms (the same) |
| `oracle-exactness.test.ts` alone, ambient | 9.8 | 4.6 s | 91 ms |
| whole suite, ambient, run 1 | 9.1 | 13.9 s | 332 ms |
| whole suite, ambient, run 2 | 11.7 | 14.9 s | 526 ms |
| `lib/ground` alone, 20 `yes` added | 13.1 | 20.6 s | 634 ms |
| `oracle-exactness.test.ts` alone, 20 `yes` added | 16.0 | 32.7 s | 591 ms |
| whole suite, 20 `yes` added | 24.8 | 39.8 s | 1090 ms |

The 20 `yes > /dev/null` processes were started by the same shell command and killed by `pkill -x yes` afterwards; `pgrep -x yes` found none
before and none after. The slowest `lib/ground` test in any of these runs is 1090 ms, 22% of the timeout. The slowest test in the whole suite in earlier
runs on a busy machine was M1's `never-sabotage.test.ts` (about 2 s), not one of these. **No timeout was raised anywhere** (`vitest.config.ts` is the
scaffold's and was not touched, and no test passes a timeout of its own except six tests in `schema-faults.test.ts` and `architecture.test.ts`
that pass 2 s as a guard against a loop and take a few milliseconds).

How it got there: the first timing run, on the first version of the tests (load 13 to 17), had a generated-instance test at 1.5 s, because 500
instances were one test. Every such loop was cut into smaller tests with the same totals and seeds (about 25 to 125 instances each), and the
heaviest few seeds were not given to the oracle (28 of 8 000 for exactness, which were half of the oracle's time; a budget on the worst any
subset can cost for the support, core and open-ends tests). A cost: the three tests of that family skip 5 to 6% of their instances, and what
they skip is the richest ones.

On cost in use, not in tests: at the largest schema the contracts allow (64 fields, 64 observations, 31 levels), on this busy machine, `ground` took
about 3 ms, one `supportOf` about 23 ms (all 64 fields in turn about 1.5 s) and `openEndsOf` for the root, both sides, about 23 ms. That is one
schema measured twice, not a bound.

## Plan wording and neighbours, flagged (the plan was not edited)

1. **Monotonicity** (section 2.3, section 6 M4, section 8B) is stated without an exception, and it has one: an observation whose id repeats an
   earlier one removes the earlier one from the snapshot (D6's "every occurrence", written to keep input order from choosing a winner) and can
   widen `E`. Found by the first run of `monotonicity.test.ts`. The property holds for a fresh id (Decision 3). The DoD gate "adding evidence never
   widens an established extent" in section 16 should say "an observation with a fresh id".
2. **Caps with no layer.** `MAX_OPERANDS` and the five length caps are declared and assigned to no layer (M1's `limits.ts` says so). `readSchema` and
   `ground` enforce them as `malformed` (Decisions 2 and 3); the minimum of 1 is mine.
3. **`4 * (fields + 1) + 8`**: "fields" is not said to be the tree's or the schema's; the tree's is used (Decision 4).
4. **"Sorted, deduped"** `malformed.fields` names no vocabulary for the strings and the dedupe is unobservable (Decision 2); for an observation
   the strings are its property names, for a schema they are paths.
5. **"All offending fields"** is all of them among the elements read, up to `MAX_FIELDS + 1` (Decision 2).
6. **`GroundFailure`** has no kind for "the observations are not an array"; `hostile-input` is used (Decision 3).
7. **`Observation.source`** is documented as "never read by the engine"; it is read once, checked to be a string of 1 to `MAX_SOURCE_LENGTH` code
   units and copied (the copy is needed: `Observation` carries it into the `Grounding` and, at M5, into the `Brief`). An observation whose source is
   not such a string is refused as `malformed`, so renaming a source to an invalid string changes the answer and renaming it to another valid string
   changes none (Decision 3; plan case 08, the metamorphic test at M7, has to rename to valid strings).
8. **Open ends and floors.** By the definition in section 4.3 a schema floor is an open end of the lower side. Plan section 7 step 1 lists
   "lower and upper of `customsDays`" as the open ends of the ungrounded claim, which is the same reading (the lower bound there is the floor of 0).
9. **The order of open ends, trees, fields and cores** is not specified; Decision 1 states the order chosen.
10. **The plan's `††` counts** are instances on a model and are not reproduced here (see the ledger's header).

## Rejected alternatives

- **Reading every element of a long `fields` array** so that `malformed` could outrank `too-many-fields` at every length: a Proxy can claim
  `2**32 - 1` elements. Bounded at `MAX_FIELDS + 1` instead.
- **Catching every error in `readSchema` and `readObservations`** and calling it `hostile-input`: it would also turn this package's own bugs
  into a typed refusal. Only the reads of input are guarded, and only an abort token created per call is caught.
- **A cache of solved trees or supports** to make `supportOf` cheap: the plan says the grounding is data with no hidden state, and
  `architecture.test.ts` forbids module-level state.
- **Sweeping the sums deepest-first, then shallowest-first**, which would settle a tree in two passes instead of 17 to 27 and make `supportOf` several
  times cheaper: more code on the path every ruling depends on, for a cost that is only visible at the largest size. Not done.
- **Sorting the schema copy** by id, so that the whole `Grounding` would be order-independent: `Grounding.schema` is "the validated copy", the
  author's order is what a renderer would expect to see, and the order-independence tests compare everything else.
- **Putting a `Map` or an index in the `Grounding`** so that `supportOf` need not rebuild the structure: the plan says plain data, and the JSON
  round trip is tested.
- **Accepting an empty id, label or unit**, or any number of operands: cases nobody asked for.

## What is not proven

- That the oracle's window rule is right for every tree: it is sound by an argument about read-once trees (the sum of the tightest constants bounds any
  finite bound) and guarded by a throw if two windows disagree on whether a world exists; no test shows the argument.
- That the generator reaches what a real snapshot would: 2 to 4 base fields, constants mostly in a range of about 10, trees up to 7 fields; the
  largest sizes are hand-worked, not generated, and in between nothing is claimed.
- That 28 instances not given to the oracle (and 5 to 6% of the support, core and open-ends instances) would have passed.
- That the read-once classes are all the ways to observe an input (Decision 8), or that an inherited property read through a polluted `Object.prototype`
  is handled (it is read, as `record["id"]` would; not tested).
- That propagation is exact outside read-once trees: the schema refuses everything else, so it is not asked.
- That the empty-`meet` branch of the backward step is unreachable (Decision 4): an argument.
- That the `hostile-input` message cannot carry untrusted text beyond what the tests probe: it is built from fixed words and the path of a read.
- That anything forces a later layer to call `readSchema` or `ground` rather than build a `Grounding` by hand: M5's `recheck` is specified to re-ground
  the carried evidence; a hand-built `Grounding` is outside what `extentOf`, `supportOf` and `openEndsOf` claim, and one with a cycle is shown only to end the call.
- That the sabotage ledger covers every possible edit: it shows these edits go red (and one does not, `M32`), not that no edit goes green.
- That timing holds on another machine or under another load; that CI passes on the pushed branch (see the pull request).

## Falsifiability log

```
git diff main -- . ':!lib/ground' ':!.genesis/decisions/0004-ground.md'      # empty after every commit
npm ci && ls node_modules/@rolldown/binding-darwin-arm64
npm run typecheck
npm test                                                   # M1, M2, M3 and M4 together
env -u AI_AGENT -u CLAUDECODE npx vitest run lib/ground    # prints the coverage tallies quoted in Decision 8
```
