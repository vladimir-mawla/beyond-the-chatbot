import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/**
 * WHY THIS FILE EXISTS. A `// @ts-expect-error` line proves only that SOME error occurs on the next
 * line. Four ordinary ways for that to be a false proof; the first three were reproduced against this
 * repo's own compiler settings (tsc 7.0.2), the fourth was found by a verifier on the sibling project
 * this harness is adapted from:
 *
 *  1. `noUnusedLocals` is on in both tsconfigs. `const a: Entailment = x;` with `a` never read errors
 *     with TS6133 whatever `Entailment` looks like, so the directive above it is satisfied even if the
 *     assignment is perfectly legal.
 *  2. `const x = { kind: "ungrounded", ... }` (no `as const`) widens `kind` to `string`, so
 *     `const a: Entailment = x` fails on `kind`, not on the field the proof is about.
 *  3. A fresh object literal can fail on EXCESS-PROPERTY grounds (TS2353) even when the field is not
 *     forbidden by assignability at all. That is the weakness the non-literal routes exist to expose
 *     (plan section 8, defect 7): a proof written that way stays green when the `?: never` is deleted.
 *  4. THE EXPECTED DIAGNOSTIC ARRIVES WITH AN UNEXPECTED ONE. A line that carries the stated error plus a
 *     second, unrelated one (even of the same code) still satisfies a bare directive. A first version of
 *     the sibling's harness accepted exactly that.
 *
 * `npm run typecheck` cannot see any of this: it reports TS2578 only when the line has NO error at all.
 * So every proof file under `__tests__/proofs/` is ALSO compiled by this harness with every
 * `@ts-expect-error` removed (line numbers preserved), and for each removed directive the line below it
 * must carry EXACTLY ONE diagnostic, and that diagnostic must have the stated code and the stated message
 * fragment. Any other diagnostic anywhere in the proof file is a problem.
 *
 * It fails on each of: the expected diagnostic missing; the wrong code; the wrong message fragment; the
 * wrong line (an error on a line no directive points at); and ANY additional diagnostic (a different
 * code, or the same code twice). `proof-harness.test.ts` ships one fixture for each and shows each red.
 *
 * DIRECTIVE FORMAT (the only form accepted; any other suppression comment in a proof file is a problem,
 * including `@ts-ignore` and `@ts-nocheck`, wherever on the line it sits):
 *
 *     // @ts-expect-error TS2322 Types of property 'established' are incompatible
 *     // @ts-expect-error TS2322|TS2741 Property 'unmet' is missing
 *
 * `TS<code>` is one or more `|`-separated codes; the rest of the line is a message fragment that must
 * occur verbatim in the diagnostic's text (the message and its elaboration chain, joined). TypeScript
 * ignores trailing text on a `@ts-expect-error`, so the same line still works for `npm run typecheck`.
 * Prose in a proof file must therefore avoid writing a suppression marker right after a comment opener.
 *
 * Each proof file is compiled under BOTH of this repo's tsconfigs (`tsconfig.lib.json`, which has
 * `exactOptionalPropertyTypes`, and `tsconfig.json`, which does not and is what `app/` and `components/`
 * use), because "this does not compile" is only worth saying for the settings a consumer compiles under.
 *
 * WHAT THIS DOES NOT DO. It does not prove a proof file's routes are the right routes, or that the list is
 * complete: it checks that each route that IS written fails for the stated reason under both configs.
 * It checks the diagnostics of ONE proof file per call (plus a report, by file name, of any diagnostic in
 * a file the proof imports); a proof line whose error appears only in a different file is not seen.
 * It cannot tell a proof that is vacuous for a reason outside the type system (a typo in the carrier's
 * name that happens to also be a type error would be caught by the code/fragment, not by intent).
 */

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");

/** The two compile settings every proof is checked under. */
export const PROOF_CONFIGS = ["tsconfig.lib.json", "tsconfig.json"] as const;
export type ProofConfig = (typeof PROOF_CONFIGS)[number];

/** Scratch names no real file in this repo has, so a diagnostic can be attributed to a proof by basename alone. */
const proofFileName = (index: number): string => `__proof_under_test_${index}__.ts`;
const PROOF_FILE_PATTERN = /^__proof_under_test_(\d+)__\.ts$/;
const DIRECTIVE = /^\s*\/\/ @ts-expect-error (TS\d+(?:\|TS\d+)*) (\S.*)$/;
/** A suppression marker right after a comment opener, wherever the comment sits on the line (mirrors what TypeScript honours). */
const ANY_SUPPRESSION = /(?:\/\/+|\/\*+|^\s*\*+)\s*@ts-(?:expect-error|ignore|nocheck)/;

interface Directive {
  readonly line: number;
  readonly codes: readonly number[];
  readonly fragment: string;
}

export interface Diag {
  /** The path as tsc prints it. */
  readonly file: string;
  readonly line: number;
  readonly code: number;
  readonly text: string;
}

