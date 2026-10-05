import Link from "next/link";
import { WorldBackdrop } from "@/components/world-backdrop";
import { notFound } from "@/content/site";

export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="relative isolate mx-auto flex min-h-[60svh] max-w-3xl flex-col justify-center gap-4 px-4 py-24 sm:px-6"
    >
      <WorldBackdrop />
      <h2
        id="not-found-heading"
        className="font-display text-5xl font-extrabold uppercase [font-stretch:140%]"
      >
        {notFound.heading}
      </h2>
      <p className="text-lg text-ink/85">{notFound.body}</p>
      <p>
        <Link
          href="/"
          className="font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
        >
          {notFound.homeLink}
        </Link>
      </p>
    </section>
  );
}
