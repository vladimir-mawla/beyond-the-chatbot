# Beyond the Chatbot

A system beyond chat never says more than its evidence entails.

The idea, in one paragraph: every output is a **claim** about a typed quantity, and a deterministic gate
rules it against fixed evidence as **entailed**, **weakened**, **contradicted**, **ungrounded** or
**conflicted**. A draft that says more than the evidence entails is cut back to exactly what the
evidence does entail, with the cut named; a question the evidence cannot touch gets the named gap and
not something plausible; evidence that cannot all be true is refused whole, with no source trusted over
another. Prose is only ever a projection of a checked claim. The full claim, the closed vocabulary, the
deliberately narrow claim language and the nine-milestone plan are in
[`.genesis/PLAN.md`](.genesis/PLAN.md); the locked spec and the definition of done are in
[`.genesis/DONE.html`](.genesis/DONE.html).

## Status: in progress, nothing built yet

**Live:** none yet. Nothing is deployed and there is no URL.

This repository is a **genesis scaffold only**: the tooling skeleton, a placeholder home page, two small
tests, a CI workflow and the planning documents. There is **no engine code and no domain logic**; all
nine milestones are `todo`. The idea above is a design, not something that runs yet, and nothing here
has been demonstrated on real data. Each milestone lands as its own PR and is checked by an independent
verifier before it is marked done. Where things stand is in
[`.genesis/checkpoints/CURRENT.md`](.genesis/checkpoints/CURRENT.md).

`npm run demo:order-desk` is wired in `package.json`, but its script does not exist until milestone M6,
so it fails today.

## Stack

- Next.js 16 (App Router) and React 19, TypeScript 7, Vitest, Node 24
- Built with the **webpack** bundler explicitly (`next dev --webpack`, `next build --webpack`) and
  `experimental.extensionAlias` in `next.config.ts`. Turbopack, Next 16's default, cannot resolve the
  NodeNext-style `.js`-suffixed relative imports the engine will use; the comment in `next.config.ts`
  has the full reasoning, and `tests/smoke.test.ts` pins both facts.
- `vercel.json` pins `npm ci` and `npm run build` so a Vercel deploy cannot fall back to Turbopack.
- No model, no network and no credentials are involved in anything here (see `.env.example`).

## Running it

```bash
git clone https://github.com/vladimir-mawla/beyond-the-chatbot.git
cd beyond-the-chatbot
npm ci              # not `npm install`; see the note below
npm run typecheck   # tsc against tsconfig.lib.json, then tsconfig.json
npm test            # vitest
npm run build       # next build --webpack
npm run dev         # local dev server (webpack)
npm run lint        # eslint, JavaScript and config files only; see below
```

**Use `npm ci`, never `npm install`, to restore dependencies.** npm 11.5.1 silently deletes 27
platform-binary entries (all 15 `@rolldown/binding-*`, `fsevents` and all 11 `lightningcss-*`) whenever
it rewrites the lockfile, and `npm ci` on the result still exits 0; `npm test` then fails with a bare
"Cannot find native binding" that does not point at the install. `tests/lockfile.test.ts` fails if the
lockfile has lost them. A dependency change goes through `npx --yes npm@10.9.9 install ...`.

**`npm run lint` does not check TypeScript.** `typescript-eslint` refuses to load on TypeScript 7, so
`eslint.config.mjs` ignores every `.ts` and `.tsx` file. `npm run typecheck` is the real check for
those, and CI runs it.
