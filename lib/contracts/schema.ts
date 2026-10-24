import type { Extent } from "./bounds.js";
import type { FieldId } from "./ids.js";
import type { NonEmptyReadonlyArray } from "./non-empty-array.js";

/**
 * The operands of a sum: at least two, by type. `[]` and `[f]` do not compile (proved in
 * `__tests__/proofs/required.proofs.ts`), nor does a `FieldId[]` that might be short.
 *
 * HONEST LIMIT. THE TYPE ADMITS A REPEATED OPERAND. `[f, f]` compiles (pinned in `honest-limits.test.ts`),
 * although a field may occur at most once in a sum (`.genesis/PLAN.md` section 4.3, "read-once"). The
 * plan assigns that refusal to M4's `readSchema` (`operand-reused`), which is not built. The same goes for
 * an operand that no field declares, an operand across a unit boundary and a cycle: none is a type error.
 */
export type Operands = readonly [FieldId, FieldId, ...FieldId[]];

/**
 * A base quantity: something observations can bound directly. `baseline` is a declared invariant of the
 * quantity (a duration is at least 0).
 *
 * THE TWO VARIANTS OF `FieldDecl` ARE MUTUALLY EXCLUSIVE BY ASSIGNABILITY, NOT BY EXCESS-PROPERTY CHECKING.
 * `sum?: never` is what makes "a base field with a `sum`" a type error at EVERY assignment site for a value
 * whose static type includes the field. The tempting alternative, simply not declaring `sum`, relies on the
 * excess-property check, which fires only on a fresh object literal; a sibling project made that claim and
 * seven ordinary routes walked past it (an intermediate binding, a spread, a function return, `satisfies`, a
 * generic helper, `Object.assign`, an array element). `?: never` closes all seven and the literal; they are
 * proved one by one in `__tests__/proofs/schema-forbidden.proofs.ts`, and what it still cannot close is
 * listed on `Entailment` (the same limits apply here).
 */
export interface BaseField {
  readonly kind: "base";
  readonly id: FieldId;
  readonly label: string;
  readonly unit: string;
  readonly baseline: Extent;
  readonly sum?: never;
}

/**
 * A derived quantity: it IS the sum of its operands. It declares NO baseline of its own (plan D4, and the
 * first defect the plan's own model found, section 8 defect 1): a declared floor on a sum can dominate the
 * sum of its operands' floors, leaving a bound that evidence can never move and no leaf to name as the gap.
 * `baseline?: never` makes that unrepresentable for any value whose static type includes the field.
 */
export interface DerivedField {
  readonly kind: "derived";
  readonly id: FieldId;
  readonly label: string;
  readonly unit: string;
  readonly sum: Operands;
  readonly baseline?: never;
}

export type FieldDecl = BaseField | DerivedField;

/** The quantities that exist and how the derived ones are built. At least one field, by type. */
export interface Schema {
  readonly fields: NonEmptyReadonlyArray<FieldDecl>;
}
