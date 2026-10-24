# ADR 0003 — M3 extent algebra: one door for an untrusted extent, six pure functions, and what was and was not checked

- **Date:** 2026-10-24
- **Status:** proposed — written by the builder; revised after the first independent L4 pass rejected `a0a33e2` (read-once
  was pinned for some first reads only, three ADR sentences claimed more than was shown, one oracle check had never
  been shown to fire); this version has not been re-verified
- **Phase / milestone:** M3 (BUILD, EXTENT) — `lib/extent/**` and this file

Every number below was produced by a run in this session. Sabotage results are quoted as "N failed" plus the
files, with no "passed" denominator, so adding a test later does not make a sentence stale. Counts of tests are
deliberately not quoted in this file. The grid sizes below are not test counts: they are arithmetic on the grids,
and each grid test asserts its own.

## Context

`.genesis/PLAN.md` section 6, M3: the seven functions of section 5 (`checkExtent`, `meet`, `isSubset`,
`isSameExtent`, `unmetSides`, `sumForward`, `sumBackward`), pure, total and framework-free, with the definitions of
section 4.3. Ownership: `lib/extent/**` and this file. `git diff main -- . ':!lib/extent'
':!.genesis/decisions/0003-extent.md'` was empty after every commit on this branch. None of M1's files was edited and
M1's frozen scans (closed module graph, determinism guard, file inventory, test-import allowlist) pass with
`lib/extent` present. No dependency was added and the lockfile was not written (`npm ci` only).

## Decision 1 — `checkExtent`: each side read once, five reasons, one precedence

| Reason | When | `side` |
|---|---|---|
| `not-an-object` | `null`, `undefined`, a primitive, a bigint, a symbol, a function, an array (a Proxy of one too) | none |
| `hostile-input` | reading `lo` or `hi` threw, or `Array.isArray` threw (a revoked Proxy) | none |
| `bound-not-an-integer` | a side that is not a number or `null` (missing, a string, a boolean, a bigint, a symbol, a boxed `Number`, an object), or a number that is not an integer (a fraction, `NaN`, `±Infinity`) | the side |
| `bound-out-of-range` | an integer with `|v| > MAX_MAGNITUDE` | the side |
| `inverted` | both sides bounded and `lo > hi` | none |

Precedence, first match wins: `not-an-object` > `hostile-input` > the `lo` bound (not-an-integer before
out-of-range) > the `hi` bound > `inverted`. The tests pin each step of it, including that a bad `hi` is reported
before an extent that is also numerically inverted.

**The read-once claim, and what shows it.** `raw.lo` and `raw.hi` are each read once, in that order, and the check
and the returned copy are made from that single read. Four probes in `hostile-input.test.ts`: a counting getter per
side (also when the extent is then refused); a Proxy that logs every trap, which sees exactly `get:lo` and `get:hi`
and no `has`, `ownKeys`, descriptor or prototype probe; getters that answer differently on a second read, in both
directions (a valid first read followed by a different second read is accepted with the first value; a refused first
read stays refused when the second read would be valid), on each side, with the reads of both sides counted each time.
The first reads are `null`, `0`, `-0`, `1`, `-1`, `5`, `-5`, `2**40` and `-(2**40)` in the first direction (each followed
by every one of `"x"`, `NaN`, `7.5`, `2**41`, `undefined`, an object, `3` and `null` that differs from it) and `1.5`,
`NaN`, `Infinity`, a string, `undefined`, an object and `2**40 + 1` in both signs in the second (each followed by `null`,
`0`, `-0`, `3`, `-3`, `2**40` and `-(2**40)`); and throwing reads (an `Error`, a string, `null`, `undefined`, a symbol, an object
whose own getters throw, a throwing Proxy trap, a revoked Proxy). Re-reading `lo` when the first read was a number:
**12 failed** (`hostile-input.test.ts`). Reading `hi` before `lo`: **6 failed** (`hostile-input.test.ts`). The
returned extent is plain data (own value properties, ordinary prototype), so a getter on the input cannot follow it
out.

