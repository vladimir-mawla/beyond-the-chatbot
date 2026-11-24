/**
 * The project's milestone state, in one place, for the one line of the page that talks about progress.
 *
 * WHY THIS FILE EXISTS. A page that says "milestone M2 of 9" in a literal goes on saying it after M3 lands. So the page
 * derives what it says about progress from this list (`progressLine`, `currentMilestone`), and `milestones.test.ts`
 * compares the set of milestones this list claims done with the status pills of `.genesis/DONE.html`, so that a claim on
 * a public URL cannot outrun the record. This is the decision-engine pattern.
 *
 * WHAT A `chore(genesis): mark MN done` PULL REQUEST MUST CHANGE, exactly:
 *  1. in `.genesis/DONE.html`, the `<span class="pill todo">todo</span>` (or `wip`) of row MN becomes `<span class="pill ok">done</span>`;
 *  2. in THIS file, `done: false` of the entry MN becomes `done: true`.
 * Both in the same pull request. Nothing else in this file or in the test changes, and no sentence on the page is edited:
 * the page's progress line and `currentMilestone()` follow from the list. If only one of the two is changed, exactly one
 * test (`claims exactly the same milestones done in both places`) goes red, which is the guard doing its job. `done` is
 * the only status here: DONE.html's `todo` and `wip` are both "not done" to a stranger, and the test does not compare
 * them.
 */

export interface Milestone {
  /** Matches the row id in `.genesis/DONE.html` and the milestone name in `.genesis/PLAN.md`. */
  readonly id: string;
  /** Short, for strangers. */
  readonly title: string;
  readonly done: boolean;
}

export const MILESTONES: readonly Milestone[] = [
  { id: "M1", title: "Contracts", done: true },
  { id: "M2", title: "Deploy skeleton", done: true },
  { id: "M3", title: "Extent algebra", done: true },
  { id: "M4", title: "Ground", done: true },
  { id: "M5", title: "Entail", done: true },
  { id: "M6", title: "The order desk domain", done: true },
  { id: "M7", title: "The failure suite", done: true },
  { id: "M8", title: "Interactive demo", done: false },
  { id: "M9", title: "Deliverables", done: false },
];

/** The first milestone that is not done, or `undefined` once every one is. */
export function currentMilestone(milestones: readonly Milestone[] = MILESTONES): Milestone | undefined {
  return milestones.find((milestone) => !milestone.done);
}

/** The page's one sentence about progress: counts and the current milestone, all read from `milestones`. */
export function progressLine(milestones: readonly Milestone[] = MILESTONES): string {
  const done = milestones.filter((milestone) => milestone.done).length;
  const current = currentMilestone(milestones);
  if (current === undefined) return `All ${String(milestones.length)} milestones are done.`;
  return `${String(done)} of ${String(milestones.length)} milestones are done. Next: ${current.id}, ${current.title}.`;
}
