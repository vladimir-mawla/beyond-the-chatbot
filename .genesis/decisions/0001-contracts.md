# ADR 0001 — M1 contracts: disjoint `Entailment` variants, how their proofs are checked, and what M1 does not claim

- **Date:** 2026-10-24
- **Status:** proposed — written by the builder, not yet verified by an independent L4 pass
- **Phase / milestone:** M1 (BUILD) — `lib/contracts/**`

Decisions are in the order the commits landed. Where a later commit falsified an earlier sentence, the
sentence is revised here and the revision says so.

## Context

`.genesis/PLAN.md` section 4.1 (the M1 block), section 6 (M1) and section 8 (defect 7) fix the closed
vocabulary: ten constants, the brands `FieldId` and `ObsId`, `Extent`, `Operands`, `BaseField` /
`DerivedField`, `Observation`, `Claim`, `Support`, `OpenEnd`, the five-variant `Entailment`, three fault unions,
`Brief`, and six functions (`fieldId`, `obsId`, `compareIds`, `isNonEmptyArray`, `assertNeverEntailment`,
`assertEntailmentWellFormed`). M1 is types and structural invariants only: no `lib/extent`, `lib/ground` or
`lib/entail` logic exists.

The central claim is the DoD gate "an `ungrounded` or `conflicted` `Entailment` carrying `established`, or a
`weakened` without `unmet`, does not compile, by any route". A sibling project's M1 made a near-identical claim
on the strength of the excess-property check, which fires only on a fresh object literal, and seven ordinary
non-literal routes compiled (adaptive-agent, its ADR 0001 decision 1). The plan's own model found the same flaw
in its first draft (section 8 defect 7: 16 of 17 `?: never` proofs stayed green when the field was deleted).
This ADR is mostly about making that claim true, checking it mechanically, and saying exactly where it stops.

**Sources read for technique, not for domain:** the sibling `autonomous-company-simulator` branch `m1-contracts`
(read from a fresh clone in a scratch directory; no existing checkout of it was touched): its proof harness, its
module-graph scan and its integrity guard. Its verifier's finding that the harness accepted an extra diagnostic
is Decision 1.

## Decision 1 — a `@ts-expect-error` proof is checked by a harness that fails on any additional diagnostic

**Problem.** A `// @ts-expect-error` line proves only that SOME error occurs on the next line. Four ways for that
to be a false proof: (1) `noUnusedLocals` is on in both tsconfigs, so an unread local errors with TS6133 whatever
the type says; (2) an un-annotated `{ kind: "ungrounded", ... }` widens `kind` to `string` and fails on `kind`;
(3) a fresh literal fails on excess-property grounds (TS2353) even where the field is not forbidden by
assignability; (4) the stated error arrives with an unexpected second one. `npm run typecheck` sees none of them:
it reports TS2578 only when the line has NO error.

**Decision.** `__tests__/support/proof-harness.ts` recompiles every proof file with its directives stripped
(line numbers preserved), under BOTH `tsconfig.lib.json` and `tsconfig.json` (they differ in
`exactOptionalPropertyTypes`, and a consumer under `app/` compiles under the second). Each directive
`// @ts-expect-error TS<code>[|TS<code>] <message fragment>` must be matched by **exactly one** diagnostic on the
next line, with the stated code and carrying the fragment; any other diagnostic anywhere in the file is a failure.
Any other suppression comment (`@ts-ignore`, `@ts-nocheck`, a block-comment form, one behind code on the same
line) is itself a failure.

**The change from the sibling.** Its harness tolerated an extra diagnostic whose code the directive already
listed. Here any extra fails, whatever its code. `proof-harness.test.ts` shows the harness red on each of the five
ways a proof can be false, each with its own fixture: expected diagnostic missing; wrong code; wrong message
fragment; wrong line; additional diagnostic (a different code, and the SAME code twice on one line). Section D of
the log re-introduces the sibling's tolerance and shows exactly that fixture go red.

