import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Anybody, Hanken_Grotesk } from "next/font/google";
import { meta, nav, person } from "@/content/site";
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

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
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
                    className="text-ink/85 transition-colors hover:text-cyan"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-fog px-4 py-6 text-center text-sm text-ink/70 sm:px-6">
          {person.name} · {person.location}
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
