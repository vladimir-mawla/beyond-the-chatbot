# Walkthrough: the live click path, and the 90-second Loom script

Two things live here. The first is the record of the one part of the demo no test covers: pressing the controls on the deployed page. The second is the script for the Loom, written against what that record and the page's own markup say is on screen. The Loom itself is recorded by a person; nothing in this repository records it.

## 1. The live click path: what was checked by hand, and what was not

The plan (`.genesis/PLAN.md`, M8 check 6) says the click-to-re-render path is verified by hand against the live URL and recorded here, and `.genesis/decisions/0008-demo.md` (What is not proven) says no test pins which action a control dispatches. This section is that check's own record, copied from the orchestrating agent's notes. The builder of M9 clicked nothing.

**Who, when, against what.** On 2026-11-24 the orchestrating agent of this project, not the builder of this milestone and not a test, drove the deployed page https://beyond-the-chatbot-xi.vercel.app/, whose `/api/health` reported commit `a4e1fea` at the time. The browser was the Claude desktop app's built-in browser pane (Chromium), viewport 1440 x 900.

**How the controls were driven.** The scripted-step buttons were pressed with the browser's own DOM: `element.click()` dispatched from the page console, then the page's `main.innerText` read after about 300 ms. This was not a mouse or keyboard session.

**A separate checkbox run.** Earlier on the same day, the M8 bookkeeping agent checked the checkbox path with real clicks, on commit `53d7ea0` (the M8 merge, not `a4e1fea`). Starting from step 1 (o1, o2, delivery at most 12), ticking o3 and then o4 gave `conflicted` with core o1 o2 o3 o4. The Brief text was identical to step 5 of `npm run demo:order-desk`: the page text was transcribed into a file and diffed. The page after ticking o3 alone was not recorded by that run.

**What each scripted step showed.** The opening state is step 1. For every step the answer line reads: "The system ruled your question <kind> and checked its own Brief: every ruling it can check re-derives from the evidence it carries."

| Step | Documents · question | Ruling | Notes |
|---|---|---|---|
| 1 | o1 o2 · delivery ≤ 12 | weakened | Cut "upper bound". Open end "customs clearance: nothing bounds it from above". Lower bound from o1 o2. Chatbot paragraph: "Yes: delivery is around day 7. … customs clearance about 2 days (typical)." Draft claim 3 (customs) is ungrounded: "The chatbot said 2 days (a typical figure, not from any document)." |
| 2 | o1 o2 · delivery ≥ 4 | entailed | |
| 3 | o1 o2 · delivery ≤ 3 | contradicted | |
| 4 | o1 o2 o3 · delivery ≤ 12 | entailed | |
| 5 | o1 o2 o3 o4 · delivery ≤ 12 | conflicted | Pairwise line: "6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted". "Forge the Brief" is disabled. |
| 6 | o1 o2 o4 · customs ≤ 3 | contradicted | |

**Forge.** At step 4, pressing "Forge the Brief" showed "recheck NOT intact: the forged ruling does not re-derive" and, for the question, "not re-derived: the upper bound says 10 but its own support gives 9".

**Not checked in that session:** phone width, dark theme, keyboard-only use, other browsers, and the custom-question builder. This is a list of examples of what the record does not cover, not a complete list: for instance the record gives no ruling text for steps 2, 3, 4 and 6 beyond the kind, and does not say that the forge was tried in any state but step 4.

**What the tests pin about the same page, without any browser.** The markup for each scripted step contains the engine's text for that step (`components/order-desk/__tests__/OrderDeskDemo.render.test.tsx` › "scripted step $preset.step"), and every one of the 80 document-and-question states renders (`components/order-desk/__tests__/OrderDeskDemo.render.test.tsx` › "all 80 states render"). `tests/docs/citations.test.ts` › "every beat's on-screen strings are on the page the real component renders for its state, in the stated order" checks each quoted on-screen string of section 2 against that markup, and › "ticking the documents one by one" checks that ticking o3, then o4, from step 1 renders the same page as steps 4 and 5. What no test covers is that a control's click handler dispatches the action its label names, and what a browser shows after a click.

## 2. The 90-second Loom script