**Batching (a later commit).** The sabotage tests re-check every proof file once per deleted declaration, and one
`tsc` process per file per config took about 40 s. `checkProofSources` compiles all the files of one call in one
project per config and evaluates each with the same rules; the self-test still covers the single-file wrappers.

**What the harness does not do.** It does not prove a proof's routes are the right ones or the list complete. It
compiles proof files without Node's type definitions (the scratch project is outside the repo), so a proof or a
file it imports must not use a Node global; that failure is loud (a diagnostic in an imported file).

## Decision 2 — the 17 `?: never` fields are proved by seven non-literal routes each, and deleted one at a time by a test

Each variant declares every field that belongs to another variant as `?: never`: `BaseField.sum`,
`DerivedField.baseline`; `Entailed` x3, `Weakened` x1, `Contradicted` x3, `Ungrounded` x4, `Conflicted` x4. That
is 17.

**The proof.** For each field, a carrier `{ ...sample, <field>: <value> }` where `sample` is a valid, annotated
value of the variant (so the carrier differs from a valid value in that field only, and `kind` stays literal
without `as const`) is assigned by seven routes: an intermediate binding, a spread of the carrier, a function
return, `satisfies`, a generic helper, `Object.assign({}, carrier)`, and an array element. 15 fields on
`Entailment` x 7 = 105 lines in `proofs/entailment-forbidden.proofs.ts`; 2 on `FieldDecl` x 7 = 14 in
`proofs/schema-forbidden.proofs.ts`. Every directive carries `TS2322|TS2375` (the second is the code under
`exactOptionalPropertyTypes`, so the leading code differs by config) and the fragment `Types of property '<field>'
are incompatible`; a `satisfies` line is `TS1360`.

