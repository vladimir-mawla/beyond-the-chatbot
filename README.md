# Beyond the Chatbot

A system beyond chat says only what its evidence entails.

**The claim.** Every output is a claim about a typed quantity, and a deterministic gate rules it against fixed evidence as `entailed`, `weakened`, `contradicted`, `ungrounded` or `conflicted`. A draft that says more than the evidence entails is cut back to what the evidence does entail, with the cut named; a question the evidence cannot touch gets the named gap, not something plausible; evidence that cannot all be true is refused whole, with no source trusted over another. Prose is only ever a projection of a checked claim. The guarantee is relative to the observations the gate is given, not to the world: an observation that mis-reads its document is believed (the deliberate failure test is case 01 below). The language is deliberately narrow (integer ranges over sums), and everything outside it is refused rather than guessed. The engine is in `lib/`, a stub standing in for a language model and one worked domain (an order desk) are in `domains/order-desk`, and the page below drives the engine in your browser and renders only what it returns. Plan: [`.genesis/PLAN.md`](.genesis/PLAN.md). Definition of done: [`.genesis/DONE.html`](.genesis/DONE.html).

**Live:** https://beyond-the-chatbot-xi.vercel.app (Vercel auto-deploys `main`).

Its `/api/health` reports the commit the deployment was built from, so the page can be compared with `git log` on `main`. On 2026-11-24, before this milestone merged, it answered `{"status":"ok","commit":"a4e1fea6b3cde483d8f382d5a772bf29cbd45ca3","checks":{"contracts":{"pass":true,...` (the four cases of the contracts guard, nothing about the engine; see Honest limits). That is one observation on one date. It changes when this pull request merges and Vercel redeploys.

## Run it from a clean clone

```bash
git clone https://github.com/vladimir-mawla/beyond-the-chatbot.git
cd beyond-the-chatbot
npm ci                  # not `npm install`; see the note below
npm run typecheck       # tsc against tsconfig.lib.json, then tsconfig.json
npm test                # vitest
npm run build           # next build --webpack
npm run demo:order-desk # the canonical script through the real engine; ends with a line starting "Oracle:"
npm run lint            # eslint, JavaScript and config files only; see Honest limits
```

Node 24 (`engines.node` in `package.json`). No credentials are read: `.env.example` is there to say so, and CI asserts its workflow names no secret.

**Use `npm ci`, never `npm install`.** npm 11.5.1 silently deletes the platform-binary entries (all 15 `@rolldown/binding-*`, `fsevents` and all 11 `lightningcss-*`) when it rewrites the lockfile, and `npm ci` on the result still exits 0; `npm test` then fails with a bare "Cannot find native binding". `tests/lockfile.test.ts` › "keeps all 15 @rolldown/binding-* entries, by name" fails if they are gone. A dependency change goes through `npx --yes npm@10.9.9 install ...`.

CI is `.github/workflows/ci.yml`: a fresh checkout, `npm ci`, a check that the native binding loaded, `npm run typecheck`, `npm test`, `npm run build`. The pull request that wrote this file's current text records the output of each command above from a fresh clone.

## The deliverables

| Deliverable | Where |
|---|---|
| Public repo that runs from a clean clone, with a README | this file; the commands above |
| Live demo URL | https://beyond-the-chatbot-xi.vercel.app, which auto-deploys `main` |
| 90-second Loom (the recording is a human step and is not in this repository) | the script is [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md), beside the record of the by-hand check of the live click path |
| Architecture snapshot | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): stage by stage, what each refuses and why, each tied to a file and a test |
| One deliberate failure test | [`tests/failures/01-extraction-fidelity-is-not-closed.test.ts`](tests/failures/01-extraction-fidelity-is-not-closed.test.ts), listed first below |
| Two-year thesis, at most 300 words | [`docs/THESIS.md`](docs/THESIS.md) |
| Process record | [`docs/NOTES.md`](docs/NOTES.md); the decisions are `.genesis/decisions/0001` to `0009` |

