# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hiring managers, founders and senior engineers at startups and product companies in Toronto and remote Canada, evaluating Adrian Luk for senior frontend-leaning roles. They arrive from an application, LinkedIn or a referral, often on a phone, and typically give the site under a minute. Their job: decide whether he is worth an interview. A second audience is recruiters and interviewers who open the site right before a call to refresh on his background.

## Product Purpose

adrianluk.com is Adrian's public portfolio. It exists to win interviews for senior frontend roles by showing, not just describing, his craft: motion, accessibility and polish. Success is a visitor leaving with a clear picture of what he builds and a reason to reply.

## Positioning

The site is itself the proof. The strongest craft work of his career (a GSAP scroll engine, canvas route transitions, the Control D accessibility overhaul) is not publicly visible, so the portfolio demonstrates those skills in its own build: motion-rich, axe-clean, keyboard navigable. A visitor can tab through it, run a screen reader or axe on it, or read its public source. Few portfolios can make that offer honestly.

## Operating Context

- Visited from job applications, LinkedIn and referrals; the home page and Juice Bros case study are the pages most likely to be read.
- Phones first for the quick look; desktop for the deliberate review and anyone reading the source.
- The repo is public, so the source is part of the product.
- The Resume PDF on the site is a copy of `Adrian-Luk-Resume-2026.pdf` with the phone number removed. The PDF and the Resume page must state the same facts.
- Vocabulary lives in `CONTEXT.md`; decisions, scope and content-accuracy rules live in `docs/HANDOFF.md`.

## Capabilities and Constraints

- Static site: Next.js App Router, TypeScript, Tailwind v4, deployed on Vercel. No auth, no database, no backend, no contact form.
- v1 surfaces: home page (hero, four Highlights in the order Control D, Life House, Juice Bros, BT Cup, a line linking to the Resume page, contact), one Case study (Juice Bros), the Resume page, and a 404. After launch: the Rally game on `/play`.
- Contact: `mailto:` to a Gmail address, LinkedIn (linkedin.com/in/adrian-luk), GitHub (github.com/AdrianLuk).
- Analytics: Vercel Web Analytics only (cookieless, no banner).
- GSAP motion lives in client components; everything else is a server component.
- Motion guardrails (binding): content readable immediately and never waiting on an animation; no scroll-jacking (native scroll speed, no snapping; pinning only inside the Case study); a fully static `prefers-reduced-motion` version that is just as good (except the Rally game, which moves only once the player starts it, in slow mode under reduced motion); no layout shift; motion is time-boxed so a launch doesn't slip more than a few days.
- If scope gets tight, motion polish is cut first; content accuracy and accessibility are never cut.
- Never shows or links to Adrian's private tools.

## Brand Commitments

- Name: Adrian Luk. Domain: adrianluk.com.
- Voice: first person, plain and specific in every factual passage (Highlights, Case study, Resume page). Humour is welcome only in three deliberate places where personality is expected (the opening credits, the closing bookend, and the Rally game's own UI on `/play`, never its page copy), in the register of his GitHub bio ("Slapping the keyboard till something good happens"). A joke never sits inside a claim. Everywhere else the copy is plain; the 404's "Lost in the fog" is themed, not a joke.
- Hero positioning: "Senior frontend engineer" leads, with one supporting line on backend depth ("React and TypeScript, plus the back end when it needs building.").
- Naming: product leads, company in the byline ("Control D" / Windscribe; "BT Cup" / Elite Digital Agency for PepsiCo Canada (spelled "BT Cup" on the site)).
- Visual direction: a luminous night world of Adrian's own, techy and cyberpunk-esque, in the spirit of a world the camera flies into but never any film's IP (no Na'vi, no named Pandora places or creatures) and with no flora required, with a cinematic fly-in that settles on his name. Ambition level: extravagant, worthy of Awwwards. Dark as a night sky is in; dark as a flat background with a neon accent is out. The world is built procedurally in code (WebGL), not from supplied imagery.
- The site need not match Juice Bros' court-green / neon-yellow.

## Evidence on Hand

- Verified experience copy (bullet and paragraph per role), kept outside the repo. Every factual claim on the site comes from it or the resume.
- Resume: `Adrian-Luk-Resume-2026.pdf`. The source, with the phone number, is kept outside the repo; the repo holds only the phone-free web copy in `public/`.
- Juice Bros is live at https://juicebrospickleball.com with public Player tools (currently Booking Buddy, Pickle Point Pal, Match Mixer, Drum Roll; the set grows, so never state a count, and Booking Buddy needs a login), and its repo is public (github.com/AdrianLuk/juice-bros). Screenshots and short recordings can be taken from it.
- controld.com is public, but no screenshots of the authenticated dashboard or of the a11y work exist. BT Cup is not publicly reachable and no screenshots exist. The Life House booking widget and dashboards are behind hotel accounts; no screenshots exist. Studio's site is live but is not shown on the portfolio.
- Confirmed outcomes: Control D got its SOC certification, and the a11y overhaul was his contribution to it (SOC type unknown; never state it). BT Cup: 11,750 employees provisioned, roughly 2,000 enrolled per contest; contest count and time span unknown. Juice Bros: no usage numbers, tools mainly used by Adrian himself; never claim traffic, users or adoption.
- Absences to leave as they are: testimonials, employer quotes, client logos beyond naming, metrics not listed above, a Studio case study.

## Product Principles

1. The build is the proof. Every page must survive a senior engineer's inspection: keyboard, screen reader, axe, source.
2. Never embellish. Claims come from the verified experience copy or the resume, and shared credit stays shared.
3. Motion with judgment. Rich, but never in the way of reading or scrolling. Where motion and load-speed scores pull apart, motion wins. The reduced-motion version is a first-class design.
4. Fast to the point. A phone visitor with 30 seconds should know who he is, what he builds and how to reach him.
5. Ship, then polish. Content accuracy and accessibility are fixed; motion scope flexes.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor, matching the standard enforced at Control D: axe-clean on every route, fully keyboard navigable with visible focus, correct semantics and ARIA, and a complete `prefers-reduced-motion` experience. Accessibility is part of the product's claim, not a compliance checkbox.
