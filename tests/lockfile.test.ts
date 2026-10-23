import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The mechanical form of "`npm ci` exits 0 while the lockfile has silently
 * shrunk".
 *
 * THE FAILURE THIS CATCHES. npm 11.5.1 (the npm on this project's machines)
 * silently deletes platform-binary entries from package-lock.json whenever
 * it rewrites the file: the sibling that measured it counted 27 (all 15
 * @rolldown/binding-*, fsevents, and all 11 lightningcss-*), with or
 * without node_modules and with or without --package-lock-only. `npm ci` on
 * the damaged file still exits 0. The damage first shows up as "Cannot find
 * native binding" when vitest starts, which points at nothing. CI has one
 * labelled step for the rolldown symptom (`require('rolldown')` after
 * `npm ci`), but only on a fresh runner, after the damage is already
 * committed. This test fails in `npm test`, locally, before that.
 *
 * WHAT IT PINS.
 *   (a) The number of lockfile entries carrying `os` or `cpu` is at least
 *       RECORDED_PLATFORM_ENTRY_COUNT. The number was counted from the
 *       lockfile copied at genesis, not taken from a document: 80. It is a
 *       floor, not an equality, so a legitimate dependency bump that adds a
 *       platform package passes. Lowering it must be a deliberate edit that
 *       a reviewer sees.
 *   (b) Each of the 15 @rolldown/binding-* entries is present by name.
 *   (c) fsevents and each of the 11 lightningcss-* entries are present by
 *       name (the other 12 of the 27 entries npm 11.5.1 deletes).
 * Names are hard-coded on purpose. A list computed from the lockfile would
 * shrink together with it and prove nothing.
 *
 * WHAT IT DOES NOT PROVE. It does not detect damage to any other part of
 * the lockfile (a changed version, a dropped `integrity`, a removed
 * non-platform package), and it cannot tell a deliberate removal from an
 * accidental one. A dependency change must go through
 * `npx --yes npm@10.9.9 install ...`, and the diff of this count is part of
 * reviewing it. If upstream renames a platform package on a bump, (b) or
 * (c) goes red and a human updates the list; that is the point of a pin.
 */
const RECORDED_PLATFORM_ENTRY_COUNT = 80;

const ROLLDOWN_BINDINGS = [
  "android-arm-eabi",
  "android-arm64",
  "darwin-arm64",
  "darwin-x64",
  "freebsd-x64",
  "linux-arm-gnueabihf",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-ppc64-gnu",
  "linux-s390x-gnu",
  "linux-x64-gnu",
  "linux-x64-musl",
  "openharmony-arm64",
  "win32-arm64-msvc",
  "win32-x64-msvc",
].map((platform) => `node_modules/@rolldown/binding-${platform}`);

const LIGHTNINGCSS_AND_FSEVENTS = [
  "fsevents",
  "lightningcss-android-arm64",
  "lightningcss-darwin-arm64",
  "lightningcss-darwin-x64",
  "lightningcss-freebsd-x64",
  "lightningcss-linux-arm-gnueabihf",
  "lightningcss-linux-arm64-gnu",
  "lightningcss-linux-arm64-musl",
  "lightningcss-linux-x64-gnu",
  "lightningcss-linux-x64-musl",
  "lightningcss-win32-arm64-msvc",
  "lightningcss-win32-x64-msvc",
].map((name) => `node_modules/${name}`);

interface LockEntry {
  os?: unknown;
  cpu?: unknown;
}

const lock = JSON.parse(
  readFileSync(path.join(root, "package-lock.json"), "utf-8"),
) as { packages: Record<string, LockEntry> };

describe("package-lock.json has not silently lost its platform-binary entries", () => {
  it(`keeps at least ${RECORDED_PLATFORM_ENTRY_COUNT} entries that carry os or cpu`, () => {
    const gated = Object.entries(lock.packages).filter(
      ([key, entry]) =>
        key !== "" && (entry.os !== undefined || entry.cpu !== undefined),
    );
    expect(gated.length).toBeGreaterThanOrEqual(RECORDED_PLATFORM_ENTRY_COUNT);
  });

  it("keeps all 15 @rolldown/binding-* entries, by name", () => {
    const missing = ROLLDOWN_BINDINGS.filter((key) => !(key in lock.packages));
    expect(missing).toEqual([]);
  });

  it("keeps fsevents and all 11 lightningcss-* entries, by name", () => {
    const missing = LIGHTNINGCSS_AND_FSEVENTS.filter(
      (key) => !(key in lock.packages),
    );
    expect(missing).toEqual([]);
  });
});