What keeps the documents honest: `tests/docs/citations.test.ts` fails when a backticked source or test path in `README.md`, `docs/ARCHITECTURE.md`, `docs/NOTES.md`, `docs/WALKTHROUGH.md` or `docs/THESIS.md` does not exist; when any quoted test title cited after a path (each written ` › "title"`) is not in that file on a line that opens a test; when a title follows no path on its line; when a failure case is missing from this README; when the thesis exceeds 300 words; when the Loom script has a beat over 170 words a minute, slots that do not run on, a run past 90 seconds or more than 230 words of narration; when a quoted on-screen string is not on the page that the component renders for the beat's state, in order; and when the dependency lines below differ from `package.json`. It does not check that a cited test asserts what the sentence beside it says, that a sentence without a citation is true, that a quoted string is on the deployed page (only on the markup the same component renders), or that anyone can speak at the stated rate.

## Honest limits

The failure suite is `tests/failures/`: ten cases, each a file whose header says what the limit is and what edit would make the case fail. A case marked DISCLOSES states something the engine does not do, and its tests pin the limit so that closing it turns the case red. A case marked PROVES pins a guarantee. Each bullet below is the limit as that file's header states it, with a title of a test in that file cited.

1. **Extraction fidelity is not closed (the deliberate failure test; DISCLOSES, and PROVES the partial guard).** The gate is sound relative to its observations, not to the world. The one check on an extraction is that every finite bound occurs as a digit run of its quote, and that holds: `tests/failures/01-extraction-fidelity-is-not-closed.test.ts` › "customs 'takes 0 to 2 days' read as [0, 7] is refused, number-not-in-quote { value: 7 }, and the tree is left as the schema has it". It cannot hold for a number the quote contains but means differently: › "ground accepts it, rule says entailed, the ruling is false in the world meant, and recheck says reproduced" (a direction flip, a dropped bound and a "business days" slip, three examples, not a complete list).
2. **`recheck` cannot certify silence or fabrication (an honest partial pin).** A bound that still cites its support and was changed by one is caught; a supported bound dropped together with its support is not, and neither is evidence replaced by invented documents with the right digits. `tests/failures/02-recheck-cannot-certify-silence-or-fabrication.test.ts` › "(a) a supported upper bound dropped together with its support is reproduced" and › "(c) evidence replaced by invented documents with the right digits is reproduced".
3. **A conflict silences its whole tree (PROVES locality, DISCLOSES the cost).** Another tree's rulings are byte-identical; a well-grounded packing claim becomes `conflicted` once the conflict exists, because salvaging would need a trust order. `tests/failures/03-a-conflict-silences-its-whole-tree.test.ts` › "LOCALITY: adding o3 and o4 conflicts the desk tree and leaves every ruling, extent and support of the refund tree byte-identical" and › "THE COST: a packing claim that was".
4. **A core, not the core (DISCLOSES).** The core the engine names is one irreducible conflict; another, equally real, can stay hidden until the first is resolved. `tests/failures/04-a-core-not-the-core.test.ts` › "two disjoint minimal conflicts in one tree: the engine names m1 m2, and resolving it (dropping m1) makes the next ground name k1 k2".
5. **Support is irreducible, not minimum (DISCLOSES).** The same evidence under two id schemes gives two certificates for the same bound; it depends on ids, never on input order. `tests/failures/05-support-is-irreducible-not-minimum.test.ts` › "the plan's pair: z-direct gives [z-direct]; 0-direct gives [a1 a2 a3]; the extent is the same; reversing the array changes nothing".
6. **A named gap is a place, not a promise (DISCLOSES).** A loose bound names no gap, and a named open end says where evidence is missing, not what it will say. `tests/failures/06-a-named-gap-is-a-place-not-a-promise.test.ts` › "(a) with o1 o2 o3 and 'delivery at most 5': weakened [4, 9] with openEnds []" and › "(b) the same filled gap, three kinds".
7. **Evidence has no clock (DISCLOSES).** A snapshot rules the same until the snapshot changes: no function takes a time and moving the system clock moves nothing. An observation that was true last month and has since been recalled keeps entailing. `tests/failures/07-evidence-has-no-clock.test.ts` › "with the system clock moved a century either way, the same snapshot gives byte-identical results" and › "a recalled or expired observation entails exactly what the unmarked one does".
8. **No trust order between sources (PROVES a metamorphic claim, DISCLOSES the cost).** Relabelling every source to another valid one changes no ruling over the 80 demo states; an authoritative source and a flaky one that disagree are refused equally. `tests/failures/08-no-trust-order-between-sources.test.ts` › "METAMORPHIC" and › "THE COST".
9. **Read-once buys exactness, not soundness (PROVES the restriction earns its keep, DISCLOSES that it over-restricts).** `ground` rejects a shared operand. A hand-rolled propagator inside the test is sound but loose on a diamond; and the rule also rejects a shape that propagator handles exactly. `tests/failures/09-read-once-buys-exactness-not-soundness.test.ts` › "(a) ground rejects the diamond" and › "(c) ground also rejects x = a + b, y = a + c as operand-reused naming a".
10. **Render checks digits, not meaning (PROVES a property, DISCLOSES its limit).** No rendered number is foreign to its ruling; a number word the denylist lacks passes both checks. `tests/failures/10-render-checks-digits-not-meaning.test.ts` › "THE DIGIT PROPERTY, per ruling" and › "a number added as a word the list lacks".

