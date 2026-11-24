/**
 * Text for the evidence list and the pairwise table. Pure functions over plain strings and numbers; this file imports
 * nothing (see `format-entailment.ts`). No `Date`, no `Intl`, no locale-dependent formatting.
 */

/** "[1, 2]", "[14, 14]", "[0, ∞)": an extent as a closed interval, an unbounded side as an infinity. */
export function intervalText(lo: number | null, hi: number | null): string {
  const left = lo === null ? "(−∞" : `[${String(lo)}`;
  const right = hi === null ? "∞)" : `${String(hi)}]`;
  return `${left}, ${right}`;
}

/** Which rulings cite a document, as one line. */
export function citedByText(citedBy: readonly string[]): string {
  return citedBy.length === 0 ? "cited by no ruling" : `cited by ${citedBy.join(", ")}`;
}

const COUNT_WORDS: readonly string[] = ["no", "one", "two", "three", "four", "five", "six"];

/** A count of documents in words where there is one ("four"), in digits otherwise. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** What a group of subsets of one size is called. Sizes above three are named only as the full set. */
function groupName(size: number): string {
  return size === 2 ? "pairs" : size === 3 ? "triples" : `${countWord(size)}-document sets`;
}

/** One size of subset, and how many of them ground without a conflict. */
export interface PairwiseGroupText {
  readonly size: number;
  readonly total: number;
  readonly consistent: number;
}

/**
 * The headline line of the pairwise table: "6 of 6 pairs consistent · 4 of 4 triples consistent · all four: conflicted".
 * `groups` are the proper subsets of size two upward, `fullCount` the number of documents included, and
 * `fullConsistent` whether the whole set grounds without a conflict. The numbers are counted by the caller from `ground`.
 */
export function pairwiseLine(groups: readonly PairwiseGroupText[], fullCount: number, fullConsistent: boolean): string {
  const parts = groups.map((group) => `${String(group.consistent)} of ${String(group.total)} ${groupName(group.size)} consistent`);
  parts.push(`all ${countWord(fullCount)}: ${fullConsistent ? "consistent" : "conflicted"}`);
  return parts.join(" · ");
}