**There is deliberately no fresh-literal route.** A first version had one (8 routes). The first run of the
sabotage test found two faults in it, both measured on the real types: a literal that carries the forbidden field
fails to compile whether or not the field is `?: never`, so it is a vacuous proof (the plan's defect 7), and its
diagnostic wording depends on OTHER variants' fields, so deleting `Entailed.unmet?: never` turned the
`contradicted_unmet` literal line red, and a proof that reacts to another field's deletion cannot be attributed to
one field. `never-sabotage.test.ts` keeps a literal PROBE per field instead: a fresh literal carrying the field
produces exactly one error under each config both with the `?: never` present and with it deleted (so it cannot
discriminate), and the 17 rows all pass.

**The 17-of-17 sabotage, as a test (`never-sabotage.test.ts`).** For each field, a COPY of `lib/contracts` has that
one line deleted; every proof file is run against the copy, strict and "as written" (TS2578). Required: exactly
that field's seven routes go red (both views), and no proof of any other field does; a control with nothing
deleted must produce no failure. A second test (`required-sabotage.test.ts`) does the same for what each variant
REQUIRES: 12 required fields made optional and 4 non-empty tuples loosened (16 rows, 25 proof groups). Together
33 mutations. A third guard shows up in them: see Decision 4 ("the table assertion").

**Result, run for real** (log below): 17 of 17 turn exactly their own proofs red, in the test (on copies) and on
the real tree under plain `tsc`. Printed with `BTC_REPORT=1 npm test -- never-sabotage`, the 17x17 matrix is a
diagonal of 7.

**An unavoidable cross-talk, stated.** `public-surface.proofs.ts` imports the barrel, which re-exports
`integrity.ts`, so when a variant's field changes the table assertion at the bottom of `integrity.ts` (Decision 4)
also fails and the harness reports it against every proof file that imports it, as "in a file the proof imports,
not in the proof". `npm test` therefore shows `public-surface.proofs.ts` red alongside `entailment-forbidden.
proofs.ts` for such a deletion, through that imported-file diagnostic and through none of its own lines. The
sabotage tests separate the two (`sourceDiagnostics`) and require the table assertion to fire for the 28 of 33
mutations that change an `Entailment` variant and to stay silent for the 5 that touch `FieldDecl` or `Operands`.

## Decision 3 — what `?: never` does NOT refuse: every residual route, shown to compile, and where it is caught

The brief and the plan list routes the type must refuse. Probed rather than assumed, these are the ones it does
not. Each is a directive-free line in `proofs/residuals.proofs.ts` (the harness requires such a line to compile
under both tsconfigs, so the type system really does let it through), exported in `RESIDUALS`, and run through
`assertEntailmentWellFormed` by `residual-routes.test.ts`.

| # | Route | Compiles? | Caught at run time as |
|---|---|---|---|
| 1 | `as unknown as Entailment` | yes, both configs | `unexpected-field` / ungrounded / established |
| 2 | implicit `any` (`JSON.parse`) | yes | same |
| 3 | annotate as a supertype that lacks the field, then assign | yes | same |
| 4 | function parameter and return typed as that supertype | yes | same |
| 5 | conditional expression (type is the common supertype) | yes | same |
| 6 | array literal (element type reduced the same way) | yes | same |
| 7 | user-defined type guard whose body returns `true` | yes | same |
| 8 | `Object.assign(value, { field })` as a statement (mutation) | yes | same |
| 9 | `Object.assign(value, { field })` as an expression | yes | same |
| 10 | `Object.defineProperty(value, "field", ...)` | yes | same |
| 11 | a writable alias typed as a supertype that PERMITS the field | yes | same |
| 12 | a field the variants do not mention (`note`) | yes | **not caught** (`ok: true`) |
| 13 | cast `conflicted` with no `core` | yes | `missing-field` / conflicted / core |
| 14 | `any` `weakened` with `unmet: []` | yes | `empty-array` / weakened / unmet |
| 15 | plain `x as Entailment` (no `unknown`) | `tsconfig.lib.json` only; `tsconfig.json` refuses (TS2352) | same as 1 |
| 16 | explicit `established: undefined` | `tsconfig.json` only; `tsconfig.lib.json` refuses (TS2375) | `unexpected-field` (Decision 4) |

Rows 15 and 16 hold under ONE config and are pinned with the harness itself (a directive that is satisfied under
one config and reported `no-diagnostic` under the other).

**`Object.assign`, specifically (the brief asked).** It is type-refused ONLY when the carrier's TYPE already has
the field: `Object.assign({}, carrier)` is the seventh route of the forbidden proofs and goes red when the
`?: never` is deleted. `Object.assign(value, { established: x })` ADDING the field does NOT error: the field enters
through an object-literal argument and the result type is an intersection that still contains the clean variant
(rows 8 and 9). So the plan's "must refuse via ... `Object.assign`" is met for one reading of it and not the
other; the second is caught at run time only.

## Decision 4 — `assertEntailmentWellFormed`: table-driven, key presence counts, one deliberate addition

**The table** is the plan's: required (entailed/contradicted: `established`, `support`; weakened: `established`,
`support`, `unmet` non-empty, `openEnds` array; ungrounded: `openEnds` non-empty; conflicted: `core` non-empty) and
forbidden (entailed/contradicted: `unmet`, `openEnds`, `core`; weakened: `core`; ungrounded: `established`,
`support`, `unmet`, `core`; conflicted: `established`, `support`, `unmet`, `openEnds`) — 25 cells, 15 forbidden and
10 required, three of the required non-empty. `integrity.test.ts` writes the plan's table out independently of
the guard's own and has one test per cell, the four M2 self-checks and the presence, precedence and
limit semantics (70 tests).

**The table assertion (a second guard).** Compile-time assertions inside `integrity.ts` fail `npm run typecheck`
if the table drifts from the types: every cell is required or forbidden and not both, the table's forbidden
cells are exactly the `?: never` fields of the variant, its required cells exactly the required ones, and the shape
it demands (present / array / non-empty) is the declared one. Dropping any of the 28 cells turns its named test
red AND fires the assertion (log, section C).

**Order of checks** (documented on the function and pinned): `unknown-variant`; the variant's required fields in
table order (`missing-field`, or `empty-array`); its forbidden fields in table order (`unexpected-field`); the
common fields `field` and `tested` (`missing-field`). The plan's four M2 self-checks are each one cell, so M2
does not depend on the order. The common fields are checked last so they cannot pre-empt a plan cell if M2's
cast-built values are minimal.

**Present-but-`undefined` forbidden key (the brief asked).** `tsconfig.json` has no `exactOptionalPropertyTypes`,
so under it `established?: never` ACCEPTS `established: undefined` (row 16). The guard counts the KEY as present:
`field in value`. That sees an own property, an inherited one, an accessor, a non-enumerable one and a property
whose value is `undefined`. The brief recommended `Object.hasOwn`; `in` is a strict superset (it also sees a field
inherited from a prototype, which `value.field` would still read), so this is stronger than the recommendation,
not different from it. Cost: a builder that writes `{ ..., established: cond ? x : undefined }` is told, which is
the point. A value with the key REMOVED is well formed. Pinned by tests (own/undefined, prototype, non-enumerable,
accessor, `null`).

**Deliberate addition to the plan's types: `unknown-variant`.** The plan's `EntailmentIntegrityError` has three
kinds with `variant: Entailment["kind"]`, which has no way to describe a value that is not an object or whose
`kind` is none of the five. The options were: let it pass (fails open), throw (a function whose job is to return a
verdict), invent a `variant` (lies), or add a fourth member. A fourth member, `{ kind: "unknown-variant"; found:
string }`, was chosen; **this is a deviation from the plan's type and is flagged here and in the report.** It is
additive: no M2 check in the plan can return it.

**What it does not catch** (header, at full strength): presence and array-ness only (`established: 42` passes); no
relation between fields; an unrelated extra key; a required array field holding a non-array is reported as
`missing-field` (there is no `wrong-type` member and none was added); it is not total (a getter that throws makes
it throw, a lying `Proxy` is believed; hostile input is read once at M3-M5 intake). Each is pinned by a test.

## Decision 5 — exhaustiveness: a local stand-in AND the real union, and the plan's "fifth" is a sixth

A proof cannot edit the real union, so `proofs/exhaustiveness.proofs.ts` proves the gate on a local stand-in with
the five kinds (five cases compile) and a stand-in with a sixth (the same five cases do not: TS2345 naming the
left-over variant). It also proves it on the real `Entailment`: a switch with all five compiles (a control), and
five switches each leaving one out fail naming that variant (which also shows each variant is told apart by `kind`
alone). `entailment.test.ts` then makes the REAL union grow in a copy and requires the real handles-all switch and
all five "missing" proofs to react and the stand-in lines not to; and grows the stand-in to show its handles-all
switch break.

**Plan wording flagged.** Section 6 M1 (b) says "a fifth `Entailment` variant compiling silently"; `Entailment`
already has five. What a change adds is a SIXTH, which is what the same milestone's falsifiable check says. Built
as sixth.

## Decision 6 — ids, limits, non-empty arrays

`FieldId` / `ObsId` are `T & { readonly __brand: B }` exactly as the plan writes `Brand` (the sibling used a
`unique symbol`; the plan wins). The mint functions validate nothing (plan: "NO PARSERS"). `compareIds` is
UTF-16 code-unit order (`<`), not `localeCompare`; its test separates code-unit from code-point order with a
surrogate pair against U+FF5E. The ten constants are annotated `: number`, as the plan declares them, not as
literals. `MAX_MAGNITUDE * MAX_FIELDS` is exactly 2**46, below the plan's "2**48" and far below the safe-integer
limit; M3, not M1, checks the propagation argument against `BigInt`. `NonEmptyReadonlyArray` is the readonly
tuple; `isNonEmptyArray` is a user-defined type guard whose body is pinned from both sides.

## Decision 7 — faults, `Brief`, and where `Support` and `OpenEnd` live

Declarations only. The plan lists the M1 files but gives `Support` and `OpenEnd` no home; they are in `claim.ts`
(they are the evidence-side vocabulary a `Claim` is ruled against). Fault fields that hold hostile text are
`string`, not a brand, because a fault is raised about input not yet matched against the schema. `Brief` carries no
schema (a carried schema would make `recheck` circular, plan M5) and no index-paired parallel arrays.

## Decision 8 — `lib/**` is a closed module graph; one rule the sibling lacked; one allowlist trade-off

Every module reference (static, `export from`, `import x = require`, dynamic `import()`, `require()`, import type,
triple-slash) in every `.ts` file under `lib/` and `domains/` is parsed with the TypeScript parser. A relative
specifier is resolved to a real file with `realpathSync` and must stay in `lib/`; library SOURCE may import nothing
else (not even `node:`); tests may import seven fixed names. Layers are the plan's order, a rank comparison.

**The rule the sibling's graph test was missing:** a NON-TEST source under `lib/` or `domains/` may not resolve
into any `__tests__` directory or a `*.test.ts` file (`source-imports-test`), by real path (a symlink into
`__tests__` is caught). Without it library code could import a test helper and every layer check would still pass.
A fixture proves it red for a direct import, a directory import, a re-export, a dynamic import, an import type, a
symlink, and a cross-layer import; a test importing a test is not flagged. The same rule is shown on the REAL
sources (the `__tests__` import bullet of section D in the log).

**Domains.** A non-test source under `domains/` may import only inside `domains/` or a `lib/<layer>/index.ts`, and
no package (plan section 5: "imports only `lib/*/index`"). `domains/` does not exist yet, so only fixtures exercise
it. The plan's further rule that the drafter imports no engine function is M6's.

**The layer table, exhaustively.** 5 importers x 8 targets, the verdict for each pair taken from the plan's order
written out in the test, not from the table under test.

**Allowlist trade-off, stated.** The test-import allowlist is exactly what `lib/**` imports today (7 names), and
a test asserts nothing is allowlisted that nothing uses. `module-graph.ts` is M1's and frozen after M1, so a later
milestone whose tests need another package or built-in cannot add it without breaking the freeze boundary. M3-M5
are specified to use `node:fs`/`node:os`/`node:path` and the TypeScript parser, which are covered; if that proves
wrong the cost lands on that milestone.

**Not decided by the plan:** `scripts/`, `components/` and `app/` are one rank, so the table does not forbid
`components -> app`; lib layers may import another layer's internals (only `domains/` is held to `index`).

**File inventory** (`file-inventory.test.ts`): no non-`.ts` file, no `.d.ts`, no symlink under `lib/`, by `lstat`.
A hidden file such as a macOS `.DS_Store` is reported (it is gitignored, so it can only appear locally).

## Decision 9 — the determinism guard is an AST walk with an honest header

Non-test sources under `lib/**` and `domains/**`; the plan's ten identifiers, `Math.random` (three forms), dynamic
`import()`, `localeCompare`, a banned name as a string key; fails closed on an unparseable file and on a code file
it does not parse (`.tsx`, `.js`, `.mjs`, ...). It over-reports on purpose (a function called `process` is flagged;
a comment or string mentioning a name is not). **Limits, all pinned as files the guard is expected NOT to flag:**
a computed name (`globalThis["Da"+"te"]`), a variable name, `eval`, `new Function`, `Reflect.get(globalThis, ...)`,
an alias variable of `Math` (`const M = Math` or `const M = globalThis.Math`), `Math` passed as an argument or
spread (`call(Math)`, `{ ...Math }`), `Math` wrapped in parentheses, `as`, `!`, `satisfies` or a comma expression
(`(Math).random()`), `Math` destructured in a parameter default, by assignment or in a `for` head
(`({ random } = Math)`), and `Intl` / `toLocaleString`. (`globalThis.Math.random()` and `globalThis["Math"].random()` ARE caught; a
probe for that bypass after the first push found it open and it was closed.) The plan names two
of these (`globalThis["Da"+"te"]`, `eval`); the rest were found by writing the fixtures. Not built, on purpose: a
name-scan for "confidence"/"score"/"threshold" (plan: that class of scanner cost control-tower five rounds; the
absence of a scalar is proved behaviourally in M4).

## Decision 10 — the honest limits are code

`proofs/honest-limits.proofs.ts` (compile-only) and `honest-limits.test.ts`: `Extent` admits `lo > hi` (M3
`checkExtent`: `inverted`), `fieldId` admits any string (M4 `readSchema`/`ground`, M5 `readClaim`), `Operands`
admits a repeated field (M4 `readSchema`: `operand-reused`) — the plan's three — plus a non-integer / `NaN` /
infinite / over-`MAX_MAGNITUDE` bound, a schema with a duplicate id, an unknown operand, a cross-unit sum and a
cycle, a quote without its digits, an `entailed` whose `established` is outside `tested`, and an incoherent
`Brief`. **None of M3-M5 is built, so "closed by" is the plan's assignment, not something this repository does.**
Each closing refusal named is checked to occur in PLAN.md, and the four functions that raise them are checked
against the plan's function-ownership table (`checkExtent` M3, `readSchema` and `ground` M4, `readClaim` M5). Which
refusal belongs to which function is the plan's prose and type comments, and is not checked. The plan does not say
which layer enforces `MAX_ID_LENGTH`, and the test says that too.

## Decision 11 — the canonical scenario is typed against the real contracts, as an expressibility check only

Plan section 7 (the four-field schema, four documents with their real quotes, six rulings, a step-5 `Brief`) is
written in the real types and every ruling passes the guard. It computes nothing. M6 owns the real data.

## Rejected alternatives

- **A fresh-literal route in the proofs** (the plan's own first draft): vacuous and unattributable (Decision 2).
- **One combined proof per variant** (several forbidden fields in one carrier): masked, a second never-field keeps
  it red after the first is deleted (plan section 8 defect 7).
- **Throwing from `assertEntailmentWellFormed` on an unknown variant**, or **inventing a `variant`**: Decision 4.
- **`Object.hasOwn` alone** for forbidden keys: misses an inherited field (Decision 4).
- **Testing a forbidden field by value (`!== undefined`)**: accepts `undefined`, which `tsconfig.json` allows.
- **A regular-expression determinism or import scan**: flags comments and strings, so gets switched off.
- **An exemption for `.DS_Store` in the inventory**: a literal reading of "no non-`.ts` file" is simpler; the
  report names the file.
- **Separate `unique symbol` brands** (the sibling's choice): the plan writes `__brand`.
- **A generic `Assert` inside the table assertion**: a constraint on a generic is not resolved until instantiation;
  the first version evaluated to `false` for every variant (found by running it). It is a boolean computed per
  variant now.

## Residual routes and what is not proven

Read Decision 3 first. In short: M1 proves that every value whose STATIC TYPE carries a forbidden field is refused
by the seven routes, for the 17 fields, under both configs, except where the field is typed `undefined` or `any`
under `tsconfig.json`: there `?: never` reads as `undefined` (no `exactOptionalPropertyTypes`) and accepts both,
through all seven routes. `established: undefined` is row 16 of Decision 3; `established: <a value typed any>` is
the same door and is not a row of its own. Only the run-time guard sees either; for a `FieldDecl` nothing in M1
does. It does **not** prove, and no test claims, that a contaminated value cannot exist: sixteen routes in Decision 3
build one. The run-time guard catches fifteen of those; the other one (an unrelated extra key, row 12) is caught by
nothing, by design of the plan's table.

Also not proven:

- That the 17 are the right 17, or the required table the right table: both are the plan's, checked by reading.
- Anything about the engine: no meet, propagation, ruling, support, recheck or render exists. Every
  cross-field fact (`unmet` is the cut, `established` is inside `tested` for `entailed`, a `core` is unsatisfiable,
  `evidence` is what supports name) is M4's or M5's to produce and to test.
- That `npm run build` exercises `lib/`: nothing under `app/` imports `lib/contracts` yet, so the build does not
  touch it. A SCRATCH copy of HEAD with an `app/api/probe/route.ts` importing `lib/contracts/index.js` built clean
  under `next build --webpack` with `extensionAlias` (log, section D); that probe is not in the repo.
- That `npm run typecheck` compiles `lib/` under the loose `tsconfig.json`: it does not (`exclude: ["lib/**/*"]`).
  Only the proof harness does, for the proof files and what they import, and the scratch build above did, through
  an importing route.
- Lint: `npm run lint` covers JS only (`typescript-eslint` throws on TypeScript 7); `typecheck` is the backstop.
- The TypeScript AST API is `unstable`: a minor release may change it, and the scans would then fail loudly.

## Falsifiability log (every number below was produced by a run in this session)

**A. The plan's sabotage on the real tree, plain `tsc -p tsconfig.lib.json`** (each deletion restored with
`git checkout`; `git diff` empty afterwards). Deleting `readonly established?: never;` from `Ungrounded`:

```
lib/contracts/__tests__/proofs/entailment-forbidden.proofs.ts(173): error TS2578: Unused '@ts-expect-error' directive.
  ... (175, 178, 181, 183, 185, 187: seven lines in all, every one of ungrounded_established)
lib/contracts/integrity.ts(90): error TS2344: Type 'false' does not satisfy the constraint 'true'.
```

All 17, one at a time: each row below is `TS2578 on its own 7 routes / TS2578 on any other proof / other diagnostics`.
Every row is 7/7, no other proof, and `integrity.ts` TS2344 for the 15 `Entailment` rows (line 87 Entailed, 88
Weakened, 89 Contradicted, 90 Ungrounded, 91 Conflicted) and none for the 2 `FieldDecl` rows.

| Field deleted | own 7 | other proofs | other diagnostics |
|---|---|---|---|
| BaseField.sum | 7/7 | none | none |
| DerivedField.baseline | 7/7 | none | none |
| Entailed.unmet / openEnds / core | 7/7 each | none | integrity.ts(87) TS2344 |
| Weakened.core | 7/7 | none | integrity.ts(88) TS2344 |
| Contradicted.unmet / openEnds / core | 7/7 each | none | integrity.ts(89) TS2344 |
| Ungrounded.established / support / unmet / core | 7/7 each | none | integrity.ts(90) TS2344 |
| Conflicted.established / support / unmet / openEnds | 7/7 each | none | integrity.ts(91) TS2344 |

