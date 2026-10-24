/**
 * Compile-time equality, for proof files that pin the exact shape of a type (a union of kinds, a tuple).
 *
 * `Equal<A, B>` is true only when A and B are the SAME type; mutual assignability is not enough (it would
 * accept `{ a?: never }` for `{}`). `Assert<T extends true>` fails to compile when handed `false`, so a
 * line `type _ = Assert<Equal<X, Y>>` is a proof that needs no `@ts-expect-error`. Such a line is checked
 * by `npm run typecheck` and by the proof harness, which requires every directive-free line in a proof file
 * to compile under both tsconfigs.
 *
 * The negative direction (a proof that two types are NOT equal) is written `Assert<Equal<Equal<X, Y>, false>>`.
 */
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Assert<T extends true> = T;
