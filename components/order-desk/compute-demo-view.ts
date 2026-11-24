import { assertNeverEntailment } from "../../lib/contracts/index.js";
import type { Brief, Claim, Entailment, Extent, ObsId, Observation, Schema } from "../../lib/contracts/index.js";
import { declOf, ground } from "../../lib/ground/index.js";
import { answer, recheck, renderBrief, renderEntailment } from "../../lib/entail/index.js";
import type { RecheckFinding } from "../../lib/entail/index.js";
import { CANON_SCRIPT, FIELDS, OBSERVATIONS, ORDER_DESK_SCHEMA, QUESTIONS, SNAPSHOTS, claimsOf, fluentDraft, renderFluent } from "../../domains/order-desk/index.js";
import type { FieldName, FluentDraft } from "../../domains/order-desk/index.js";
import { basisText, daysPhrase, cutText, openEndText, reproductionText } from "./format-entailment.js";
import type { Kind } from "./format-entailment.js";
import { intervalText, pairwiseLine } from "./format-evidence.js";

/**
 * THE ONE BRIDGE (plan section 6, M8). This is the only file under `components/` that imports `lib/**` or `domains/**`
 * (`__tests__/architecture.test.ts` pins that, type imports included); the component renders exactly what
 * `computeDemoView` returns and calls no engine function itself. Every ruling, support id, core and pairwise result in
 * a `DemoView` was produced by the engine for the state it was computed from, on this call: there is no stored
 * transcript, and nothing is cached between calls.
 *
 * THE COMPOSITION is the one `runScript` (domains/order-desk/script.ts) uses, over the documents the state includes:
 * `ground` the snapshot, `fluentDraft` the chatbot's four claims, `answer` rules the question and every claim,
 * `renderBrief` and `recheck` the result. For the six scripted steps the output is the same Brief, text and findings as
 * `runScript`'s (`__tests__/compute-demo-view.test.ts` compares them in full).
 *
 * NEVER THROWS, in two layers: every failure the engine reports is a typed `{ ok: false }`, and the whole body is also
 * inside a `try`, the second layer, for anything else. An `{ ok: false }` still carries the chatbot's paragraph when a
 * question could be formed, so the page never hides the chatbot column because the system refused.
 *
 * WHAT THE PAGE DERIVES ITSELF, all named by the plan (ADR 0008 lists them): (1) the forge, `forgeTarget` below;
 * (2) the pairwise table, by `ground` on every subset of the included documents of size two upward; (3) the custom
 * question, a `Claim` built from a quantity, an operator and one or two integers. Labels and glosses are display text.
 */

// ---- state ------------------------------------------------------------------------------------------------

/** The four documents, in the domain's order. */
export const DOCUMENT_IDS: readonly ObsId[] = OBSERVATIONS.map((observation) => observation.id);

/** The only forge there is: raise by one the established upper bound of a ruling that cites support for it. */
export type ForgeChoice = "raise-upper-bound";

export type CustomOp = "at-most" | "at-least" | "exactly" | "between";

/** The custom builder's fields as typed text; `computeDemoView` reads them as integers or says why not. */
export interface CustomQuestion {
  readonly field: FieldName;
  readonly op: CustomOp;
  readonly a: string;
  readonly b: string;
}

/**
 * The page's whole state (plan: `{ included, question, forge }`, plus `custom`, which holds the custom builder's text
 * so that the builder survives a switch to a menu question; ADR 0008, Decision 2). `question` is an index into the
 * domain's five-item menu, or `CUSTOM_QUESTION` for the builder.
 */
export interface DemoState {
  readonly included: readonly ObsId[];
  readonly question: number;
  readonly forge: ForgeChoice | null;
  readonly custom: CustomQuestion;
}

export const CUSTOM_QUESTION: number = QUESTIONS.length;

/** The five menu questions' labels, in the domain's order. */
export const MENU_LABELS: readonly string[] = QUESTIONS.map((entry) => entry.label);