Limits of the rest of the repository, each with where it is stated (a limit with no test cited is stated, not pinned by a test):

- **`npm run lint` does not check TypeScript.** `typescript-eslint` does not load on TypeScript 7, so `eslint.config.mjs` ignores `.ts` and `.tsx`; `npm run typecheck` is the check for those, and CI runs it. Stated in `eslint.config.mjs` and in `.genesis/PLAN.md` section 12; not pinned by a test.
- **A green `/api/health` is not a statement about the engine.** It runs four cases of the contracts guard (`app/api/health/__tests__/route.test.ts` › "answers 200, status ok, and all four checks passing with the plan"). Stated in `.genesis/decisions/0002-deploy.md`.
- **The click path on the deployed page has no automated test.** It was checked by hand, by the orchestrating agent, on 2026-11-24 (and the checkbox path by another agent on `53d7ea0`); what was and was not covered is in `docs/WALKTHROUGH.md`. Which action each control dispatches is listed as unpinned in `.genesis/decisions/0008-demo.md`.
- **The drafter is a stub.** There is no model, no network and no key anywhere; a real model would sit where `domains/order-desk/drafter.ts` is, and an extractor in front of `ground`. Nothing here shows how either would behave. Stated in `.genesis/PLAN.md` D10.
- **The claim language is narrow on purpose.** Integer ranges over read-once sums; case 09 is the over-restriction. The plan names three domains considered and not built: a spend roll-up, a launch-date chain (a critical path needs `max`), and an incident-facts brief; categorical sorts, `max`/`min`/`scale` rules and a natural-language question box are also not built (`.genesis/PLAN.md` section 10). Not pinned by a test.
- **The demo keeps its choices in the browser's React state; there is no persistence or database.** Stated in `.genesis/PLAN.md` section 10; not pinned by a test.
- **`recheck` is re-derivation, not authentication, and does not bind a Brief to the question it answers.** Stated in `.genesis/decisions/0005-entail.md` (Stated, not pinned by a test) and in a comment in `lib/entail/recheck.ts`.
- **The sabotage ledgers are not run by CI.** The ADRs record edits made by hand to the shipped source and which tests then failed; CI runs the suite on the unedited source only.
- **`npm audit` findings were recorded at genesis and not addressed** (`.genesis/checkpoints/CURRENT.md`, Known gaps; the count there was measured before the `next` upgrade and was not re-measured).
- **The thesis is a prediction.** `docs/THESIS.md` says what would falsify it.

## Files that keep the wording of the day they were written

