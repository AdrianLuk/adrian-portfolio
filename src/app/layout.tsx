import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Anybody, Hanken_Grotesk } from "next/font/google";
import { ViewTransition } from "react";
import { CROSSFADE_TRANSITION_TYPE } from "@/components/world-places";
import { footer, nav, person, shareCards } from "@/content/site";
import { shareMetadata } from "./share";
import { glowsLit } from "./styles";
import "./globals.css";

// "optional": a face that misses first paint is never swapped in, because the
// swap reflows the wide display type and breaks the zero-CLS budget.
const anybody = Anybody({
  variable: "--font-anybody",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "optional",
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  display: "optional",
  subsets: ["latin"],
});

// Home's, and so the 404's, which has no metadata of its own, but without
// the canonical URL: a missing page isn't the home page. Home sets its own.
export const metadata: Metadata = {
  ...shareMetadata(shareCards.home),
  alternates: null,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${anybody.variable} ${hanken.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-fog bg-night/90 backdrop-blur">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6"
          >
            <h1 className="font-display text-lg font-bold tracking-wide uppercase [font-stretch:125%]">
              <Link href="/">{person.name}</Link>
            </h1>
            <ul className="flex gap-5 font-display text-sm tracking-widest uppercase [font-stretch:75%]">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`text-ink/85 hover:text-cyan focus-visible:text-cyan ${glowsLit}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        {/* The world's root: it carries data-transit while the camera flies
          between two Places (home, the court of the Juice Bros Case study
          and /play, the Resume page's Skyline) or two views of one, and
          data-arriving while the arriving page's
          copy waits to land with it (src/components/world-transits.ts). */}
        <main data-world-root className="flex-1">
          {/* Each navigation updates it: a short crossfade between routes,
            except where the world's camera flies instead (a transit). Any
            other commit (a page's metadata streaming in late) is not
            animated. */}
          <ViewTransition
            default={{ [CROSSFADE_TRANSITION_TYPE]: "auto", default: "none" }}
          >
            {children}
          </ViewTransition>
        </main>
        {/* Positioned, so it paints over the home page's world, which is held
          fixed behind the page as the camera flies. */}
        <footer className="relative border-t border-fog px-4 py-6 text-center text-sm text-ink/70 sm:px-6">
          {person.name} · {person.location} ·{" "}
          <a
            href={footer.source.href}
            className="underline decoration-ink/40 underline-offset-4 hover:text-cyan hover:decoration-cyan"
          >
            {footer.source.label}
          </a>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
