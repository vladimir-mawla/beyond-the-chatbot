import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { PROOF_CONFIGS, checkProofSources, compileAllAsWritten, compileAsWritten, type ProofConfig } from "./proof-harness.js";

/**
 * SABOTAGE MACHINERY: deletes (or loosens) ONE declaration in a COPY of `lib/contracts`, runs every proof file
 * against the copy, and reports which proof GROUPS went red. It never touches the real sources.
 *
 * A proof file names every proof `<group>_<route>` (for example `ungrounded_established_binding`: group
 * `ungrounded_established`, route `binding`), so a failing line can be attributed to a group by reading the
 * nearest `export const|function <name>` at or above it. The claim under test is, for a mutation M:
 *   (1) STRICT, the proof harness (directives stripped, exactly one stated diagnostic per line, nothing else):
 *       the groups that fail are EXACTLY M's own groups, every route of each, and no other group in any file;
 *   (2) AS WRITTEN, what `npm run typecheck` sees: each failing line is TS2578 ("unused directive"), and the
 *       lines are exactly M's own, every route of each.
 * PLUS, optionally, a LITERAL PROBE: a fresh-literal assignment compiled in the same copy. It shows the form
 * the plan's defect 7 warns about is non-discriminating on the real code: it fails to compile both with and
 * without the `?: never`, so a proof written that way could not tell the two apart.
 *
 * WHAT THIS DOES NOT PROVE: that the 17 `?: never` fields are the right 17 (that is the plan's list, checked
 * by reading), nor anything about a mutation that is not in the list.
 */

export const CONTRACTS_DIR = resolve(import.meta.dirname, "..", "..");

export interface Mutation {
  /** Human name, used as the test title and in the printed matrix. */
  readonly id: string;
  /** The contract source file, relative to `lib/contracts`. */
  readonly file: string;
  /** Returns the mutated source; must throw unless it changed exactly one place. */
  readonly apply: (source: string) => string;
  /** The proof groups that must go red. */
  readonly groups: readonly string[];
}

/** The proof group and route of the declaration at (or nearest above) a 1-based line. */
export function proofNameAt(source: string, line: number): { group: string; route: string } | undefined {
  const lines = source.split("\n");
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const match = /^export (?:const|function) (\w+)/.exec(lines[i] as string);
    if (match !== null) {
      const name = match[1] as string;
      const cut = name.lastIndexOf("_");
      if (cut < 0) return undefined;
      return { group: name.slice(0, cut), route: name.slice(cut + 1) };
    }
  }
  return undefined;
}

export function proofFiles(contractsDir: string): string[] {
  const dir = join(contractsDir, "__tests__", "proofs");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .sort()
    .map((name) => join(dir, name));
}

export interface SabotageOutcome {
  /** `group -> routes that failed STRICT`, over every proof file. */
  readonly strict: ReadonlyMap<string, ReadonlySet<string>>;
  /** `group -> routes that failed AS WRITTEN with TS2578`. */
  readonly asWritten: ReadonlyMap<string, ReadonlySet<string>>;
  /** Anything that is not attributable to a `group_route` proof line, as sentences: must be empty. */
  readonly unattributed: readonly string[];
}

function add(map: Map<string, Set<string>>, group: string, route: string): void {
  const routes = map.get(group) ?? new Set<string>();
  routes.add(route);
  map.set(group, routes);
}

