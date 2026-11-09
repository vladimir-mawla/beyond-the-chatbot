/**
 * `deepFreeze`: the one helper the domain's constants need. The plan's file list for `domains/order-desk` has no home
 * for something shared, so this is the one file beyond that list (ADR 0006, "Files"). It freezes a value and
 * everything reachable from it through own enumerable properties, arrays included, and returns the same value. It is
 * only ever handed data this package has just built out of fresh literals, which cannot contain a cycle.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}
