import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseFile, withProject } from "../components/order-desk/__tests__/support/ast.js";
import { literalTexts } from "../components/order-desk/__tests__/support/scan.js";
import { MILESTONES, currentMilestone, progressLine } from "./milestones";
import type { Milestone } from "./milestones";
import Home from "./page";

/**
 * THE DRIFT GUARD (plan section 6, M8: `app/milestones.ts` + `app/milestones.test.ts`, "compare claimed-done milestones with
 * `.genesis/DONE.html`"; decision-engine's pattern). The property that matters on a public URL: the set of milestones the page's
 * list claims DONE equals the set `.genesis/DONE.html` marks done. The not-done states are not compared: DONE.html says `todo` or
 * `wip`, the list says "not done", and forcing them to match would fight legitimate edits.
 *
 * HOW THE TEETH WORK. The guard is the function `findDrift(list, html)`. The tests of its teeth do not depend on the real
 * `DONE.html` being in any particular state: each builds its OWN agreeing pair, by taking the real DONE.html text, setting
 * every pill to `todo`, and flipping chosen rows with `flipPill`, which THROWS if the html does not change (so a regex that
 * misses cannot make a tooth vacuous). The list side is built the same way from the real `MILESTONES` ids. Exactly one test,
 * "claims exactly the same milestones done in both places", reads the real list against the real file; it is the test that
 * goes red when a mark-done pull request changes only one of the two.
 *
 * A `chore(genesis): mark MN done` pull request changes DONE.html's pill of row MN to `done` AND `done: false` to `done: true` for
 * MN in `app/milestones.ts`, together (the header of `milestones.ts` says the same). It changes nothing in this file.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DONE_HTML = readFileSync(join(ROOT, ".genesis", "DONE.html"), "utf8");

type PillState = "done" | "wip" | "todo";
const PILL_CLASS: { readonly [S in PillState]: string } = { done: "ok", wip: "wip", todo: "todo" };

const ROW = /<tr><td>(M\d+)<\/td>((?:(?!<\/tr>)[\s\S])*?)<span class="pill[^"]*">([a-z]+)<\/span>/g;

/** Every (milestone id, pill text) in DONE.html's status table, anchored on the pill (a second table in the file is keyed by the same ids). */
function pillsIn(html: string): { id: string; state: string }[] {
  return [...html.matchAll(ROW)].map((match) => ({ id: match[1] as string, state: match[3] as string }));
}

/** The html with row `id`'s pill set to `state`. THROWS if the row is not there or the html does not change. */
function flipPill(html: string, id: string, state: PillState): string {
  let found = false;
  const out = html.replace(ROW, (whole, rowId: string, middle: string) => {
    if (rowId !== id) return whole;
    found = true;
    return `<tr><td>${rowId}</td>${middle}<span class="pill ${PILL_CLASS[state]}">${state}</span>`;
  });
  if (!found) throw new Error(`flipPill: no row ${id} in the html`);
  if (out === html) throw new Error(`flipPill: setting ${id} to ${state} changed nothing`);
  return out;
}

/** Every pill set to `state`, without the throw (a baseline, not a tooth). */
function allPills(html: string, state: PillState): string {
  return html.replace(ROW, (_whole, rowId: string, middle: string) => `<tr><td>${rowId}</td>${middle}<span class="pill ${PILL_CLASS[state]}">${state}</span>`);
}

/** The guard: the ways `list` and `html` disagree about which milestones are done. Empty means they agree. */
function findDrift(list: readonly Milestone[], html: string): string[] {
  const pills = pillsIn(html);
  const problems: string[] = [];
  const htmlIds = pills.map((pill) => pill.id).join(",");
  const listIds = list.map((milestone) => milestone.id).join(",");
  if (htmlIds !== listIds) problems.push(`rows differ: DONE.html has [${htmlIds}], the list has [${listIds}]`);
  for (const milestone of list) {
    const pill = pills.find((candidate) => candidate.id === milestone.id);
    if (pill === undefined) continue;
    const htmlDone = pill.state === "done";
    if (htmlDone !== milestone.done) problems.push(`${milestone.id}: the list says ${milestone.done ? "done" : "not done"}, DONE.html says ${pill.state}`);
  }
  return problems;
}

const withDone = (ids: readonly string[]): Milestone[] => MILESTONES.map((milestone) => ({ ...milestone, done: ids.includes(milestone.id) }));
const BASE_HTML = allPills(DONE_HTML, "todo");
const htmlWithDone = (ids: readonly string[]): string => ids.reduce((html, id) => flipPill(html, id, "done"), BASE_HTML);