export const FIELD_NAMES: readonly FieldName[] = ["packDays", "transitDays", "customsDays", "deliveryDay"];
export const CUSTOM_OPS: readonly { readonly op: CustomOp; readonly label: string }[] = [
  { op: "at-most", label: "at most" },
  { op: "at-least", label: "at least" },
  { op: "exactly", label: "exactly" },
  { op: "between", label: "between" },
];

/** The schema's own label of a field, for the builder's quantity menu. */
export function fieldLabel(name: FieldName): string {
  return declOf(ORDER_DESK_SCHEMA, FIELDS[name])?.label ?? name;
}

const SHORT: { readonly [K in FieldName]: string } = { packDays: "packing", transitDays: "transit", customsDays: "customs", deliveryDay: "delivery" };

export const INITIAL_CUSTOM: CustomQuestion = { field: "deliveryDay", op: "at-most", a: "12", b: "" };

/** The six scripted steps of the domain, as page states: the document ids and the menu question of each. */
export const PRESETS: readonly { readonly step: number; readonly included: readonly ObsId[]; readonly question: number; readonly label: string }[] = CANON_SCRIPT.map((entry) => ({
  step: entry.step,
  included: SNAPSHOTS[entry.snapshot] ?? [],
  question: entry.question,
  label: `${(SNAPSHOTS[entry.snapshot] ?? []).join(" ")} · ${QUESTIONS[entry.question]?.label ?? "?"}`,
}));

/** Step 1 of the domain's script: the moment the mechanic fires. */
export const INITIAL_STATE: DemoState = {
  included: PRESETS[0]?.included ?? [],
  question: PRESETS[0]?.question ?? 0,
  forge: null,
  custom: INITIAL_CUSTOM,
};

export type DemoAction =
  | { readonly type: "toggle"; readonly id: ObsId }
  | { readonly type: "ask"; readonly question: number }
  | { readonly type: "custom"; readonly patch: Partial<CustomQuestion> }
  | { readonly type: "forge" }
  | { readonly type: "preset"; readonly step: number };

/**
 * The reducer. Any change of documents or question clears the forge (a forge is made from one particular ruling, so it
 * cannot outlive the ruling). Editing the custom builder selects it. An id that is not one of the four, a question
 * outside the menu and a step that is not scripted change nothing.
 */
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "toggle": {
      if (!DOCUMENT_IDS.includes(action.id)) return state;
      const next = state.included.includes(action.id) ? state.included.filter((id) => id !== action.id) : [...state.included, action.id];
      return { ...state, included: DOCUMENT_IDS.filter((id) => next.includes(id)), forge: null };
    }
    case "ask":
      if (!Number.isInteger(action.question) || action.question < 0 || action.question > CUSTOM_QUESTION) return state;
      return { ...state, question: action.question, forge: null };
    case "custom":
      return { ...state, question: CUSTOM_QUESTION, custom: { ...state.custom, ...action.patch }, forge: null };
    case "forge":
      return { ...state, forge: state.forge === null ? "raise-upper-bound" : null };
    case "preset": {
      const preset = PRESETS.find((candidate) => candidate.step === action.step);
      return preset === undefined ? state : { ...state, included: preset.included, question: preset.question, forge: null };
    }
    default:
      return state;
  }
}

// ---- the view ---------------------------------------------------------------------------------------------

export interface RecheckView {
  readonly verdict: "reproduced" | "not-reproduced" | "uncertifiable-silence";
  /** For `not-reproduced`, the engine's reason kind (`bound-differs` ...); `null` otherwise. */
  readonly reasonKind: string | null;
  readonly text: string;
}

/** One ruling, as a card. `sentence` is `renderEntailment`'s, as it is. */
export interface CardView {
  readonly key: string;
  readonly role: "question" | "draft";
  /** "question", "claim 1" ...: how a document's "cited by" names this card. */
  readonly name: string;
  readonly heading: string;
  /** For a draft claim, what the chatbot stated and where the value came from. */
  readonly stated: string | null;
  readonly kind: Kind;
  readonly sentence: string;
  /** For a `weakened` ruling: the cut, named. Empty otherwise. */
  readonly cut: string;
  readonly openEnds: readonly string[];
  readonly support: { readonly lo: readonly string[]; readonly hi: readonly string[] } | null;
  readonly core: readonly string[] | null;
  readonly recheck: RecheckView;
}

