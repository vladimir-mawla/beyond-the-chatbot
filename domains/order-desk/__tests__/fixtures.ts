/** Shared helpers for the order-desk tests. */

/** True if `value` and every object reachable from it through own enumerable properties is frozen. */
export function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.keys(value).every((key) => isDeepFrozen((value as Record<string, unknown>)[key]));
}