The same 17 in the test (on copies, strict and as written): `npm test -- never-sabotage` is 19 passing tests
(a layout test, a control, 17 deletions); with `BTC_REPORT=1` it prints the 17x17 matrix, a diagonal of 7.
Under `npm test` the type-proofs test for the real tree shows `entailment-forbidden.proofs.ts` red and, through the
imported `integrity.ts` diagnostic only, `public-surface.proofs.ts` (Decision 2).

**B. Required fields** (`required-sabotage.test.ts`, 17 tests: a layout test and 16 mutations, on copies): each
of 12 made-optional and 4 made-possibly-empty declarations turns exactly its own proof groups red, every route,
and no other.

**C. The guard's table, 28 cells dropped one at a time on the real tree** (15 forbidden, 10 required, 3 non-empty
shapes), `integrity.test.ts` plus `tsc`: in 28 of 28 the cell's own named test goes red and `integrity.ts` TS2344
fires on that variant's line. In 17 of 28 it is the ONLY test that goes red; in the other 11 the same cell is also
used by a semantics test (`undefined` key, prototype, accessor, the M2 self-checks, the precedence tests), so 2 to
6 tests go red, never fewer than its own.

**D. The plan's other sabotages, on the real tree** (restored after each):

- *Add a sixth variant to the stand-in* (`exhaustiveness.proofs.ts`): `npm run typecheck` →
  `exhaustiveness.proofs.ts(44): error TS2345: Argument of type 'StandInRefuted' is not assignable to parameter of
  type 'never'.` — the one handles-all site of the stand-in.
