/**
 * Placeholder home page: genesis only, no engine code and no domain logic.
 *
 * Handoff file (plan section 6): genesis creates this placeholder, M8 owns
 * and rewrites it into the interactive demo that drives the real engine in
 * the browser. M2 adds a deployed skeleton with a real health endpoint
 * (app/api/health) backed by M1's frozen contracts, but does not edit this
 * file. Until M8 this page exists only so `npm run build` has something real
 * to render.
 */
export default function Home() {
  return (
    <main>
      <h1>Beyond the Chatbot</h1>
      <p>
        A system beyond chat never says more than its evidence entails. Every
        claim is ruled against fixed evidence as entailed, weakened,
        contradicted, ungrounded or conflicted; a draft that overreaches is cut
        back to what the evidence does entail, and a question the evidence
        cannot touch gets the named gap instead of something plausible.
      </p>
      <p>
        This project is in progress. There is no engine and no live demo yet;
        see the README for current status.
      </p>
    </main>
  );
}
