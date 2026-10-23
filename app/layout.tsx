import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beyond the Chatbot",
  description:
    "A system beyond chat never emits a sentence it cannot back: every claim is ruled entailed, weakened, contradicted, ungrounded or conflicted against fixed evidence.",
};

/**
 * Minimal App Router shell: infrastructure only. No project-specific UI
 * exists yet (that is M8's job). This file's only reason to exist at genesis
 * is so app/ has at least one real entry point for `npm run typecheck`
 * (tsconfig.json) and `npm run build` to check, ahead of M1's contracts and
 * M2's deployed health endpoint.
 *
 * Owned by genesis and not rewritten by any milestone: the plan's handoff
 * rule is that M8 replaces app/page.tsx and app/globals.css but "may not
 * touch app/layout.tsx". The metadata above is therefore final and
 * deliberately generic; it makes no claim about what is built.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
