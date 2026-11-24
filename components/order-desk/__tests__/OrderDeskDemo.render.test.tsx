import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { obsId } from "../../../lib/contracts/index.js";
import type { ObsId } from "../../../lib/contracts/index.js";
import { QUESTIONS, runScript } from "../../../domains/order-desk/index.js";
import { OrderDeskDemo } from "../OrderDeskDemo.js";
import { CUSTOM_QUESTION, DOCUMENT_IDS, INITIAL_CUSTOM, INITIAL_STATE, PRESETS, demoReducer } from "../compute-demo-view.js";
import type { CustomQuestion, DemoState } from "../compute-demo-view.js";

/**
 * RENDER-SMOKE (plan section 6, M8, check (4)): `renderToStaticMarkup` over a handful of initial states, in `vitest`'s node
 * environment, no jsdom. What this CAN pin is what the markup says for a given state: the text the engine produced is on
 * the page verbatim, the chatbot column is never hidden, the markup is deterministic, and the static structure (headings,
 * labels, tables) is as claimed. What it CANNOT see is a click: which `dispatch` each control is wired to is NOT pinned
 * by any test in this repository (the node environment has no click path); the plan assigns that to a manual run against
 * the live URL, recorded in `docs/WALKTHROUGH.md` (M9). The reducer the controls call is pinned in `compute-demo-view.test.ts`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const render = (state: DemoState): string => renderToStaticMarkup(<OrderDeskDemo initial={state} />);
const state = (included: readonly ObsId[], question: number, forge: DemoState["forge"] = null, custom: CustomQuestion = INITIAL_CUSTOM): DemoState => ({ included, question, forge, custom });

/** What React's server renderer does to text: the five characters it escapes. */
const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const run = runScript();
if (!run.ok) throw new Error("the demo script did not run");
const steps = run.steps;

describe("the page renders the engine's text, as it is", () => {
  it("the default state is step 1: both columns, the chatbot's paragraph, the rendered Brief, and one card per claim", () => {
    const markup = render(INITIAL_STATE);
    expect(markup).toContain("What a chatbot would say");
    expect(markup).toContain("What the system will say");
    expect(markup).toContain(escapeHtml(steps[0]!.paragraph));
    expect(markup).toContain(escapeHtml(steps[0]!.rendered));
    expect(markup.match(/data-card="/g)).toHaveLength(5);
  });

  it.each(PRESETS.map((preset, index) => ({ preset, step: steps[index]! })))("scripted step $preset.step: the paragraph, the rendered Brief and every sentence of the demo are in the markup", ({ preset, step }) => {
    const markup = render(demoReducer(INITIAL_STATE, { type: "preset", step: preset.step }));
    expect(markup).toContain(escapeHtml(step.paragraph));
    expect(markup).toContain(escapeHtml(step.rendered));
    for (const line of step.rendered.split("\n")) expect(markup).toContain(escapeHtml(line.replace(/^(- |Question: )/, "")));
  });

  it("step 5 is the conflict block: the four-document core, the rendered Brief, the pairwise line and its eleven rows", () => {
    const markup = render(demoReducer(INITIAL_STATE, { type: "preset", step: 5 }));
    expect(markup).toContain(escapeHtml(steps[4]!.rendered));
    expect(markup).toContain("6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted");
    expect(markup.match(/<tr>/g)).toHaveLength(12); // header row + 11
    expect(markup).toContain("core, cannot all be true");
    for (const id of ["o1", "o2", "o3", "o4"]) expect(markup).toContain(`<code class="chip">${id}</code>`);
    // the headline words are on the page
    expect(markup).toContain("conflicted");
  });

  it("the pairwise section is absent in every scripted step but step 5", () => {
    for (const preset of PRESETS) {
      const markup = render(demoReducer(INITIAL_STATE, { type: "preset", step: preset.step }));
      expect(markup.includes('data-testid="pairwise-line"')).toBe(preset.step === 5);
    }
  });

  it("all 80 states render: the chatbot column and the system column are both present, the markup is the same twice, and nothing prints undefined, NaN or [object", () => {
    let count = 0;
    for (let mask = 0; mask < 16; mask++) {
      const included = DOCUMENT_IDS.filter((_, bit) => (mask & (1 << bit)) !== 0);
      QUESTIONS.forEach((_, question) => {
        const s = state(included, question);
        const markup = render(s);
        expect(markup).toBe(render(s));
        expect(markup).toContain('data-testid="chatbot-paragraph"');
        expect(markup).toContain('data-testid="brief-text"');
        for (const bad of ["undefined", "NaN", "[object", "null"]) expect(markup, `${bad} in ${included.join(" ")}/${question}`).not.toContain(bad);
        count++;
      });
    }
    expect(count).toBe(80);
  });

  it("a document's checkbox is checked exactly when the state includes it", () => {
    const markup = render(state([obsId("o1"), obsId("o3")], 0));
    const boxes = [...markup.matchAll(/<input type="checkbox"([^>]*)>/g)].map((match) => (match[1] ?? "").includes("checked"));
    expect(boxes).toEqual([true, false, true, false]);
  });

  it("the selected question's radio is the one checked", () => {
    for (const question of [0, 3, CUSTOM_QUESTION]) {
      const markup = render(state([obsId("o1")], question));
      const radios = [...markup.matchAll(/<input type="radio"([^>]*)>/g)].map((match) => (match[1] ?? "").includes("checked"));
      expect(radios.filter(Boolean)).toHaveLength(1);
      expect(radios[question]).toBe(true);
    }
  });
});

describe("when the system refuses, the chatbot column is still there", () => {
  it("a question the schema already implies: the refusal is shown AND the chatbot's paragraph is", () => {
    const markup = render(state(DOCUMENT_IDS, CUSTOM_QUESTION, null, { field: "customsDays", op: "at-least", a: "0", b: "" }));
    expect(markup).toContain('data-testid="refusal"');
    expect(markup).toContain("already implies");
    expect(markup).toContain('data-testid="chatbot-paragraph"');
    expect(markup).toContain("Yes: customs clearance takes about 1 day.");
    expect(markup).not.toContain('data-testid="brief-text"');
  });

  it("text that is not a number: the refusal says so and the chatbot column says there is no question yet", () => {
    const markup = render(state(DOCUMENT_IDS, CUSTOM_QUESTION, null, { ...INITIAL_CUSTOM, a: "twelve" }));
    expect(markup).toContain("Enter a whole number");
    expect(markup).toContain("No question to answer yet.");
  });

  it("an unreadable state still renders the page, with the controls", () => {
    const markup = render(state([obsId("o9")], 0));
    expect(markup).toContain("The documents chosen are not among the four.");
    expect(markup).toContain('type="checkbox"');
  });
});

describe("the forge", () => {
  it("off: the control is enabled in step 1, explains what it would do, and no forged result is shown", () => {
    const markup = render(INITIAL_STATE);
    expect(markup).toContain("Forge the Brief");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("This raises the upper bound of the");
    expect(markup).not.toContain('data-testid="forged"');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Forge the Brief/);
  });

  it("on, in step 4: the forged ruling does not re-derive, and the page says which bound and what its support gives", () => {
    const markup = render(state(PRESETS[3]!.included, PRESETS[3]!.question, "raise-upper-bound"));
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-testid="forged"');
    expect(markup).toContain("NOT intact");
    expect(markup).toContain("the upper bound says 10 but its own support gives 9");
  });

  it("in a state with nothing to forge the control is disabled and says why", () => {
    const markup = render(state([], 0));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Forge the Brief/);
    expect(markup).toContain("so there is nothing to forge");
  });
});