**A gap the first version of these probes had.** Their first reads were all of one kind, and an independent verifier
found ten edits of `checkExtent` that left the whole suite green: five that re-read `hi` and two that re-read `lo`
only for a first read of another kind (on `hi`: `null`, `0`, a negative, a finite fraction, or `null` together with a
`null` `lo`; on `lo`: `0`, `NaN` or an infinity), and three that take the returned copy from a second read (`hi` when
the checked `hi` is `null` or negative, `lo` when the checked `lo` is `null`). The two that take the copy from a second read when the checked value is `null` (`hi` and `lo`) are the serious ones: with `{ lo: 1, get hi() {
null, then "not-a-number" } }` the edited code returned `hi` equal to `"not-a-number"` after two reads of `hi`, a value
that was never checked. I reproduced all ten green on the previous head (0 failed over the whole suite each) and that
result for `L4-T01`; the table described above is what closed them, and they are the `L4-` rows of the ledger. A wider
family (a re-read, or a copy from the raw object, for each of twelve classes of first value on each side: 34 edits)
was also run against `hostile-input.test.ts` and `check-extent.test.ts` alone and every one went red; that run is in
the scratch directory, not in the ledger.

**Choices the plan does not make, made and pinned:**

- **`±Infinity` is `bound-not-an-integer`.** The plan lists "non-integer, `NaN`, `±Infinity` or `|v| > MAX_MAGNITUDE`"
  as one clause without assigning `Infinity` a reason. `Number.isInteger(Infinity)` is false, so it is refused
  before the range is looked at, and so is any value that is both (`2**40 + 0.5`).
- **A missing side is refused, never read as unbounded.** `undefined` is not an integer, so `{ hi: 3 }` is
  `bound-not-an-integer` on `lo`. `null` is the only spelling of "unbounded", and nothing turns it into `0`
  (making it `0`: **20 failed**, `boundaries`, `check-extent`, `hostile-input`, `meet-subset`, `sum-exactness`).
- **An array is `not-an-object`.** It is an object in JavaScript but not the record `Extent` is; without the
  special case `[1, 2]` would be reported as a missing `lo`, which blames the wrong thing. Removing it: **4 failed**
  (`check-extent` 3, `hostile-input` 1).
- **`side` is present only for the two `bound-*` reasons**, and absent rather than `undefined` for the rest
  (`exactOptionalPropertyTypes` is on; the tests use `toStrictEqual`).
- **Only `lo` and `hi` are read, and an inherited one counts** (`raw.lo` would read it). An extra property, even one
  with a throwing getter, is never touched. A JSON-parsed own `"__proto__"` key is data and cannot reach the
  result. With `Object.prototype.lo` and `.hi` set, `{}` is accepted: I tried it once in a scratch script and it is
  not a test, because it would mean mutating a global.
- **`-0` becomes `0`** (`value === 0 ? 0 : value`). Without it: **5 failed** (`check-extent` 3, `hostile-input` 2).

**What this does not show.** The plan cites adaptive-agent's ADR 0003 Decision 4 as the technique for read-once; I
did not read that document and built the technique from the plan's one-line description. The probes above are the
ways of observing an object that were tried; nothing here claims that they are all of them.

## Decision 2 — the algebra trusts its inputs, and "total" is claimed for those

