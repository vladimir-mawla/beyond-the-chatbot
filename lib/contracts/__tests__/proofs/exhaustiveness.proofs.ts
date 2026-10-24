import { assertNeverEntailment, type Entailment } from "../../entailment.js";

/**
 * Type-only proofs that `assertNeverEntailment` is an exhaustiveness gate (see `support/proof-harness.ts`).
 * Called in the `default` of a `switch (x.kind)`, it compiles only while every variant has a `case`: `value`
 * is then `never`. Add a variant to the union, or leave one out of a switch, and the call stops compiling.
 *
 * TWO UNIONS, because a proof cannot edit the real one:
 *  1. A LOCAL STAND-IN, `StandIn`, with the five kinds of the real union, and `StandInPlusOne`, the same with a
 *     SIXTH. The switch over `StandIn` with five cases compiles; the same five cases over `StandInPlusOne` do
 *     not. This is the plan's "a fifth variant compiling silently" proof, on a stand-in (the plan's wording
 *     says "fifth" although `Entailment` already has five: what a change adds is a SIXTH; flagged in the ADR).
 *  2. THE REAL `Entailment`. The switch with all five cases compiles (a control: it shows the five proofs
 *     below are about the missing case and not about the gate's own signature), and the five switches that each
 *     leave out ONE variant fail, each naming the variant left over. That also proves each variant is told
 *     apart by `kind` alone.
 *
 * `exhaustiveness.test.ts` adds a sixth variant to a COPY of the real union and requires these same lines to
 * react: the control and all five "missing" proofs go red, and the stand-in lines do not move.
 *
 * Every declaration is exported so `noUnusedLocals` cannot satisfy a directive.
 */

// ---- 1. a local stand-in union ----
interface StandInEntailed { readonly kind: "entailed" }
interface StandInWeakened { readonly kind: "weakened" }
interface StandInContradicted { readonly kind: "contradicted" }
interface StandInUngrounded { readonly kind: "ungrounded" }
interface StandInConflicted { readonly kind: "conflicted" }
interface StandInRefuted { readonly kind: "refuted" }
export type StandIn = StandInEntailed | StandInWeakened | StandInContradicted | StandInUngrounded | StandInConflicted;
export type StandInPlusOne = StandIn | StandInRefuted;

// CONTROL (no directive): five cases over the five-variant stand-in compile.
export function standInHandlesAll(value: StandIn): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      return assertNeverEntailment(value);
  }
}

// The same five cases over the six-variant stand-in do not: the sixth reaches the gate.
export function standInPlusOneMissingSixth(value: StandInPlusOne): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'StandInRefuted' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}

// ---- 2. the real union ----
// CONTROL (no directive): all five variants handled.
export function realHandlesAll(value: Entailment): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      return assertNeverEntailment(value);
  }
}

export function realMissingEntailed(value: Entailment): string {
  switch (value.kind) {
    case "weakened":
    case "contradicted":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'Entailed' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}

export function realMissingWeakened(value: Entailment): string {
  switch (value.kind) {
    case "entailed":
    case "contradicted":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'Weakened' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}

export function realMissingContradicted(value: Entailment): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "ungrounded":
    case "conflicted":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'Contradicted' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}

export function realMissingUngrounded(value: Entailment): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
    case "conflicted":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'Ungrounded' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}

export function realMissingConflicted(value: Entailment): string {
  switch (value.kind) {
    case "entailed":
    case "weakened":
    case "contradicted":
    case "ungrounded":
      return value.kind;
    default:
      // @ts-expect-error TS2345 Argument of type 'Conflicted' is not assignable to parameter of type 'never'
      return assertNeverEntailment(value);
  }
}