Lines that begin with `> ` are said aloud. A beat is a header with its time slot, an `On screen [state]:` line and the narration; `tests/docs/citations.test.ts` fails if a slot does not run on from the one before, if the script runs past 1:30, if any beat is over 170 words a minute, if the narration totals more than 230 words, or if a quoted on-screen string is not on the page that the component renders for the stated state, in the stated order. The bound is on the text, not a measurement of anyone's speech. Stage directions are not narration.

The strings in the `On screen` lines are written exactly as the page renders them. The plan's outline (`.genesis/PLAN.md` section 15) names order "A-1042" and the word `bound-differs`; neither is on the page (the page says "not re-derived: the upper bound says 10 but its own support gives 9"), so the script says what the page says.

**Before recording:** open the URL and reload, so the page is at step 1. Tick and press in the order below.

**0:00 - 0:10. The claim.** Stage: the top of the page, step 1.
On screen [step 1]: "Beyond the chatbot" · "What a chatbot would say" · "What the system will say"
> A chatbot says it; this system checks it. Left, a stub stands in for a model. Right, the gate, the part that must be right.

**0:10 - 0:32. The mechanic: two documents, delivery by day twelve.** Stage: step 1 as loaded (o1, o2 ticked, "delivery ≤ 12").
On screen [step 1]: "Yes: delivery is around day 7." · "Not established: delivery (days from order) at most 12 days." · "cut: upper bound" · "customs clearance: nothing bounds it from above" · "ungrounded" · "The chatbot said 2 days (a typical figure, not from any document)."
> Two documents on file. Is delivery by day twelve? The chatbot says yes, around day seven. The system says: not established. At least day four; nothing on file bounds customs from above. And the chatbot's two days for customs? Invented. The gate calls it ungrounded.

**0:32 - 0:52. Add the customs bulletin.** Stage: tick o3, "Customs bulletin" (or press "Step 4"). The by-hand record covers pressing Step 4; the checkbox route was checked with real clicks only as o3 then o4 (section 1), and the test above checks that the markup is the same.
On screen [step 4]: "entailed" · "Established: delivery (days from order) at most 12 days." · "between 4 and 9 days (lower bound from o1, o2; upper bound from o1, o2, o3)" · "The chatbot said 6 days (the sum of its own three figures)." · "Not established: delivery (days from order) exactly 6 days."
> Add the customs bulletin. Now the answer is established: delivery by day twelve, between day four and day nine, citing documents o1, o2 and o3. The chatbot's six days is cut back to four to nine.

**0:52 - 1:16. Add the courier tracking page.** Stage: tick o4, "Courier tracking page" (or press "Step 5"). Scroll to the pairwise block.
On screen [step 5]: "conflicted" · "Sources conflict: o1, o2, o3, o4 cannot all be true. No source is trusted over another." · "6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted"
> Now add the courier tracking page, which says day fourteen. Every ruling goes conflicted. All six pairs are consistent, all four triples are consistent, but the four together cannot be true. No pair shows it. No source is trusted over another.

**1:16 - 1:26. Recheck and forge.** Stage: press "Step 4" (the forge is disabled at step 5), then "Forge the Brief".
On screen [step 4, forged]: "Forge the Brief" · "NOT intact: the forged ruling does not re-derive" · "not re-derived: the upper bound says 10 but its own support gives 9"
> Back to three documents. Forge the Brief: raise the upper bound by one. Recheck says not intact: the bound says ten, its own support gives nine.

**1:26 - 1:30. Close.** Stage: scroll to the top.
On screen [step 4, forged]: "Beyond the chatbot" · "says only what they back."
> No model here. Say only what you can show.

## 3. What the script leaves out, and why

- Every ruling of the other steps (2, 3 and 6) is left out for time. Step 6, where the engine derives "customs 7 to 10" from three documents none of which says it, is the best candidate for a longer take; the by-hand record has its kind (contradicted) and no more.
- The close says "No model here". That is stated in the page's own text ("the drafter stands in for a language model") and in `.genesis/PLAN.md` D10; it is not a test result.
- What a Brief cannot show is in the failure suite, not on the page: for example that an extraction can be wrong (`tests/failures/01-extraction-fidelity-is-not-closed.test.ts` › "the half of the guard that holds"). The script does not claim the demo's documents are real; the page names them as sources and shows their quotes.