export interface DocumentView {
  readonly id: ObsId;
  readonly source: string;
  readonly quote: string;
  readonly typed: string;
  readonly included: boolean;
  /** The `name` of every card whose support or core names this document. */
  readonly citedBy: readonly string[];
}

export interface PairwiseRow {
  readonly members: readonly string[];
  readonly consistent: boolean;
}

export interface PairwiseView {
  readonly rows: readonly PairwiseRow[];
  readonly line: string;
}

export interface ForgeView {
  /** Whether the control can be used in this state. */
  readonly available: boolean;
  /** Which ruling would be forged, and the two bounds, when `available`. */
  readonly target: { readonly name: string; readonly honest: number; readonly forged: number } | null;
  /** Present when the state asks for the forge and it is available. */
  readonly result: {
    readonly sentence: string;
    readonly intact: boolean;
    readonly findings: readonly { readonly name: string; readonly recheck: RecheckView }[];
  } | null;
}

export interface DemoView {
  readonly questionLabel: string;
  readonly paragraph: string;
  /** `renderBrief`'s text for the Brief, as it is. */
  readonly rendered: string;
  readonly answer: CardView;
  readonly claims: readonly CardView[];
  readonly refused: readonly string[];
  readonly documents: readonly DocumentView[];
  readonly intact: boolean;
  readonly pairwise: PairwiseView | null;
  readonly forge: ForgeView;
}

export type DemoError =
  | { readonly kind: "bad-state"; readonly message: string }
  | { readonly kind: "custom-invalid"; readonly message: string }
  | { readonly kind: "question-rejected"; readonly message: string }
  | { readonly kind: "engine-failed"; readonly message: string }
  | { readonly kind: "internal"; readonly message: string };

export type DemoResult =
  | { readonly ok: true; readonly view: DemoView }
  | { readonly ok: false; readonly error: DemoError; readonly paragraph: string | null; readonly documents: readonly DocumentView[] };

// ---- pieces -----------------------------------------------------------------------------------------------

const INTEGER_TEXT = /^-?[0-9]{1,12}$/;

/** `text` as an integer, or `undefined`. Digits and one optional minus only: no locale, no exponent, no whitespace. */
function integerOf(text: string): number | undefined {
  return INTEGER_TEXT.test(text) ? Number(text) : undefined;
}

/** The builder's text as a question: a label and a `Claim`, or the reason it is not one. */
function customQuestion(custom: CustomQuestion): { readonly ok: true; readonly label: string; readonly claim: Claim } | { readonly ok: false; readonly message: string } {
  const a = integerOf(custom.a);
  const b = integerOf(custom.b);
  const name = SHORT[custom.field];
  const field = FIELDS[custom.field];
  if (a === undefined) return { ok: false, message: "Enter a whole number for the question." };
  switch (custom.op) {
    case "at-most":
      return { ok: true, label: `${name} ≤ ${String(a)}`, claim: { field, extent: { lo: null, hi: a } } };
    case "at-least":
      return { ok: true, label: `${name} ≥ ${String(a)}`, claim: { field, extent: { lo: a, hi: null } } };
    case "exactly":
      return { ok: true, label: `${name} = ${String(a)}`, claim: { field, extent: { lo: a, hi: a } } };
    case "between":
      if (b === undefined) return { ok: false, message: "Enter two whole numbers for a range." };
      return { ok: true, label: `${name} between ${String(a)} and ${String(b)}`, claim: { field, extent: { lo: a, hi: b } } };
    default:
      return { ok: false, message: "Choose at most, at least, exactly or between." };
  }
}