export type FailureKind =
  | "bad-directive"
  | "no-diagnostic"
  | "wrong-diagnostic"
  | "extra-diagnostic"
  | "stray-diagnostic"
  | "imported-file"
  | "unparsed-output";

/** One thing the harness found wrong, structured so a caller (the sabotage test) can say WHERE without parsing prose. */
export interface ProofFailure {
  readonly config: ProofConfig | "source";
  /** 1-based line in the proof file; the line the diagnostic (or its absence) is about. */
  readonly line: number;
  readonly kind: FailureKind;
  readonly message: string;
}

/** Everything the harness found wrong; empty `problems` means the proof file is sound. */
export interface ProofReport {
  readonly directives: number;
  readonly problems: readonly string[];
  readonly failures: readonly ProofFailure[];
}

function parseDirectives(lines: readonly string[], failures: ProofFailure[]): Directive[] {
  const directives: Directive[] = [];
  lines.forEach((text, index) => {
    const line = index + 1;
    if (!ANY_SUPPRESSION.test(text)) return;
    const match = DIRECTIVE.exec(text);
    if (match === null) {
      failures.push({
        config: "source",
        line,
        kind: "bad-directive",
        message:
          `line ${line}: suppression comment is not in the accepted form ` +
          "`// @ts-expect-error TS<code>[|TS<code>] <message fragment>`: " +
          text.trim(),
      });
      return;
    }
    directives.push({
      line,
      codes: (match[1] as string).split("|").map((c) => Number(c.slice(2))),
      fragment: match[2] as string,
    });
  });
  return directives;
}

const DIAGNOSTIC_HEADER = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

function parseTscOutput(output: string): { diags: Diag[]; unparsed: string[] } {
  const diags: Diag[] = [];
  const unparsed: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const header = DIAGNOSTIC_HEADER.exec(raw);
    if (header !== null) {
      diags.push({ file: header[1] as string, line: Number(header[2]), code: Number(header[4]), text: header[5] as string });
    } else if (/^\s/.test(raw) && diags.length > 0) {
      const last = diags[diags.length - 1] as Diag;
      diags[diags.length - 1] = { ...last, text: `${last.text}\n${raw.trim()}` };
    } else {
      unparsed.push(raw);
    }
  }
  return { diags, unparsed };
}

function compile(config: ProofConfig, scratch: string, count: number): { diags: Diag[]; unparsed: string[] } {
  const project = join(scratch, `${config.replace(/\.json$/, "")}.project.json`);
  writeFileSync(
    project,
    JSON.stringify({
      extends: join(REPO_ROOT, config),
      compilerOptions: { noEmit: true, incremental: false },
      include: Array.from({ length: count }, (_, i) => `./${proofFileName(i)}`),
      exclude: [],
    }),
  );
  let output = "";
  try {
    output = execFileSync(process.execPath, [TSC, "-p", project, "--pretty", "false"], {
      cwd: scratch,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // tsc exits 1 when it reports diagnostics; its report is on stdout.
    const failure = error as { stdout?: string; stderr?: string };
    output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
  return parseTscOutput(output);
}

/**
 * Relative imports in a proof file are written against the proof's own directory; the copy that is
 * compiled lives in a scratch directory, so they are rewritten to absolute paths. Only the double-quoted
 * `from "./x.js"` / `from "../x.js"` form is rewritten; anything else stays relative and fails to resolve,
 * which shows up as a diagnostic outside any proof line (red, not silently skipped).
 */
function absolutise(source: string, baseDir: string): string {
  return source.replace(/(\bfrom\s+)"(\.{1,2}\/[^"]*)"/g, (_all, lead: string, spec: string) => {
    return `${lead}${JSON.stringify(resolve(baseDir, spec))}`;
  });
}

/** One proof file's text, with a caller-chosen name to find its report by. */
export interface ProofInput {
  readonly name: string;
  readonly source: string;
}

/**
 * Compile each proof source EXACTLY AS WRITTEN (directives left in), under one config, in ONE tsc run, and
 * return what tsc says about each (by `name`). This is what `npm run typecheck` sees for the file: a directive
 * that suppresses nothing shows up here as TS2578 (reported on the directive's own line). The sabotage test
 * uses it to report TS2578 at a proof's own line. One run for many files is only a speed-up: the files are
 * independent modules and a diagnostic is attributed to its file by name.
 */
