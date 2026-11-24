import { realpathSync } from "node:fs";
import type { SourceFile } from "typescript/unstable/ast";
import { API, type Project } from "typescript/unstable/sync";

/**
 * Parsing for the scans in this directory. TypeScript 7 is the native compiler: there is no `ts.createSourceFile`; the only
 * parser a Node program can reach is `typescript/unstable/sync` (open a project from a tsconfig) plus the node guards of
 * `typescript/unstable/ast`. "Unstable" is the package's word: a minor release may change them, and the tests that use them
 * would then fail loudly, because a file that cannot be parsed is a violation, never a skip. (`lib/contracts/__tests__/support/ast.ts`
 * does the same for M1's scans; this copy keeps M8's tests from importing a frozen layer's test helper.)
 */

/** Open the project of `tsconfig` with a FRESH `API`, run `body`, close it. */
export function withProject<T>(tsconfig: string, body: (project: Project) => T): T {
  const real = realpathSync(tsconfig);
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openProjects: [real] });
    const project = snapshot.getProject(real);
    if (project === undefined) throw new Error(`the compiler could not open ${real}`);
    return body(project);
  } finally {
    api.close();
  }
}

/** The parsed file, or `undefined` if the project does not contain it or it has a syntax error: callers treat that as a violation. */
export function parseFile(project: Project, file: string): SourceFile | undefined {
  const sourceFile = project.program.getSourceFile(file);
  if (sourceFile === undefined || project.program.getSyntacticDiagnostics(file).length > 0) return undefined;
  return sourceFile;
}