`meet`, `isSubset`, `isSameExtent`, `unmetSides`, `sumForward` and `sumBackward` take `Extent`s and do not
re-validate them; `checkExtent` is the one gate. For arguments that are plain data, as `checkExtent` returns them (own value properties holding an integer or `null`, in
ordinary arrays), they contain no operation that can throw (comparisons, arithmetic, `Array.push`); that is from
reading the code, and no test gives it a counterexample (frozen arguments, every grid case, every bad index of
Decision 3). It is not claimed for every value the declared types admit: an object that satisfies `Extent` through a
getter that throws makes each of the six functions throw (tried by hand for each of them; no test pins it), the same
limit M1's ADR records for `assertEntailmentWellFormed`. Over the grids no result of
`meet`, `sumForward` or `sumBackward` failed `checkExtent`. For a value `checkExtent` refuses, nothing is claimed,
and only the two limits below are tested.

- **A sum's bounds are not clamped to `MAX_MAGNITUDE`.** `[N, N] + [1, 1]` is `[N + 1, N + 1]`, which
  `checkExtent` would refuse as out of range (pinned in `boundaries.test.ts`). A later layer must not feed a
  propagated extent back through `checkExtent`.
- **Past `2**53` an addition silently loses exactness** (`2**53 + 1` is not representable; pinned with `BigInt`).
  The cap on one bound is not enough to keep a sum below it: a sum of at most 8,192 operands whose bounds are inside
  `MAX_MAGNITUDE` cannot leave `2**53` (8,192 x `2**40` is `2**53`), but nothing in this layer limits the operand count
  (`MAX_FIELDS` and `MAX_OPERANDS` are not enforced here). A call on 8,193 operands, every one accepted by `checkExtent`
  (one `[2**40 - 1, 2**40]` and 8,192 `[2**40, 2**40]`), returned a lower bound of 9008298766368768 where the exact sum is
  9008298766368767 (checked against `BigInt` in a scratch script, with the odd operand first and last; no test pins it).
  What is meant to keep it out is the cap together with a bound on the operand count; that later layers use either is
  not shown here (see "What is not proven").
- **An empty operand list is outside the type.** `sumForward([])` gives `[0, 0]`, which is what the loop's identity
  yields and the exact sum of no terms; `sumBackward` with no operands has no valid index, so it gives "no
  information". Both are pinned so a change is deliberate; I did not add a guard for a case the type forbids.

## Decision 3 — `sumBackward` with an index that names no operand implies nothing

`index` that is negative, equal to or past the length, fractional, `NaN`, `±Infinity`, or not a number returns
`{ lo: null, hi: null }`: never a throw, never a tightening. It is the one answer that cannot rule anything out, so
a bad index from a caller cannot invent a bound (the test meets it with several extents and each comes back
unchanged). `-0` is index `0`, as `operands[-0]` is `operands[0]`. The answer is not intersected with the operand's
own extent; that is the caller's `meet`, and leaving it out is what lets the grid compare the function with a plain
enumeration. The guard written `index > operands.length` instead of `>=`: **3 failed** (`sum-exactness`). That variant
does not throw: at `index === length` it subtracts every operand and returned `{ lo: 0, hi: 0 }` for one of the
tested cases, a bound nothing supports. That is why the guard is tested at the length.

## Decision 4 — `isSubset` and `unmetSides` share one per-side rule

`satisfiesLo` and `satisfiesHi` live in `subset.ts`, are used by `unmet.ts`, and are not exported from `index.ts`
(`architecture.test.ts` pins the public surface). So "is a subset" and "has no unmet side" cannot drift apart; the
grid test checks that `unmetSides(a, b)` is empty exactly when `isSubset(a, b)`. The cost is that one edit moves
both functions: `>=` to `>` on the lower side fails `meet-subset` and `unmet` together (ledger below). The two
tables are written separately and by hand (one from the subset side, one from the tested side), so the shared rule
is checked twice. `unmetSides` returns a new array each call, including the empty one.

## Decision 5 — the exhaustive grids, and what a side being `null` means to the oracle