- *Add a sixth variant `Refuted` to the REAL union*: `entailment.test.ts(35)` and `exhaustiveness.proofs.ts(74)`
  (the two handles-all switches) fail with TS2345 `Argument of type 'Refuted' is not assignable to parameter of type
  'never'`; the five `realMissing*` lines still hold under plain `tsc` (their directive is satisfied by a TS2345 with
  a longer type) and are turned red by the strict harness (`entailment.test.ts`); `integrity.ts`'s table also fails
  to compile (`Record<Entailment["kind"], ...>` has no `refuted`). So "every `assertNeverEntailment` site fails to
  compile" is true of the two handles-all sites under `tsc`, and of the missing-variant sites under the harness.
- *`import "node:fs";` at the top of `lib/contracts/limits.ts`*: `npm test -- architecture` → the real-repo test
  `has no violation` fails with `+ "lib/contracts/limits.ts:external-not-allowed"`.
- *`import "./__tests__/support/samples.js";` at the top of `lib/contracts/ids.ts`* (the rule the sibling lacked):
  the same test fails with `+ "lib/contracts/ids.ts:source-imports-test"`.
- *`export const stamp = Date.now();` appended to `lib/contracts/limits.ts`*: `npm test -- determinism` → `finds
  nothing` fails with `+ "lib/contracts/limits.ts:banned-identifier:Date"`.