/** Run `body` against a scratch COPY of `lib/contracts` with `mutation` applied (or none); the copy is removed afterwards. */
function withCopy<T>(mutation: Mutation | undefined, body: (copy: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), "btc-sabotage-"));
  try {
    const copy = join(scratch, "contracts");
    cpSync(CONTRACTS_DIR, copy, { recursive: true });
    if (mutation !== undefined) {
      const target = join(copy, mutation.file);
      writeFileSync(target, mutation.apply(readFileSync(target, "utf8")));
    }
    return body(copy);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Run every proof file against a copy with `mutation` applied (or none). */
export function runSabotage(mutation: Mutation | undefined): SabotageOutcome {
  return withCopy(mutation, (copy) => {
    const strict = new Map<string, Set<string>>();
    const asWritten = new Map<string, Set<string>>();
    const unattributed: string[] = [];
    const proofsDir = join(copy, "__tests__", "proofs");
    const inputs = proofFiles(copy).map((file) => ({ name: file, source: readFileSync(file, "utf8") }));
    const sourceOf = new Map(inputs.map((i) => [i.name, i.source]));
    for (const [file, report] of checkProofSources(inputs, proofsDir)) {
      for (const failure of report.failures) {
        const name = failure.line > 0 ? proofNameAt(sourceOf.get(file) as string, failure.line) : undefined;
        if (name === undefined) unattributed.push(`[strict] ${basename(file)}: ${failure.message}`);
        else add(strict, name.group, name.route);
      }
    }
    for (const config of PROOF_CONFIGS as readonly ProofConfig[]) {
      for (const [file, diags] of compileAllAsWritten(inputs, proofsDir, config)) {
        for (const diag of diags) {
          // TS2578 is reported on the DIRECTIVE line; the proof it belongs to is declared on the line below it.
          const name = proofNameAt(sourceOf.get(file) as string, diag.line + 1);
          if (diag.code !== 2578 || name === undefined) unattributed.push(`[as written, ${config}] ${basename(file)} line ${diag.line}: TS${diag.code} ${diag.text.split("\n")[0]}`);
          else add(asWritten, name.group, name.route);
        }
      }
    }
    return { strict, asWritten, unattributed };
  });
}

/**
 * Compile `probe` (a source text whose relative imports are written against `__tests__/proofs/`) AS WRITTEN in a
 * copy with `mutation` applied (or none), under both configs; returns the diagnostic codes per config.
 */
export function probeCodes(mutation: Mutation | undefined, probe: string): readonly { readonly config: ProofConfig; readonly codes: readonly number[] }[] {
  return withCopy(mutation, (copy) =>
    (PROOF_CONFIGS as readonly ProofConfig[]).map((config) => ({
      config,
      codes: compileAsWritten(probe, join(copy, "__tests__", "proofs"), config).map((d) => d.code),
    })),
  );
}

// ---------------------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------------------

/** The text of `export interface <name> ... { ... }` (up to the first line that is exactly `}`), with its start offset. */
function interfaceBlock(source: string, name: string): { start: number; end: number; text: string } {
  const open = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(source);
  if (open === null) throw new Error(`sabotage: no \`export interface ${name}\` in the source`);
  const close = source.indexOf("\n}", open.index);
  if (close < 0) throw new Error(`sabotage: \`interface ${name}\` is not closed`);
  return { start: open.index, end: close + 2, text: source.slice(open.index, close + 2) };
}

function replaceInBlock(source: string, iface: string, from: RegExp, to: string): string {
  const block = interfaceBlock(source, iface);
  const matches = block.text.match(new RegExp(from.source, "gm")) ?? [];
  if (matches.length !== 1) {
    throw new Error(`sabotage: expected exactly one match of ${from} in interface ${iface}, found ${matches.length}`);
  }
  return source.slice(0, block.start) + block.text.replace(from, to) + source.slice(block.end);
}

/** Delete the line `readonly <field>?: never;` from `interface <iface>`. */
export function deleteNever(iface: string, field: string): (source: string) => string {
  return (source) => replaceInBlock(source, iface, new RegExp(`^[ \\t]*readonly ${field}\\?: never;[ \\t]*\\n`, "m"), "");
}

/** Make a required field optional: `readonly <field>: T;` -> `readonly <field>?: T;`. */
export function makeOptional(iface: string, field: string): (source: string) => string {
  return (source) => replaceInBlock(source, iface, new RegExp(`^([ \\t]*readonly ${field}): `, "m"), "$1?: ");
}

/** Replace a type on the one line that declares `<field>` in `interface <iface>`. */
export function retype(iface: string, field: string, from: string, to: string): (source: string) => string {
  return (source) =>
    replaceInBlock(source, iface, new RegExp(`^([ \\t]*readonly ${field}\\??: )${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`, "m"), `$1${to};`);
}

/** Loosen `type Operands = readonly [FieldId, FieldId, ...FieldId[]]` to an array that may be empty. */
export function loosenOperands(source: string): string {
  const pattern = /^export type Operands = readonly \[FieldId, FieldId, \.\.\.FieldId\[\]\];$/m;
  if (!pattern.test(source)) throw new Error("sabotage: the `Operands` declaration was not found as expected");
  return source.replace(pattern, "export type Operands = readonly FieldId[];");
}

export const ROUTES = ["binding", "spread", "return", "satisfies", "identity", "assign", "array"] as const;

// ---------------------------------------------------------------------------------------------------------
// Expectations and the printed matrix
// ---------------------------------------------------------------------------------------------------------

/** Every proof group declared in the real proof files (`<group>_<route>` exports), sorted. */
export function allGroups(): string[] {
  const groups = new Set<string>();
  for (const file of proofFiles(CONTRACTS_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^export (?:const|function) (\w+)/gm)) {
      const name = match[1] as string;
      const cut = name.lastIndexOf("_");
      if (cut > 0 && (ROUTES as readonly string[]).includes(name.slice(cut + 1))) groups.add(name.slice(0, cut));
    }
  }
  return [...groups].sort();
}

