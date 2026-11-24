"use client";

import { useReducer } from "react";
import {
  CUSTOM_OPS,
  CUSTOM_QUESTION,
  FIELD_NAMES,
  INITIAL_STATE,
  MENU_LABELS,
  PRESETS,
  computeDemoView,
  demoReducer,
  fieldLabel,
} from "./compute-demo-view.js";
import type { CardView, DemoState, DemoView, DocumentView, ForgeView, PairwiseView } from "./compute-demo-view.js";
import { KIND_GLOSS } from "./format-entailment.js";
import { citedByText } from "./format-evidence.js";

/**
 * THE DEMO PAGE (plan section 6, M8). It renders exactly what `computeDemoView` returns for the state and calls no engine
 * function: this file imports nothing from `lib/` or `domains/` (`__tests__/architecture.test.ts`). The state is one
 * `useReducer`; the view is recomputed during render from it, so there is no effect, no timer, no async, no memo and no
 * callback hook anywhere (`__tests__/architecture.test.ts` scans the parsed source for them).
 *
 * `initial` exists so a test can render a chosen state with `renderToStaticMarkup`; the page passes nothing.
 */

function Badge({ kind }: { readonly kind: CardView["kind"] }) {
  return (
    <span className="badge" data-kind={kind}>
      {kind}
    </span>
  );
}

function Chips({ ids, label }: { readonly ids: readonly string[]; readonly label: string }) {
  if (ids.length === 0) return null;
  return (
    <span className="chips">
      <span className="chips-label">{label}</span>
      {ids.map((id) => (
        <code key={id} className="chip">
          {id}
        </code>
      ))}
    </span>
  );
}

function Card({ card }: { readonly card: CardView }) {
  return (
    <article className="card" data-kind={card.kind} data-card={card.key}>
      <h4 className="card-title">
        <Badge kind={card.kind} /> <span>{card.heading}</span>
      </h4>
      {card.stated === null ? null : <p className="muted">{card.stated}</p>}
      <p className="sentence">{card.sentence}</p>
      <p className="muted">{KIND_GLOSS[card.kind]}</p>
      {card.cut === "" ? null : <p className="cut">{card.cut}</p>}
      {card.openEnds.length === 0 ? null : (
        <ul className="gaps" aria-label="Open ends">
          {card.openEnds.map((end) => (
            <li key={end}>{end}</li>
          ))}
        </ul>
      )}
      {card.support === null ? null : (
        <p className="support">
          <Chips ids={card.support.lo} label="lower bound from" /> <Chips ids={card.support.hi} label="upper bound from" />
        </p>
      )}
      {card.core === null ? null : (
        <p className="support">
          <Chips ids={card.core} label="core, cannot all be true" />
        </p>
      )}
      <p className="check" data-verdict={card.recheck.verdict}>
        <span className="check-label">recheck</span> {card.recheck.text}
      </p>
    </article>
  );
}

