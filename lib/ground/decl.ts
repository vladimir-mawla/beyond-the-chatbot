import type { FieldDecl, FieldId, Schema } from "../contracts/index.js";

/**
 * The declaration of `field` in `schema`, or `undefined` when no field has that id. A lookup, not a reader: it
 * returns the declaration object that is in `schema` (frozen if the schema came out of `readSchema`), not a
 * copy, and it never validates its arguments. If a hand-built schema declares one id twice, the first wins.
 */
export function declOf(schema: Schema, field: FieldId): FieldDecl | undefined {
  for (const decl of schema.fields) if (decl.id === field) return decl;
  return undefined;
}

/**
 * Follow `parent` links (an operand to the derived field it is an operand of) from `start` up to the field that
 * is an operand of nothing, and return it, or `undefined` if the walk never gets there.
 *
 * THE WALK IS BOUNDED BY THE FIELD COUNT, and that is the whole point of the function. `limit` is the number of
 * fields. Without a cycle the longest chain of parents has `limit - 1` links, so the root is found within
 * `limit` iterations; if `limit` iterations pass and every one found another parent, some field has been
 * visited twice, which is a cycle (a field that is its own operand, or two fields that are each other's). A
 * loop of the form "while there is a parent, go to it" would never return on such a schema; this one returns
 * `undefined`. `readSchema` uses that to refuse a cyclic schema as `rule-cycle` instead of hanging on it.
 */
export function rootOf(parent: ReadonlyMap<string, string>, start: string, limit: number): string | undefined {
  let current = start;
  for (let step = 0; step < limit; step++) {
    const next = parent.get(current);
    if (next === undefined) return current;
    current = next;
  }
  return undefined;
}