The grids are the plan's. Sides from `{null, -2..3}` give 34 valid extents (`lo <= hi` whenever both are set), run
over 2 operands; sides from `{null, 0..2}` give 13, run over 3 operands. `sumForward` and `sumBackward` are compared
with `oracleForward` / `oracleBackward` in `__tests__/fixtures.ts`, which list every integer assignment and build
each sum one assignment at a time, and never call the library. Printed by `env -u AI_AGENT -u CLAUDECODE npx vitest
run lib/extent/__tests__/sum-exactness.test.ts`:

```
sumForward, 2 operands: 1156 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumForward, 3 operands: 2197 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumBackward, 2 operands, index 0: 39304 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumBackward, 2 operands, index 1: 39304 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumBackward, 3 operands, index 0: 28561 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumBackward, 3 operands, index 1: 28561 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sumBackward, 3 operands, index 2: 28561 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
sum grids in total: 167644 checks, 0 mismatches, 0 sets with a hole, 0 results that fail checkExtent
```

(With `AI_AGENT` and `CLAUDECODE` set, the same command printed none of these lines; I counted zero. Vitest 5's
`minimal` reporter, which it selects when it detects an agent, is the stated reason, and I did not inspect it
further.) A check is one call of the function compared with the oracle, both sides at once. Each
grid test asserts its own check count, so a loop that quietly ran fewer cases cannot pass as "0 mismatches".

**A side is `null` iff widening the enumeration window moves the oracle's bound**, not iff the bound reaches the
window's edge. The window is `[-cap, cap]` with `null` sides running to the edge, and `cap` is one more than the
largest finite bound in the case; the bound is read at that window and again at one two wider. A finite bound is the
same at both; an unbounded side runs to the new edge. The plan (section 8, defect 9) records that stopping at the
edge got 24,276 of 79,764 checks wrong in its first harness. That rule is kept as `naiveSum` in `fixtures.ts` so
that it can be shown wrong here: two hand-picked cases (a finite bound that lands on the edge, forward
`[-2, 0] + [-1, 0]`; an unbounded side that never reaches it, backward from `[null, 5]` with the operands `[0, 0]`,
the one asked about and so ignored, and `[1, 1]`) and the same rule over the same grids, which gets **2750 of 3353 forward and 128236 of 164291 backward
wrong** against the widening oracle (the number is printed by the same command; only "not zero" is asserted). The
plan names its rule as "the oracle reaches its cap" without saying how a sum reaches a cap; this is my reading of
it, so its count need not match, and I do not claim to have reproduced 24,276.

**The oracle also looks for holes.** For every case the set of sums is checked to be every integer between its least
and greatest value (0 sets with a hole), which is the thing that makes `[lo, hi]` an exact representation.

