import {
  contact,
  hero,
  highlights,
  hrefFor,
  linkLabelFor,
  person,
  work,
} from "@/content/site";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <section
        aria-label={hero.label}
        className="mx-auto flex min-h-[70svh] max-w-6xl flex-col justify-end gap-6 px-4 pt-24 pb-16 sm:px-6"
      >
        {/* The accessible name is the H1 in the nav; this is its display echo. */}
        <p
          aria-hidden="true"
          className="font-display text-6xl leading-none font-extrabold uppercase [font-stretch:150%] sm:text-8xl"
        >
          {person.name}
        </p>
        <div className="max-w-2xl space-y-2">
          <p className="font-display text-2xl font-semibold text-cyan [font-stretch:110%]">
            {hero.titleLine}
          </p>
          <p className="text-lg text-ink/85">{hero.backendLine}</p>
        </div>
        <p>
          <a
            href={hero.primaryAction.href}
            className="inline-block rounded-full bg-ember px-6 py-3 font-display font-bold tracking-wide text-night uppercase [font-stretch:110%]"
          >
            {hero.primaryAction.label}
          </a>
        </p>
      </section>

      <section
        id="work"
        aria-labelledby="work-heading"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <h2
          id="work-heading"
          className="font-display text-sm tracking-[0.3em] text-violet uppercase [font-stretch:75%]"
        >
          {work.heading}
        </h2>
        <div className="mt-8 space-y-16">
          {highlights.map((highlight) => (
            <section
              key={highlight.id}
              id={`highlight-${highlight.id}`}
              aria-labelledby={`highlight-${highlight.id}-heading`}
              className="max-w-3xl rounded-2xl bg-dusk/70 p-6 sm:p-8"
            >
              <h3
                id={`highlight-${highlight.id}-heading`}
                className="font-display text-3xl font-bold [font-stretch:120%]"
              >
                {highlight.title}
              </h3>
              <p className="mt-1 font-display text-sm tracking-widest text-cyan uppercase [font-stretch:75%]">
                {highlight.byline}
              </p>
              <p className="mt-4 leading-relaxed text-ink/90">
                {highlight.paragraph}
              </p>
              <ul className="mt-6 flex flex-wrap gap-8">
                {highlight.keyNumbers.map((n) => (
                  <li key={n.label} className="flex flex-col">
                    <span className="font-display text-4xl font-extrabold text-cyan [font-stretch:130%]">
                      {n.value}
                    </span>
                    <span className="text-sm text-ink/80">{n.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6">
                <Link
                  href={hrefFor(highlight.link)}
                  className="font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
                >
                  {linkLabelFor(highlight)}
                </Link>
              </p>
            </section>
          ))}
        </div>
      </section>

      <section
        id="contact"
        aria-labelledby="contact-heading"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
      >
        <h2
          id="contact-heading"
          className="font-display text-sm tracking-[0.3em] text-violet uppercase [font-stretch:75%]"
        >
          {contact.heading}
        </h2>
        <ul className="mt-6 space-y-3 text-lg">
          {contact.channels.map((channel) => (
            <li key={channel.id}>
              <span className="mr-3 font-display text-sm tracking-widest text-ink/70 uppercase [font-stretch:75%]">
                {channel.label}
              </span>
              <a
                href={channel.href}
                className="text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
              >
                {channel.text}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-16 font-display text-2xl font-bold [font-stretch:120%]">
          {contact.bookend}
        </p>
      </section>
    </>
  );
}