function documentsOf(included: readonly ObsId[], citedBy: ReadonlyMap<string, readonly string[]>): DocumentView[] {
  return OBSERVATIONS.map((observation) => ({
    id: observation.id,
    source: observation.source,
    quote: observation.quote,
    typed: `${declOf(ORDER_DESK_SCHEMA, observation.field)?.label ?? observation.field} ∈ ${intervalText(observation.extent.lo, observation.extent.hi)}`,
    included: included.includes(observation.id),
    citedBy: citedBy.get(observation.id) ?? [],
  }));
}

function failure(error: DemoError, paragraph: string | null, included: readonly ObsId[]): DemoResult {
  return { ok: false, error, paragraph, documents: documentsOf(included, new Map()) };
}

function rejectionText(fault: { readonly kind: string }): string {
  switch (fault.kind) {
    case "vacuous-claim":
      return "The schema already implies this, so it rules nothing out. Ask something the documents could change.";
    case "malformed":
      return "This is not a well-formed range of whole numbers (the lower end may not exceed the upper, and numbers are limited in size).";
    default:
      return "The engine could not read this question.";
  }
}

const FINDING_NAME = (position: "answer" | number): string => (position === "answer" ? "question" : `claim ${String(position + 1)}`);

function recheckViewOf(finding: RecheckFinding | undefined): RecheckView {
  if (finding === undefined) return { verdict: "not-reproduced", reasonKind: "no-finding", text: "no finding was produced for this ruling" };
  const result = finding.result;
  return { verdict: result.kind, reasonKind: result.kind === "not-reproduced" ? result.reason.kind : null, text: reproductionText(result) };
}

/** The observation ids a ruling rests on: a support's, or a core. Exhaustive over the five kinds. */
function citedIds(e: Entailment): readonly string[] {
  switch (e.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
      return [...e.support.lo, ...e.support.hi];
    case "conflicted":
      return e.core;
    case "ungrounded":
      return [];
    default:
      return assertNeverEntailment(e);
  }
}

/**
 * THE FORGE TARGET (plan, M8 Scope): the established upper bound of the answer's ruling if that bound is finite and
 * cites support, else of the first draft claim that has such a bound; `undefined` if none does. `position` indexes
 * `brief.claims`, or is "answer".
 */
export function forgeTarget(brief: Brief): { readonly position: "answer" | number; readonly honest: number } | undefined {
  const candidates: readonly { readonly position: "answer" | number; readonly ruling: Entailment }[] = [{ position: "answer", ruling: brief.answer }, ...brief.claims.map((ruling, index) => ({ position: index, ruling }))];
  for (const { position, ruling } of candidates) {
    if ((ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted") && ruling.established.hi !== null && ruling.support.hi.length > 0) {
      return { position, honest: ruling.established.hi };
    }
  }
  return undefined;
}

/** The Brief with that one upper bound raised by one and its support left as it was. A fresh value; `brief` is not changed. */
function forged(brief: Brief, target: { readonly position: "answer" | number; readonly honest: number }): Brief {
  const raise = (ruling: Entailment): Entailment =>
    ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted" ? { ...ruling, established: { lo: ruling.established.lo, hi: target.honest + 1 } satisfies Extent } : ruling;
  return target.position === "answer"
    ? { ...brief, answer: raise(brief.answer) }
    : { ...brief, claims: brief.claims.map((ruling, index) => (index === target.position ? raise(ruling) : ruling)) };
}

/** Every subset of `items` with exactly `size` members, in a fixed order (by position of the members in `items`). */
export function subsetsOfSize<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, index) => {
    for (const rest of subsetsOfSize(items.slice(index + 1), size - 1)) out.push([item, ...rest]);
  });
  return out;
}

/** Does `ground` find the observations consistent? `undefined`: it refused them (not a verdict on consistency). */
function groundsConsistently(observations: readonly Observation[]): boolean | undefined {
  const grounded = ground(ORDER_DESK_SCHEMA, observations);
  if (!grounded.ok || grounded.rejected.length > 0) return undefined;
  return grounded.grounding.trees.every((tree) => tree.state.kind === "consistent");
}