**The plan's count and mine differ, and I can say why only by arithmetic.** The plan says "0 mismatches in 139 083
checks" (`79 764 + 59 319`). `79 764 = 34² + 2 × 34³` is the 2-operand grid with both indexes. `59 319 = 13³ + 2 ×
13⁴` is the 3-operand grid with two indexes, not three. So the model evidently covered two of the three indexes of
the 3-operand grid; this repository covers all three, which is 28 561 more checks, **167 644** in all. That is an
inference from the numbers; I did not see the model.

## Decision 6 — the boundaries

`checkExtent` accepts `±MAX_MAGNITUDE` and refuses `±(MAX_MAGNITUDE + 1)` on each side, naming it; the test first
shows `MAX_MAGNITUDE + 1` is a distinct exactly representable integer. `>` to `>=` there: **5 failed**
(`boundaries` 2, `check-extent` 1, `hostile-input` 2).

**The 63-operand worst case, as I read it.** The plan says "a 63-operand-deep worst case, cross-checked against
`BigInt`" without saying what "deep" is. `MAX_FIELDS` is 64, and 63 operands plus their result is 64 fields, the most
a 64-field schema can give one sum. So: one call on 63 operands at the extreme values and on a seeded sample of values
at and next to `±MAX_MAGNITUDE` (every side compared with the `BigInt` sum), `sumBackward` at every one of the 63
indexes, and a ladder of 62 chained calls, forward and backward, each intermediate value checked against `BigInt`
and below `2**46`. `MAX_OPERANDS` (8) is not enforced anywhere in this layer and 63 is past it. The plan says
intermediates stay "below 2⁴⁸"; M1's ADR records that `MAX_MAGNITUDE × MAX_FIELDS` is exactly `2**46`, so the tests
check `2**46`. Not shown: any magnitude, shape or operand count beyond these cases.

## Decision 7 — what `architecture.test.ts` pins, and one coupling

- `lib/extent` holds exactly the six sources and the plan's seven test files plus `fixtures.ts`.
- The public surface is the seven functions and the type `ExtentCheck`, read at run time and by the parser.
- The sources may import only `../contracts/index.js` (never a file inside `contracts`) and each other; from
  `contracts` only types and the one value `MAX_MAGNITUDE`. This is stricter than M1's layer table, which allows a
  deep import of a lower layer. A synthetic tree with one violation per file shows each rule fires; so does a copy
  of the real `lib/` with one real source sabotaged.
- A source holds only imports, re-exports, function declarations and types: no `let`, and no module-level `const`,
  because a shared `{ lo: null, hi: null }` handed out by reference is the same hazard as mutable state. A
  module-level array that `unmetSides` cleared and refilled: **7 failed** (`architecture` 6, `unmet` 1).
- Deeply frozen arguments are accepted by every function over the 34-extent grid, and no result is an argument or an
  earlier result.
- M1's module-graph scan and determinism guard are shown to parse these files, so their silence is not an empty
  scan.

**The coupling.** The test imports four of M1's test helpers (`ast`, `module-graph`, `determinism`, `fixtures`
under `lib/contracts/__tests__/support/`), read-only. M1 is frozen, so they should not move; if they do, this test
fails loudly (an import that does not resolve) rather than passing.

## Sabotage ledger (the plan's four, then mine)

Each edit was applied to the committed source as an exact-match replacement that was first checked to occur once,
the whole suite was run, the file was restored with `git checkout -- <file>`, and `git status --porcelain` was empty
afterwards. All 40 edits turned the suite red; none left it green, and every failing test is under `lib/extent`
(no M1 or M2 test failed). The counts are from the final tests: they were measured again after the read-once table
and the hole-detector tests were added, and six rows moved (`P2e`, `M01`, `M02`, `M03`, `M12`, `M13`, each by the
`hostile-input` tests the table added). Some files fail without testing the edited function directly, because they call it to
build their input (for example `checkExtent` inside the grid tests). The plan's four are the first ten rows (two
variants for the swap, five for null-as-0, two for the boundary, one for `unmetSides`); mine are `M01` to `M20`; the
last ten are the verifier's (`L4-` plus its own label), each of which was green before the read-once table.

| # | Edit | Result |
|---|---|---|
| P1a | `sumBackward` subtracts the others' `lo` from `lo` and `hi` from `hi` (the sides no longer cross) | **16 failed**: `boundaries` 4, `sum-exactness` 12 |
| P1b | `sumBackward` returns `{ lo: hi, hi: lo }` | **20 failed**: `boundaries` 4, `sum-exactness` 16 |
| P2a | `meet`: `tighterLo` reads `null` as `0` | **14 failed**: `meet-subset` 12, `sum-exactness` 2 |
| P2b | `isSubset`: `satisfiesLo` reads `null` as `0` | **19 failed**: `meet-subset` 9, `sum-exactness` 1, `unmet` 9 |
| P2c | `sumForward`: a `null` lower bound adds `0` | **10 failed**: `boundaries` 1, `sum-exactness` 9 |
| P2d | `sumBackward`: a `null` other `hi` subtracts `0` from `lo` | **11 failed**: `boundaries` 1, `sum-exactness` 10 |
| P2e | `checkExtent`: `null` becomes the bound `0` | **20 failed**: `boundaries` 1, `check-extent` 7, `hostile-input` 2, `meet-subset` 2, `sum-exactness` 8 |
| P3a | `isSubset`: `>=` becomes `>` on the lower bound | **23 failed**: `meet-subset` 11, `sum-exactness` 1, `unmet` 11 |
| P3b | `isSubset`: `<=` becomes `<` on the upper bound | **23 failed**: `meet-subset` 11, `sum-exactness` 1, `unmet` 11 |
| P4 | `unmetSides` always reports both sides | **42 failed**: `unmet` 42 |
| M01 | `checkExtent` keeps `-0` | **5 failed**: `check-extent` 3, `hostile-input` 2 |
| M02 | `checkExtent` re-reads `raw.lo` when the first read was a number | **12 failed**: `hostile-input` 12 |
| M03 | `checkExtent`: `> MAX_MAGNITUDE` becomes `>=` | **5 failed**: `boundaries` 2, `check-extent` 1, `hostile-input` 2 |
| M04 | `sumBackward`: `index >= length` becomes `index > length` | **3 failed**: `sum-exactness` 3 |
| M05 | `checkExtent`: `lo > hi` becomes `lo >= hi` (rejects points) | **17 failed**: `boundaries` 2, `check-extent` 6, `meet-subset` 1, `sum-exactness` 8 |
| M06 | `meet` never returns `undefined` | **7 failed**: `meet-subset` 7 |
| M07 | `isSameExtent` compares only `lo` | **13 failed**: `meet-subset` 13 |
| M08 | `unmetSides` never reports `hi` | **22 failed**: `unmet` 22 |
| M09 | `sumBackward` does not skip `operands[index]` | **17 failed**: `boundaries` 4, `sum-exactness` 13 |
| M10 | `sumForward` adds the operands' `lo` into the upper bound | **16 failed**: `boundaries` 4, `sum-exactness` 12 |
| M11 | `checkExtent` no longer refuses an array | **4 failed**: `check-extent` 3, `hostile-input` 1 |
| M12 | `checkExtent`: `Number.isInteger` becomes `Number.isFinite` | **12 failed**: `check-extent` 7, `hostile-input` 5 |
| M13 | `checkExtent` returns the object it was given, not a copy | **20 failed**: `check-extent` 8, `hostile-input` 12 |
| M14 | `checkExtent` names `hi` for a bad `lo` | **28 failed**: `boundaries` 3, `check-extent` 23, `hostile-input` 2 |
| M15 | `checkExtent` rethrows instead of `hostile-input` | **17 failed**: `hostile-input` 17 |
| M16 | `checkExtent` reads `hi` before `lo` | **6 failed**: `hostile-input` 6 |
| M17 | `unmetSides` returns one module-level array it clears and refills | **7 failed**: `architecture` 6, `unmet` 1 |
| M18 | `sumForward`: a `null` upper bound adds `0` | **9 failed**: `boundaries` 1, `sum-exactness` 8 |
| M19 | `meet`: `tighterHi` takes the larger bound | **23 failed**: `meet-subset` 22, `sum-exactness` 1 |
| M20 | `isSubset`: an unbounded inner upper side counts as inside a bounded outer one | **21 failed**: `meet-subset` 9, `unmet` 12 |
| L4-V07 | `checkExtent` re-reads `hi` when the first read was `null` | **3 failed**: `hostile-input` 3 |
| L4-R01 | `checkExtent` re-reads `hi` when the first read was `0` | **1 failed**: `hostile-input` 1 |
| L4-R02 | `checkExtent` re-reads `hi` when the first read was a negative number | **2 failed**: `hostile-input` 2 |
| L4-R04 | `checkExtent` re-reads `lo` when the first read was `0` | **1 failed**: `hostile-input` 1 |
| L4-R09 | `checkExtent` re-reads `lo` when the first read was `NaN` or an infinity | **1 failed**: `hostile-input` 1 |
| L4-R11 | `checkExtent` re-reads `hi` when the first read was a finite non-integer | **1 failed**: `hostile-input` 1 |
| L4-R13 | `checkExtent` re-reads `hi` when both first reads were `null` | **2 failed**: `hostile-input` 2 |
| L4-T01 | `checkExtent` takes `hi` of the returned copy from a second read when the checked `hi` is `null` | **2 failed**: `hostile-input` 2 |
| L4-T02 | `checkExtent` takes `lo` of the returned copy from a second read when the checked `lo` is `null` | **2 failed**: `hostile-input` 2 |
| L4-T05 | `checkExtent` takes `hi` of the returned copy from a second read when the checked `hi` is negative | **1 failed**: `hostile-input` 1 |

The plan quotes "738 failing" for the always-both-sides edit on its throwaway model, counted in instances out of
2,000. P4's 42 is tests in this repository. The two are not comparable and neither confirms the other. The edits
are described in words; the script that applied them (an exact-match replace and the restore) lives in the
session's scratch directory, not in the repository. The oracle's own detectors are not in this table because they
are edits of test support, not of the library: replacing the hole predicate by `false`, replacing its call site by
`false`, changing it to `>` or to an off-by-one, and removing each of the three counters of `Tally`, each went red in
`sum-exactness.test.ts`: the call site replaced by `false` 1 failed; the predicate replaced by `false` 2, changed to `>`
2, changed to an off-by-one 10; each of the three counters removed (holes, invalid results, mismatches) 1 failed
apiece; and `oracleSum` ignoring its enumeration parameter 1 failed. Replacing the call site alone is the case a test
of the predicate by itself would have missed.

## Timing

Measured with `vitest run --reporter=json` (per-test durations). The machine was busy throughout, because of other
work on it, and busier than in the first round of measurements: its load average (1, 5 and 15 minutes) was 10, 12 and
10 when the first batch started, 12 at the start of the second, and 16 to 19 in the last runs, on 10 cores. The
second batch ran with six `yes > /dev/null` processes added; they were killed afterwards and `pgrep -x yes` found none.

| Run | Slowest `lib/extent` test | Slowest `lib/extent` file (wall) |
|---|---|---|
| whole suite, ambient load, run 1 | 1061 ms (`architecture`) | 4815 ms (`sum-exactness`) |
| whole suite, ambient load, run 2 | 963 ms (`architecture`) | 3783 ms (`sum-exactness`) |
| whole suite, ambient load, run 3 | 814 ms (`sum-exactness`) | 4494 ms (`sum-exactness`) |
| whole suite, six `yes` added, run 1 | 1164 ms (`architecture`) | 6896 ms (`sum-exactness`) |
| whole suite, six `yes` added, run 2 | 1104 ms (`architecture`) | 5562 ms (`sum-exactness`) |
| whole suite, six `yes` added, run 3 | 957 ms (`architecture`) | 5100 ms (`sum-exactness`) |
| `lib/extent` alone, ambient load, run 1 | 118 ms (`sum-exactness`) | 707 ms (`sum-exactness`) |
| `lib/extent` alone, ambient load, run 2 | 180 ms (`sum-exactness`) | 787 ms (`sum-exactness`) |
| `lib/extent` alone, ambient load, run 3 | 137 ms (`sum-exactness`) | 1135 ms (`sum-exactness`) |

`npm test` took 19.25 s with the six `yes` running and 16.26 s straight afterwards. The earlier round, on a quieter
machine, had 10.0 s and 13.7 s for the same two situations on the previous tests, so the whole-suite figures above
say more about the machine than about the tests. A file's wall time is many tests plus the wait for a worker; vitest's
default timeout (5 s) applies to one test, and the slowest `lib/extent` test in any whole-suite run above is 1164 ms.
No timeout was raised anywhere (`vitest.config.ts` is the scaffold's and was not touched).

Two things were slower than I wanted when they were written and were fixed rather than tolerated; the figures are from
then, on the earlier tests: the two lattice-law loops over all 34³ triples called `expect` on every comparison (about
340 ms for the file's slowest test in the suite, about 1 s under load; collecting the failures and asserting once made
the slowest test in that file 6 ms when run on its own), and a first version of the "wrong rule" measurement ran all
grids in one test (1.0 to 1.8 s in the suite, 1.2 to 2.6 s under load, over three runs each) and is now one test per
index. The slowest test in the whole suite in the runs above is M1's `never-sabotage.test.ts` (1686 to 1959 ms).

## Rejected alternatives

- **A guard for an empty operand list in `sumForward`**: the type forbids it, and returning `[0, 0]` is the exact
  answer. A case nobody asked for (Decision 2).
- **Clamping a sum's bounds to `MAX_MAGNITUDE`**: it would make a result look valid and hide that a bound left the
  cap; the unclamped value is exact and `checkExtent` would refuse it if it were fed back.
- **Accepting only own properties in `checkExtent`**: it needs `Object.hasOwn`, `getOwnPropertyDescriptor` or `in`,
  which would be further observations of the input (for a Proxy, further traps) beyond the one read per field the
  plan asks for.
- **`Math.max` / `Math.min` in `meet`**: they would need `null` mapped to an infinity or a number first, and a
  number is exactly the `null`-as-`0` mistake.
- **A separate `oracle.ts`**: the plan lists `fixtures.ts` only; the oracle and the grids are in it.

## Plan wording and neighbours, flagged (the plan was not edited)

1. **The 3-operand check count** (Decision 5): the plan's 139 083 is consistent with two of the three indexes; this
   repository checks three, 167 644 in all.
2. **"63-operand-deep"** is not defined; Decision 6 says how it was read.
3. **"below 2⁴⁸"** against M1's exact `2**46` (Decision 6); the tests use `2**46`.
4. **`±Infinity` has no assigned reason** in the plan (Decision 1).
5. **M1's text that says M3 is not built is now stale for M3.** `lib/contracts/bounds.ts` ("which is not built; until
   it is, nothing in this repository refuses such a value"), `lib/contracts/limits.ts` ("the argument ... is M3's to
   check against `BigInt` and is not built") and ADR 0001 ("None of M3-M5 is built") were true when written. M1 is
   frozen and I did not edit them. M1's tests only pin what M1 does and still pass. `boundaries.test.ts` is the
   check `limits.ts` leaves to M3, for the cases in Decision 6 and no others.

## What is not proven

- That the grids are representative: they are exhaustive over their own values (`-2..3`, `0..2`) and over 2 and 3
  operands. Four or more operands are covered only by the `BigInt` boundary cases, not by enumeration.
- That read-once covers every way of observing an input (Decision 1).
- That anything forces a later layer to call `checkExtent`: this milestone provides the door; M4 and M5 must use it.
- That the functions behave on a value `checkExtent` would refuse, or on an `Extent` whose getter throws (Decision 2).
- That a sum is exact beyond 8,192 operands (Decision 2): nothing in this layer limits the operand count.
- That the sabotage ledger covers every possible edit: it shows 40 edits go red, not that no edit goes green.
- That timing holds on another machine, or under a load other than the one used.
- That CI passes on the pushed branch: see the pull request.

## Falsifiability log

```
git diff origin/main...m3-extent -- . ':!lib/extent' ':!.genesis/decisions/0003-extent.md'      # empty (three dots: main has moved)
npm ci && ls node_modules/@rolldown/binding-darwin-arm64
npm run typecheck
npm test                                  # M1, M2 and M3 together
env -u AI_AGENT -u CLAUDECODE npx vitest run lib/extent/__tests__/sum-exactness.test.ts    # prints the grid lines of Decision 5
```