export function compileAllAsWritten(inputs: readonly ProofInput[], baseDir: string, config: ProofConfig): ReadonlyMap<string, readonly Diag[]> {
  const scratch = mkdtempSync(join(tmpdir(), "btc-proof-asis-"));
  try {
    inputs.forEach((input, i) => writeFileSync(join(scratch, proofFileName(i)), absolutise(input.source, baseDir)));
    const { diags } = compile(config, scratch, inputs.length);
    const byName = new Map<string, Diag[]>(inputs.map((input) => [input.name, []]));
    for (const diag of diags) {
      const match = PROOF_FILE_PATTERN.exec(basename(diag.file));
      if (match !== null) (byName.get((inputs[Number(match[1])] as ProofInput).name) as Diag[]).push(diag);
    }
    return byName;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function compileAsWritten(source: string, baseDir: string, config: ProofConfig): readonly Diag[] {
  return (compileAllAsWritten([{ name: "proof", source }], baseDir, config).get("proof") ?? []) as readonly Diag[];
}

/**
 * Check several proof files in one tsc run per config (the same checks as `checkProofSource`, file by file).
 * `baseDir` is the directory their RELATIVE imports are written against.
 */
export function checkProofSources(inputs: readonly ProofInput[], baseDir: string): ReadonlyMap<string, ProofReport> {
  interface Prepared {
    readonly input: ProofInput;
    readonly directives: readonly Directive[];
    readonly failures: ProofFailure[];
  }
  const prepared: Prepared[] = inputs.map((input) => {
    const failures: ProofFailure[] = [];
    return { input, directives: parseDirectives(input.source.split("\n"), failures), failures };
  });

  const scratch = mkdtempSync(join(tmpdir(), "btc-proof-harness-"));
  try {
    prepared.forEach(({ input }, i) => {
      const stripped = absolutise(
        input.source
          .split("\n")
          .map((text) => (DIRECTIVE.test(text) ? "// (directive removed by the proof harness)" : text))
          .join("\n"),
        baseDir,
      );
      writeFileSync(join(scratch, proofFileName(i)), stripped);
    });
    for (const config of PROOF_CONFIGS) {
      const { diags, unparsed } = compile(config, scratch, prepared.length);
      // A diagnostic in a file the proofs IMPORT (a contract source that no longer compiles) is not a proof
      // line; it is reported under its own file name so the cause is not mistaken for a broken proof.
      const shared: ProofFailure[] = [];
      for (const line of unparsed) {
        shared.push({ config, line: 0, kind: "unparsed-output", message: `[${config}] tsc printed something that is not a diagnostic: ${line}` });
      }
      for (const other of diags.filter((d) => !PROOF_FILE_PATTERN.test(basename(d.file)))) {
        shared.push({
          config,
          line: 0,
          kind: "imported-file",
          message: `[${config}] ${other.file}(${other.line}): TS${other.code} in a file the proof imports, not in the proof`,
        });
      }
      prepared.forEach((entry, i) => {
        entry.failures.push(...shared);
        const inProof = diags.filter((d) => basename(d.file) === proofFileName(i));
        const targetLines = new Set(entry.directives.map((d) => d.line + 1));
        for (const directive of entry.directives) {
          const target = directive.line + 1;
          const here = inProof.filter((d) => d.line === target);
          const matching = here.find((d) => directive.codes.includes(d.code) && d.text.includes(directive.fragment));
          if (here.length === 0) {
            entry.failures.push({
              config,
              line: target,
              kind: "no-diagnostic",
              message: `[${config}] line ${target}: expected TS${directive.codes.join("|TS")} containing ${JSON.stringify(directive.fragment)}, got no diagnostic at all`,
            });
            continue;
          }
          if (matching === undefined) {
            entry.failures.push({
              config,
              line: target,
              kind: "wrong-diagnostic",
              message:
                `[${config}] line ${target}: expected TS${directive.codes.join("|TS")} containing ${JSON.stringify(directive.fragment)}, ` +
                `got ${here.map((d) => `TS${d.code}`).join(", ")}`,
            });
          }
          // Exactly one diagnostic per proof line: everything that is not THE matching one is extra, whatever its code.
          for (const extra of here) {
            if (extra === matching) continue;
            if (matching === undefined && extra === here[0]) continue; // already reported as the wrong diagnostic
            entry.failures.push({
              config,
              line: target,
              kind: "extra-diagnostic",
              message:
                `[${config}] line ${target}: unexpected extra diagnostic TS${extra.code} ` +
                "(a proof line must fail for exactly the stated reason, and a variable it declares must be used elsewhere)",
            });
          }
        }
        for (const diag of inProof) {
          if (!targetLines.has(diag.line)) {
            entry.failures.push({
              config,
              line: diag.line,
              kind: "stray-diagnostic",
              message: `[${config}] line ${diag.line}: unexpected diagnostic TS${diag.code} outside any proof line`,
            });
          }
        }
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return new Map(
    prepared.map((entry) => [
      entry.input.name,
      { directives: entry.directives.length, problems: entry.failures.map((f) => f.message), failures: entry.failures },
    ]),
  );
}

/** Check one proof file's text. `baseDir` is the directory its RELATIVE imports are written against. */
export function checkProofSource(source: string, baseDir: string): ProofReport {
  return checkProofSources([{ name: "proof", source }], baseDir).get("proof") as ProofReport;
}

export function checkProofFile(file: string): ProofReport {
  return checkProofSource(readFileSync(file, "utf8"), dirname(file));
}
