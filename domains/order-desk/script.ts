import type { Brief, Claim, ObsId, RejectedObservation, Schema } from "../../lib/contracts/index.js";
import { ground } from "../../lib/ground/index.js";
import type { GroundFailure } from "../../lib/ground/index.js";
import { answer, recheck, renderBrief } from "../../lib/entail/index.js";
import type { AnswerFailure, RecheckFinding } from "../../lib/entail/index.js";
import { claimsOf, fluentDraft, renderFluent } from "./drafter.js";
import type { FluentDraft } from "./drafter.js";
import { deepFreeze } from "./freeze.js";
import { observationsOf, SNAPSHOTS } from "./observations.js";
import { QUESTIONS } from "./questions.js";
import { ORDER_DESK_SCHEMA } from "./schema.js";

/** One scripted step: which snapshot (an index into `SNAPSHOTS`) is asked which question (an index into `QUESTIONS`). */
export interface ScriptStep {
  readonly step: number;
  readonly snapshot: number;
  readonly question: number;
}

/**
 * The six steps of plan section 7: `{o1,o2}` asked `delivery <= 12`, `delivery >= 4` and `delivery <= 3`; `{o1,o2,o3}`
 * asked `delivery <= 12`; `{o1,o2,o3,o4}` asked `delivery <= 12` (the conflict); `{o1,o2,o4}` asked `customs <= 3`
 * (the derived `[7, 10]`). The menu's fifth question, `delivery = 14`, is not scripted.
 */
export const CANON_SCRIPT: readonly ScriptStep[] = deepFreeze([
  { step: 1, snapshot: 0, question: 0 },
  { step: 2, snapshot: 0, question: 1 },
  { step: 3, snapshot: 0, question: 2 },
  { step: 4, snapshot: 1, question: 0 },
  { step: 5, snapshot: 2, question: 0 },
  { step: 6, snapshot: 3, question: 3 },
]);

/** What one step produced: the chatbot's paragraph, and the engine's Brief, its rendering and its re-check. */
export interface StepRun {
  readonly step: number;
  readonly snapshot: readonly ObsId[];
  readonly questionLabel: string;
  readonly question: Claim;
  readonly draft: FluentDraft;
  /** What the chatbot says. */
  readonly paragraph: string;
  /** What the engine rules. */
  readonly brief: Brief;
  /** `renderBrief` over the engine's own validated schema. */
  readonly rendered: string;
  /** `recheck`: `intact` and one finding per ruling. */
  readonly intact: boolean;
  readonly findings: readonly RecheckFinding[];
}

export type ScriptFailure =
  | { readonly kind: "snapshot-out-of-range"; readonly step: number }
  | { readonly kind: "question-out-of-range"; readonly step: number }
  | { readonly kind: "ground-failed"; readonly step: number; readonly failure: GroundFailure }
  | { readonly kind: "observation-rejected"; readonly step: number; readonly rejected: readonly RejectedObservation[] }
  | { readonly kind: "answer-failed"; readonly step: number; readonly failure: AnswerFailure }
  | { readonly kind: "recheck-failed"; readonly step: number; readonly failure: GroundFailure };

export type ScriptRun =
  | { readonly ok: true; readonly schema: Schema; readonly steps: readonly StepRun[] }
  | { readonly ok: false; readonly failure: ScriptFailure };

/**
 * Run a script through the real engine: for each step, ground the snapshot, let the drafter draft, have `answer` rule the
 * question and every draft claim, render the Brief, and `recheck` it from the carried evidence alone. This file composes
 * the engine's public functions and rules nothing itself. It stops at the first step that fails and says which.
 *
 * `script` is typed, and each step's three numbers are read once into locals; an index that is not an integer inside
 * the menu is a `...-out-of-range` failure, not an exception.
 */
export function runScript(script: readonly ScriptStep[] = CANON_SCRIPT): ScriptRun {
  const steps: StepRun[] = [];
  let schema: Schema | undefined;
  for (const entry of script) {
    const step = entry.step;
    const snapshotIndex = entry.snapshot;
    const questionIndex = entry.question;
    const ids = Number.isInteger(snapshotIndex) ? SNAPSHOTS[snapshotIndex] : undefined;
    if (ids === undefined) return fail({ kind: "snapshot-out-of-range", step });
    const menu = Number.isInteger(questionIndex) ? QUESTIONS[questionIndex] : undefined;
    if (menu === undefined) return fail({ kind: "question-out-of-range", step });

    const observations = observationsOf(ids);
    const grounded = ground(ORDER_DESK_SCHEMA, observations);
    if (!grounded.ok) return fail({ kind: "ground-failed", step, failure: grounded.failure });
    if (grounded.rejected.length > 0) return fail({ kind: "observation-rejected", step, rejected: grounded.rejected });

    const draft = fluentDraft(observations, menu.claim);
    const answered = answer(grounded.grounding, menu.claim, claimsOf(draft));
    if (!answered.ok) return fail({ kind: "answer-failed", step, failure: answered.failure });

    const rechecked = recheck(grounded.grounding.schema, answered.brief);
    if (!rechecked.ok) return fail({ kind: "recheck-failed", step, failure: rechecked.failure });

    schema = grounded.grounding.schema;
    steps.push({
      step,
      snapshot: ids,
      questionLabel: menu.label,
      question: menu.claim,
      draft,
      paragraph: renderFluent(draft),
      brief: answered.brief,
      rendered: renderBrief(grounded.grounding.schema, answered.brief),
      intact: rechecked.intact,
      findings: rechecked.findings,
    });
  }
  return { ok: true, schema: schema ?? ORDER_DESK_SCHEMA, steps };
}

function fail(failure: ScriptFailure): ScriptRun {
  return { ok: false, failure };
}
