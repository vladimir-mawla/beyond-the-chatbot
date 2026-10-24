import type { ClaimRejection } from "./faults.js";
import type { Entailment } from "./entailment.js";
import type { Observation } from "./observation.js";

/**
 * The unit of output: the question's ruling, the draft's rulings, the draft claims refused before ruling,
 * and the observations they rest on. A sentence exists only as M5's `renderBrief(schema, brief)`, a
 * projection of this (plan D1).
 *
 * A `Brief` does NOT carry its schema: the holder supplies it to `recheck`, because a carried schema would
 * make the re-derivation circular (plan M5, "must refuse"). It also carries no index-paired parallel arrays:
 * `rejected` names its own `index`.
 *
 * WHAT THE TYPE DOES NOT SAY. That `evidence` is "exactly the observations some support or core names,
 * sorted by id", that `claims` is "one per accepted draft claim, in draft order", or that `rejected` indices
 * are in range and unique. M5's `answer` produces those and M5's tests pin them; nothing in M1 checks them.
 */
export interface Brief {
  /** The user's question, ruled like any claim. */
  readonly answer: Entailment;
  /** One per accepted draft claim, in draft order. */
  readonly claims: readonly Entailment[];
  /** Draft claims refused before ruling. */
  readonly rejected: readonly ClaimRejection[];
  /** Exactly the observations some support or core names, sorted by id: the Brief is self-contained. */
  readonly evidence: readonly Observation[];
}