describe("static structure of the markup (what a click-free test can say about accessibility)", () => {
  const markup = render(demoReducer(INITIAL_STATE, { type: "preset", step: 5 }));

  it("one h1; the sections are h2s with ids that their regions are labelled by", () => {
    expect(markup.match(/<h1>/g)).toHaveLength(1);
    for (const id of ["steps-h", "docs-h", "q-h", "chatbot-h", "system-h"]) {
      expect(markup).toContain(`id="${id}"`);
      expect(markup).toContain(`aria-labelledby="${id}"`);
    }
  });

  it("every input and select is inside a label, the question radios are in a fieldset with a legend, and the table has a caption and column headers", () => {
    const controls = markup.match(/<(input|select)\b/g) ?? [];
    const labelled = markup.match(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*?<(input|select)\b/g) ?? [];
    expect(controls.length).toBeGreaterThan(8);
    expect(labelled.length).toBe(controls.length);
    expect(markup).toMatch(/<fieldset[^>]*><legend>/);
    expect(markup).toContain("<caption");
    expect(markup).toContain('<th scope="col">');
    expect(markup).toContain('<th scope="row">');
  });

  it("the status line is a live region and every kind is shown by word, not colour alone", () => {
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-kind="conflicted">conflicted</span>');
  });

  it("there is no inline style, no script and no event-handler attribute in the markup", () => {
    expect(markup).not.toMatch(/\sstyle=/);
    expect(markup).not.toContain("<script");
    expect(markup).not.toMatch(/\son[a-z]+=/);
  });
});

describe("the stylesheet (read as text: the node environment has no layout engine, so a 375 px check is by hand)", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  /** The bodies of every rule whose selector list names `selector` exactly (a rule may be shared by several selectors). */
  const rulesFor = (selector: string): string[] =>
    css
      .split("}")
      .map((chunk) => chunk.split("{"))
      .filter((parts) => parts.length === 2 && (parts[0] ?? "").split(",").map((name) => name.trim()).includes(selector))
      .map((parts) => parts[1] ?? "");
  const ruleBody = (selector: string): string => {
    const bodies = rulesFor(selector);
    expect(bodies.length, `a rule names ${selector}`).toBeGreaterThan(0);
    return bodies.join(";");
  };

  it.each([".button", ".doc-label", ".choice", ".field select"])("%s has a 44 px minimum height (a touch target)", (selector) => {
    expect(ruleBody(selector)).toMatch(/min-height:\s*44px/);
  });

  it("the text input in the builder is also at least 44 px", () => {
    expect(ruleBody(".field input")).toMatch(/min-height:\s*44px/);
  });

  it("has a :focus-visible rule with a visible outline", () => {
    expect(ruleBody(":focus-visible")).toMatch(/outline:\s*3px solid/);
  });

  it("every colour token of :root is redefined for dark, and dark follows the system unless the page says light", () => {
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    const tokens = [...root.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]!);
    const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
    expect(darkStart).toBeGreaterThan(-1);
    expect(css.slice(darkStart, darkStart + 200)).toContain(':root:not([data-theme="light"])');
    const dark = css.slice(darkStart, css.indexOf("* {", darkStart));
    expect(tokens.length).toBeGreaterThan(15);
    expect(tokens.filter((token) => !dark.includes(`${token}:`))).toEqual([]);
  });

  it("the two-column layouts collapse to one column below 52 rem (a single column at 375 px)", () => {
    expect(ruleBody(".columns")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(ruleBody(".controls")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toMatch(/@media \(min-width: 52rem\)\s*\{\s*\.controls,\s*\.columns\s*\{\s*grid-template-columns: repeat\(2/);
  });
});