- *`compareIds` changed to `a.localeCompare(b)`*: `ids.test.ts` has 2 tests red (code-unit order, surrogate pair)
  and the determinism guard reports `lib/contracts/ids.ts:locale-compare:localeCompare`.
- *`isNonEmptyArray` changed to `xs.length >= 0`*: `non-empty-array.test.ts` "is false for an empty array" red.
- *`MAX_FIELDS` 64 → 65*: `limits.test.ts` 2 red (the value, and the 2**46 product).
- *The harness re-weakened to tolerate an extra diagnostic of a code the directive lists*: exactly one test red,
  `proof-harness.test.ts` 5b (the same-code extra).
- *`assertNeverEntailment` changed to `return value`*: 6 tests red: its 3 run-time tests, and 3 more in
  `entailment.test.ts` because `entailment.ts` stops compiling (the helper `describe` becomes unused and trips
  `noUnusedLocals`, TS6133), which the harness reports as a diagnostic in an imported file.

**E. A scratch build** (`git archive HEAD` into a scratch directory, `node_modules` symlinked, an
`app/api/probe/route.ts` importing `../../../lib/contracts/index.js` and calling the guard): `next build --webpack`
printed `Next.js 16.4.3 (webpack)`, `Experiments: extensionAlias`, `Compiled successfully`, `Running TypeScript` and
finished, with the route listed as `ƒ /api/probe`. This is the only evidence that `.js`-suffixed `lib/` imports
resolve in a build; it is not in the repo and the repo's own `npm run build` does not cover it.

