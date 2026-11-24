import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createElement } from "react";
import type { FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, demoReducer } from "../../components/order-desk/compute-demo-view.js";
import type { DemoState } from "../../components/order-desk/compute-demo-view.js";
import { obsId } from "../../lib/contracts/index.js";

/**
 * Do the documents' claims still point at something? (`.genesis/PLAN.md` section 6, M9.)
 *
 * The plan asks that "every backticked `lib/**` / `tests/failures/**` test path in `README.md` and `docs/ARCHITECTURE.md` exists, and every quoted test
 * name occurs as a substring of that file", and that `docs/THESIS.md` is at most 300 words. This file does both, and four things beside them that a person
 * would otherwise have to remember:
 *
 *   1. CITATION FORM. A citation is a backticked repository path (under `lib/`, `domains/`, `components/`, `app/`, `tests/` or `scripts/`, ending `.ts` or
 *      `.tsx`), followed on the same line by zero or more titles, each written as ` › "title"`. The path must exist. EVERY title on the line is checked,
 *      not only the first: each must follow a path on its line (an orphan title is reported), the path must be a test file, the title must occur in the
 *      file, and the occurrence must be on a line that opens an `it(`, `test(` or `describe(` (so a title that only survives in a comment is reported).
 *      A title is matched as a substring, so a cited prefix of a longer test name is allowed. The documents list several titles for one path by repeating
 *      the ` › "title"` form, never by joining quoted names with "and" or a comma.
 *   2. EVERY FAILURE CASE IS LISTED. Each file `tests/failures/NN-*.test.ts` is cited, with a title, in `README.md` (the plan: Honest limits "listing every M7 case").
 *   3. NO LINE NUMBERS. `file.ts:123` goes stale on the next edit; a citation is a file and a title.
 *   4. THE THESIS is at most 300 words, counted as `wc -w` counts (runs of non-whitespace) over the whole file, heading included.
 *   5. THE LOOM SCRIPT is performable. In `docs/WALKTHROUGH.md` a beat is a header line `**M:SS - M:SS. title.**`, an `On screen [step N]: "..." · "..."` line and
 *      the lines that begin with `> ` (what is said aloud). Each beat's narration must be at most 170 words a minute over its own time slot, the total at
 *      most 230 words, the slots must run on without a gap or overlap and end by 1:30, and every quoted on-screen string must occur, in the stated order,
 *      in the text of the page the real component renders for that state (`renderToStaticMarkup` of `OrderDeskDemo`, the same markup the server sends).
 *      The checkbox route the script uses (tick o3, then o4) is checked to render the same page as the scripted step it stands for.
 *   6. THE DEPENDENCY LIST in `README.md` names exactly the packages of `package.json`, runtime and dev separately.
 *
 * WHAT THIS DOES NOT CHECK. That a cited test asserts what the sentence beside it says: only a person reading both can do that. That a sentence without
 * a citation is true, or that a number in prose matches the code. That a title that appears in a test file belongs to a test that can fail. That a cited title identifies one test: a title is matched as a substring of any
 * line that opens a test, and titles under 8 characters are refused. That a
 * quoted string appears on the LIVE page: it checks the markup the same component renders from the same source, not a deployment, and not what a browser
 * shows after a click; the by-hand record in `docs/WALKTHROUGH.md` is what covers a browser. That anyone can SPEAK at a stated rate: the word bound is on the
 * text. The scan reads Markdown by pattern; a citation written in another form (a path in a link, a path not in backticks, a title not after a path on its
 * own line) is either reported as an orphan or not seen at all.
 */

const REPO = join(import.meta.dirname, "..", "..");

// The component is a .tsx file, and `tsconfig.lib.json` (which type-checks everything under `tests/`) sets no `jsx`, so a static import of it is an error
// (TS6142) in `npm run typecheck`. A dynamic import of a path held in a variable is resolved at run time by vitest and typed here by the cast below.
const DEMO_COMPONENT = "../../components/order-desk/OrderDeskDemo.js";
const { OrderDeskDemo } = (await import(/* @vite-ignore */ DEMO_COMPONENT)) as { OrderDeskDemo: FunctionComponent<{ initial?: DemoState }> };

