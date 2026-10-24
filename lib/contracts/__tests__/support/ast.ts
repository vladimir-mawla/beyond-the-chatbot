import { realpathSync } from "node:fs";
import type { SourceFile } from "typescript/unstable/ast";
import { API, type Project } from "typescript/unstable/sync";

/**
 * Parsing for the scans in this directory (`module-graph.ts`, `determinism.ts`) and the public-surface test.
 *
 * TypeScript 7 is the native compiler: there is no `ts.createSourceFile`. The only parser a Node program can
 * reach is `typescript/unstable/sync` (the programmatic API, which opens a project from a tsconfig) plus the AST
 * node guards of `typescript/unstable/ast`. Both ship with `typescript@7.0.2` (checked by the plan's section
 * 12 deviation 5). "Unstable" is the package's word: a minor release may change them, and the tests that use
 * them would then fail loudly rather than pass, because an unparseable file is a violation, never a skip.
 */

/** Open the project of `tsconfig` with a FRESH `API` (a project opened earlier does not see files created after it), run `body`, close it. */
export function withProject<T>(tsconfig: string, body: (project: Project) => T): T {
  // Real paths throughout: on macOS the temp directory is reached through a symlink, and the compiler returns
  // a source file only under the spelling it opened the project with.
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

/** The parsed file, or `undefined` if the project does not contain it or it has a syntax error: callers must treat that as a violation. */
export function parseFile(project: Project, file: string): SourceFile | undefined {
  const sourceFile = project.program.getSourceFile(file);
  if (sourceFile === undefined || project.program.getSyntacticDiagnostics(file).length > 0) return undefined;
  return sourceFile;
}