/** The pairwise table of a conflict: `ground` on every subset of the included documents of size two up to the whole set. */
export function pairwiseOf(observations: readonly Observation[]): PairwiseView | undefined {
  const rows: PairwiseRow[] = [];
  const groups: { size: number; total: number; consistent: number }[] = [];
  for (let size = 2; size < observations.length; size++) {
    const group = { size, total: 0, consistent: 0 };
    for (const subset of subsetsOfSize(observations, size)) {
      const consistent = groundsConsistently(subset);
      if (consistent === undefined) return undefined;
      rows.push({ members: subset.map((observation) => observation.id), consistent });
      group.total++;
      if (consistent) group.consistent++;
    }
    groups.push(group);
  }
  const whole = groundsConsistently(observations);
  if (whole === undefined) return undefined;
  rows.push({ members: observations.map((observation) => observation.id), consistent: whole });
  return { rows, line: pairwiseLine(groups, observations.length, whole) };
}

function cardOf(schema: Schema, role: "question" | "draft", name: string, heading: string, stated: string | null, ruling: Entailment, finding: RecheckFinding | undefined): CardView {
  return {
    key: name.replace(" ", "-"),
    role,
    name,
    heading,
    stated,
    kind: ruling.kind,
    sentence: renderEntailment(schema, ruling),
    cut: ruling.kind === "weakened" ? cutText(ruling.unmet) : "",
    openEnds: ruling.kind === "weakened" || ruling.kind === "ungrounded" ? ruling.openEnds.map((end) => openEndText(declOf(schema, end.field)?.label ?? end.field, end.side)) : [],
    support: ruling.kind === "entailed" || ruling.kind === "weakened" || ruling.kind === "contradicted" ? { lo: ruling.support.lo, hi: ruling.support.hi } : null,
    core: ruling.kind === "conflicted" ? ruling.core : null,
    recheck: recheckViewOf(finding),
  };
}

// ---- the function -----------------------------------------------------------------------------------------

/**
 * The page's whole view of one state, computed by the engine on this call. Total: it returns `{ ok: false }` for a state
 * it cannot read, a question the engine refuses, or anything that throws.
 */
