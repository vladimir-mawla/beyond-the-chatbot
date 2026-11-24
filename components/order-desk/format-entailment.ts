/**
 * Text for the cards of the demo page: what a ruling's kind means, the cut, the open ends, what `recheck` said. Pure
 * functions over plain strings and numbers; this file imports nothing (the plan makes `compute-demo-view.ts` the only
 * file under `components/` that imports `lib/**` or `domains/**`, and `__tests__/architecture.test.ts` pins that).
 *
 * What is NOT here: the sentence of a ruling. That is `renderEntailment`'s, called in the bridge and shown as it is.
 * Everything below is a label or a gloss around that sentence, never a restatement of its numbers, except
 * `reproductionText`, which prints the two bounds of a `bound-differs` finding exactly as the finding carries them.
 *
 * No `Date`, no `Intl`, no locale-dependent formatting: integers are printed with `String`.
 */

/** The five kinds, as plain strings. The engine's `Entailment["kind"]` is assignable to this. */
export type Kind = "entailed" | "weakened" | "contradicted" | "ungrounded" | "conflicted";

export const KINDS: readonly Kind[] = ["entailed", "weakened", "contradicted", "ungrounded", "conflicted"];

/** One short gloss per kind: what the system does with a claim of that kind. */
export const KIND_GLOSS: { readonly [K in Kind]: string } = {
  entailed: "The evidence backs this exactly as asked.",
  weakened: "Cut back: only part of this is backed.",
  contradicted: "Ruled out by the evidence.",
  ungrounded: "No document moves this: refused, with the gap named.",
  conflicted: "The documents cannot all be true: refused, with the core named.",
};

/** "1 day", "7 days". */
export function daysPhrase(n: number): string {
  return `${String(n)} ${n === 1 ? "day" : "days"}`;
}

/** Where a drafted value came from, in the drafter's three words. */
export function basisText(basis: string): string {
  if (basis === "observed") return "read from the documents";
  if (basis === "prior") return "a typical figure, not from any document";
  if (basis === "sum") return "the sum of its own three figures";
  return basis;
}

/** "upper bound", "lower bound". */
export function sideText(side: string): string {
  return side === "lo" ? "lower bound" : side === "hi" ? "upper bound" : side;
}

/** The cut of a `weakened` ruling: the sides of the tested extent the evidence does not meet. */
export function cutText(unmet: readonly string[]): string {
  return unmet.length === 0 ? "nothing cut" : `cut: ${unmet.map(sideText).join(" and ")}`;
}

/** One open end: a quantity and the side nothing bounds. */
export function openEndText(label: string, side: string): string {
  return `${label}: nothing bounds it from ${side === "lo" ? "below" : "above"}`;
}

/** A bound, or "none" for an unbounded side. */
function boundText(bound: unknown): string {
  return typeof bound === "number" ? String(bound) : "none";
}

/** What `recheck` said about one ruling, as one line. `reason` carries what the finding carries; nothing is added. */
export function reproductionText(result: {
  readonly kind: string;
  readonly silentSides?: readonly string[];
  readonly reason?: { readonly kind: string; readonly side?: string; readonly carried?: unknown; readonly rederived?: unknown };
}): string {
  if (result.kind === "reproduced") {
    const silent = result.silentSides ?? [];
    return silent.length === 0 ? "re-derived from the carried evidence" : `re-derived; ${silent.map(sideText).join(" and ")} rests on the schema alone`;
  }
  if (result.kind === "uncertifiable-silence") return "not certifiable: an absence cannot be checked from a subset of the evidence";
  const reason = result.reason;
  if (reason === undefined) return "not re-derived";
  if (reason.kind === "bound-differs") {
    return `not re-derived: the ${sideText(reason.side ?? "")} says ${boundText(reason.carried)} but its own support gives ${boundText(reason.rederived)}`;
  }
  return `not re-derived (${reason.kind})`;
}