## Plan observations (found by building; the plan is frozen and was not edited)

1. **M1 (b) says "fifth variant"**; there are already five, the falsifiable check says sixth. Built as sixth.
2. **`Object.assign`** is listed among the routes `?: never` must refuse; it is refused only when the carrier's
   type already has the field (Decision 3). Adding the field through the call compiles.
3. **Plan section 8A "8 at the literal site"**: a literal-site proof is vacuous (Decision 2); the proofs have none.
4. **`EntailmentIntegrityError` has no way to describe a value of no variant**; a fourth member was added
   (Decision 4). Flagged as a deviation.
5. **The plan gives `Support` and `OpenEnd` no file**; they are in `claim.ts`.
6. **The plan's `npm run build` expectation** ("`lib/contracts` sources are the first real test of
   `extensionAlias`") cannot hold at M1: nothing under `app/` imports `lib/`. M2's health route will be the first
   real import.
7. **`tsconfig.json` does not compile `lib/`** (its `exclude`), so "under both tsconfigs" is true only of what the
   harness compiles. A `lib/` file is checked under the loose config only when `app/` or `components/` imports it.
8. **The M1-frozen allowlist** (Decision 8) can block a later milestone's test import.
9. **`MAX_MAGNITUDE * MAX_FIELDS` is 2**46**, which is "below 2**48" as the plan says; recorded so M3 does not
   re-derive it.