function Pairwise({ pairwise }: { readonly pairwise: PairwiseView }) {
  return (
    <section className="panel" aria-labelledby="pairwise-h">
      <h3 id="pairwise-h">Why this is a conflict nobody could see by comparing documents</h3>
      <p className="pairwise-line" data-testid="pairwise-line">
        {pairwise.line}
      </p>
      <p className="muted">
        Computed now by running the engine&apos;s <code>ground</code> on every subset of the documents above, not asserted.
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Every subset of the chosen documents and whether they can all be true together</caption>
          <thead>
            <tr>
              <th scope="col">Documents</th>
              <th scope="col">Can all be true together?</th>
            </tr>
          </thead>
          <tbody>
            {pairwise.rows.map((row) => (
              <tr key={row.members.join("+")}>
                <th scope="row">{row.members.join(" ")}</th>
                <td data-consistent={row.consistent ? "yes" : "no"}>{row.consistent ? "yes" : "no: conflicted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Forge({ forge, active, onForge }: { readonly forge: ForgeView; readonly active: boolean; readonly onForge: () => void }) {
  return (
    <section className="panel" aria-labelledby="forge-h">
      <h3 id="forge-h">Can the Brief be tampered with?</h3>
      <p className="muted">
        A Brief carries its evidence, so a holder can re-derive each ruling with <code>recheck</code>. Forge one: raise an upper bound by one while still citing
        the same documents.
      </p>
      <button type="button" className="button" aria-pressed={active && forge.available} aria-describedby="forge-note" disabled={!forge.available} onClick={onForge}>
        Forge the Brief
      </button>
      <p id="forge-note" className="muted">
        {forge.target === null
          ? "Nothing in this state has a finite upper bound that cites a document, so there is nothing to forge."
          : `This raises the upper bound of the ${forge.target.name} ruling from ${String(forge.target.honest)} to ${String(forge.target.forged)}.`}
      </p>
      {forge.result === null ? null : (
        <div className="forged" data-testid="forged">
          <p className="sentence">{forge.result.sentence}</p>
          <p className="check" data-verdict={forge.result.intact ? "reproduced" : "not-reproduced"}>
            <span className="check-label">recheck</span> {forge.result.intact ? "intact" : "NOT intact: the forged ruling does not re-derive"}
          </p>
          <ul className="findings">
            {forge.result.findings.map((finding) => (
              <li key={finding.name} data-verdict={finding.recheck.verdict}>
                <strong>{finding.name}</strong>: {finding.recheck.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Documents({ documents, onToggle }: { readonly documents: readonly DocumentView[]; readonly onToggle: (id: DocumentView["id"]) => void }) {
  return (
    <ul className="docs">
      {documents.map((doc) => (
        <li key={doc.id} className="doc" data-included={doc.included ? "yes" : "no"} data-cited={doc.citedBy.length > 0 ? "yes" : "no"}>
          <label className="doc-label">
            <input type="checkbox" checked={doc.included} onChange={() => onToggle(doc.id)} />
            <span className="doc-body">
              <span className="doc-head">
                <code className="chip">{doc.id}</code> <strong>{doc.source}</strong>
              </span>
              <span className="doc-quote">&ldquo;{doc.quote}&rdquo;</span>
              <span className="muted">read as {doc.typed}</span>
              {doc.included ? <span className="doc-cited">{citedByText(doc.citedBy)}</span> : <span className="muted">not included</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Results({ view }: { readonly view: DemoView }) {
  return (
    <>
      <p role="status" className="status">
        The system ruled your question <Badge kind={view.answer.kind} /> and checked its own Brief:{" "}
        {view.intact ? "every ruling it can check re-derives from the evidence it carries." : "a ruling does not re-derive."}
      </p>
      <Card card={view.answer} />
      <section aria-labelledby="brief-h" className="brief-block" data-testid="brief-block">
        <h3 id="brief-h">The Brief as text</h3>
        <pre className="brief" data-testid="brief-text">
          {view.rendered}
        </pre>
      </section>
      <h3 className="claims-h">Each claim the chatbot made, ruled</h3>
      {view.claims.map((card) => (
        <Card key={card.key} card={card} />
      ))}
      {view.refused.map((text) => (
        <p key={text} className="muted">
          {text}
        </p>
      ))}
    </>
  );
}

export function OrderDeskDemo({ initial = INITIAL_STATE }: { readonly initial?: DemoState }) {
  const [state, dispatch] = useReducer(demoReducer, initial);
  const result = computeDemoView(state);
  const documents = result.ok ? result.view.documents : result.documents;
  const paragraph = result.ok ? result.view.paragraph : result.paragraph;
  const customSelected = state.question === CUSTOM_QUESTION;

  const setCustom = (patch: Partial<DemoState["custom"]>): void => dispatch({ type: "custom", patch });

  return (
    <div className="demo">
      <header className="hero">
        <h1>Beyond the chatbot</h1>
        <p className="lede">
          A chatbot answers every question in the same confident voice. This system rules every claim against the documents it was given, and says only what they back. Change the
          documents or the question and watch the two columns diverge.
        </p>
        <p className="muted">
          Everything below runs the real engine in your browser: the drafter stands in for a language model, and the engine is the library this repository tests.
        </p>
      </header>

      <section className="panel" aria-labelledby="steps-h">
        <h2 id="steps-h">Start with the scripted steps</h2>
        <p className="muted">
          Step 1 shows the mechanic. Step 5 is the headline: add all four documents and ask <strong>delivery ≤ 12</strong> (by day 12).
        </p>
        <div className="step-row" role="group" aria-label="Scripted steps">
          {PRESETS.map((preset) => (
            <button key={preset.step} type="button" className="button" onClick={() => dispatch({ type: "preset", step: preset.step })}>
              Step {preset.step}: {preset.label}
            </button>
          ))}
        </div>
      </section>

      <div className="controls">
        <section className="panel" aria-labelledby="docs-h">
          <h2 id="docs-h">1. Choose the documents</h2>
          <p className="muted">The documents the system may use. Tick one to add it, untick to remove it.</p>
          <Documents documents={documents} onToggle={(id) => dispatch({ type: "toggle", id })} />
        </section>

        <section className="panel" aria-labelledby="q-h">
          <h2 id="q-h">2. Ask a question</h2>
          <fieldset className="questions">
            <legend>Pick a question or build your own</legend>
            {MENU_LABELS.map((label, index) => (
              <label key={label} className="choice">
                <input type="radio" name="question" checked={state.question === index} onChange={() => dispatch({ type: "ask", question: index })} />
                <span>{label}</span>
              </label>
            ))}
            <label className="choice">
              <input type="radio" name="question" checked={customSelected} onChange={() => dispatch({ type: "ask", question: CUSTOM_QUESTION })} />
              <span>Build my own</span>
            </label>
            <div className="builder">
              <label className="field">
                <span>Quantity</span>
                <select value={state.custom.field} onChange={(event) => setCustom({ field: FIELD_NAMES.find((name) => name === event.target.value) ?? state.custom.field })}>
                  {FIELD_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {fieldLabel(name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Is</span>
                <select value={state.custom.op} onChange={(event) => setCustom({ op: CUSTOM_OPS.find((entry) => entry.op === event.target.value)?.op ?? state.custom.op })}>
                  {CUSTOM_OPS.map((entry) => (
                    <option key={entry.op} value={entry.op}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{state.custom.op === "between" ? "From (days)" : "Days"}</span>
                <input type="text" inputMode="numeric" autoComplete="off" value={state.custom.a} onChange={(event) => setCustom({ a: event.target.value })} />
              </label>
              {state.custom.op === "between" ? (
                <label className="field">
                  <span>To (days)</span>
                  <input type="text" inputMode="numeric" autoComplete="off" value={state.custom.b} onChange={(event) => setCustom({ b: event.target.value })} />
                </label>
              ) : null}
            </div>
          </fieldset>
        </section>
      </div>

      <div className="columns">
        <section className="column chatbot" aria-labelledby="chatbot-h">
          <h2 id="chatbot-h">What a chatbot would say</h2>
          <p className="paragraph" data-testid="chatbot-paragraph">
            {paragraph ?? "No question to answer yet."}
          </p>
          <p className="muted">One confident value for every quantity, whatever the documents say. Nothing here is checked.</p>
        </section>

        <section className="column system" aria-labelledby="system-h">
          <h2 id="system-h">What the system will say</h2>
          {result.ok ? (
            <Results view={result.view} />
          ) : (
            <div className="refusal" role="status" data-testid="refusal">
              <p className="sentence">{result.error.message}</p>
              <p className="muted">The system refused to answer this. The chatbot, left, answered anyway.</p>
            </div>
          )}
        </section>
      </div>

      {result.ok && result.view.pairwise !== null ? <Pairwise pairwise={result.view.pairwise} /> : null}
      {result.ok ? <Forge forge={result.view.forge} active={state.forge !== null} onForge={() => dispatch({ type: "forge" })} /> : null}
    </div>
  );
}