/** The problems with an outcome relative to what `mutation` promises; empty means the mutation behaved exactly as stated. */
export function outcomeProblems(mutation: Mutation, outcome: SabotageOutcome): string[] {
  const problems: string[] = [...outcome.unattributed];
  const own = [...mutation.groups].sort();
  const routes = (m: ReadonlyMap<string, ReadonlySet<string>>, g: string): string => [...(m.get(g) ?? [])].sort().join(",");
  const strictExpected = [...ROUTES].sort().join(",");
  const asWrittenExpected = strictExpected;

  const strictGroups = [...outcome.strict.keys()].sort();
  if (strictGroups.join("|") !== own.join("|")) {
    problems.push(`strict: groups that went red were [${strictGroups.join(", ")}], expected exactly [${own.join(", ")}]`);
  }
  for (const g of own) {
    if (routes(outcome.strict, g) !== strictExpected) problems.push(`strict: ${g} went red on [${routes(outcome.strict, g)}], expected all of [${strictExpected}]`);
  }
  const writtenGroups = [...outcome.asWritten.keys()].sort();
  if (writtenGroups.join("|") !== own.join("|")) {
    problems.push(`as written: groups with TS2578 were [${writtenGroups.join(", ")}], expected exactly [${own.join(", ")}]`);
  }
  for (const g of own) {
    if (routes(outcome.asWritten, g) !== asWrittenExpected) problems.push(`as written: ${g} had TS2578 on [${routes(outcome.asWritten, g)}], expected [${asWrittenExpected}]`);
  }
  return problems;
}

/**
 * A matrix for the report: one row per mutation, one numbered column per proof group in `columns`; a cell is the
 * number of routes of that group that went red under the strict harness (`.` for none). A mutation that does
 * exactly what it should shows one non-`.` cell per own group, equal to 8, and nothing else in its row.
 */
export function formatMatrix(title: string, rows: readonly { id: string; outcome: SabotageOutcome }[], columns: readonly string[]): string {
  const width = Math.max(...rows.map((r) => r.id.length));
  const lines = [title, ...columns.map((c, i) => `  ${String(i + 1).padStart(2)} = ${c}`)];
  lines.push(`${"".padEnd(width)}  ${columns.map((_, i) => String(i + 1).padStart(2)).join(" ")}`);
  for (const row of rows) {
    const cells = columns.map((c) => String(row.outcome.strict.get(c)?.size ?? ".").padStart(2));
    lines.push(`${row.id.padEnd(width)}  ${cells.join(" ")}`);
  }
  return lines.join("\n");
}