export function computeDemoView(state: DemoState): DemoResult {
  let included: readonly ObsId[] = [];
  let paragraph: string | null = null;
  try {
    // Read the state once, into locals: a getter that throws lands in the `catch` below.
    const rawIncluded = state.included;
    const questionIndex = state.question;
    const forgeChoice = state.forge;
    const custom = state.custom;
    if (!Array.isArray(rawIncluded) || new Set(rawIncluded).size !== rawIncluded.length || !rawIncluded.every((id) => DOCUMENT_IDS.includes(id))) {
      return failure({ kind: "bad-state", message: "The documents chosen are not among the four." }, null, []);
    }
    included = rawIncluded;
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > CUSTOM_QUESTION) {
      return failure({ kind: "bad-state", message: "The question chosen is not on the menu." }, null, included);
    }

    let questionLabel: string;
    let question: Claim;
    if (questionIndex === CUSTOM_QUESTION) {
      const built = customQuestion(custom);
      if (!built.ok) return failure({ kind: "custom-invalid", message: built.message }, null, included);
      questionLabel = built.label;
      question = built.claim;
    } else {
      const entry = QUESTIONS[questionIndex];
      if (entry === undefined) return failure({ kind: "bad-state", message: "The question chosen is not on the menu." }, null, included);
      questionLabel = entry.label;
      question = entry.claim;
    }

    const observations = OBSERVATIONS.filter((observation) => included.includes(observation.id));
    const draft: FluentDraft = fluentDraft(observations, question);
    paragraph = renderFluent(draft);

    const grounded = ground(ORDER_DESK_SCHEMA, observations);
    if (!grounded.ok) return failure({ kind: "engine-failed", message: `The engine refused the documents (${grounded.failure.kind}).` }, paragraph, included);
    if (grounded.rejected.length > 0) return failure({ kind: "engine-failed", message: "The engine refused one of the documents at intake." }, paragraph, included);
    const schema = grounded.grounding.schema;

    const answered = answer(grounded.grounding, question, claimsOf(draft));
    if (!answered.ok) {
      const failed = answered.failure;
      if (failed.kind === "question-rejected") return failure({ kind: "question-rejected", message: rejectionText(failed.fault) }, paragraph, included);
      return failure({ kind: "engine-failed", message: `The engine could not rule this question (${failed.kind}).` }, paragraph, included);
    }
    const brief = answered.brief;
    const rechecked = recheck(schema, brief);
    if (!rechecked.ok) return failure({ kind: "engine-failed", message: `The engine could not re-check its own Brief (${rechecked.failure.kind}).` }, paragraph, included);
    const findingAt = (position: "answer" | number): RecheckFinding | undefined => rechecked.findings.find((finding) => finding.position === position);

    // Which draft position each ruled claim is: `answer` refuses a claim before ruling and keeps the rest in draft order.
    const refusedAt = new Set(brief.rejected.map((rejection) => rejection.index));
    const draftPositions = draft.statements.map((_, position) => position).filter((position) => !refusedAt.has(position));

    const answerCard = cardOf(schema, "question", "question", `Your question: ${questionLabel}`, null, brief.answer, findingAt("answer"));
    const claimCards = brief.claims.map((ruling, index) => {
      const position = draftPositions[index] ?? index;
      const statement = draft.statements[position];
      const value = statement?.claim.extent.lo;
      const label = declOf(schema, ruling.field)?.label ?? ruling.field;
      const stated = statement === undefined || value === null || value === undefined ? null : `The chatbot said ${daysPhrase(value)} (${basisText(statement.basis)}).`;
      return cardOf(schema, "draft", `claim ${String(position + 1)}`, `Draft claim ${String(position + 1)}: ${label}`, stated, ruling, findingAt(index));
    });
    const cards = [answerCard, ...claimCards];

    const citedBy = new Map<string, string[]>();
    const rulings: readonly Entailment[] = [brief.answer, ...brief.claims];
    rulings.forEach((ruling, index) => {
      const card = cards[index];
      if (card === undefined) return;
      for (const id of new Set(citedIds(ruling))) citedBy.set(id, [...(citedBy.get(id) ?? []), card.name]);
    });

    const pairwise = brief.answer.kind === "conflicted" ? (pairwiseOf(observations) ?? null) : null;

    const target = forgeTarget(brief);
    let forge: ForgeView = { available: false, target: null, result: null };
    if (target !== undefined) {
      const targetName = target.position === "answer" ? "question" : (claimCards[target.position]?.name ?? FINDING_NAME(target.position));
      const forgedBrief = forged(brief, target);
      let result: ForgeView["result"] = null;
      if (forgeChoice === "raise-upper-bound") {
        const forgedCheck = recheck(schema, forgedBrief);
        if (!forgedCheck.ok) return failure({ kind: "engine-failed", message: `The engine could not re-check the forged Brief (${forgedCheck.failure.kind}).` }, paragraph, included);
        const forgedRuling = target.position === "answer" ? forgedBrief.answer : forgedBrief.claims[target.position];
        result = {
          sentence: forgedRuling === undefined ? "" : renderEntailment(schema, forgedRuling),
          intact: forgedCheck.intact,
          findings: forgedCheck.findings.map((finding) => ({ name: finding.position === "answer" ? "question" : (claimCards[finding.position]?.name ?? FINDING_NAME(finding.position)), recheck: recheckViewOf(finding) })),
        };
      }
      forge = { available: true, target: { name: targetName, honest: target.honest, forged: target.honest + 1 }, result };
    }

    return {
      ok: true,
      view: {
        questionLabel,
        paragraph,
        rendered: renderBrief(schema, brief),
        answer: answerCard,
        claims: claimCards,
        refused: brief.rejected.map((rejection) => `Draft position ${String(rejection.index + 1)} was refused before ruling.`),
        documents: documentsOf(included, citedBy),
        intact: rechecked.intact,
        pairwise,
        forge,
      },
    };
  } catch {
    // The second layer: whatever threw is not echoed.
    return failure({ kind: "internal", message: "Something unexpected stopped this computation." }, paragraph, included);
  }
}