export interface Citation {
  readonly path: string;
  readonly titles: readonly string[];
  readonly line: number;
}

const TOKEN = /`((?:lib|domains|components|app|tests|scripts)\/[^`\s*]+\.tsx?)`|› "([^"]+)"/g;
const TEST_FILE = /\.test\.tsx?$/;
export const MIN_TITLE_LENGTH = 8;
const TEST_OPENER = /\b(?:it|test|describe)(?:\.each\b.*?)?\(/;

/** The citations of `markdown`, and the titles that follow no path on their line. */
export function scanCitations(markdown: string): { citations: Citation[]; orphans: { title: string; line: number }[] } {
  const citations: Citation[] = [];
  const orphans: { title: string; line: number }[] = [];
  markdown.split("\n").forEach((text, index) => {
    let current: { path: string; titles: string[]; line: number } | null = null;
    for (const match of text.matchAll(TOKEN)) {
      if (match[1] !== undefined) {
        current = { path: match[1], titles: [], line: index + 1 };
        citations.push(current);
      } else if (match[2] !== undefined) {
        if (current === null) orphans.push({ title: match[2], line: index + 1 });
        else current.titles.push(match[2]);
      }
    }
  });
  return { citations, orphans };
}

export const findCitations = (markdown: string): Citation[] => scanCitations(markdown).citations;

/** The problems with `markdown`'s citations, read against the tree at `root`; empty when there are none. Every title is checked. */
export function citationProblems(markdown: string, root: string, name: string): string[] {
  const problems: string[] = [];
  const { citations, orphans } = scanCitations(markdown);
  for (const { title, line } of orphans) problems.push(`${name} line ${line}: a title with no path before it on the line: "${title}"`);
  for (const { path, titles, line } of citations) {
    const where = `${name} line ${line}: ${path}`;
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      problems.push(`${where}: no such file`);
      continue;
    }
    if (titles.length === 0) continue;
    if (!TEST_FILE.test(path)) {
      problems.push(`${where}: a title is cited, but this is not a test file`);
      continue;
    }
    const source = readFileSync(absolute, "utf8");
    const sourceLines = source.split("\n");
    for (const title of titles) {
      if (title.length < MIN_TITLE_LENGTH) {
        problems.push(`${where}: the title is under ${MIN_TITLE_LENGTH} characters, so it could match almost any test: "${title}"`);
      } else if (!source.includes(title)) {
        problems.push(`${where}: the title is not in the file: "${title}"`);
      } else if (!sourceLines.some((sourceLine) => sourceLine.includes(title) && TEST_OPENER.test(sourceLine))) {
        problems.push(`${where}: the title occurs, but not on a line that opens an it, test or describe: "${title}"`);
      }
    }
  }
  return problems;
}

export function lineNumberCitations(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => /\.(?:tsx?|mjs|json|md):\d+/.test(text))
    .map(({ text, line }) => `line ${line}: ${text.trim().slice(0, 80)}`);
}

export const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;

/** Failure-case files that `readme` does not cite with at least one title. */
export function uncitedFailureCases(readme: string, caseFiles: readonly string[]): string[] {
  const cited = new Set(findCitations(readme).filter((citation) => citation.titles.length > 0).map((citation) => citation.path));
  return caseFiles.filter((file) => !cited.has(`tests/failures/${file}`));
}

// ---- the Loom script ---------------------------------------------------------------------------------------

export interface Beat {
  readonly title: string;
  readonly start: number;
  readonly end: number;
  readonly words: number;
  readonly state: string | null;
  readonly strings: readonly string[];
}

const BEAT_HEADER = /^\*\*(\d+):(\d{2}) - (\d+):(\d{2})\. (.*?)\*\*/;
const ON_SCREEN = /^On screen \[([^\]]+)\]: (.*)$/;

export function parseBeats(markdown: string): Beat[] {
  const beats: { title: string; start: number; end: number; spoken: string[]; state: string | null; strings: string[] }[] = [];
  for (const text of markdown.split("\n")) {
    const header = BEAT_HEADER.exec(text);
    if (header !== null) {
      beats.push({ title: header[5] ?? "", start: Number(header[1]) * 60 + Number(header[2]), end: Number(header[3]) * 60 + Number(header[4]), spoken: [], state: null, strings: [] });
      continue;
    }
    const beat = beats[beats.length - 1];
    if (beat === undefined) continue;
    const screen = ON_SCREEN.exec(text);
    if (screen !== null) {
      beat.state = screen[1] ?? null;
      for (const quoted of (screen[2] ?? "").matchAll(/"([^"]+)"/g)) beat.strings.push(quoted[1] ?? "");
    } else if (text.startsWith("> ")) beat.spoken.push(text.slice(2));
  }
  return beats.map((beat) => ({ title: beat.title, start: beat.start, end: beat.end, words: wordCount(beat.spoken.join("\n")), state: beat.state, strings: beat.strings }));
}

export const MAX_WORDS_PER_MINUTE = 170;
export const MAX_TOTAL_WORDS = 230;
export const LOOM_SECONDS = 90;

/** Timing problems of a script: slots that do not run on, run past 1:30, a beat faster than 170 words a minute, a total over 230 words. */
export function timingProblems(beats: readonly Beat[]): string[] {
  const problems: string[] = [];
  if (beats.length === 0) problems.push("no beats were found");
  let clock = 0;
  for (const beat of beats) {
    if (beat.start !== clock) problems.push(`"${beat.title}" starts at ${beat.start} s, but the previous beat ended at ${clock} s`);
    if (beat.end <= beat.start) problems.push(`"${beat.title}" has no time: ${beat.start} s to ${beat.end} s`);
    else {
      const rate = (beat.words * 60) / (beat.end - beat.start);
      if (rate > MAX_WORDS_PER_MINUTE) problems.push(`"${beat.title}" is ${beat.words} words in ${beat.end - beat.start} s, which is ${Math.round(rate)} words a minute (limit ${MAX_WORDS_PER_MINUTE})`);
    }
    clock = beat.end;
  }
  if (clock > LOOM_SECONDS) problems.push(`the script runs to ${clock} s, past ${LOOM_SECONDS}`);
  const total = beats.reduce((sum, beat) => sum + beat.words, 0);
  if (total > MAX_TOTAL_WORDS) problems.push(`the narration is ${total} words, over ${MAX_TOTAL_WORDS}`);
  return problems;
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The visible text of the markup: tags dropped (a block's end is a space), the five escapes undone, whitespace collapsed. */
export function visibleText(markup: string): string {
  return squash(
    markup
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
}

/** The quoted strings that are not on the page, or not in the stated order (each is looked for after the end of the previous one). */
export function onScreenProblems(strings: readonly string[], page: string, name: string): string[] {
  const problems: string[] = [];
  let from = 0;
  for (const raw of strings) {
    const wanted = squash(raw);
    const at = page.indexOf(wanted, from);
    if (at >= 0) {
      from = at + wanted.length;
    } else if (page.includes(wanted)) {
      problems.push(`${name}: on the page, but before the previous string, so not in the stated order: "${raw}"`);
    } else {
      problems.push(`${name}: not on the page: "${raw}"`);
    }
  }
  return problems;
}

const markupOf = (state: DemoState): string => renderToStaticMarkup(createElement(OrderDeskDemo, { initial: state }));
const step = (number: number): DemoState => demoReducer(INITIAL_STATE, { type: "preset", step: number });

/** The state a beat names: `step N`, or `step N, forged` (the Forge control pressed). Anything else is undefined. */
export function stateOf(label: string): DemoState | undefined {
  const match = /^step ([1-6])(, forged)?$/.exec(label);
  if (match === null) return undefined;
  const base = step(Number(match[1]));
  return match[2] === undefined ? base : demoReducer(base, { type: "forge" });
}

// ---- dependency list ---------------------------------------------------------------------------------------

/** The names listed after `label` on the line of `readme` that starts with it, as `a, b, c.`; undefined when there is no such line. */
export function listedPackages(readme: string, label: string): string[] | undefined {
  const line = readme.split("\n").find((text) => text.startsWith(label));
  if (line === undefined) return undefined;
  return line
    .slice(label.length)
    .replace(/\.\s*$/, "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

// ---- the documents -----------------------------------------------------------------------------------------

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const README = read("README.md");
const ARCHITECTURE = read("docs/ARCHITECTURE.md");
const THESIS = read("docs/THESIS.md");
const WALKTHROUGH = read("docs/WALKTHROUGH.md");
const NOTES = read("docs/NOTES.md");
const PACKAGE = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

describe("this repository: README.md and the docs cite files and tests that exist, every title of every citation", () => {
  it("README.md has no citation problem", () => {
    expect(citationProblems(README, REPO, "README.md")).toEqual([]);
  });

  it("docs/ARCHITECTURE.md has no citation problem", () => {
    expect(citationProblems(ARCHITECTURE, REPO, "docs/ARCHITECTURE.md")).toEqual([]);
  });

  it("docs/NOTES.md, docs/WALKTHROUGH.md and docs/THESIS.md have no citation problem either", () => {
    expect(citationProblems(NOTES, REPO, "docs/NOTES.md")).toEqual([]);
    expect(citationProblems(WALKTHROUGH, REPO, "docs/WALKTHROUGH.md")).toEqual([]);
    expect(citationProblems(THESIS, REPO, "docs/THESIS.md")).toEqual([]);
  });

  it("the scan really saw citations (an empty scan would pass the tests above): each document cites at least its floor of files, and of titles", () => {
    // Floors, not counts: set below what each document has, so that deleting most of a document's citations fails and adding one does not.
    for (const [name, text, files, titles] of [["README.md", README, 12, 12], ["docs/ARCHITECTURE.md", ARCHITECTURE, 30, 30]] as const) {
      const citations = findCitations(text);
      expect(citations.length, `${name} files`).toBeGreaterThanOrEqual(files);
      expect(citations.reduce((sum, citation) => sum + citation.titles.length, 0), `${name} titles`).toBeGreaterThanOrEqual(titles);
    }
  });
});

describe("every failure case of tests/failures is listed in README.md, with a title", () => {
  const cases = readdirSync(join(REPO, "tests", "failures")).filter((file) => /^\d\d-.*\.test\.ts$/.test(file));

  it("there are failure case files to check (an empty directory would pass the test below)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it("each is cited in README.md with a title", () => {
    expect(uncitedFailureCases(README, cases)).toEqual([]);
  });
});

describe("no document cites a line number", () => {
  it("README.md and docs/*.md have no `file:123` form", () => {
    expect([...lineNumberCitations(README), ...lineNumberCitations(ARCHITECTURE), ...lineNumberCitations(THESIS), ...lineNumberCitations(WALKTHROUGH), ...lineNumberCitations(NOTES)]).toEqual([]);
  });
});

describe("docs/THESIS.md is at most 300 words", () => {
  it("counts as wc -w counts, the heading included", () => {
    expect(wordCount(THESIS)).toBeLessThanOrEqual(300);
  });

  it("and is not trivially empty", () => {
    expect(wordCount(THESIS)).toBeGreaterThanOrEqual(150);
  });
});

describe("docs/WALKTHROUGH.md: the script is performable in 90 seconds", () => {
  const beats = parseBeats(WALKTHROUGH);

  it("has the six beats of the plan's outline, each with an on-screen line and some narration", () => {
    expect(beats.length).toBe(6);
    for (const beat of beats) {
      expect(beat.state, beat.title).not.toBeNull();
      expect(beat.strings.length, beat.title).toBeGreaterThan(0);
      expect(beat.words, beat.title).toBeGreaterThan(0);
    }
  });

  it("the slots run on from 0:00, no beat is over 170 words a minute, and the narration is at most 230 words in all", () => {
    expect(timingProblems(beats)).toEqual([]);
  });

  it("every beat's on-screen strings are on the page the real component renders for its state, in the stated order", () => {
    for (const beat of beats) {
      const state = stateOf(beat.state ?? "");
      expect(state, `${beat.title}: the state "${beat.state}" is not one this test can render`).toBeDefined();
      expect(onScreenProblems(beat.strings, visibleText(markupOf(state as DemoState)), beat.title)).toEqual([]);
    }
  });

  it("ticking the documents one by one (the script's route) renders the same page as the scripted step it stands for", () => {
    const tick = (state: DemoState, id: string): DemoState => demoReducer(state, { type: "toggle", id: obsId(id) });
    const afterO3 = tick(step(1), "o3");
    expect(markupOf(afterO3)).toBe(markupOf(step(4)));
    expect(markupOf(tick(afterO3, "o4"))).toBe(markupOf(step(5)));
  });
});

describe("README.md carries the deliverables the plan names", () => {
  it("states the live URL", () => {
    expect(README).toContain("https://beyond-the-chatbot-xi.vercel.app");
  });

  it("gives the clean-clone commands in the plan's order", () => {
    const order = ["git clone", "npm ci", "npm run typecheck", "npm test", "npm run build"].map((command) => README.indexOf(command));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("has an Honest limits section", () => {
    expect(README).toMatch(/^## Honest limits$/m);
  });

  it("lists the runtime and dev dependencies of package.json, exactly", () => {
    expect(listedPackages(README, "Runtime dependencies (package.json): ")?.sort()).toEqual(Object.keys(PACKAGE.dependencies).sort());
    expect(listedPackages(README, "Dev dependencies (package.json): ")?.sort()).toEqual(Object.keys(PACKAGE.devDependencies).sort());
  });
});

describe("TEETH: the checker reports what it claims to, on a synthetic tree", () => {
  const SOURCE = [
    'import { describe, it } from "vitest";',
    '// "a title that only a comment holds"',
    'describe("the suite", () => {',
    '  it("a real title that is a test", () => {});',
    '  it("a second real title", () => {});',
    '  it.each([1])("a table title: %s", () => {});',
    "});",
    "",
  ].join("\n");

  function tree(): { root: string; cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), "btc-docs-citations-"));
    for (const [path, text] of [["lib/x/__tests__/a.test.ts", SOURCE], ["lib/x/a.ts", "export const a = 1;\n"]] as const) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }

  const cite = (path: string, ...titles: string[]): string => `see \`${path}\`${titles.map((title) => ` › "${title}"`).join(",")}`;

  it("accepts a file, a test title, a prefix of a test title, a describe title, a table title, and several titles after one path", () => {
    const { root, cleanup } = tree();
    try {
      for (const text of [
        cite("lib/x/a.ts"),
        cite("lib/x/__tests__/a.test.ts", "a real title that is a test"),
        cite("lib/x/__tests__/a.test.ts", "a real title"),
        cite("lib/x/__tests__/a.test.ts", "the suite"),
        cite("lib/x/__tests__/a.test.ts", "a table title"),
        cite("lib/x/__tests__/a.test.ts", "a real title that is a test", "a second real title"),
      ]) {
        expect(citationProblems(text, root, "doc")).toEqual([]);
      }
    } finally {
      cleanup();
    }
  });

  it("reports a missing file, a title not in the file, a title only a comment holds, and a title cited on a source file", () => {
    const { root, cleanup } = tree();
    try {
      expect(citationProblems(cite("lib/x/__tests__/gone.test.ts"), root, "doc")).toEqual(["doc line 1: lib/x/__tests__/gone.test.ts: no such file"]);
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "not a title here"), root, "doc")).toEqual([
        'doc line 1: lib/x/__tests__/a.test.ts: the title is not in the file: "not a title here"',
      ]);
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "a title that only a comment holds"), root, "doc")).toEqual([
        'doc line 1: lib/x/__tests__/a.test.ts: the title occurs, but not on a line that opens an it, test or describe: "a title that only a comment holds"',
      ]);
      expect(citationProblems(cite("lib/x/a.ts", "export"), root, "doc")).toEqual(["doc line 1: lib/x/a.ts: a title is cited, but this is not a test file"]);
    } finally {
      cleanup();
    }
  });

  it("refuses a title under 8 characters, even one that is in the file", () => {
    const { root, cleanup } = tree();
    try {
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "T"), root, "doc")).toEqual(['doc line 1: lib/x/__tests__/a.test.ts: the title is under 8 characters, so it could match almost any test: "T"']);
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "the suite"), root, "doc")).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("checks EVERY title after a path: a bad second title is reported although the first is good", () => {
    const { root, cleanup } = tree();
    try {
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "a real title that is a test", "a title that is not there"), root, "doc")).toEqual([
        'doc line 1: lib/x/__tests__/a.test.ts: the title is not in the file: "a title that is not there"',
      ]);
      expect(citationProblems(cite("lib/x/__tests__/a.test.ts", "a real title", "a second real title", "a third that is missing"), root, "doc")).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("reports a title that follows no path on its line (an orphan), instead of skipping it", () => {
    const { root, cleanup } = tree();
    try {
      expect(citationProblems('and › "a title with no path"', root, "doc")).toEqual(['doc line 1: a title with no path before it on the line: "a title with no path"']);
      expect(scanCitations(["`lib/x/a.ts`", '› "on the next line"'].join("\n")).orphans).toEqual([{ title: "on the next line", line: 2 }]);
    } finally {
      cleanup();
    }
  });

  it("SABOTAGE: renaming a cited test file turns a passing citation into a reported one", () => {
    const { root, cleanup } = tree();
    try {
      const text = cite("lib/x/__tests__/a.test.ts", "a real title that is a test");
      expect(citationProblems(text, root, "doc")).toEqual([]);
      renameSync(join(root, "lib/x/__tests__/a.test.ts"), join(root, "lib/x/__tests__/b.test.ts"));
      expect(citationProblems(text, root, "doc")).toEqual(["doc line 1: lib/x/__tests__/a.test.ts: no such file"]);
    } finally {
      cleanup();
    }
  });

  it("reads the line of each citation, sees two on one line, and ignores a path outside the six roots or without a backtick", () => {
    const text = ["nothing", '`lib/a.ts` and `tests/b.test.ts` › "t"', "docs/x.ts without backticks", "`docs/x.ts` is not under a root"].join("\n");
    expect(findCitations(text)).toEqual([
      { path: "lib/a.ts", titles: [], line: 2 },
      { path: "tests/b.test.ts", titles: ["t"], line: 2 },
    ]);
  });

  it("SABOTAGE: a `file.ts:123` citation is found, and only that", () => {
    expect(lineNumberCitations("see lib/a.ts:12 here\nsee lib/a.ts there\nport localhost:3000")).toEqual(["line 1: see lib/a.ts:12 here"]);
  });

  it("SABOTAGE: a 301-word thesis is over the cap and a 300-word one is not; words are counted as wc -w counts them", () => {
    const words = (count: number): string => Array.from({ length: count }, (_, index) => `w${index}`).join(" ");
    expect(wordCount(words(301))).toBe(301);
    expect(wordCount(words(301))).toBeGreaterThan(300);
    expect(wordCount(`# heading\n${words(299)}`)).toBe(301);
    expect(wordCount(`# heading\n${words(298)}`)).toBe(300);
    expect(wordCount("  one two\nthree\t four  ")).toBe(4);
  });

  it("SABOTAGE: a failure case missing from the README is reported", () => {
    const readme = ["`tests/failures/01-a.test.ts` › \"x\"", "`tests/failures/02-b.test.ts`"].join("\n");
    expect(uncitedFailureCases(readme, ["01-a.test.ts", "02-b.test.ts", "03-c.test.ts"])).toEqual(["02-b.test.ts", "03-c.test.ts"]);
    expect(uncitedFailureCases(readme, ["01-a.test.ts"])).toEqual([]);
  });

  it("parses beats, and reports a beat over 170 words a minute, a gap, an overrun and a total over 230 words", () => {
    const say = (count: number): string => `> ${Array.from({ length: count }, () => "word").join(" ")}`;
    const script = (parts: [string, number][]): string =>
      parts.map(([slot, count]) => `**${slot}. A beat.**\nOn screen [step 1]: "x"\n${say(count)}`).join("\n\n");
    expect(parseBeats(script([["0:00 - 0:10", 28]]))).toEqual([{ title: "A beat.", start: 0, end: 10, words: 28, state: "step 1", strings: ["x"] }]);
    expect(timingProblems(parseBeats(script([["0:00 - 0:10", 28]])))).toEqual([]);
    expect(timingProblems(parseBeats(script([["0:00 - 0:10", 29]])))).toEqual(['"A beat." is 29 words in 10 s, which is 174 words a minute (limit 170)']);
    expect(timingProblems(parseBeats(script([["0:00 - 0:10", 5], ["0:12 - 0:20", 5]])))).toEqual(['"A beat." starts at 12 s, but the previous beat ended at 10 s']);
    expect(timingProblems(parseBeats(script([["0:00 - 1:00", 5], ["1:00 - 1:31", 5]])))).toEqual(["the script runs to 91 s, past 90"]);
    expect(timingProblems(parseBeats(script([["0:00 - 0:45", 116], ["0:45 - 1:30", 115]])))).toEqual(["the narration is 231 words, over 230"]);
    expect(timingProblems([])).toEqual(["no beats were found"]);
  });

  it("SABOTAGE: an on-screen string that is not on the page, or is out of order, is reported", () => {
    const page = visibleText('<p>first &amp; foremost</p><p>second\n  line</p><!-- a comment --><p>third</p>');
    expect(page).toBe("first & foremost second line third");
    expect(onScreenProblems(["first & foremost", "second line", "third"], page, "beat")).toEqual([]);
    expect(onScreenProblems(["first & foremost", "fourth"], page, "beat")).toEqual(['beat: not on the page: "fourth"']);
    expect(onScreenProblems(["third", "first & foremost"], page, "beat")).toEqual(['beat: on the page, but before the previous string, so not in the stated order: "first & foremost"']);
  });

  it("renders a beat's state, and refuses a state it does not know", () => {
    expect(stateOf("step 5")).toBeDefined();
    expect(stateOf("step 4, forged")?.forge).toBe("raise-upper-bound");
    expect(stateOf("step 7")).toBeUndefined();
    expect(stateOf("step 4, forged, and more")).toBeUndefined();
    expect(visibleText(markupOf(step(5)))).toContain("6 of 6 pairs consistent");
    expect(visibleText(markupOf(step(1)))).not.toContain("6 of 6 pairs consistent");
  });

  it("reads a dependency list line, and not a line that only mentions the label", () => {
    expect(listedPackages("x\nRuntime dependencies (package.json): a, b, c.\ny", "Runtime dependencies (package.json): ")).toEqual(["a", "b", "c"]);
    expect(listedPackages("see Runtime dependencies (package.json): a", "Runtime dependencies (package.json): ")).toBeUndefined();
  });
});
