import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Pins `vercel.json` to `{"installCommand":"npm ci","buildCommand":"npm run build"}` (`.genesis/PLAN.md`
 * section 6, M2). `vercel.json` belongs to the scaffold (G3), not to M2: this milestone pins it and does not
 * edit it.
 *
 * WHY IT IS PINNED. Without a `buildCommand`, Vercel's Next.js preset runs a plain `next build`, which on
 * Next 16 is Turbopack, and Turbopack cannot resolve `lib/`'s `.js`-suffixed imports (`next.config.ts`, and the
 * ADR for this milestone records the build that shows it). `npm run build` is `next build --webpack`
 * (`tests/smoke.test.ts` pins that). `npm ci` is pinned for the lockfile reason in `tests/lockfile.test.ts`.
 *
 * WHAT THE PIN CHECKS. The file is read as text and run through `JSON.parse`, and the resulting object must
 * have exactly the two keys, each with exactly its value. So, as the table below (executed, not just stated):
 *   FAILS:  an extra key (any key, including one named like an inherited property), a wrong value, a missing
 *           key, malformed JSON (a trailing comma, a comment, an empty file, a truncated one), and JSON that
 *           is not an object (`[]`, `null`, a string).
 *   PASSES: any reordering of the keys, and any reformatting (minified, tabs, CRLF, no final newline).
 *
 * WHAT IT CANNOT SEE. It sees the object `JSON.parse` returns, and `JSON.parse` keeps the LAST value of a key
 * written twice, so a file that repeats a key passes if the last value is the right one, and fails if the last
 * one is wrong; the earlier one is invisible to it. That is a statement about this test, not about what Vercel
 * does with a repeated key, which was not run. It also does not check that Vercel honoured the file: the
 * deploy log's two "Running ..." lines are where that was looked at (the ADR quotes them).
 */
const PINNED = { installCommand: "npm ci", buildCommand: "npm run build" } as const;

/** Everything wrong with the text of a `vercel.json`, as short messages; `[]` means it matches the pin. */
function problemsWith(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [`not valid JSON: ${error instanceof Error ? error.message : "unparseable"}`];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return ["not a JSON object"];
  const record = parsed as Readonly<Record<string, unknown>>;
  const problems: string[] = [];
  for (const [key, expected] of Object.entries(PINNED)) {
    if (!Object.hasOwn(record, key)) problems.push(`missing key ${key}`);
    else if (record[key] !== expected) problems.push(`${key} is ${JSON.stringify(record[key])}, not ${JSON.stringify(expected)}`);
  }
  // `Object.hasOwn`, not `in`: `"toString" in PINNED` is true, and an extra key of that name must still be extra.
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(PINNED, key)) problems.push(`unexpected key ${key}`);
  }
  return problems;
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const file = path.join(root, "vercel.json");

describe("vercel.json in the repository", () => {
  const text = readFileSync(file, "utf-8");

  it("parses to exactly the pinned object (stated directly, not through the helper below)", () => {
    expect(JSON.parse(text)).toStrictEqual(PINNED);
  });

  it("has no problem by the helper's account", () => {
    expect(problemsWith(text)).toEqual([]);
  });
});

describe("what the pin catches (the helper, on synthetic text)", () => {
  const BUILD = '"buildCommand": "npm run build"';
  const INSTALL = '"installCommand": "npm ci"';

  const passes: readonly (readonly [string, string])[] = [
    ["the exact pinned text", `{ ${INSTALL}, ${BUILD} }`],
    ["the keys in the other order", `{ ${BUILD}, ${INSTALL} }`],
    ["minified", '{"installCommand":"npm ci","buildCommand":"npm run build"}'],
    ["tab-indented with CRLF line endings and no final newline", `{\r\n\t${INSTALL},\r\n\t${BUILD}\r\n}`],
    ["a repeated key whose LAST value is right (JSON.parse keeps the last: the test cannot see the first)", `{ "installCommand": "yarn", ${INSTALL}, ${BUILD} }`],
  ];

  const fails: readonly (readonly [string, string])[] = [
    ["an extra key", `{ ${INSTALL}, ${BUILD}, "framework": "nextjs" }`],
    ["an extra key named like an inherited property", `{ ${INSTALL}, ${BUILD}, "toString": "x" }`],
    ["an extra key named __proto__", `{ ${INSTALL}, ${BUILD}, "__proto__": {} }`],
    ["a wrong buildCommand", `{ ${INSTALL}, "buildCommand": "next build" }`],
    ["a wrong installCommand", `{ "installCommand": "npm install", ${BUILD} }`],
    ["an empty value", `{ ${INSTALL}, "buildCommand": "" }`],
    ["a value of the wrong type", `{ ${INSTALL}, "buildCommand": ["npm run build"] }`],
    ["a missing buildCommand", `{ ${INSTALL} }`],
    ["a missing installCommand", `{ ${BUILD} }`],
    ["an empty object", "{}"],
    ["a repeated key whose LAST value is wrong", `{ ${INSTALL}, ${BUILD}, "buildCommand": "next build" }`],
    ["a trailing comma", `{ ${INSTALL}, ${BUILD}, }`],
    ["a comment", `{ // pinned\n ${INSTALL}, ${BUILD} }`],
    ["an empty file", ""],
    ["a truncated file", `{ ${INSTALL}, "buildCom`],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"npm ci"'],
  ];

  it.each(passes)("passes: %s", (_what, text) => {
    expect(problemsWith(text)).toEqual([]);
  });

  it.each(fails)("fails: %s", (_what, text) => {
    expect(problemsWith(text)).not.toEqual([]);
  });

  it("reports what is wrong, by name", () => {
    expect(problemsWith(`{ ${INSTALL}, "buildCommand": "next build", "framework": "nextjs" }`)).toEqual([
      'buildCommand is "next build", not "npm run build"',
      "unexpected key framework",
    ]);
  });
});
