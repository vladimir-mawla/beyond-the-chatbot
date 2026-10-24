import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";

/**
 * Synthetic repository trees for the scan tests, built under the OS temp directory (this milestone's tests never
 * write inside `lib/`, so the default parallel test files cannot collide). Every tree gets a tsconfig whose
 * program includes `lib/**` and `domains/**`, which is what the scans open.
 *
 * `useTrees()` registers the clean-up; call it once at the top of a test file.
 */
const created: string[] = [];

export function useTrees(): void {
  afterAll(() => {
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
    created.length = 0;
  });
}

export const TREE_TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true },
  include: ["lib/**/*.ts", "domains/**/*.ts"],
});

/** `files` are written relative to a fresh root; `symlinks` map a path inside the tree to another path inside the tree. Returns the root. */
export function tree(files: Readonly<Record<string, string>>, symlinks: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "btc-tree-"));
  created.push(root);
  const put = (relPath: string, content: string): void => {
    const path = join(root, relPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  put("tsconfig.json", TREE_TSCONFIG);
  for (const [path, content] of Object.entries(files)) put(path, content);
  for (const [path, target] of Object.entries(symlinks)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(join(root, target), join(root, path), "dir");
  }
  return root;
}
