# Beyond the Chatbot — G0–G2 Plan

Project 8 of 8 (the last). Cluster: "what do I know?" — second, after `memory-ledger`. Today: 2026-10-24. This
document is a plan, not code: no repo exists, nothing is scaffolded, `git init` was not run. The next agent (G3)
copies this file to `.genesis/PLAN.md`. **If any later brief disagrees with a path, name or signature in this
file, this file wins; the builder flags the mismatch rather than inferring a rename.** (One sibling paid for this — adaptive-agent's ADR 0004 Decision 0 records that its M4 task brief said `lib/gate/**` while its plan and DONE.html said `lib/invariants/**`.
This project's engine directories are `lib/extent`, `lib/ground`, `lib/entail` — **not** `lib/conflict|gate|arbitrate|evidence|invariants|chain|allowance|standing`. A brief written from the house template that says "M4 = lib/gate" is wrong for this project.)

Proposed repo name: **`beyond-the-chatbot`** (the brief's own title, so a judge searching for it finds it; the
siblings are named by mechanism — `memory-ledger`, `agent-control-tower` — so `claim-gate` is the alternative; the
coordinator's call, and nothing below depends on it).

---

## 0. Sources, and what this plan does not claim

Every sibling claim below was read on `origin/main` via `git -C ~/Desktop/<repo> show origin/main:<path>` or
`git grep … origin/main`; **no working tree was read, and no state-changing git command was run in any sibling.**
(The two repos with other agents active — `adaptive-agent`, `autonomous-company-simulator` — are read the same way;
the scratch directory this plan uses is `…/scratchpad/btc/`, a fresh subdirectory; a sibling planner's `trace/` in
the same scratchpad was not touched.)

| Repo | `origin/main` | What main says (as read) |
|---|---|---|
| agent-trust-layer | `a515ac6` | M9 done 2026-09-17; tip is the 2026-10-24 `next` 16.4.3 upgrade |
| decision-engine | `2ab9aa2` | five-outcome engine; tip is the `next` upgrade. Its README still says the deploy "has not happened yet" while its git log says M2/M8 were marked done against the live deployment — stale README, not relied on |
| shadow-run | `911621f` | 9/9 (`mark M9 done`), `next` upgrade on top |
| memory-ledger | `6f27092` | 9/9; a later commit fixes `app/milestones.ts` to match DONE.html |
| agent-control-tower | `af7699c` | 9/9 |
| adaptive-agent | `2879c13` | **M8 done, M9 `todo`** in its DONE.html on main; I claim nothing about its M9 |
| autonomous-company-simulator | `fc17afd` | **scaffold only** on main: config, CI, smoke test, `.genesis/PLAN.md`, DONE.html; no engine code. This is where the infrastructure below is copied from |

**Read in full:** memory-ledger `PLAN.md`, `memory-plan.md` (all of it), `README.md`, `docs/THESIS.md`, `docs/ARCHITECTURE.md`
(all of it), `docs/WALKTHROUGH.md` (first screen), one failure-case header (`case-4`); autonomous-company-simulator
`PLAN.md` (all of it, as the bar), `DONE.html`, `README.md`, and every config/infra file on main (list in §12);
control-tower `PLAN.md` (first 150 lines), `README.md`, `vitest.config.ts`, `package.json`, `app/api/health/route.ts`,
`lib/contracts/__tests__/import-containment.test.ts` and `file-inventory.test.ts` (headers), `components/demo/compute-demo-view.ts` (head);
adaptive-agent `PLAN.md` (first 140 lines), `README.md`, ADR 0001 (decision 1 lines) and ADR 0003 (first 60 lines);
decision-engine `README.md` (first 120 lines), ADR 0001 (first 120 lines), `docs/ARCHITECTURE.md` (first 80 lines); shadow-run `README.md`, `PLAN.md`
(first 170 lines); agent-trust-layer `README.md` (first 100 lines), `docs/THESIS.md`, `PLAN.md` (first 120 lines).
**Grepped, not read:** every other ADR and file. I grepped all seven `main` snapshots for
`entail|weaken|unanswerable|grounded|interval|overclaim|hallucinat|citation|proof-carrying|answerab|determinacy|constraint propag`:
the hits are English prose ("weakened a check", "overclaim" in ADR text) or an unrelated identifier (agent-trust-layer's policy explanation "cites" the credential field a bound came from), never an entailment mechanism. No sibling implements
claim-versus-evidence entailment, interval propagation, or output-side weakening.

**From my own knowledge, not verified in this session:** that bounds-consistency over an acyclic network of convex constraints is exact (the reason read-once schemas are expected to propagate exactly — a Berge-acyclic hypergraph is a join tree, so arc consistency decides it). The plan does not rest on it: it rests on the oracle checks of §8, which would have shown a counterexample, and did, for the diamond.

**Not verified:** (a) nothing is built — the scratch model of §8 is not the build and the build will find defects in
it; (b) the brief says npm 11.5.1 deletes **27** platform-binary lockfile entries on any rewrite; I did not reproduce
that number. I counted what is in the copied lockfile (§12): 216 package entries, **80** carrying `os`/`cpu`
(15 `@rolldown/binding-*`, 25 `@img/sharp*`, 20 `@typescript/typescript-*`, 11 `lightningcss-*`, 8 `@next/swc-*`, 1 `fsevents`),
and G3 pins that count mechanically (§12 deviation 4) rather than trusting either number.

---

## 1. What the seven siblings already own (so this project repeats none of them)

| Project | Question | Central closed enum / shape (as read) |
|---|---|---|
| agent-trust-layer | Is this presented claim authentic and does policy permit it now? | no outcome enum; `did:key` identity → VC claims (authority vs history) → fail-closed verification → policy that names the rule and credential field |
| decision-engine | May *I* act, given my evidence and the stakes? | `Outcome` = execute · ask · defer · escalate · refuse; `ask` "names the missing fact"; evidence bar scales with reversibility × cost |
| shadow-run | What would this write do, and did reality match? | `Reconciliation` = confirmed · drifted · unprojected; rollback = restored · failed · dishonest · unavailable |
| memory-ledger | What do I believe, and might it be stale or wrong? | `BeliefAnswer` = believed · doubted · disputed · unknown; `ForgetReason` (5); `Provenance.tier` decides superseded vs disputed; decay; tombstones; no un-forgetting |
| agent-control-tower | What may a supervisor do to an agent it did not start? | `Intervention` = observe · warn · pause · halt(checkpointed\|forced) · quarantine; `Corroboration` = self-reported · cross-checked · independently-verified |
| adaptive-agent | Has a single agent's proposed change to itself earned the right to stick? | `AdaptationDecision` = adopt · hold · revert · frozen; evidence counted by `distinctContexts` |
| autonomous-company-simulator | When an act was done, does it bind the organisation and who answers? | `Standing` = binding · inherited · void; conserved attenuating grants; no wall clock |

None of the seven decides **what a system is allowed to *say***. Six of them decide what it may *do* (act, simulate,
intervene, adapt, delegate, authenticate). The seventh, `memory-ledger`, decides what it may *believe* — a property of a
store over time. The gap this project fills is the step after belief: a system holds some evidence; **what may it
emit?** That is the thing a chatbot does not ask, and the thing a system "beyond" one must refuse to skip.

---

## 2. Brainstorm (G0.5) and the spine

**The weak reading, rejected outright.** *A chatbot with extra features* — tools, retrieval, a memory, a nicer UI, a
"cite your sources" footer. That is a prompt wrapper; the brief names it as an automatic disqualifier. A citation
footer is the sharpest form of the trap: a link next to a sentence proves the document exists, not that it says the
sentence, and nothing re-executes the link.

Candidate mechanisms for "what must a system beyond chat refuse that a chatbot happily does":

* **A — Cite-checked generation** (the drafter attaches citations; a checker confirms each cited document exists and
  mentions the topic). *Rejected:* decorative citations pass it. A model can cite a real document for a claim the
  document does not entail, and the check still goes green. It also needs the checker to read prose, i.e. a model.
* **B — An LLM judge scores faithfulness.** *Rejected on the brief's own terms:* a non-deterministic mechanism
  cannot be falsifiably tested, and "a model checks a model" is the wrapper pattern again.
* **C — Commitments with deadlines and discharge** ("answer vs commitment" as a lifecycle: open → discharged →
  breached). *Rejected:* it needs clocks (the staleness-and-skew class control-tower paid for), it is the
  "commitment lifecycle" autonomous-company-simulator's plan itself rejected, and "may I promise this?" drifts into
  the may-I-act cluster. **The half of the question worth keeping — "who can hold the system to it?" — survives as
  `recheck` (§5, M5): a stranger holding only the output and the schema can re-derive it.**
* **D — Calibration: a confidence earned from a track record.** *Rejected:* it is `Confidence` (memory-ledger) and
  `EvidenceTally` (adaptive-agent) under a third name, and it needs a time axis.
* **E — Possible-worlds over categorical domains (a SAT/CSP engine).** *Rejected as first build:* more general, much
  heavier, and no brute-force oracle small enough to run in a unit test. The chosen fragment (F, below) is the
  smallest one where **exactness is checkable by enumeration.**
* **F — A gate that rules every claim against fixed evidence by set inclusion, over a deliberately decidable claim
  language.** *Chosen.*

### 2.1 The one-sentence claim

> A system beyond chat never emits a sentence it cannot back: every output is a **claim** about a typed quantity,
> and a deterministic gate rules it against fixed evidence as **entailed**, **weakened**, **contradicted**,
> **ungrounded** or **conflicted** — so a draft that says more than its evidence entails is cut back to exactly what
> the evidence does entail (with the cut named), a question the evidence cannot touch gets the named gap and not
> something plausible, and prose is only ever a projection of a checked claim.

### 2.2 The counterclaim a judge may reasonably make

1. "This is interval arithmetic with a UI. The hard part of 'beyond the chatbot' is turning messy language into
   claims, and you stubbed it: the observations are typed by hand and the drafter is a deterministic stand-in. A gate
   that only checks what is already typed does not touch hallucination where it happens."
2. *The honest answer, not a rhetorical one.* (a) The translation from prose to claims is the **untrusted** part by
   construction — you cannot make a model's translation correct, you can make its **output** checkable, and that is
   the part this project builds and falsifies. (b) The closed claim language is the price of exactness: entailment
   here is set inclusion over integer intervals under sum rules, so every *ruling* can be checked against a
   brute-force enumerator in a unit test. A richer language would be a bigger system with a weaker proof. (c) The
   gate's guarantee is **conditional on its observations**, and §11 case 01 — the deliberate failure test — pins the
   exact way that condition fails: a mis-extracted observation yields a claim that is entailed, re-derivable, and
   false. That limit is stated up front, not discovered at M7. Whether a decidable fragment is a seed or a toy is
   the thing a judge is entitled to disagree with; §9 names it as the riskiest decision.

### 2.3 How it differs from each neighbour, concretely

**Memory-ledger first, because it is the nearest and the brief says not to rebuild it in new nouns.**

| | memory-ledger (read on main) | this project |
|---|---|---|
| **Subject** | a stored `Memory` (subject, predicate, value, `Provenance`, `Confidence`, `DecayPolicy`, status) | an *emitted* `Claim` (a quantity and an integer extent) tested against immutable `Observation`s |
| **Time** | the axis of the whole design: `believedAt`, `DecayPolicy`, clock-inconsistent `now` fails closed, tombstones | **none.** No `now` parameter anywhere in `lib/`; an AST guard bans `Date`, `performance`, `Math.random`, timers (§6 M1). Staleness is memory-ledger's problem |
| **Confidence** | a recorded `Confidence` in [0,1] and a computed `effectiveConfidence` | **none.** Entailment is set inclusion. Property: every number in every `Entailment` is an integer (a leaked 0.9 would be a failing test, §6 M4) |
| **Contradiction** | *pairwise* `contradict(older, newer)` on the same (subject, predicate), decided on `Provenance.tier` alone: no-conflict · superseded · disputed · not-comparable | **joint.** A conflict is an *unsatisfiable set*. In the demo no two documents disagree and no three do; four together cannot all be true (§7, executed). It is never resolved: no tier, no recency, no count exists in the engine (D6) |
| **Unit of output** | a *selection*: `BeliefAnswer` hands back a stored `Memory` (or a pair of them) | a *computation*: `weakened` emits an extent no document contains; `established` bounds are derived by propagation — in step 6 of §7 customs is "7 to 10 days", a number written in none of the documents |
| **The "don't know" variant** | `unknown{reason: no-memory \| all-known-memories-tombstoned, tombstones}` — about a *key* | `ungrounded{openEnds}` — about a *claim over a quantity the evidence has not moved*, naming the leaf quantities no observation bounds |
| **Monotonicity** | non-monotone by design: decay and forgetting shrink what is believed | **monotone in evidence** (theorem, property-tested): more observations only narrow `established`, or turn the tree `conflicted` — never widen it |
| **Where it sits** | upstream: what the system may *hold* | downstream: what the system may *say* from what it holds. They **compose**: a `believed` memory can be an `Observation`; neither imports the other |
| **Trust** | `Provenance.tier` is load-bearing | no trust order exists in the engine; `source` is display-only and a metamorphic test (case 08) proves renaming sources changes no `Entailment` |

**The different-nouns test, run both ways.** Delete the vocabulary: memory-ledger is "keep records of what you were
told, let them age, retire the ones contradicted or expired, answer from the live ones". This project is "never say
more than the evidence forces; say the strongest thing it does force; say nothing when it forces nothing; refuse to
choose between evidence that cannot all hold". Neither sentence describes the other: there is no age here, no record
that is retired, no selection of a stored value there.

| Neighbour | What it decides | Why this is not that |
|---|---|---|
| decision-engine | whether to *act*, with an evidence bar scaled by stakes (cost × reversibility); `ask` names the missing fact | no action, no stakes, **no threshold at all**; the nearest echo is `openEnds` naming the quantities with no evidence — same spirit as `ask`, different object (a bound on a claim, not a fact for an action) |
| shadow-run | whether a *projection* matched reality after execution (`Reconciliation`) | same two-sided shape (predicted vs observed ⇔ tested vs established) but no action, no world, no rollback; the comparison here happens **before** emission and the "observed" side is derived by propagation |
| agent-control-tower | what to do to a running agent; `Corroboration` grades *how a fact was learned* | no "how it was learned" axis exists here: every observation is equally trusted, by design (D6, case 08) |
| adaptive-agent | whether a self-change earned adoption; evidence **counted** by distinct context | nothing is counted; one document that entails a bound is enough, ten that don't are not |
| agent-trust-layer | whether a presented claim is authentic (signatures, revocation) | no cryptography; authorship is asserted (case 02 states what `recheck` therefore does not prove). The two compose: a signed observation could feed this gate |
| autonomous-company-simulator | whether a *completed act* binds the organisation and who answers | that is about acts and authority; this is about statements and evidence |

**Where it does overlap, stated rather than hidden.** (1) *Technique reuse, not claim reuse:* `?: never` disjoint
families plus a runtime guard for the cast residual; typed failure instead of a throw on hostile input; closed
module graph; hand-rolled seeded PRNG property tests. (2) *Spirit with decision-engine's `ask`:* naming what is
missing instead of shrugging. (3) *Memory-ledger's `unknown`* and this project's `ungrounded` both decline to answer;
they differ in what triggers them (an absent or retired key vs. a quantity whose extent the evidence has not moved)
and in what they carry.

### 2.4 The brief's questions → where this project answers them

| Question | Answer in this design |
|---|---|
| What is the unit of output if not a message? | An `Entailment` per claim, collected in a `Brief` (the question's ruling, the draft's rulings, the draft claims refused before ruling, and the observations they rest on). A sentence exists only as `renderBrief(schema, brief)` — a projection that may not invent a number (§6 M5, case 10) |
| What must it refuse that a chatbot does happily? | To say more than the evidence entails (`weakened`); to answer a claim over a quantity the evidence has not moved (`ungrounded`); to pick between evidence that cannot all be true (`conflicted`); to emit a claim that rules nothing out (`vacuous-claim`); to emit anything outside its claim language (`ClaimFault`) |
| When must it say "I can't answer that from what I have"? | When `E = B`: the evidence has not narrowed the quantity at all. It then emits nothing about the quantity and names ≥ 1 open end (a leaf quantity and the side no observation bounds) |
| What separates an answer from a commitment, and who can hold the system to it? | An answer is prose. A commitment is a claim carrying a **certificate** — `support` ids whose carried observations re-derive each evidence-backed bound. Anyone with the `Brief` and the schema can `recheck` it: change any bound that still cites its support and it is caught. Two things it cannot certify, both pinned: that the carried observations are the *real* ones (the holder checks the carried quotes against their own documents — they are carried for that), and that nothing was *left out* (case 02, measured in §8) |

---

## 3. Design decisions (the numbered spine every failure case traces to)

* **D1 — A claim is an extent, not a sentence.** The unit of output is `Entailment`; prose is `render(brief)`, one-way,
  and may contain no number the entailment does not.
* **D2 — The draft is untrusted and carries no evidence.** `Claim = {field, extent}`: there is no citation slot, so
  nothing can be forged. Only the engine attaches support, computed from the snapshot.
* **D3 — Entailment is set inclusion. There is no score.** No confidence, no threshold, no clock, no counting, no
  randomness. The engine's only inputs are a schema, a snapshot of observations, and claims.
* **D4 — Exact over a decidable fragment.** Integer extents (`lo`/`hi`, `null` = unbounded) over **read-once sum
  trees**. Bounds propagation is *exact* on that fragment (checked against a brute-force oracle — exhaustively for the algebra, on 8 000 random instances for whole trees, §8; checked, not proved) and is **not**
  exact on a diamond (§11 case 09). Derived fields declare no baseline of their own.
* **D5 — Weaken, don't merely refuse, when the evidence permits.** When the tested extent overlaps but is not
  contained in the evidence-implied extent `E`, the output is `E` itself with the cut named. When `E` equals the
  schema-only baseline `B`, the output says nothing about the quantity and names the open ends.
* **D6 — A conflict is never resolved.** There is no trust order, recency, or vote in the engine. An unsatisfiable
  tree is refused whole (per-tree, no salvage) and an **irreducible core** of observations is named.
* **D7 — Support is a certificate, found by deletion-minimisation.** For each bound the engine keeps an irreducible
  subset of observations that reproduces it (deletion in **ascending id order**, so the survivors are the
  lexicographically *latest* ids). Irreducible, not minimum; depends on ids, not on input order.
* **D8 — Observations are typed data whose numbers must occur in their quote.** The extractor is outside the trust
  boundary. The only fidelity check is digit-containment; everything else about extraction is *not* checked.
* **D9 — A snapshot is the closed world.** Evidence is immutable; there is no clock and no staleness. "What I have"
  is the snapshot. A new snapshot is a new grounding. Time is memory-ledger's problem.
* **D10 — Everything is deterministic; the drafter is a pure function standing in for a model.** No LLM, no
  network, no key, anywhere. A real model would replace `domains/order-desk/drafter.ts` (and an extractor in front of
  `ground`); the engine's guarantees must not depend on which.
* **D11 — One error discipline.** Hostile or malformed input becomes a typed fault; the engine throws only on an
  internal invariant violation (a result it built failing `assertEntailmentWellFormed`). Shape problems report **all**
  offending fields (sorted, deduped); structural problems report the **first** failing rule in a documented precedence.

---

## 4. The closed domain vocabulary

### 4.1 Types (compiled — see §8 and Appendix A)

Four ```` ```ts ```` blocks follow, one per layer, each opening with `// FILE:` and an explicit `import type` list. They were
**extracted from this markdown file into `lib/contracts|extent|ground|entail/index.ts`, with each file importing only from
lower layers, and compiled with the repo-pinned `tsc 7.0.2` under `tsconfig.lib.json`-equivalent flags** (`strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`). They are
declarations only. Because the layers are separate files with real imports, a type used in a layer that has not
imported it from below fails to compile — the layering is itself checked, not asserted.

```ts
// FILE: lib/contracts/index.ts   (M1)
type Brand<T, B extends string> = T & { readonly __brand: B };

export type FieldId = Brand<string, "FieldId">;          // opaque; minted by fieldId(); NO PARSERS (ids are not grammars)
export type ObsId = Brand<string, "ObsId">;              // opaque; minted by obsId()
export type Bound = number | null;                       // null = unbounded on that side
export interface Extent { readonly lo: Bound; readonly hi: Bound }   // integers; lo <= hi when both set. The TYPE cannot say so; M3 `checkExtent` enforces it (and M1 pins that as an HONEST LIMIT test)
export type Side = "lo" | "hi";
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];
export type Operands = readonly [FieldId, FieldId, ...FieldId[]];    // a sum has >= 2 operands, by type

export declare const MAX_MAGNITUDE: number;      // 2 ** 40   — invented, disclosed
export declare const MAX_FIELDS: number;         // 64        — invented, disclosed
export declare const MAX_OPERANDS: number;       // 8         — invented, disclosed
export declare const MAX_OBSERVATIONS: number;   // 64        — invented, disclosed
export declare const MAX_DRAFT_CLAIMS: number;   // 32        — invented, disclosed
export declare const MAX_ID_LENGTH: number;      // 128
export declare const MAX_LABEL_LENGTH: number;   // 64
export declare const MAX_UNIT_LENGTH: number;    // 16
export declare const MAX_SOURCE_LENGTH: number;  // 64
export declare const MAX_QUOTE_LENGTH: number;   // 280

// ---- the schema: what quantities exist and how derived ones are built ----
export interface BaseField {
  readonly kind: "base"; readonly id: FieldId; readonly label: string; readonly unit: string;
  readonly baseline: Extent;                     // a declared invariant of the quantity, e.g. a duration is >= 0
  readonly sum?: never;
}
export interface DerivedField {
  readonly kind: "derived"; readonly id: FieldId; readonly label: string; readonly unit: string;
  readonly sum: Operands;                        // this field IS the sum of these fields
  readonly baseline?: never;                     // a derived field declares NO baseline: it is computed (D4)
}
export type FieldDecl = BaseField | DerivedField;
export interface Schema { readonly fields: NonEmptyReadonlyArray<FieldDecl> }

// ---- evidence and claims ----
export interface Observation {
  readonly id: ObsId; readonly field: FieldId; readonly extent: Extent;
  readonly quote: string;                        // the clause the extent was read from; every bound's digits must occur in it (D8)
  readonly source: string;                       // display label only; never read by the engine (D6)
}
export interface Claim { readonly field: FieldId; readonly extent: Extent }    // a draft claim OR the user's question: same shape

export interface Support { readonly lo: readonly ObsId[]; readonly hi: readonly ObsId[] }   // per bound; [] = the bound needs no evidence (schema-implied or unbounded)
export interface OpenEnd { readonly field: FieldId; readonly side: Side }                    // a base quantity with no observation bounding that side

// ---- the closed enum at the centre: Entailment (five variants, disjoint families) ----
interface EntailmentBase { readonly field: FieldId; readonly tested: Extent }

export interface Entailed extends EntailmentBase {
  readonly kind: "entailed"; readonly established: Extent; readonly support: Support;
  readonly unmet?: never; readonly openEnds?: never; readonly core?: never;
}
export interface Weakened extends EntailmentBase {
  readonly kind: "weakened"; readonly established: Extent; readonly support: Support;
  readonly unmet: NonEmptyReadonlyArray<Side>;   // the sides of `tested` that `established` does not satisfy: the cut, named
  readonly openEnds: readonly OpenEnd[];         // may be empty: a loose bound names no gap (case 06)
  readonly core?: never;
}
export interface Contradicted extends EntailmentBase {
  readonly kind: "contradicted"; readonly established: Extent; readonly support: Support;
  readonly unmet?: never; readonly openEnds?: never; readonly core?: never;
}
export interface Ungrounded extends EntailmentBase {
  readonly kind: "ungrounded"; readonly openEnds: NonEmptyReadonlyArray<OpenEnd>;
  readonly established?: never; readonly support?: never; readonly unmet?: never; readonly core?: never;
}
export interface Conflicted extends EntailmentBase {
  readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId>;   // an irreducible set that cannot all hold
  readonly established?: never; readonly support?: never; readonly unmet?: never; readonly openEnds?: never;
}
export type Entailment = Entailed | Weakened | Contradicted | Ungrounded | Conflicted;

// ---- typed refusals, by the layer that raises them ----
export type SchemaFault =                          // M4 readSchema. Precedence: malformed > too-many-fields > duplicate-field > unknown-operand > operand-reused > rule-cycle > unit-mismatch
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "too-many-fields"; readonly count: number; readonly max: number }
  | { readonly kind: "duplicate-field"; readonly field: string }
  | { readonly kind: "unknown-operand"; readonly result: string; readonly operand: string }
  | { readonly kind: "operand-reused"; readonly operand: string }
  | { readonly kind: "rule-cycle"; readonly field: string }
  | { readonly kind: "unit-mismatch"; readonly result: string; readonly operand: string }
  | { readonly kind: "hostile-input"; readonly message: string };
export type ObservationFault =                     // M4 ground. Precedence: duplicate-id > malformed > unknown-field > number-not-in-quote > outside-baseline
  | { readonly kind: "duplicate-id"; readonly id: string }                      // every occurrence of a repeated id is rejected, so input order cannot pick a winner
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "number-not-in-quote"; readonly value: number }
  | { readonly kind: "outside-baseline"; readonly field: FieldId }              // extent ∩ the field's computed baseline is empty: impossible by the schema's own invariants
  | { readonly kind: "hostile-input"; readonly message: string };
export type ClaimFault =                           // M5 readClaim. Precedence: malformed > unknown-field > vacuous-claim
  | { readonly kind: "malformed"; readonly fields: NonEmptyReadonlyArray<string> }
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "vacuous-claim"; readonly field: FieldId }                 // the computed baseline already satisfies it: it rules nothing out
  | { readonly kind: "hostile-input"; readonly message: string };
export interface RejectedObservation { readonly index: number; readonly fault: ObservationFault }
export interface ClaimRejection { readonly index: number; readonly fault: ClaimFault }

// ---- the unit of output ----
export interface Brief {
  readonly answer: Entailment;                       // the user's question, ruled like any claim
  readonly claims: readonly Entailment[];            // one per accepted draft claim, in draft order
  readonly rejected: readonly ClaimRejection[];      // draft claims refused before ruling
  readonly evidence: readonly Observation[];         // exactly the observations some support or core names, sorted by id: the Brief is self-contained
}

// ---- mint functions, order, guards ----
export declare function fieldId(raw: string): FieldId;
export declare function obsId(raw: string): ObsId;
export declare function compareIds(a: string, b: string): number;       // UTF-16 code-unit order, never localeCompare (locale-dependent = nondeterministic)
export declare function isNonEmptyArray<T>(xs: readonly T[]): xs is NonEmptyReadonlyArray<T>;
export declare function assertNeverEntailment(value: never): never;
export type EntailmentIntegrityError =
  | { readonly kind: "unexpected-field"; readonly variant: Entailment["kind"]; readonly field: string }
  | { readonly kind: "missing-field"; readonly variant: Entailment["kind"]; readonly field: string }
  | { readonly kind: "empty-array"; readonly variant: Entailment["kind"]; readonly field: string };
export type EntailmentIntegrity = { readonly ok: true } | { readonly ok: false; readonly error: EntailmentIntegrityError };
export declare function assertEntailmentWellFormed(e: Entailment): EntailmentIntegrity;   // the runtime guard M2's health check and M5 run
```

```ts
// FILE: lib/extent/index.ts   (M3)
import type { Extent, NonEmptyReadonlyArray, Side } from "../contracts/index.js";

export type ExtentCheck =
  | { readonly ok: true; readonly extent: Extent }                // a fresh, read-once copy
  | { readonly ok: false; readonly reason: "not-an-object" | "bound-not-an-integer" | "bound-out-of-range" | "inverted" | "hostile-input"; readonly side?: Side };
export declare function checkExtent(raw: unknown): ExtentCheck;
export declare function meet(a: Extent, b: Extent): Extent | undefined;          // intersection; undefined = empty
export declare function isSubset(inner: Extent, outer: Extent): boolean;
export declare function isSameExtent(a: Extent, b: Extent): boolean;
export declare function unmetSides(established: Extent, tested: Extent): readonly Side[];   // sides of `tested` that `established` does not satisfy
export declare function sumForward(operands: NonEmptyReadonlyArray<Extent>): Extent;        // the extent the sum of the operands must lie in
export declare function sumBackward(result: Extent, operands: NonEmptyReadonlyArray<Extent>, index: number): Extent;   // the extent `result` implies for operands[index]; an out-of-range index implies nothing ({null,null})
```

```ts
// FILE: lib/ground/index.ts   (M4)
import type {
  Extent, FieldDecl, FieldId, Observation, ObsId, NonEmptyReadonlyArray,
  OpenEnd, RejectedObservation, SchemaFault, Schema, Side, Support,
} from "../contracts/index.js";

export interface FieldExtent { readonly field: FieldId; readonly extent: Extent }
export type TreeState =
  | { readonly kind: "consistent"; readonly extents: NonEmptyReadonlyArray<FieldExtent> }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };
export interface Tree { readonly root: FieldId; readonly fields: NonEmptyReadonlyArray<FieldId>; readonly state: TreeState }
export interface Grounding {                                       // plain data, deep-frozen; no closure, no Map
  readonly schema: Schema;                                         // the validated copy
  readonly observations: readonly Observation[];                   // the ACCEPTED ones, sorted by id
  readonly baseline: NonEmptyReadonlyArray<FieldExtent>;           // B(f) for every field: the schema alone, no observation
  readonly trees: NonEmptyReadonlyArray<Tree>;                     // the connected components of the sum rules
}
export type GroundFailure =
  | { readonly kind: "invalid-schema"; readonly fault: SchemaFault }
  | { readonly kind: "too-many-observations"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };
export type GroundResult =
  | { readonly ok: true; readonly grounding: Grounding; readonly rejected: readonly RejectedObservation[] }
  | { readonly ok: false; readonly failure: GroundFailure };

export type SchemaRead = { readonly ok: true; readonly schema: Schema } | { readonly ok: false; readonly fault: SchemaFault };
export declare function readSchema(raw: unknown): SchemaRead;
export declare function ground(rawSchema: unknown, rawObservations: unknown): GroundResult;

export type ExtentFailure =
  | { readonly kind: "unknown-field"; readonly field: string }
  | { readonly kind: "conflicted"; readonly core: NonEmptyReadonlyArray<ObsId> };
export type ExtentRead = { readonly ok: true; readonly extent: Extent; readonly baseline: Extent } | { readonly ok: false; readonly failure: ExtentFailure };
export declare function extentOf(g: Grounding, field: FieldId): ExtentRead;
export type SupportRead = { readonly ok: true; readonly support: Support } | { readonly ok: false; readonly failure: ExtentFailure };
export declare function supportOf(g: Grounding, field: FieldId): SupportRead;
export declare function openEndsOf(g: Grounding, field: FieldId, sides: readonly Side[]): readonly OpenEnd[];   // [] for an unknown field or a conflicted tree
export declare function declOf(schema: Schema, field: FieldId): FieldDecl | undefined;
```

```ts
// FILE: lib/entail/index.ts   (M5)
import type {
  Bound, Brief, Claim, ClaimFault, Entailment, NonEmptyReadonlyArray, ObsId, ObservationFault, Schema, Side,
} from "../contracts/index.js";
import type { Grounding, GroundFailure } from "../ground/index.js";

export type ClaimRead = { readonly ok: true; readonly claim: Claim } | { readonly ok: false; readonly fault: ClaimFault };
export declare function readClaim(g: Grounding, raw: unknown): ClaimRead;
export type RuleResult = { readonly ok: true; readonly entailment: Entailment } | { readonly ok: false; readonly fault: ClaimFault };
export declare function rule(g: Grounding, raw: unknown): RuleResult;                // re-reads its input through readClaim even though it is typed

export type AnswerFailure =
  | { readonly kind: "question-rejected"; readonly fault: ClaimFault }
  | { readonly kind: "draft-not-an-array" }
  | { readonly kind: "draft-too-long"; readonly count: number; readonly max: number }
  | { readonly kind: "hostile-input"; readonly message: string };
export type AnswerResult = { readonly ok: true; readonly brief: Brief } | { readonly ok: false; readonly failure: AnswerFailure };
export declare function answer(g: Grounding, rawQuestion: unknown, rawDraft: unknown): AnswerResult;

export declare function renderEntailment(schema: Schema, e: Entailment): string;
export declare function renderBrief(schema: Schema, brief: Brief): string;

export type NotReproduced =
  | { readonly kind: "missing-evidence"; readonly id: ObsId }
  | { readonly kind: "evidence-rejected"; readonly fault: ObservationFault }
  | { readonly kind: "support-conflicted" }
  | { readonly kind: "bound-differs"; readonly side: Side; readonly carried: Bound; readonly rederived: Bound }
  | { readonly kind: "kind-differs"; readonly carried: Entailment["kind"]; readonly rederived: Entailment["kind"] }
  | { readonly kind: "unmet-differs" }
  | { readonly kind: "core-satisfiable" };
export type Reproduction =
  | { readonly kind: "reproduced"; readonly silentSides: readonly Side[] }    // every evidence-backed bound re-derived from the carried evidence alone; silentSides = bounds with empty support, which the carried evidence cannot certify
  | { readonly kind: "not-reproduced"; readonly reason: NotReproduced }
  | { readonly kind: "uncertifiable-silence" };                               // an `ungrounded` claim: an absence cannot be certified from a subset
export interface RecheckFinding { readonly position: "answer" | number; readonly result: Reproduction }
export type RecheckResult =
  | { readonly ok: true; readonly intact: boolean; readonly findings: NonEmptyReadonlyArray<RecheckFinding> }
  | { readonly ok: false; readonly failure: GroundFailure };
export declare function recheck(schema: Schema, brief: Brief): RecheckResult;     // the HOLDER supplies the schema; the Brief does not carry its own
```

### 4.2 The closed enum at the centre: `Entailment`

For a claim `C` (an extent) about a quantity `f`, let `B` be the schema-only extent of `f` (what its declared invariants and
sum rules imply with **no** observations) and `E` the extent the snapshot's observations imply. Everything is set
relations between `E`, `B` and `C`:

| Variant | Holds when | Who/what it tells | **What it refuses** |
|---|---|---|---|
| `entailed` | `E ⊆ C` | the claim may be said as drafted | to exist without a `support` set that re-derives each evidence-backed bound; to carry `unmet`/`openEnds`/`core` (disjoint, not optional); to be influenced by anything but `E` and `C` — not the source label, not how many documents agree, not their order, not time |
| `weakened` | `E ∩ C ≠ ∅`, `E ⊄ C`, `E ≠ B` | say `E`, not `C`; the cut is `unmet` | to emit the tested extent (only `established = E` is emittable); to hide the cut (`unmet` is non-empty by type); to claim more than `E`; to be emitted when the evidence is silent (that is `ungrounded`) |
| `contradicted` | `E ∩ C = ∅` | the claim is ruled out | to be a bare "no": it carries `E` and the support that rules `C` out; to be emitted when the evidence conflicts (that is `conflicted`) |
| `ungrounded` | `E = B` | say nothing about `f`; name what is missing | to emit any extent, support, or number the evidence did not supply (disjoint); to be a bare refusal (≥ 1 `OpenEnd` is required by type); to be "fluent filler" |
| `conflicted` | the tree's observations are jointly unsatisfiable | refuse the tree; name an irreducible core | to choose a winner (no source order, recency, or vote exists); to carry `established`/`support`; to name an observation outside the irreducible core; to spread past its own tree |

**Precedence and the partition.** `conflicted` → `ungrounded` → `entailed` → `contradicted` → `weakened`; a claim with
`B ⊆ C` never reaches the table (it is rejected first as `vacuous-claim`: it rules nothing out). For every non-vacuous
claim the five rows are mutually exclusive and exhaustive. That is not asserted; it is a property compared against a
brute-force enumerator on every generated instance (§6 M4/M5, §8).

**Why five and not three.** `entailed`/`contradicted`/`silent` would be a yes/no/unknown. The two variants that earn the
project its place are the ones a chatbot cannot represent: `weakened` (a *different, weaker* claim than the one drafted
— there is a stable middle between answering and refusing) and `conflicted` (evidence that is inconsistent *only
jointly*). `ungrounded` is the typed "I can't answer that from what I have", carrying its gap.

### 4.3 Definitions the milestones share (single source of truth)

* **Extent algebra.** `lo`/`hi` are integers or `null` (unbounded). `meet` intersects; empty is `undefined`. `A ⊆ B` iff `B.lo` is
  `null` or `A.lo` is non-null and `≥ B.lo`, and likewise for `hi`. `sumForward([x1..xn])` has `lo` = `null` if any `xi.lo` is
  `null`, else `Σ xi.lo`; `hi` likewise. `sumBackward(z, xs, i)` has `lo` = `null` if `z.lo` is `null` or any `xj.hi` (j ≠ i) is
  `null`, else `z.lo − Σ_{j≠i} xj.hi`; `hi` = `null` if `z.hi` is `null` or any `xj.lo` (j ≠ i) is `null`, else `z.hi − Σ_{j≠i} xj.lo`.
* **The schema forest.** A field is `base` (declares a `baseline`) or `derived` (is the sum of ≥ 2 operand fields, declares none).
  **Read-once:** every field is an operand of at most one sum (and at most once in it), the sums are acyclic, and the
  operands of a sum share its `unit`. A *tree* is the set of fields connected through sums; `root` is the field that is an
  operand of nothing.
* **Baseline `B(f)`** = the fixpoint of bounds propagation over the schema with **no** observation. **`E(f)`** = the fixpoint
  with the snapshot's observations (each observation `meet`s into its field's domain; sums propagate forward and backward
  to fixpoint; an empty domain anywhere makes that **tree** `conflicted`). Propagation terminates in ≤ `4·(fields+1)+8` passes; an
  overrun is an internal invariant violation (throws), never a result.
* **Support of a bound.** For a consistent tree and a side, the subset of the tree's observation ids reproduced by deletion:
  start from all of the tree's ids in ascending order, try dropping each, keep the drop if `E.side(f)` is still at least as tight
  as before. The survivor is **irreducible** (dropping any one element loosens the bound). `[]` means the bound needs no
  evidence (schema-implied, or unbounded).
* **Core of a conflict.** The same deletion, with predicate "the tree is still unsatisfiable". Irreducible: every strict subset is
  satisfiable. A core has ≥ 2 observations — **a single observation that meets its field's computed baseline never conflicts
  by itself** (checked, §8), which is why `outside-baseline` can reject at intake with no conflict machinery.
* **Open ends** for a claim and a side: for each side in `unmetSides(E, C)` whose support for `f` is empty, every *base* field in
  `f`'s subtree whose own support for that side is empty. It is *necessary-ish, not a promise*: bounding every listed `hi` end bounds `f.hi`
  (property-tested, §8); it does not say the claim would then be entailed (case 06, and the evidence may then contradict it).
* **Digit-containment (D8).** Every non-null bound `v` of an observation's extent must equal some maximal ASCII-digit run in its `quote`
  taken as an integer `|v|`. The sign is not checked.

### 4.4 Faults vs rulings

A **ruling** is one of the five `Entailment`s about a claim that is *inside the language*. A **fault** says why something never reached a
ruling: a malformed or out-of-vocabulary claim, an observation that failed intake, a schema that is not a read-once forest. Faults are
never `Entailment`s and never throw. `answer()` collects draft-claim faults in `Brief.rejected`; a rejected *question* fails the whole
`answer()` (there is no answer without a question).

---

## 5. Engine layers, signatures, and who owns what

`lib/contracts` → `lib/extent` → `lib/ground` → `lib/entail` → `domains/order-desk` → `scripts/`, `components/`, `app/`. One direction, no cycle, enforced by a layer table (M1).
`lib/contracts` imports nothing; `lib/extent` imports `contracts`; `lib/ground` imports `contracts`, `extent`; `lib/entail` imports `contracts`, `extent`, `ground`;
`domains/order-desk/**` imports only `lib/*/index` — and its **drafter imports nothing from `lib/` but the `Claim`/`FieldId` types and `fieldId`**, because a
chatbot does not have the engine (D2).

**Function ownership — every function named has exactly one owner** (the control-tower defect "a function the plan names but no milestone builds"; checked mechanically, §8):

| Milestone | Owns |
|---|---|
| M1 | `fieldId` `obsId` `compareIds` `isNonEmptyArray` `assertNeverEntailment` `assertEntailmentWellFormed` |
| M3 | `checkExtent` `meet` `isSubset` `isSameExtent` `unmetSides` `sumForward` `sumBackward` |
| M4 | `readSchema` `ground` `extentOf` `supportOf` `openEndsOf` `declOf` (+ internal `solve`, `shrink`) |
| M5 | `readClaim` `rule` `answer` `renderEntailment` `renderBrief` `recheck` |
| M6 | `fluentDraft` `renderFluent` `runScript` `CANON_SCRIPT` `ORDER_DESK_SCHEMA` `OBSERVATIONS` `SNAPSHOTS` `QUESTIONS` |
| M8 | `computeDemoView` and the formatters |
| M9 | the citations test |

---

## 6. Nine milestones

House shape (M1 contracts, M2 deploy, M3–M5 engine layers, M6 domain, M7 failure suite, M8 demo, M9 deliverables). **No deviation in the
shape.** One *assignment* choice worth stating: M3 is deliberately small and pure (the extent algebra), because it is the one layer whose
correctness can be proved *exhaustively* rather than by sampling, and every layer above leans on it. Each milestone is one PR on branch
`mN-<slug>`, ends with its own ADR (`.genesis/decisions/000N-<slug>.md`), and is verified by an independent L4 pass before its
`chore(genesis): mark MN done` bookkeeping PR. Token budget: 9 × 150 000. **Every sabotage listed is "must go red" for the independent
verifier; those marked †† were reproduced on the throwaway model of §8 (counts are failing instances out of 2 000) and the builder must re-run them on the real code.**

### Directory ownership — the single source of truth

| Owner | Exact paths | Frozen after |
|---|---|---|
| **G3 scaffold** (not a milestone) | `package.json` `package-lock.json` `tsconfig.json` `tsconfig.lib.json` `vitest.config.ts` `eslint.config.mjs` `next.config.ts` `vercel.json` `.gitignore` `.env.example` `.github/workflows/ci.yml` `scripts/register-ts-loader.mjs` `scripts/ts-loader-hooks.mjs` `app/layout.tsx` `app/page.tsx` (placeholder) `app/globals.css` `tests/smoke.test.ts` `tests/lockfile.test.ts` `README.md` (stub) `.genesis/{PLAN.md,DONE.html,checkpoints/CURRENT.md,decisions/.gitkeep}` | G3 |
| **M1** | `lib/contracts/**` (sources and their tests) | M1 |
| **M2** | `app/api/health/**` (route and its tests), the single `Live:` line in `README.md` | M2 |
| **M3** | `lib/extent/**` | M3 |
| **M4** | `lib/ground/**` | M4 |
| **M5** | `lib/entail/**` | M5 |
| **M6** | `domains/order-desk/**`, `scripts/demo-order-desk.ts` | M6 |
| **M7** | `tests/failures/**` | M7 |
| **M8** | `app/page.tsx`, `app/globals.css`, `app/milestones.ts`, `app/milestones.test.ts`, `components/order-desk/**` | M8 |
| **M9** | `docs/**`, `README.md` (rewrite), `tests/docs/**` | M9 |
| **Bookkeeping exception** | `.genesis/DONE.html`, `.genesis/checkpoints/CURRENT.md`, status lines in `app/milestones.ts` — edited **only** by `chore(genesis): mark MN done` PRs after independent L4 APPROVE; never part of a milestone's freeze boundary | — |

**Handoff files — the only paths with more than one writer, each with a stated limit:** `app/page.tsx` and `app/globals.css` (G3 creates placeholders; M8 rewrites them; M8 may not touch `app/layout.tsx`) and `README.md` (G3 stub; M2 adds the single `Live:` line; M9 rewrites). Everything else has exactly one owner; a brief that names a second owner for any other path is wrong.

`vercel.json` is **G3's**, not M2's (a deliberate resolution: the copy source already has it committed at scaffold, and a path owned by two
owners is how a brief names the wrong one). M2 *pins* it with a test instead of owning it. A milestone may not edit another's paths;
`git diff main -- <earlier paths>` must be empty on every milestone branch, checked after every file, not only at the end.

### M1 — Contracts: `Entailment`, `Claim`, `Observation`, `Schema`, `Brief`
* **Scope:** every type in §4.1's M1 block, the three mint/order functions, constants, `assertNeverEntailment`, `assertEntailmentWellFormed`.
  No engine logic. `assertEntailmentWellFormed` is table-driven: *required* — entailed/contradicted: `established`,`support`; weakened:
  `established`,`support`,`unmet`(non-empty),`openEnds`(array); ungrounded: `openEnds`(non-empty); conflicted: `core`(non-empty); *forbidden* — entailed/contradicted: `unmet`,`openEnds`,`core`; weakened: `core`; ungrounded: `established`,`support`,`unmet`,`core`; conflicted: `established`,`support`,`unmet`,`openEnds`.
* **Owns:** `lib/contracts/**` — `ids.ts limits.ts bounds.ts schema.ts observation.ts claim.ts entailment.ts faults.ts brief.ts non-empty-array.ts integrity.ts index.ts __tests__/`.
* **Must refuse:** (a) every disjoint-family violation — an `ungrounded` carrying `established`/`support`/`unmet`/`core`, a `conflicted` carrying `support`/`established`/`unmet`/`openEnds`, an `entailed`/`contradicted` carrying `unmet`/`openEnds`/`core`, a `weakened` carrying `core` or missing `unmet`, a base field with a `sum`, a derived field declaring a `baseline`, a `sum` with fewer than two operands, an `ungrounded` with no open end, a `conflicted` with an empty core — **via every non-literal route** (intermediate binding, spread, function return, `satisfies`, generic helper, `Object.assign`, array element). *Written in round 1:* adaptive-agent's M1 shipped an excess-property-only claim and L4 reproduced seven bypasses (its ADR 0001 Decision 1). **One proof per `?: never` field (17 of them), each through a *non-fresh carrier* and differing from a valid value in that field only** — §8 defect 7: a fresh-literal or explicit-property-spread proof stays green when the `?: never` is deleted, because excess-property checking fires anyway; the 17-of-17 sabotage (each field deleted alone turns exactly its own proof red) is part of the check. (b) a fifth `Entailment` variant compiling silently (proof on a **local stand-in**, not the real union). (c) a cast-built value passing `assertEntailmentWellFormed` — unit tests for all 25 required/forbidden cells (5 per variant) and the three non-empty cells (`weakened.unmet`, `ungrounded.openEnds`, `conflicted.core`). (d) **HONEST LIMIT tests**: `Extent` admits `lo > hi` at the type level; `fieldId("anything")` admits any string; `Operands` admits a repeated field — each pinned with the M3/M4 refusal that closes it. (e) a **closed module graph**: every import under `lib/**` resolves, by real path, inside `lib/**` or an explicit allowlist (technique: control-tower's `import-containment.test.ts`, which resolves by `realpathSync`, not by `../` syntax) **plus** its `file-inventory.test.ts` companion (no non-`.ts` file under `lib/`), plus the layer table of §5. (f) **determinism guard**: an AST walk (not a regex) over every non-test source under `lib/**` and `domains/**` failing on the identifiers `Date`, `performance`, `Math.random`, `crypto`, `fetch`, `XMLHttpRequest`, `WebSocket`, `process`, `setTimeout`, `setInterval`, `queueMicrotask`, on a dynamic `import()`, and on `localeCompare`; it fails closed on a file it cannot parse. Its header states its one named limit: `globalThis["Da"+"te"]` and `eval` are not caught. **Not built, on purpose:** a name-scan for "confidence"/"score"/"threshold" in sources — control-tower's M1 took five rounds on that class of scanner; the absence of a scalar is proven *behaviourally* in M4 (every number in every `Entailment` is an integer).
* **Falsifiable check:** `npm test -- lib/contracts` and `npm run typecheck`. Sabotage: delete `established?: never` from `ungrounded` → TS2578 at *its own* carrier proof and no other; delete `core?: never` from `weakened` → TS2578 at the `weakened`-core proof only (repeat for all 17); add a sixth variant to the stand-in → every `assertNeverEntailment` site fails to compile; drop one cell of `assertEntailmentWellFormed`'s table → its named test goes red; insert `import "node:fs"` into a `lib/contracts` source → the containment test names the file; insert `Date.now()` anywhere under `lib/` → the determinism guard names the file.

### M2 — Deploy skeleton (deployed now, never last)
* **Scope:** `GET /api/health` runs a real self-check against `lib/contracts`: `assertEntailmentWellFormed` on (1) a well-formed `conflicted` → `ok`; (2) a cast-built `ungrounded` carrying `established` → `unexpected-field`/`ungrounded`/`established`; (3) a cast-built `weakened` whose `unmet` is `[]` → `empty-array`/`weakened`/`unmet`; (4) a cast-built `conflicted` missing `core` → `missing-field`/`conflicted`/`core`. Reports `VERCEL_GIT_COMMIT_SHA` or the literal `"unknown (local dev)"` — never a guessed SHA. `export const dynamic = "force-dynamic"`; `runtime = "nodejs"`. Returns **503** with `status: "degraded"` if any check fails. Adds `app/api/health/__tests__/vercel-config.test.ts` pinning `{"installCommand":"npm ci","buildCommand":"npm run build"}` exactly (Vercel's zero-config preset runs plain `next build`, i.e. Turbopack, which cannot resolve `lib/`'s `.js` imports — a failure mode adaptive-agent's ADR 0002 Decision 3 is cited for in autonomous-company-simulator's plan).
* **Owns:** `app/api/health/**`, the `Live:` line in `README.md`. **Needs a Vercel account — a human step.**
* **Must refuse:** `200` on a bare liveness ping; a fabricated SHA; deploying from a dirty tree (the CLI uploads the working tree while `VERCEL_GIT_COMMIT_SHA` reads `HEAD` — recorded as a rejection cause in autonomous-company-simulator's plan; rule: commit everything, `git status --short` empty, `vercel deploy`, then diff the live `commit` against `git rev-parse HEAD`, **every** deploy); the framework preset's default build.
* **Falsifiable check:** `curl -sf <live>/api/health` → 200, body `commit` equals `git rev-parse HEAD` of the deployed clean tree, `checks.contracts.pass: true`. Sabotage (local `next dev`, reverted): disable the `unmet` branch of `assertEntailmentWellFormed` → `503`. A route test calls `GET` directly and asserts both branches (mocking the guard to fail → 503). The independent verifier confirms webpack by finding no `turbopack` string in the served runtime chunk.

### M3 — Extent algebra (`lib/extent/**`)
* **Scope:** the seven §5 functions; definitions of §4.3. Pure, total, framework-free.
* **Owns:** `lib/extent/**` — `check-extent.ts meet.ts subset.ts unmet.ts sum.ts index.ts __tests__/{check-extent,hostile-input,meet-subset,unmet,sum-exactness,boundaries,architecture}.test.ts + fixtures.ts`.
* **Must refuse:** a non-integer, `NaN`, `±Infinity` or `|v| > MAX_MAGNITUDE` bound (and it normalises `-0` to `0`, so two extents that are equal compare equal); `lo > hi`; a getter read twice (each field of the raw object is read **exactly once** into a fresh copy — technique recorded in adaptive-agent's ADR 0003 Decision 4); `null` treated as `0` anywhere; `sumBackward` throwing on an out-of-range index (it returns "no information" — never a tightening).
* **Falsifiable check:** `npm test -- lib/extent`. Three layers: (1) **exhaustive, not sampled** — over the full grid of extents with every side ∈ {null, −2…3} (34 valid extents), `sumForward` and `sumBackward` for **2 operands** (34³ ≈ 39 000 combinations), and over the reduced grid {null, 0…2} (13 extents) for **3 operands** (13⁴ ≈ 28 600), equal a brute-force enumeration of integer assignments (a side is expected `null` **iff widening the enumeration cap moves the oracle's bound** — not "the oracle reaches its cap", which misreports a finite bound that happens to equal the cap and, in the backward direction, misreports every unbounded side: the first version of the model's harness got 24 276 of 79 764 backward/forward checks wrong that way; with cap-widening the same grids give **0 mismatches in 139 083 checks** and no holes in any sum set, §8). (2) **Boundaries N / N+1** for `MAX_MAGNITUDE` and a 63-operand-deep worst case, cross-checked against `BigInt` (all intermediate values stay below 2⁴⁸ given `MAX_FIELDS`/`MAX_MAGNITUDE`, an invented, disclosed bound). (3) A table for `isSubset`/`meet`/`unmetSides` over every null/non-null combination. Sabotage ledger: swap `lo`/`hi` in `sumBackward`; treat `null` as `0`; `<` for `<=` in `isSubset` at the boundary; make `unmetSides` report both sides always (†† 738 failing) — each must go red.

### M4 — Ground: schema, observations, propagation, support, core (`lib/ground/**`)
* **Scope:** the §5 M4 functions; the algorithm of §4.3. **Reads each untrusted input exactly once** into plain data. `ground` validates the schema, validates each observation (all of §4.1's `ObservationFault`s), computes `B` and `E`, finds each tree's state, and for a conflicted tree its core. `supportOf` and `openEndsOf` are computed on demand from the `Grounding` alone (it is data; there is no hidden state). Output is **deep-frozen**, recursively (adaptive-agent has a failure case named `14-freeze-is-one-level-deep`; the builder tests nested arrays, not only the top object).
* **Owns:** `lib/ground/**` — `read-schema.ts read-observation.ts solve.ts shrink.ts support.ts open-ends.ts decl.ts ground.ts index.ts __tests__/{schema-faults,observation-faults,hostile-input,oracle-exactness,monotonicity,order-independence,locality,single-observation,support-certificate,core,open-ends,integer-only,immutability,architecture}.test.ts + fixtures.ts + oracle.ts`.
* **Must refuse:** each of the eight `SchemaFault`s and six `ObservationFault`s (counting `hostile-input` in each); a diamond (a field in two sums) as `operand-reused`; a self- or mutual-cycle as `rule-cycle`; a sum across units as `unit-mismatch`; a digit in no quote as `number-not-in-quote`; every occurrence of a repeated observation id (so input order cannot choose a winner); a hand-built cyclic or self-referential *schema* (`rule-cycle`) must never make the parent walk loop (the walk is bounded by the field count); a result that depends on the order of observations, the order of fields, or the order of operands within a sum; `localeCompare`; a conflict in one tree changing any answer in another (**locality**).
* **Falsifiable check:** `npm test -- lib/ground`. Three layers, because **whole-system properties do not reliably catch deleted refusals** (§8: on the model, deleting `operand-reused`, `rule-cycle` and `unit-mismatch` tripped **0 of 3 000** property instances, because the generator only produces valid schemas): (1) **table-driven, masking-aware** — each fault's fixture violates *only* that rule (e.g. the `unit-mismatch` fixture is acyclic and read-once; `outside-baseline` uses a base field whose extent is otherwise well-formed and quoted). (2) **Oracle exactness** over a seeded generator (hand-rolled `mulberry32`; no new dependency): per tree, `E(f)` and `B(f)` equal a brute-force enumeration of the tree's worlds for every field, including `conflicted` ⇔ no world; value sets are contiguous (the interval representation is exact — the model asserted this per field). Unboundedness is detected by cap widening (M3). The generator is **proven able to reach** every property's branch (a coverage assertion — model run over 8 000 instances / 32 000 rulings: all five rulings reached, two-level trees in 1 255 instances, cores of size 2 (7 010), 3 (894) and 4 (42)). (3) **Properties**: *monotonicity* (adding an observation either leaves `E ⊆` the old `E` or makes the tree conflicted, and never un-conflicts it; `entailed`/`contradicted` rulings never move to a non-conflicted different kind); *order independence* (reversing/permuting observations, fields, operands: identical extents, supports, cores); *locality*; *support certificate* (for every bound, re-grounding with **only** that bound's support reproduces it, and dropping any one element does not — checked with the oracle, not with `ground`); *core* (unsatisfiable by the oracle, and every strict subset satisfiable by the oracle); *single-observation* (an observation that meets its field's `B` never conflicts alone — 36 802 instances, 0 violations on the model; one that does not always does); *open ends* (soundness: each listed end has empty support; completeness: every unmet side with empty support has ≥ 1 listed end; sufficiency on `hi`: bounding every listed `hi` end bounds `f.hi` unless the tree turns conflicted); *integer-only* (every number in every produced structure is an integer). Sabotage ledger (each must go red): drop backward propagation (†† 310) · drop forward (†† 1 347) · no deletion-shrink, return the full pool (†† 1 599) · core = first two ids (†† 440) · support computed for the wrong side (†† 1 020) · unsorted pool (†† 660) · open ends by "null side" instead of "empty support" (†† 926) · open ends over every claim-bounded side instead of unmet sides (†† 236) · conflict marks every tree (†† caught: the property run throws) · **delete `operand-reused` / `rule-cycle` / `unit-mismatch` (†† 0 of 3 000 — table only)**.

### M5 — Entail: claim, ruling, brief, render, recheck (`lib/entail/**`)
* **Scope:** the §5 M5 functions. `readClaim` reads the claim once, validates the extent with `checkExtent`, requires a known field and rejects a vacuous claim. `rule` applies §4.2's table (precedence `conflicted → ungrounded → entailed → contradicted → weakened`); it **calls `assertEntailmentWellFormed` on every `Entailment` it returns** and throws on an internal violation (build requirement recorded from adaptive-agent ADR 0001/0005 via autonomous-company-simulator's plan). `answer` rules the question first, then each draft claim; draft faults go to `Brief.rejected`; `Brief.evidence` is exactly the observations some support or core names, sorted by id. `renderEntailment`/`renderBrief` are pure templates over `Entailment` and `Schema` labels/units (no free text, no model). `recheck` is the holder's checker: it takes the **holder's** schema and the Brief; it re-runs `ground(schema, brief.evidence)` (so the carried evidence passes intake again, including digit-containment) and, for each ruling, re-derives each side's bound from **only that side's support**, recomputes the kind and (for `weakened`) `unmet` from the re-derived extent and the carried `tested`, and checks a conflict's core is unsatisfiable on its own. It never sees the snapshot. A `weakened`'s `openEnds` and every empty-support bound are *absences*: they are never certified, and `silentSides` says which sides they are.
* **Owns:** `lib/entail/**` — `read-claim.ts rule.ts answer.ts render.ts recheck.ts index.ts __tests__/{claim-faults,rule-table,partition,answer,render-properties,recheck,integrity,immutability,architecture}.test.ts + fixtures.ts`.
* **Must refuse:** a vacuous claim as a ruling (it is a `vacuous-claim` fault — and a **table fixture** must pin it: on the model its deletion tripped 0 of 2 000 until an unrelated open-end property happened to catch it, 152 of 2 000, so it is incidental, not guarded); an `Entailment` that fails `assertEntailmentWellFormed`; a `weakened` that emits the *tested* extent (††weakened keeps the draft: 776); the precedence of `ungrounded` over `entailed` is **unobservable through the public API** — the only claims for which both hold (`E = B ⊆ C`) are exactly the vacuous ones, which `readClaim` rejects first — so the plan claims to guard the *vacuity rejection* (a table row) and does **not** claim to guard that ordering (an equivalent mutant; the model's `noungrounded` mutant is a different thing: it removes the whole variant); a ruling that depends on `source`; a `render` output containing a digit token that is in no field of the entailment (it may add words, never numbers); a `recheck` that returns `reproduced` for an *overstated* bound; a `recheck` that ever asserts anything about an `ungrounded` claim except `uncertifiable-silence`; a `Brief` that carries the schema (the holder supplies it; a carried schema would make `recheck` circular).
* **Falsifiable check:** `npm test -- lib/entail`. (1) **Rule table** over every (E, B, C) relation with masking-aware fixtures; (2) **Partition property** against the brute-force oracle: for every generated (schema, snapshot, claim) the engine's kind equals the oracle's, with the same generator and coverage assertion as M4 (model: 0 mismatches in 8 000 instances; every sabotage below red); (3) **Render properties**: for every variant the rendered text contains the formatted `tested` and `established` extents, and for `weakened` the cut (`unmet`) — a rendering may not drop a disclosed gap; the digit-token set of the output ⊆ the digits of the entailment's own fields and referenced ids; exact expected strings for the §7 fixtures. (4) **Recheck**: on honest Briefs (generated) every positive ruling is `reproduced` and every `ungrounded` is `uncertifiable-silence` (model: 15 140 rulings, 0 deviations); changing any bound **that still cites its support** is caught as `bound-differs` — tightened by 1 (model: 12 123 of 12 123) **or loosened by 1** (9 977 of 9 977; this is what M8's forge control does), a flipped `unmet` as `unmet-differs` (2 644 of 2 644); the limits are *pinned, not hidden*: a Brief that drops a bound **and its support together** claims silence and is `reproduced` with that side in `silentSides` (model: 4 850 of 9 977 such forged omissions undetected, the rest changing the kind or `unmet`), and a Brief whose carried **observations are fabricated** is certified (authorship is asserted — agent-trust-layer's problem, and the reason the quotes are carried) — that is case 02. (5) `integrity.test.ts` mocks `assertEntailmentWellFormed` to fail and asserts a throw, **plus** a real un-mocked cast-built contaminated value (the two-way proof). Sabotage ledger: `nocontradicted` (†† 664) · `noungrounded` (†† 885) · `weakenedkeepsdraft` (†† 776) · `unmetall` (†† 738) · render adds a constant "typically 2 days" → the digit-set property red · `recheck` compares only `kind` → bound-tamper red · `recheck` reads the snapshot → the architecture test (it must import only `ground`'s public API) red.

### M6 — Domain: the order desk (`domains/order-desk/**`, `scripts/demo-order-desk.ts`)
* **Scope:** one desk, one international order, four quantities (days): `packDays`, `transitDays`, `customsDays` (base, baseline `[0, ∞)`) and `deliveryDay = packDays + transitDays + customsDays` (derived; no baseline). Four canonical observations `o1`–`o4` with real quotes and display sources (§7); `SNAPSHOTS` = the id-sets of the four scripted snapshots (`{o1,o2}`, `{o1,o2,o3}`, `{o1,o2,o3,o4}`, `{o1,o2,o4}`); `QUESTIONS` = a five-item menu (`delivery ≤ 12` · `delivery ≥ 4` · `delivery ≤ 3` · `customs ≤ 3` · `delivery = 14`); `fluentDraft(observations, question)` — the **stand-in for a model** — and `renderFluent` (its confident paragraph); `CANON_SCRIPT` (§7); `runScript`. **The drafter's rule is fully specified, so it cannot be accused of being rigged:** for each base quantity with observations it states the midpoint (rounded down) of the `meet` of those extents' finite sides; with none it states a declared **model prior** (`PRIOR_CUSTOMS_DAYS = 2`, labelled as such); for `deliveryDay` it states the midpoint of a direct observation if one exists, else the sum of the three states. It states each as an *exact* value.
* **Owns:** `domains/order-desk/**` — `schema.ts observations.ts questions.ts drafter.ts script.ts index.ts __tests__/*`, and `scripts/demo-order-desk.ts`.
* **Must refuse:** to contribute **any** entailment rule — `domains/order-desk/**` must not construct an `Entailment` (an AST scan: no object literal with `kind` equal to one of the five variant names), compute a bound, or import anything below `lib/*/index`; **`drafter.ts` imports no engine function at all** (only the `Claim`/`FieldId` types and `fieldId`) — a drafter that borrowed `lib/extent` would be the gate in a costume, and control-tower's ADR 0006 Decision 4c is the cautionary precedent for a load-bearing rule placed in `domains/`; a misspelt field must not compile (`@ts-expect-error`).
* **Falsifiable check:** `npm run demo:order-desk` prints, per scripted step, the chatbot's paragraph, the rendered `Brief`, and the `recheck` result, and **exits non-zero unless all five `Entailment` kinds were observed**, **every `established` extent equals an independent oracle inside the script** (a ~30-line brute-force enumerator of the four-field world that does **not** import `lib/ground` or `lib/extent`), and `recheck.intact` on every Brief. Also `npm test -- domains/order-desk`: every step's kinds equal the §7 table; the drafter's claims equal the §7 table. Sabotage (reverted): flip `sumBackward`'s sign → the script's oracle check exits non-zero at step 6 (where customs is derived); change `PRIOR_CUSTOMS_DAYS` → only the *drafter* column of the §7 table moves, no `Entailment` does (proves the engine does not read the prior).

### M7 — The failure suite (`tests/failures/**`) — 10 cases
* **Scope:** the ten cases of §11 as `tests/failures/01-…` to `10-…`, each against the public API of `lib/*/index` and `domains/order-desk/index` only. Each file's header states `KIND: PROVES | DISCLOSES | HONEST PARTIAL PIN`, the design decision (D#) it traces to, and **what would make it fail**. **Case 01 is the project's deliberate failure test.** At least five are sabotaged for real against the *shipped* source and restored byte-for-byte; `git diff main -- lib domains app` stays empty throughout.
* **Owns:** `tests/failures/**` — `01-…test.ts` … `10-…test.ts`, `helpers.ts`. May import `lib/ground/__tests__/oracle.ts` read-only.
* **Must refuse:** to claim a limit is closed when it is not; a case that passes without exercising its own stated limit; restating an M3–M5 test without new scale or a new layer; any edit under `lib/**`, `domains/**`, `app/**`.
* **Falsifiable check:** `npm test -- failures`; every case asserts a specific typed result, never "did not throw". Sketch risk, stated up front, as every sibling found its own sketch partly wrong on contact: **this plan's own sketch was partly wrong, and the model caught three of the errors before any builder did** (case 04's "sorted-first core", case 06's "closing the gap yields `weakened` or `conflicted`", case 09's "read-once is necessary") — see §8. Cases 02 and 08 are the two most exposed to becoming "a test that only checks the caller behaves"; the builder replaces a case rather than bending it, and records which.

### M8 — Interactive demo (`app/`, `components/order-desk/`)
* **Scope:** one page driving the real engine in the browser. **One pure bridge** (`components/order-desk/compute-demo-view.ts`) is the only file under `components/` that imports `lib/**`/`domains/**`; the component renders exactly what it returns. State is a single `useReducer` over `{ included: ObsId[], question: number, forge: ForgeChoice | null }`; **no `useEffect`, `useCallback`, `useMemo`, `setTimeout` or `async` anywhere** (control-tower ADR 0009 Decision 2 and memory-ledger ADR 0006 Decision 6 both checked this by grep). Controls: a checkbox per document `o1`–`o4` ("add the customs bulletin", "add the courier tracking page"); the five-question menu **and** a custom builder (quantity · at most/at least/exactly/between · number); a "Forge the Brief" control — it raises by one the established upper bound of the answer's ruling if that bound is finite and cites support, else of the first draft claim that has such a bound, and is disabled if none does — feeding `recheck`. The page shows, side by side: **left, "What a chatbot would say"** (the drafter's paragraph, `renderFluent`); **right, "What the system will say"** (`renderBrief`): the answer's badge and sentence, one card per draft claim with its kind, the cut named, the open ends, the support ids highlighted on the evidence list, and — for a conflict — a **pairwise table** computed by calling `ground` on every pair, triple and the full set ("6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted"), so the headline fact is computed on screen, not asserted. `app/milestones.ts` + `app/milestones.test.ts` (drift guard, decision-engine pattern) compare claimed-done milestones with `.genesis/DONE.html`.
* **Owns:** `app/page.tsx`, `app/globals.css`, `app/milestones.ts`, `app/milestones.test.ts`, `components/order-desk/**` (`compute-demo-view.ts`, `format-entailment.ts`, `format-evidence.ts`, `OrderDeskDemo.tsx`, `__tests__/`).
* **Must refuse:** to render a ruling, support id, core, or pairwise result the engine did not just produce for the snapshot and question on screen (no pre-baked transcript); to throw (`computeDemoView` returns `{ok}|{ok:false,error}`, with `try/catch` only as the *second* layer); to show a different Brief from `npm run demo:order-desk` for the same step; to hide the chatbot column when the system refuses.
* **Falsifiable check:** (1) **exhaustive, because the state space is finite**: all 16 subsets of `{o1..o4}` × all 5 menu questions = 80 states, each yields `ok: true`, `recheck.intact === true`, and the question's kind equals a brute-force oracle's classification computed in the test (the finite-state analogue of control-tower's cross-product, and stronger than a sampled check); every kind appears somewhere in the 80; (2) **forge**: in every state where the control is enabled, forging makes `recheck` report `bound-differs` for that ruling (a loosened bound that still cites its support — 9 977 of 9 977 on the model) — and in every state with an `ungrounded` card, `recheck` reports `uncertifiable-silence` for it; (3) on the deployed URL, with all four documents included and the question "by day 12", the page shows `conflicted` with the four-document core and the pairwise line above — **an independent verifier diffs that block with the last scripted step of `npm run demo:order-desk`**; (4) `renderToStaticMarkup` render-smoke tests over a handful of initial states (no jsdom; `vitest` stays `environment: "node"`); (5) a source scan (parsed, not grepped) for the banned hooks; (6) the click-to-re-render path is verified by hand against the live URL and recorded in `docs/WALKTHROUGH.md` (control-tower's disclosed gap, kept disclosed).

### M9 — Deliverables
* **Scope:** `README.md` (one-paragraph claim, live URL, clean-clone command, **Honest limits** listing every M7 case, the domains considered and not built), `docs/ARCHITECTURE.md` (stage by stage: "what it refuses and why", each refusal cited to a real file **and test name**), `docs/THESIS.md` (≤ 300 words), `docs/WALKTHROUGH.md` (the 90-second Loom script), `docs/NOTES.md` (process record), `tests/docs/citations.test.ts`.
* **Owns:** `docs/**`, `README.md`, `tests/docs/**`.
* **Must refuse:** a doc claim no test pins (control-tower's README admits nothing there checks a doc's claims against code — autonomous-company-simulator's plan closes that with a citations test, which this project adopts *from its plan*, unbuilt there); a thesis over 300 words; a milestone marked done that `DONE.html` disagrees with; restating a limit more strongly than a test pins it (this account's standing note: verifiers caught overstatement of a disclosed caveat three times).
* **Falsifiable check:** `cd "$(mktemp -d)" && git clone <repo> . && npm ci && npm run typecheck && npm test && npm run build`, **output pasted verbatim**, plus CI green on a fresh runner. `tests/docs/citations.test.ts`: every backticked `lib/**` / `tests/failures/**` test path in `README.md` and `docs/ARCHITECTURE.md` exists, and every quoted test name occurs as a substring of that file; `docs/THESIS.md` word count ≤ 300. Sabotage: rename a cited test file → red. The **Loom recording itself is a human step**; the plan delivers its script.

---

## 7. The canonical scenario (M6's `CANON_SCRIPT`, M8's headline) — numbers verified by execution of the throwaway model

Schema: `packDays`, `transitDays`, `customsDays` (base, unit `days`, baseline `[0, ∞)`), `deliveryDay` = their sum (derived). "Day N" = N days after the order.

| id | source (display only) | quote | extent |
|---|---|---|---|
| `o1` | Warehouse system | "Packed and dispatched within 1 to 2 days of the order" | `packDays ∈ [1, 2]` |
| `o2` | Carrier SLA sheet | "Standard international transit takes 3 to 5 days" | `transitDays ∈ [3, 5]` |
| `o3` | Customs bulletin | "Customs clearance takes 0 to 2 days" | `customsDays ∈ [0, 2]` |
| `o4` | Courier tracking page | "Courier tracking estimates delivery on day 14" | `deliveryDay ∈ [14, 14]` |

| Step | Snapshot | Question | Question's ruling | The chatbot's draft claims (exact values) → the gate's ruling on each |
|---|---|---|---|---|
| 1 | `o1 o2` | delivery **≤ 12** | **weakened** — established "at least 4" (lo support `o1 o2`; hi support `[]`); cut: the upper side; open end: `customsDays` upper | pack = 1 → weakened `[1,2]` · transit = 4 → weakened `[3,5]` · customs = 2 → **ungrounded** (open ends: lower and upper of `customsDays`) · delivery = 7 → weakened "at least 4" |
| 2 | `o1 o2` | delivery **≥ 4** | **entailed** — "at least 4", support `o1 o2` | (same four rulings as step 1) |
| 3 | `o1 o2` | delivery **≤ 3** | **contradicted** — established "at least 4" | (same) |
| 4 | `o1 o2 o3` | delivery **≤ 12** | **entailed** — established `[4, 9]`; lo support `o1 o2`; hi support `o1 o2 o3` | pack = 1 weakened · transit = 4 weakened · customs = 1 weakened `[0,2]` (lo support `[]`: the floor) · delivery = 6 weakened `[4,9]` |
| 5 | `o1 o2 o3 o4` | delivery **≤ 12** | **conflicted** — core `o1 o2 o3 o4` | all four claims **conflicted** (same core). *Executed:* all six pairs consistent; all four triples consistent; the four together are not |
| 6 | `o1 o2 o4` | **customs ≤ 3** | **contradicted** — established `[7, 10]`, support `o1 o2 o4` on both sides. **No document says 7 to 10; it is derived** (`14 − (1..2) − (3..5)`) | pack = 1 weakened · transit = 4 weakened · customs = 2 → **contradicted** `[7,10]` · delivery = 14 → **entailed** `[14,14]` (support `o4`) |

All five kinds appear (entailed: 2, 4, 6; weakened: 1; contradicted: 3, 6; ungrounded: 1; conflicted: 5). **The headline is step 5**: no two documents disagree and no three do;
the four jointly cannot be true — a conflict a pairwise comparator cannot see because none exists pairwise — and the gate neither picks the courier page nor averages: it names the four and refuses.
Step 1 is the moment the mechanic fires: the chatbot says "yes, around day 7"; the gate says "not from what I have; at least day 4; nothing on file bounds customs from above."

Sample renderings (illustrative; M5 pins exact strings): step 1 question — *"Not established: delivery (days from order) at most 12. What the evidence does establish: at least 4 days (from o1, o2). Withheld: the upper bound — no document bounds customs clearance from above."* Step 5 — *"Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another."*

---

## 8. Plan-internal consistency check — what I ran and what it found

**A. Mechanical type trace.** The four `ts` blocks of §4.1 were extracted from this file by `btc/check-plan.mjs` into `lib/contracts|extent|ground|entail/index.ts`
(each importing only from lower layers) and compiled with `autonomous-company-simulator`'s installed `tsc 7.0.2` under flags copied from its
`tsconfig.lib.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`). They pass. A fifth file of
**probe bodies** (`btc/probes.ts`, Appendix A) then makes `tsc` check that **every required field of every cross-layer type has a source in what the layer below returns**:
`Entailed`/`Contradicted` ← `Claim.extent` (`tested`) + `extentOf`'s `extent` (`established`) + `supportOf`'s `support`; `Weakened.unmet` ← `unmetSides` narrowed by
`isNonEmptyArray`, `Weakened.openEnds` ← `openEndsOf`; `Ungrounded.openEnds` ← `openEndsOf` narrowed; `Conflicted.core` ← `ExtentFailure.core` (already non-empty);
both arms of `ExtentRead` ← `Grounding.baseline`, `Tree.state` (`core`, `extents`) and the argument (`unknown-field.field`); `AnswerFailure.question-rejected.fault` and `Brief.rejected[i]` ← `RuleResult.fault` + the draft index;
`Brief.claims` ← `RuleResult.entailment`; `Brief.evidence` ← `Grounding.observations` filtered by the ids an entailment names; `recheck`'s re-derivation ← `ground(schema, brief.evidence)` + `extentOf`;
render's label/unit ← `declOf`; and an exhaustive `switch` over the five kinds. **Twenty-five `@ts-expect-error` proofs all fire** (an unused directive is itself an error): 8 at the literal site, and **17 through a non-fresh carrier, exactly one per `?: never` field**.
**Not vacuous — eleven sabotage runs each turned `tsc` red with the predicted code** (`btc/typesab.mjs`): `Ungrounded.openEnds`, `Conflicted.core` or `Operands` loosened to allow empty (TS2578 at its own proof); `Weakened.unmet` made optional (TS2578); a sixth variant added to the union (TS2339/TS2345 at the exhaustive switch);
the `Conflicted` probe dropping `core` and the `Weakened` probe dropping `unmet` (TS2741); the exhaustive switch losing `conflicted` (TS2345 `Conflicted` → `never`); `unmetSides` returning `string[]` (TS2322/TS2345); `supportOf` returning a bare `{ok}` (TS2339); `Grounding.baseline` renamed (TS2551 — which caught that my first probe set never read it, so §8A's earlier claim about `ExtentRead.baseline` had no probe; it has one now).
Then `btc/neverfields.mjs` removes each of the **17** `?: never` fields **one at a time** from the extracted block and runs `tsc`: **17 of 17 turn exactly their own proof red and nothing else** — see defect 7 for why that took a rewrite.

**B. Semantic model.** A throwaway Node model of §4 (`btc/model.mjs`, 289 lines; `btc/fuzz.mjs`, 249) plus a **brute-force oracle** that enumerates every integer assignment of a tree's base
fields was fuzzed (`btc/fuzz.mjs`, seeded `mulberry32`): **8 000 instances** (32 000 claim rulings; 2–4 base fields, 0–2 sum rules, 1 255 instances with two-level trees, 0–7 observations, 4 claims each), comparing at every instance: per-tree extents and baselines
against the oracle (exactness, contiguity), the five-way classification against the oracle, support sufficiency **and irreducibility**, core unsatisfiability **and irreducibility** (by the oracle, independent of the engine),
order independence (reversed observation order), monotonicity and the ruling lattice (entailed→{entailed,conflicted}, contradicted→{contradicted,conflicted}, conflicted→conflicted), `unmet` correctness, and open-end soundness / completeness / `hi`-sufficiency.
**0 violations of the properties as specified.** A second check (`btc/single.mjs`), 40 000 single observations: an observation that meets its field's computed baseline never conflicts alone (36 802), one that does not always does (3 198) — so a core always has ≥ 2 members.
Coverage of the generator, so the zero is not vacuous: of 32 000 rulings, 9 092 ungrounded, 7 946 conflicted, 5 167 weakened, 4 072 contradicted, 3 985 entailed and 1 738 rejected as vacuous; cores of size 2 (7 010), 3 (894) and 4 (42); 13 224 rulings with a non-empty support; 11 538 with at least one open end.
**Mutants confirmed the checks can fail** (†† marks in §6, failing instances of 2 000): no backward pass 310 · no forward pass 1 347 · no deletion-shrink 1 599 · core = first two 440 · wrong-side support 1 020 · unsorted pool 660 · null-side open ends 926 · all-sides open ends 236 · `unmet` always both 738 · no `ungrounded` 885 · no `contradicted` 664 · `weakened` keeps the draft 776 · tree-global conflict (the run throws).

**C. A recheck model** (`btc/recheck.mjs`, 4 000 instances): a checker that sees only (schema, one entailment, the evidence the Brief carries). 15 140 honest rulings: 0 not reproduced; every `ungrounded` flagged `uncertifiable-silence`. Tampering with a bound **that keeps its support**: tightened by 1 — **12 123 of 12 123** caught; loosened by 1 — **9 977 of 9 977**; a flipped `unmet` — **2 644 of 2 644**.
Forging an *omission* (drop a supported bound and its support, fall back to the schema-implied value): **4 850 of 9 977 not caught** (the other forgeries happened to change the kind or `unmet`). So `recheck` is not "sound-but-not-complete" in the naive sense I first wrote down: it catches *any change to a bound that still cites its support*, and it cannot catch *claiming less* (silence) or *fabricated evidence*. That precise shape is real, measured, and became case 02.

**D0. The M3 algebra, exhaustively** (`btc/m3grid.mjs`): `sumForward` and `sumBackward` exactly as §4.3 defines them, against brute force over the full grid {null, −2…3} for 2 operands (and `sumBackward` for every result extent) and the reduced grid {null, 0…2} for 3 operands: **79 764 + 59 319 checks, 0 mismatches**, and every enumerated sum set is contiguous (so an interval is an exact representation).

**D. The five scripted steps of §7** were executed on the model (`btc/script.mjs`, `btc/canon.mjs`); every number in §7 is from that run, including the 6/6 pairs and 4/4 triples that are consistent, and the derived `[7,10]` of step 6.

**E. Mechanical checks of this document** (`btc/check-plan.mjs`, Appendix A): every function named in §5's ownership table appears in exactly one row and in exactly one layer's declarations; every path in §6's ownership table is disjoint from every other (no prefix overlap) and every `lib/` directory named in §5 has exactly one owner; the layer table is acyclic and every `import type` in §4.1 points strictly downward; the thesis seed (§14) is ≤ 300 words (275); each of M1–M9 has its Scope / Owns / Must refuse / Falsifiable check; the ten failure cases are numbered 01–10. Two further scripts verify the type layer's own claims: `btc/typesab.mjs` (11 sabotages) and `btc/neverfields.mjs` (17 of 17).

**Defects the check found in my own draft (each changed the plan):**

1. **A derived field that declares its own baseline made "every unmet side with empty support names an open end" unsatisfiable** (seed 835): a declared floor on a sum can dominate the sum of its operands' floors, so evidence can raise every operand while the sum's bound stays schema-pinned with no leaf left to name. Fix: **derived fields declare no baseline** (`DerivedField.baseline?: never`), `B` is computed (D4).
2. **Open ends computed over every claim-bounded side listed ends on sides the claim already satisfied** (236 / 2 000). Fix: over `unmetSides` only.
3. **`SchemaFault: unsatisfiable-baseline` was unreachable** — a derived baseline is a sum of non-empty intervals, so `B` can never be empty. A rejection with no path to it is "a mechanism that does not exist" (the defect class the brief records in the siblings' M7 sketches); deleted.
4. **My case-04 sketch ("the engine names the sorted-*first* core") was wrong.** Deletion in ascending order drops early ids first, so the survivor is the *latest* core. On two disjoint conflicts (`k1,k2` on `packDays`; `m1,m2` on `transitDays`) the engine names `m1 m2`. D7 and case 04 now say so.
5. **My case-09 sketch ("read-once is necessary for exactness") was false as stated, and its replacement is subtler than I expected.** A shared-operand but acyclic schema (`x = a + b`, `y = a + c`) is propagated exactly (0 of 20 000 random instances inexact), so read-once is *sufficient, not necessary*. What goes wrong off a tree is **tightness, not soundness**: on a **diamond** (`x = a + b`, `y = a + c`, `z = x + y`, so `a` reaches `z` twice) propagation was *looser than the oracle in 3 529 of 30 000 random instances (11.8%)* — e.g. `c ≤ 4`, `z ∈ [3,7]`, `b ∈ [0,6]` gives `a ∈ [0,7]` where the true extent is `[0,3]` — and **never wrong the other way** (0 unsound, 0 missed inconsistencies in the same 30 000). So without read-once the gate would stay *safe* (it would only under-establish: `weakened` where the truth is `entailed`) but would stop being **exact**, and "the tightest entailed claim" (D5) would no longer be a true statement; "complete conflict detection" could no longer be *claimed* (none was seen missed in the same 30 000, but nothing would prove it). D4 and case 09 now say exactly that, and no more.
6. **Support depends on ids, not input order, and is not minimum**: with a one-observation route whose id sorts first, the survivor is the three-observation route (`["a1","a2","a3"]` vs `["z-direct"]`, same evidence). D7 and case 05 say so; `localeCompare` is banned (locale-dependent).
7. **My first type proofs for the disjoint families were worthless, and the trace proved it.** With a fresh literal *or* a spread-with-an-explicit-property (`{...ok, unmet: ["lo"]}`), deleting the `?: never` field left the proof **green for 16 of 17 never-fields** — excess-property checking fires anyway, so the proof never exercised the `?: never` (the one exception, `DerivedField.baseline`, only worked because its field arrived through the spread). This is the adaptive-agent ADR 0001 failure (an excess-property-only claim, seven bypasses at L4) reproduced in my own probe file. Only a **non-fresh carrier** — an intermediate binding assigned to the type — discriminates. M1 now requires **one carrier proof per never-field**, and the 17-of-17 sabotage above is the check. (A combined proof is also *masked*: a second never-field in the same carrier would keep it red after the first was deleted.)
8. **Whole-system properties do not guard three families of refusal** — `operand-reused`/`rule-cycle`/`unit-mismatch` (0 / 3 000, the generator emits valid schemas only), and `vacuous-claim` (0 / 2 000 until an unrelated open-end property happened to catch it, 152 / 2 000). Hence the table-driven, masking-aware layers in M4/M5. The plan does not claim the properties guard them.
9. **The oracle itself has an artifact the builder will hit, and I hit it twice.** "An unbounded side is one where the oracle reaches its cap" misreports a finite bound that coincides with the cap (a `9 = 7 − (−2)` with cap 9 made `ungrounded` look `weakened`; my fuzz now keeps the cap strictly above every finite bound), and in the *backward* direction it misreports every unbounded side (24 276 of 79 764 checks wrong in the first M3 harness). The correct rule, now in M3 and M4: **a side is unbounded iff widening the cap moves the oracle's bound**; with it, `btc/m3grid.mjs` is 0 / 139 083.
10. **`recheck` was first specified as "verifies the Brief", then as "certifies non-overstatement only"; both were wrong.** The model showed it catches *any* change to a bound that still cites its support — loosening as well as tightening (9 977 of 9 977), and a flipped `unmet` — and that it **cannot** catch a Brief that claims *less* (drops a bound and its support together: 4 850 of 9 977 undetected) or one whose carried observations are fabricated (no authentication exists). Specified accordingly, with `uncertifiable-silence` and `silentSides` as first-class results, an `unmet-differs` reason, and the provenance limit in case 02.
11. **`drafted` was the wrong name** for the extent under test, because the user's *question* is ruled through the same path and nobody drafted it; renamed `tested`.
12. **My case-06 sketch ("filling the named gap leaves `weakened`, or turns `conflicted`") was half wrong.** Executed: customs `≤ 30` leaves `weakened`, customs `[20,30]` gives `contradicted` (not `conflicted` — a conflict needs a *joint* impossibility), and customs `≤ 3` gives `entailed`. The case now pins all three.
14. **The mechanical ownership check (§8E) found three real omissions on its first run:** `app/page.tsx` and `app/globals.css` were owned by both G3 and M8 with no declaration (now a *Handoff files* paragraph, and the check allows exactly those three paths); M7's section had no **Scope** field (added); and `__tests__/` was parsed as an ownership path (the table now says "sources and their tests"). A plan that says "single source of truth" and fails its own check is the control-tower brief that named the wrong directory.
13. **The first sketch let `ground` take already-valid input and `answer` take typed input.** Both now take `unknown` and re-read (the typed signature has no slot for a hostile value; control-tower's and adaptive-agent's M3 both changed signature for this).

**F. Contradictions and gaps checked by reading.** *No two refusals contradict*: `weakened` "refuses to emit the tested extent" and `entailed` "emits the tested claim as drafted" never apply to the same claim — the table's `E ⊆ C` / `E ⊄ C` split separates them. *No parallel index-paired arrays* (control-tower's singular-severity defect): a `Brief` has one `claims` array and a `rejected` list that names its own index. *No caller-supplied derived state* (adaptive-agent's `priorState`): the only caller-supplied structures are the schema (configuration) and the observations (re-validated on every `ground` and again inside `recheck`). *Every contract field has a reader* (control-tower's `Heartbeat.at`, collected and never read): `Observation.source` ← `render` and the UI (and **proved unread by the engine**, case 08); `Observation.quote` ← digit-containment, `render`, the UI; `Support` ← `recheck` and the UI; `OpenEnd` ← `render` and the UI; `Tree.root` ← locality and the pairwise panel; `EntailmentBase.tested` ← `recheck` (kind re-derivation) and `render`. *Constants are named and bounded*: `MAX_MAGNITUDE 2⁴⁰` × `MAX_FIELDS 64` keeps every intermediate below 2⁴⁸ ≪ 2⁵³.

**G. Not verified.** Nothing is built; the model is not the build and will have bugs the build will find; the M7 sketch will be partly wrong on contact like every predecessor's (cases 02 and 08 flagged). The model has no quote handling, no hostile-input paths and no render, so M3's hostile-input behaviour, M4's digit-containment, and M5's render properties are specified here but **not** executed.

---

## 9. The single riskiest design decision

**The claim language is a deliberately decidable fragment — integer extents over read-once sum trees — chosen so that every ruling is checkable by enumeration, at the cost that the engine can say nothing about almost everything a chatbot says.**
A judge who wants "AI" watches an interval-bounds calculator rule four documents and four drafted numbers, and can reasonably call it a toy. *Why it is made anyway:* the alternative (a richer language) is a bigger system with a weaker proof — a gate nobody can falsify is the "score with no mechanism" the brief
disqualifies, one level up. *The mitigation is in the demo and the framing, not the prose:* the page shows the **drafter and the gate as two columns**, so the viewer sees that the language model's job is the *untrusted* half and the gate is the half that has to be right; the Loom says "no model here — the drafter is a stub, and any model would
slot in where it sits"; and **everything outside the language is refused rather than guessed** (a claim about a field that does not exist is `unknown-field`; an extent that is not an integer is `malformed`) — a chatbot would just answer. *What would falsify the decision:* showing a domain where the gate's guarantee requires a richer language than one sum rule and one sort, so that the fragment cannot carry any real claim — then the project is a proof of concept for a thing that does not extend, and the thesis weakens.
*Second-order risks, named so the verifier checks them:* (i) **the guarantee is conditional on the observations** (case 01 — the deliberate failure test); (ii) **a single conflict silences its whole tree** (case 03: the price of never choosing a winner); (iii) **vocabulary load** — five kinds and 8 + 6 + 4 faults — so the Loom uses only the five kinds and no fault names.

---

## 10. Considered and rejected

* **Cite-checked generation / citation footers** — decorative; passes with a real document that does not say the sentence (A, §2).
* **An LLM judge of faithfulness** — non-deterministic; the wrapper pattern; fails the brief's #8 (B).
* **A commitment ledger with deadlines and discharge** — needs clocks; autonomous-company-simulator rejected a commitment lifecycle; drifts into may-I-act. The "who can hold it" half survives as `recheck` (C).
* **A confidence scalar earned from a track record** — memory-ledger's `Confidence` / adaptive-agent's `EvidenceTally` in a third coat, plus a time axis (D).
* **A general SAT/CSP engine over categorical domains** — more general, no enumerable oracle small enough for a unit test; **categorical sorts are deferred, and named in the README as not built** (E).
* **Resolving conflicts by source tier / recency / votes** — would rebuild memory-ledger's `superseded`/`disputed` and control-tower's `Corroboration`. D6 makes the absence of any trust order a *tested* property (case 08), not an omission.
* **A draft that carries citations the engine then verifies** — a forgeable slot; D2 removes the slot.
* **General Berge-acyclic schemas (shared operands that are not diamonds)** — exact (0 / 20 000 inexact) but speculative flexibility nobody asked for; read-once is simpler to state and to check; the over-restriction is disclosed (case 09). *"Speculative flexibility costs rounds"* is this account's own note (a tolerated case nobody asked for produced five bypasses on a sibling).
* **`max` / `min` / `scale` rules** — `max(x,y)=z` introduces a disjunction ("one of them equals z"); bounds propagation exactness is unproven for it and the oracle would need a new generator. Out of scope, named.
* **A closed phrase grammar that parses the quote into the extent (so extraction is checked mechanically for the grammar)** — attractive and rejected for scope: a second language, its own hostile-input surface and tests. Digit-containment is the partial guard; the rest is **disclosed as the deliberate failure** (case 01).
* **Cryptographic receipts on a `Brief`** — agent-trust-layer's conceptual core. `recheck` is re-derivation, not authentication; an asker-binding (which question this Brief answers) is not provided, and the README says so.
* **Timestamped evidence with staleness** — memory-ledger's core (D9).
* **A salvage mode that quarantines a conflicted tree's offending observation and answers from the rest** — needs a trust order to pick the offender; D6.
* **Naming the enum `Ruling` / `Verdict` / `Standing` / `Outcome`, or the engine layer `lib/gate`** — each is already taken in the series (`InterventionRuling`, `Verdict`, `Standing`, `Outcome`, control-tower's `lib/gate`).
* **Domains considered and not built** (the README names them): a **spend roll-up** ("are we under budget?", sum of signed and quoted line items — maximally legible, but money amounts/limits sit too close to autonomous-company-simulator's `Amount`/`limit`); a **launch-date chain** (tasks with duration ranges — a critical path needs `max`); an **incident-facts brief** (overlaps control-tower's incident-response domain).
* **A natural-language question box** — a parser, or a model. The question is a typed claim (menu + builder); the page says it is a *closed* language on purpose.
* **Persistence / a database** — in-memory; the demo holds the snapshot selection in React state. Disclosed.

---

## 11. The failure suite sketch (10 cases, each traced to a design decision, each pinning a real limit)

Each file header: `KIND`, `TRACES TO D#`, `WHAT WOULD MAKE THIS FAIL`. Cases 03, 08, 09 and 10 PROVE a property and disclose its cost; 01 does both; 02 is an honest partial pin; 04–07 DISCLOSE. **Every case asserts a typed result of the public API.**

| # | File | KIND | Traces to | Pins |
|---|---|---|---|---|
| 01 | `01-extraction-fidelity-is-not-closed` | DISCLOSES + PROVES the partial guard — **the deliberate failure test** | D8, D2 | A quote "Customs clearance takes 0 to 2 days" extracted as `[0, 7]` is **rejected** (`number-not-in-quote{value:7}`) — that part of the guard holds. But three mis-extractions are **accepted** and then **entailed, `recheck`-reproduced, and false** (executed on the model): a direction flip (quote "transit takes at most 5 days" read as `transitDays ∈ [5, ∞)`, with `o1`: the claim "delivery ≥ 6" is `entailed`), a dropped bound (quote "3 to 5 days" read as `[3,3]`: "transit ≤ 3" is `entailed`), a semantic slip (quote "5 business days" read as `[5,5]`: "transit ≤ 5" is `entailed`). `ground` accepts each (every digit is in its quote); `rule` returns `entailed` for the false claim; `recheck` returns `reproduced`. **The gate is sound relative to its observations, not relative to the world** — and that gap is the whole extraction boundary (D8). What would make it fail: any change that makes `ground` accept a bound whose digits are not in its quote, or any change that makes `recheck` flag the three accepted cases (which would mean it read something it must not). |
| 02 | `02-recheck-cannot-certify-silence-or-fabrication` | HONEST PARTIAL PIN | D7, D2 | On a real Brief: tightening **or** loosening a bound that still cites its support → `not-reproduced{bound-differs}`; a flipped `unmet` → `unmet-differs`; **dropping a supported bound together with its support** (a forged omission) → `reproduced` with that side in `silentSides` — undetectable from the Brief alone; a forged `ungrounded` → `uncertifiable-silence`; **replacing `evidence` with invented observations whose quotes contain the right digits** → `reproduced` (authorship is asserted; the carried quotes exist so a holder can compare them with the real documents). Re-running `answer` on the full snapshot catches the omission. A certificate covers *knowledge that cites evidence*, never *ignorance* and never *provenance*. *Risk of being "tests only that the caller behaves":* assert `recheck`'s typed results on the doctored Briefs, not that a caller "should also replay". |
| 03 | `03-a-conflict-silences-its-whole-tree` | PROVES locality, DISCLOSES the cost | D6 | In a two-tree schema (the order-desk tree plus `refundDay = returnWindowDays + restockDays`), adding `o3` and `o4` (the step-5 conflict) turns a perfectly well-grounded claim about `packDays` — `weakened [1,2]` without them — into `conflicted` (the engine will not salvage the consistent rest — salvage needs a trust order), while every claim about `refundDay` is **byte-identical** to its ruling without the conflict. *Executed on the model.* Over-refusal is the price of never choosing. |
| 04 | `04-a-core-not-the-core` | DISCLOSES | D6, D7 | Two disjoint minimal conflicts in one tree (`k1: packDays ∈ [5,5]`, `k2: packDays ∈ [0,3]`; `m1: transitDays ∈ [9,9]`, `m2: transitDays ∈ [0,2]`): the engine names **`m1 m2`** (ascending deletion keeps the latest ids). Removing `m1` makes the next `ground` name **`k1 k2`**. Resolving the named conflict can reveal a hidden second one; the core is *a* core. *Executed shape verified on the model.* |
| 05 | `05-support-is-irreducible-not-minimum` | DISCLOSES | D7 | The same evidence under two id schemes: a one-observation route `"z-direct"` (`deliveryDay ≤ 9`) and a three-observation route `a1: packDays ≤ 2`, `a2: transitDays ≤ 5`, `a3: customsDays ≤ 2` for the same upper bound `deliveryDay ≤ 9`. With `z-direct` sorting last the support is `["z-direct"]`; with the direct id renamed `"0-direct"` it is `["a1","a2","a3"]`. Identical evidence, identical `E`, different certificate: it depends on ids, never on input order (reversing the array changes nothing). *Executed on the model.* |
| 06 | `06-a-named-gap-is-a-place-not-a-promise` | DISCLOSES | D5 | Two facts, both executed on the model. (a) With `o1 o2 o3` and the claim "delivery ≤ 5", `E = [4,9]` is bounded but loose: the ruling is `weakened` with **`openEnds: []`** — the engine says *not established* and names no gap, because no quantity lacks a bound; it cannot say what evidence would settle it. (b) A named open end says *where* evidence is missing, not *what it will say*: starting from step 1 ("delivery ≤ 12", open end `customsDays` upper) and adding a customs upper bound of **30** leaves the ruling `weakened` (`E = [4,37]`); adding customs `[20,30]` makes it `contradicted` (`E = [24,37]`); adding customs `≤ 3` makes it `entailed` (`E = [4,10]`). The same filled gap yields three different kinds. |
| 07 | `07-evidence-has-no-clock` | DISCLOSES | D9 | A snapshot that includes `o2` (carrier SLA) rules `entailed` forever; the API has no time parameter (`answer`, `rule`, `ground`, `recheck` take none — asserted on the function arities **and** by M1's determinism guard), and an observation that was true last month and has since been recalled keeps entailing until the *snapshot* changes. Staleness is memory-ledger's; the composition (a `believed` memory as an `Observation`) is named, not built. |
| 08 | `08-no-trust-order-between-sources` | PROVES a metamorphic claim, DISCLOSES the cost | D6 | Rename every `source` (and swap which observation carries "Warehouse system" vs "A forum post"): **no `Entailment` changes** (metamorphic, over all 80 demo states). The cost: given a conflict between an authoritative source and a flaky one the engine refuses both equally and cannot prefer the right one. *Risk of being a test of the caller:* assert engine output invariance under the relabelling. |
| 09 | `09-read-once-buys-exactness-not-soundness` | PROVES the restriction earns its keep, DISCLOSES that it over-restricts | D4 | (a) `ground` rejects the diamond (`x=a+b`, `y=a+c`, `z=x+y`) as `operand-reused{operand:"a"}`. (b) A hand-rolled interval propagator **inside the test** (the lib is never called with a diamond) on that diamond with `c ≤ 4`, `z ∈ [3,7]`, `b ∈ [0,6]` reports `a ∈ [0,7]`; the test's own brute-force enumerator says `[0,3]` — propagation off a tree is *sound but loose*, so what read-once buys is **tightness** ("the tightest entailed claim") and the right to claim complete conflict detection, not safety. (c) `ground` also rejects `x=a+b`, `y=a+c` (`operand-reused`) although the same hand-rolled propagator is exact on it (0 inexact of 20 000 on the model): the rule is stricter than it needs to be, disclosed rather than relaxed (§10). |
| 10 | `10-render-checks-digits-not-meaning` | PROVES a property, DISCLOSES its limit | D1 | Over every variant and every §7 fixture, the digit tokens of `renderBrief` are a subset of the digits in the entailments and referenced ids (a template that adds "typically 2 days" fails it). The limit: the check sees **digits**, not meaning — a template that wrote "a couple of days" would pass. A *second*, separate assertion checks the rendered words of every fixture against a **denylist** of number words ("one" … "twenty", "couple", "few", "several", "dozen"); a denylist is only as good as its list, and the case says so — neither assertion is claimed to cover the other. |

Four sketches from the siblings' history were checked against this list: none depends on a field nothing reads (control-tower's heartbeat-clock case — `source` is exercised by case 08 and proved unread), none restates an M3–M5 test (adaptive-agent's cases 1–4 were re-proofs at scale — case 03's two-tree schema and case 09's hand-rolled propagator are new layers), and 01/02/04/05/09 are limits found by tracing the design and *executed on the model*, not generic input validation. Generic hostile-input is **not** a case here: it lives in M3/M4/M5 and restating it in M7 would be the restating defect.

---

## 12. The stack

Next.js 16 + React 19 on Vercel, TypeScript, vitest. **Copied, not reinvented, from `autonomous-company-simulator` on `origin/main` (`fc17afd`), read via `git show origin/main:<path>` — each file read in full:** `package.json`, `next.config.ts`, `tsconfig.json`, `tsconfig.lib.json`, `vitest.config.ts`, `eslint.config.mjs`, `vercel.json`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, `scripts/register-ts-loader.mjs`, `scripts/ts-loader-hooks.mjs`, `tests/smoke.test.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`; `package-lock.json` was parsed (counts below), not read. That tree is the newest: its tip (`Upgrade next 16.3.5 -> 16.4.3 (closes unauthenticated RCE advisories)`) is the fix the other six siblings picked up on the same day.
Pinned versions as found: `next 16.4.3`, `react`/`react-dom 19.3.0`, `typescript 7.0.2`, `vitest 5.0.1`, `eslint 10.11.0`, `@eslint/js 10.0.1`, `@types/node 24.13.5`, `@types/react(-dom) 19.3.0`, `engines.node 24.x`. (Node `24.7.0` and npm `11.5.1` are what is on this machine.)

* **Build with `next build --webpack` plus `experimental.extensionAlias: { ".js": [".ts", ".tsx", ".js"] }`** (and `next dev --webpack`). Turbopack cannot resolve NodeNext `.js`-suffixed imports — **still true on `next@16.4.3`, per the brief; I did not run a build, and `tests/smoke.test.ts` plus CI's `npm run build` are the checks**; the full reasoning is the comment block in `next.config.ts`: copy it verbatim. `tests/smoke.test.ts` pins both facts by importing the config and reading the exported object (not by matching source text, which the config's own comment block would satisfy).
* **`npm ci` only, never `npm install`.** npm 11.5.1 silently deletes platform-binary lockfile entries (the brief says 27; I did not reproduce that count) on any rewrite while `npm ci` still exits 0. **Any lockfile change goes through `npx --yes npm@10.9.9 install …` and is reviewed as a diff of the `os`/`cpu` entry count** (the copied lockfile has 80). The CI step `require('rolldown')` after `npm ci` turns the Vitest symptom into a labelled failure.
* **`typescript-eslint` throws on TypeScript 7**, so `eslint.config.mjs` ignores `**/*.ts(x)`; `npm run lint` is real only for JS/config files and **`npm run typecheck` is the backstop** (`tsc -p tsconfig.lib.json --noEmit && tsc -p tsconfig.json --noEmit`). M9's Honest limits say so.
* **`vercel.json` pins `{"installCommand":"npm ci","buildCommand":"npm run build"}`** so the zero-config preset cannot fall back to Turbopack.
* **CI is in the scaffold** — `.github/workflows/ci.yml` from the same tree: assert no step reads a secret, `setup-node 24`, `npm ci`, assert the rolldown binding loaded, `npm run typecheck`, `npm test`, `npm run build`. (`adaptive-agent` and `agent-control-tower` have no workflow in their `origin/main` file listings — nothing checks their `main`.)

**Deviations from the copy — G3 must do these, and each is a trap if skipped:**
1. **`package.json`:** `name` → `beyond-the-chatbot`; `description`; the script `"demo:order-desk": "node --import ./scripts/register-ts-loader.mjs scripts/demo-order-desk.ts"` replacing `demo:company`. **`package-lock.json`:** change the two `"name"` fields (root and `packages[""]`); **do not regenerate it.**
2. **`vitest.config.ts` and `tsconfig*.json` are copied unchanged** — `components/**` globs are already on that `main`; `fileParallelism` stays default because every architecture test in this plan writes its scratch fixtures under `os.tmpdir()`, never inside `lib/` (if an exploit-regression ever needs scratch-in-repo, add `fileParallelism: false` then, with control-tower's comment).
3. **`.env.example`** reworded: no credentials; the one variable is `VERCEL_GIT_COMMIT_SHA`, set by Vercel, read by `app/api/health/route.ts` (M2).
4. **Add `tests/lockfile.test.ts`** (new): reads `package-lock.json` and asserts (a) the number of entries carrying `os` or `cpu` is **≥ the count recorded at G3** (80 on `fc17afd`), and (b) the 15 `@rolldown/binding-*` entries are all present. It is the mechanical form of "`npm ci` exits 0 while the lockfile has silently shrunk".
5. `typescript/unstable/{ast,sync}` — the AST API the containment, determinism and domain scans import — ships with `typescript@7.0.2`; copy the **technique** from control-tower's `import-containment.test.ts`, not its `HumanId`-specific scans.
* **No new dependencies.** Property tests use a hand-rolled seeded `mulberry32`.

**Operational notes for the coordinator (from standing memory, not from siblings):** repos live under `vladimir-mawla` (sibling READMEs clone from `github.com/vladimir-mawla/<repo>`); the active `gh` account flips to `vldmr-mawla` and 403s the push — run `gh auth status` before every push; M2 deploys from a clean committed tree; do not git-operate on an occupied worktree while a subagent works in it.

---

## 13. Infrastructure to copy vs. the core to invent

**Copy (shared, not conceptual):** `next.config.ts`, both `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `vercel.json`, the `package.json` scripts, the `scripts/*.mjs` loader, CI; the deploy-at-M2 discipline and a health endpoint that runs a *real* check and returns 503 on failure with the commit SHA; the closed-module-graph test technique; the `tests/failures/**` discipline (header states PROVES vs DISCLOSES, what would make it fail); sabotage-and-restore logs; the README / ARCHITECTURE / THESIS / WALKTHROUGH / NOTES shape with an unsoftened **Honest limits** section; the `app/milestones.ts` drift guard (decision-engine); the `compute-demo-view` pure-bridge + `renderToStaticMarkup` pattern (control-tower); the ADR template; `@ts-expect-error` proofs; typed hostile-input failures; seeded-PRNG property tests with proven-reachable generators; a brute-force **oracle** (shadow-run and memory-ledger both pin a baseline; here the oracle is the independent half of every exactness claim).

**Invent, never share:** `Extent`, `Observation`, `Claim`, `Schema` (read-once sum forest), **`Entailment`**, `Support`, `OpenEnd`, `Brief`, the ruling table over `(E, B, C)`, bounds propagation with deletion-minimised support and cores, `recheck`'s certificate (it catches a changed bound that still cites its support; not silence, not fabrication), the order-desk domain and its drafter. Reusing `BeliefAnswer`, `Memory`, `Confidence`, `DecayPolicy`, `Tombstone`, `Corroboration`, `distinctContexts`, `Outcome`, `Reconciliation`, `Standing` or an `Intervention` ladder here, even in spirit, would be the failure the brief names: eight repos wearing one mechanic in eight hats.

---

## 14. Thesis seed (M9 expands; the cap is ≤ 300 words, and the seed below is counted by `btc/check-plan.mjs`)

*Two years out: the unit of AI output stops being the message.* Products will keep shipping fluent prose with citations attached, and the citations will keep being decoration: a link beside a sentence proves the document exists, not that it says the sentence, and nothing re-runs it. The first serious buyers — finance, logistics, legal operations — will find they cannot audit prose, and will ask for the thing an auditor can hold: a claim, the evidence it rests on, and a way for someone who does not trust the vendor to re-derive it.

**The claim, stated so it can be wrong:** within two years at least one regulator, standard or large procurement requirement will demand that AI-generated figures in a defined class of documents ship with machine-re-derivable support, and products that can offer only prose will be excluded on that basis.

**What would falsify it:** citation-plus-judge faithfulness checks prove good enough that buyers accept them; or the checkable fragment is too narrow to cover what buyers actually need, so that a closed claim language like this one is a toy, not a seed.

**What it does not claim:** that a typed observation matches the document it was read from (extraction is outside the gate); that a re-derivable answer is a *complete* or *authentic* one — a certificate shows each bound re-derives from the evidence it carries, never that nothing was left out or that the evidence is the real evidence; that evidence stays true — there is no clock; or that any source outranks another — there is no trust order. Those belong to other layers, which this one composes with rather than replaces.

## 15. Loom outline (≈ 90 s; M9 writes the script and measures it; every on-screen number is from §7)

0–10 s claim ("a chatbot says it; this system checks it — the drafter on the left is a stub standing in for a model, the gate on the right is what has to be right") · 10–32 s step 1: order A-1042, two documents, ask "by day 12?" — the chatbot says yes, around day 7; the gate says *not established — at least day 4 — nothing bounds customs from above*, and the customs claim is **ungrounded**: the chatbot invented "2 days" · 32–52 s add the customs bulletin: the answer flips to **yes, day 9 at the latest**, with the three supporting documents lit; the chatbot's "6" is weakened to "4–9" · 52–76 s add the courier tracking page: everything goes **conflicted** — the page computes "6 of 6 pairs consistent, 4 of 4 triples consistent, all four: conflicted"; no document is trusted over another · 76–86 s **Recheck**: intact; **Forge** (raise the upper bound by one) → `bound-differs` · 86–90 s close: "say only what you can show".

## 16. Handoff to G3 (the scaffold agent)

1. Create the repo (`beyond-the-chatbot`, public). Do **not** start M1.
2. Copy the files of §12 from `autonomous-company-simulator` `origin/main` (`fc17afd`) — via `git show`/`git archive origin/main`, **not** a working tree — and apply deviations 1–5 of §12.
3. Prove the scaffold from a clean clone before anything else: `git clone … && npm ci && npm run typecheck && npm test && npm run build` (the smoke test pins `--webpack` and the `extensionAlias`; the lockfile test pins the platform-entry count).
4. Write `.genesis/PLAN.md` = this file; `.genesis/DONE.html` = the milestone table of §6 (every status `todo`) plus the locked spec below; `.genesis/checkpoints/CURRENT.md` = honest "genesis only, no engine code."
5. **Locked spec seed (DONE.html §1).** *Cognitive job:* given a schema of typed quantities and a snapshot of typed observations, decide, for the user's question and for every claim a drafter makes, what the evidence entails about it — one closed `Entailment` — and say no more than that.
   *Inputs → outputs:* (schema, observations, question, draft) → a `Brief` of `Entailment`s (`entailed · weakened · contradicted · ungrounded · conflicted`), each carrying its support, its cut, its open ends or its core, or a typed fault; never a score, never prose first.
   *Autonomy:* fully autonomous end to end; the drafter is untrusted input and is a pure function; there is no human in the loop and no model in the repo.
   *Failure tolerance:* fail toward the weaker statement — when the evidence is silent say nothing about the quantity, when it conflicts refuse the tree, when input is unreadable return a typed fault.
6. **DoD gates for DONE.html §2** (binary, checked by the verifier, never the builder): dependency direction `contracts → extent → ground → entail → domains/order-desk`, zero cycles, closed module graph; `typecheck` clean and `test` green; independent L4 pass per milestone; no earlier freeze boundary touched; an `ungrounded`/`conflicted` carrying `established` (or a `weakened` without `unmet`) does not compile by any route; **bounds propagation equals a brute-force oracle on every generated instance** (exactness gate, M3/M4); **adding evidence never widens an established extent** (monotonicity gate, M4); **`recheck` flags every changed bound that still cites its support** (tamper gate, M5); no clock, randomness, network, or model anywhere in `lib/` and `domains/` (determinism gate, M1); the live demo and `npm run demo:order-desk` produce the same Brief for the same step (diffed by the verifier); clean clone + `npm ci` + typecheck + test passes with no credentials.

## Appendix A — verification artifacts (scratch; not for the repo)

`…/scratchpad/btc/` (a fresh directory; the sibling planner's `…/scratchpad/trace/` was not touched) — **engine model and oracle:** `model.mjs` (the throwaway engine, with env-var mutants `MUT=…`), `fuzz.mjs` (the brute-force-oracle fuzz), `single.mjs` (single-observation theorem), `recheck.mjs` (the certificate model: tighten, loosen, flip `unmet`, forge an omission), `m3grid.mjs` (the M3 algebra, exhaustively), `sweep.txt` (the mutation sweep);
**the M7 sketches, executed:** `cases.mjs` (cases 04, 05), `cases2.mjs` (cases 01, 06), `case3.mjs` (case 03), `readonce.mjs`, `diamond.mjs`, `diamond2.mjs`, `diamond3.mjs` (case 09 and its frequencies); **the §7 numbers:** `canon.mjs`, `script.mjs`; **the type layer:** `probes.ts`, `typesab.mjs` (11 sabotages), `neverfields.mjs` (17 of 17), `tsconfig.json`, `extracted/` (the four layer files extracted from this document); **the document itself:** `check-plan.mjs` (§8E).
Reproduce, from `btc/`: `node check-plan.mjs` (extracts the blocks, compiles them with `~/Desktop/autonomous-company-simulator/node_modules/.bin/tsc`, checks ownership, layering, counts, thesis length); `node typesab.mjs`; `node neverfields.mjs`; `node fuzz.mjs 8000`; `MUT=<mutant> node fuzz.mjs 2000`; `node recheck.mjs`; `node script.mjs`.