describe("the real list and the real DONE.html", () => {
  it("DONE.html parses to nine milestone rows, M1 to M9 in order, each pill done, wip or todo, and the list has the same ids", () => {
    const pills = pillsIn(DONE_HTML);
    expect(pills.map((pill) => pill.id)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"]);
    expect(pills.every((pill) => ["done", "wip", "todo"].includes(pill.state))).toBe(true);
    expect(MILESTONES.map((milestone) => milestone.id)).toEqual(pills.map((pill) => pill.id));
  });

  it("claims exactly the same milestones done in both places", () => {
    expect(findDrift(MILESTONES, DONE_HTML)).toEqual([]);
  });
});

describe("the guard's teeth, on pairs built here from the real DONE.html text", () => {
  it("the baseline pair (every pill todo, nothing done) agrees", () => {
    expect(pillsIn(BASE_HTML).every((pill) => pill.state === "todo")).toBe(true);
    expect(findDrift(withDone([]), BASE_HTML)).toEqual([]);
  });

  it("both sources moved together is not a disagreement: M8 done in both; then M8 and M9 done in both; then every milestone", () => {
    expect(findDrift(withDone(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]), htmlWithDone(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]))).toEqual([]);
    const all = MILESTONES.map((milestone) => milestone.id);
    expect(findDrift(withDone(all), htmlWithDone(all))).toEqual([]);
  });

  it("DONE.html moved and the list did not: reported, naming the milestone", () => {
    expect(findDrift(withDone(["M1"]), htmlWithDone(["M1", "M8"]))).toEqual(["M8: the list says not done, DONE.html says done"]);
  });

  it("the list moved and DONE.html did not: reported, naming the milestone", () => {
    expect(findDrift(withDone(["M1", "M8"]), htmlWithDone(["M1"]))).toEqual(["M8: the list says done, DONE.html says todo"]);
  });

  it("a milestone the list drops, or DONE.html drops, is reported as a row mismatch", () => {
    expect(findDrift(withDone([]).slice(0, 8), BASE_HTML)[0]).toContain("rows differ");
    const withoutM9 = BASE_HTML.replace(/<tr><td>M9<\/td>(?:(?!<\/tr>)[\s\S])*?<\/tr>/, "");
    expect(withoutM9).not.toBe(BASE_HTML);
    expect(findDrift(withDone([]), withoutM9)[0]).toContain("rows differ");
  });

  it("not-done granularity is not compared: wip and todo are both 'not done'", () => {
    expect(findDrift(withDone(["M1"]), flipPill(htmlWithDone(["M1"]), "M8", "wip"))).toEqual([]);
  });

  it("markup the parse does not recognise is a failure, not a vacuous pass", () => {
    expect(findDrift(withDone([]), "<table><tr><td>M1</td><td>done</td></tr></table>")[0]).toContain("rows differ");
    expect(findDrift(withDone([]), "")[0]).toContain("rows differ");
  });

  it("flipPill throws when it changes nothing, and when the row does not exist", () => {
    expect(() => flipPill(BASE_HTML, "M8", "todo")).toThrow("changed nothing");
    expect(() => flipPill(BASE_HTML, "M99", "done")).toThrow("no row M99");
    expect(() => flipPill("", "M8", "done")).toThrow("no row M8");
    expect(flipPill(BASE_HTML, "M8", "done")).not.toBe(BASE_HTML);
  });
});

describe("what the page says about progress comes from the list", () => {
  it("currentMilestone is the first milestone not done, and undefined when all are done", () => {
    expect(currentMilestone(withDone([]))?.id).toBe("M1");
    expect(currentMilestone(withDone(["M1", "M2", "M3"]))?.id).toBe("M4");
    expect(currentMilestone(withDone(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]))?.id).toBe("M9");
    expect(currentMilestone(withDone(MILESTONES.map((milestone) => milestone.id)))).toBeUndefined();
    // the first one not done, even if a later one is done
    expect(currentMilestone(withDone(["M2"]))?.id).toBe("M1");
  });

  it("progressLine reads its counts and its current milestone from the list it is given", () => {
    const some = withDone(["M1", "M2", "M3"]);
    expect(progressLine(some)).toBe(`3 of ${String(some.length)} milestones are done. Next: M4, ${some[3]!.title}.`);
    expect(progressLine(withDone(MILESTONES.map((milestone) => milestone.id)))).toBe(`All ${String(MILESTONES.length)} milestones are done.`);
    const short: Milestone[] = [
      { id: "X1", title: "First", done: true },
      { id: "X2", title: "Second", done: false },
    ];
    expect(progressLine(short)).toBe("1 of 2 milestones are done. Next: X2, Second.");
  });

  it("the footer of the page is progressLine() of the real list, as rendered (derived: the test restates no milestone number)", () => {
    const markup = renderToStaticMarkup(Home());
    const line = progressLine(MILESTONES);
    expect(markup).toContain(`<p>${line}</p>`);
    const current = currentMilestone(MILESTONES);
    if (current !== undefined) expect(markup).toContain(`Next: ${current.id}, ${current.title}.`);
  });

  it("neither page.tsx nor the demo component has a string literal that names a milestone or a count of them", () => {
    const files = ["app/page.tsx", "components/order-desk/OrderDeskDemo.tsx"];
    withProject(join(ROOT, "tsconfig.json"), (project) => {
      for (const file of files) {
        const sourceFile = parseFile(project, join(ROOT, file));
        expect(sourceFile, file).toBeDefined();
        if (sourceFile === undefined) continue;
        const offending = literalTexts(sourceFile).filter((text) => !/^\.{1,2}\//.test(text) && /\bM[1-9]\b|\b\d+ of \d+\b|\bmilestone/i.test(text));
        expect(offending, file).toEqual([]);
      }
    });
  }, 60_000);

  it("TEETH: the literal check does flag a hard-coded milestone sentence", () => {
    const literal = "Milestone M8 of 9";
    expect(/\bM[1-9]\b|\b\d+ of \d+\b|\bmilestone/i.test(literal)).toBe(true);
    expect(/\bM[1-9]\b|\b\d+ of \d+\b|\bmilestone/i.test("Why this is a conflict nobody could see")).toBe(false);
  });
});