Each milestone froze its files when it merged, and later milestones did not edit them (`.genesis/PLAN.md` section 6, directory ownership). Some of those files therefore still say things that were true when they were written and are not now. They keep that wording; they are not corrected. For the state of the code, read this README and `docs/ARCHITECTURE.md`. The milestone table in `.genesis/checkpoints/CURRENT.md` was current as of the mark-M8-done pull request, but that file's Known-gaps section also carries lines from before M8 (for example that the live URL "served a skeleton", and that `README.md` still says "Status: in progress, nothing built yet", which was this file's earlier text), so it is not a description of the current state.

The classes below are what two searches returned at commit `a4e1fea` (the `main` this milestone branched from), run with `git grep -nE` over the tracked files except `package-lock.json`: first `not built|not yet|does not exist|nothing built|todo|proposed` (80 lines in 23 files), then `not built|does not exist yet|M[0-9] does not exist|not yet (verified|approved|exist)|nothing built|is not built|are not built|still show M[0-9]|M[0-9] (is|are) .todo|has not been|not built yet|NOT BUILT|nothing is built|no engine|until M[0-9]|planned` (73 lines in 34 files). The list is what those searches found, not a proof that no other line is stale.

- **ADR Status lines.** ADRs `0001` to `0008` in `.genesis/decisions/` read `Status: proposed — written by the builder; ...` and mostly "not yet verified by an independent L4 pass" (ADRs `0003` and `0004` say instead that the revised version "has not been re-verified"). Each of those milestones was later reviewed and merged, as `.genesis/checkpoints/CURRENT.md` records. ADR `0009` is written in the same form and will read the same way once reviewed.
- **ADR bodies that speak of a later milestone as unbuilt.** For example ADR `0001-contracts.md` says `domains/` "does not exist yet"; ADR `0002-deploy.md` says `.env.example` and the README prose are stale (they were, and `.env.example` still is); ADR `0003-extent.md` item 5 lists three more. All of M1 to M8 are on `main`.
- **Source and test comments that say a refusal or a layer is "not built".** In `lib/contracts/` (`bounds.ts`, `ids.ts`, `limits.ts`, `non-empty-array.ts`, `schema.ts`), `lib/contracts/__tests__/determinism.test.ts` ("`domains/` does not exist yet"), `lib/contracts/__tests__/canonical-scenario.test.ts` ("no engine exists"), `lib/contracts/__tests__/proofs/honest-limits.proofs.ts` ("is planned to refuse"), `tests/smoke.test.ts` ("a genesis repo that has no engine code yet"), `.github/workflows/ci.yml` ("At genesis (this commit) there is no engine code"), `.env.example` ("NOT BUILT YET") and `.genesis/DONE.html` ("This genesis repo has no engine code yet").
- **The status of M9** in `.genesis/DONE.html`, `.genesis/checkpoints/CURRENT.md` and `app/milestones.ts` reads `todo` or not done until the bookkeeping pull request that marks M9 done lands; `app/milestones.test.ts` checks that the list in `app/milestones.ts` and `DONE.html` agree. `.genesis/PLAN.md` still cites the sibling commit `fc17afd`, which `CURRENT.md` says is now `ab14763`.

Most other hits are not stale: `todo` is a style class in `DONE.html`, "does not exist on type" is an expected compiler message in a type proof, and "no engine" appears in test messages.

## Stack

Next.js 16 (App Router) and React 19, TypeScript 7, Vitest, Node 24; Next is pinned at 16.4.6 in `package.json` at this commit. The build uses the webpack bundler (`next build --webpack`) and `experimental.extensionAlias` in `next.config.ts`, because Turbopack cannot resolve the NodeNext-style `.js`-suffixed imports the engine uses (the comment in `next.config.ts` has the reasoning, and `tests/smoke.test.ts` › "declares experimental.extensionAlias mapping .js to .ts/.tsx/.js" pins the setting). `vercel.json` pins `npm ci` and `npm run build`.

Runtime dependencies (package.json): next, react, react-dom.

Dev dependencies (package.json): @eslint/js, @types/node, @types/react, @types/react-dom, eslint, typescript, vitest.

Library source under `lib/` may import no package (`lib/contracts/__tests__/architecture.test.ts` › "library source imports nothing from outside lib/: not a package, not a Node built-in").
