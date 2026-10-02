# Handoff: adrian-portfolio (adrianluk.com)

Carried over from the planning session. Source of truth for scope and content rules until a spec replaces it.

## References

- Verified experience copy (bullet + paragraph per role): https://claude.ai/artifact/4PgJFWw584vy31XLxcDDv5 (read with the Artifact tool). Also `lib/blurbs.ts` in `blurbs.zip` from the previous session.
- Resume: `Adrian-Luk-Resume-2026.pdf` (not yet in this repo; add to `public/` for the resume link).

## Decisions already made

- **Two separate sites, two repos, two Vercel projects.** No Turborepo or shared package.
  - `adrianluk.com`: this repo. Public portfolio. Static, no auth, no database.
  - `tools.adrianluk.com`: private tools (blurbs app). Do not merge private tools into the portfolio.
  - For visual consistency, copy the Tailwind theme. Extract a shared package only if duplication starts to hurt.
- **Stack:** Next.js (App Router), TypeScript, Tailwind v4, Vercel (same account as Juice Bros, Hobby plan). Astro was considered and rejected.
- **v1 scope** (kept small so it doesn't block the job search):
  - Hero
  - Three Highlights on the home page: Control D accessibility overhaul, Juice Bros, btcup (PepsiCo Canada contest platform at Elite Digital)
  - One full Case study: Juice Bros
  - Resume page (with PDF download)
  - Contact
  - Polish after it ships.
- **Why the site matters:** targeting senior frontend-leaning roles (Toronto and remote Canada), often at startups where founders click through links. The strongest craft work (Studio GSAP scroll engine, canvas route transitions, Control D) isn't shown on the site, so the portfolio must *demonstrate* motion, accessibility and polish, not just describe them.

## Technical notes

- Scaffolded 2026-09-25 with Next 16.3.6, React 19.2.8, Tailwind v4 (CSS-first `@theme inline`, no `tailwind.config.js`).
- Read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- `middleware.ts` is renamed `proxy.ts` in Next 16. The portfolio shouldn't need it.
- GSAP/motion sections are client components; everything else stays a server component. Respect `prefers-reduced-motion`.
- Accessibility bar: axe-clean, keyboard navigable, visible focus.

## Content accuracy (important)

Take case-study claims from the resume or blurbs wording. Don't embellish.

- **Control D:** the a11y overhaul covered ~248 components and has a cypress-axe WCAG 2.1 AA suite over 96 routes. The statistics panel redesign was **not** his. The Gatsby→Next migration was a colleague's work.
- **Control D outcome (confirmed 2026-09-30):** the product got its SOC certification. The a11y overhaul was his part of the work that fed into it. Word it as his contribution to a certification the company achieved, not as "he got it certified". The SOC type (2, Type I/II) isn't known, so don't state it.
- **btcup:** "Architected" applies only to the data model, REST API and React front end. Colleagues built the SAML SSO middleware, most of the admin panel, and the scoring engine.
- **btcup outcome:** the number of contests and the time span are unknown, so state neither. The outcome rests on scale (11,750 provisioned, ~2,180 enrolled per contest) and his share of the codebase.
- **Juice Bros outcome:** there are no usage numbers, and the Player tools are mainly used by Adrian himself. Never claim traffic, users or adoption. The outcome is that the site is live and shipped, and he built the tools for his own play and uses them. The link to the live site is the proof.
- **Studio:** he inherited a dormant prototype and did not start the project.

If a detail isn't in the resume, the blurbs, or the project context, ask Adrian instead of inventing it.

## Answered (2026-09-26)

- **Domain:** adrianluk.com was repurchased on 2026-09-26.
- **Visual direction:** still open. Work it out in an `impeccable` design session. It doesn't need to match Juice Bros (court-green / neon-yellow).
- **Case studies (v1, revised 2026-10-01):** only Juice Bros gets a full Case study. Control D and btcup are Highlights only: the verified blurb paragraph and key numbers, linking to their Role on the Resume page. Neither has its own page. Reason: there are no showable visuals, and not enough detail yet for a full write-up without padding. Either can be promoted to a Case study later. Studio was dropped on 2026-09-29.
- **Contact email:** his existing Gmail. No email at the domain for now.
- **Contact channels (2026-09-29):** a `mailto:` link to Gmail, LinkedIn (linkedin.com/in/adrian-luk), and GitHub (github.com/AdrianLuk). No contact form.
- **Case-study depth:** a Case study covers problem, what Adrian did, approach and outcome. (Superseded: the 2026-09-26 "all full write-ups" decision.)
- **Home page Highlight order (2026-09-27):** Control D, Juice Bros, btcup.
- **Experience (2026-09-29):** a Resume page lists every Role with bullets taken from the blurbs' bullet versions, plus a "Download PDF" button. The home page has one line linking to it, and each Highlight and Case study links to its Role or Side project there. Whenever the PDF changes, update the page to match.
- **Repo visibility (2026-09-29):** this repo goes public at launch and gets pinned on his GitHub profile. Before launch, reword the internal notes (this file, `CONTEXT.md`) so they read as neutral guidance: keep the content-accuracy rules, and drop the third-person asides.
- **Motion (2026-10-01):** motion-rich across the site (hero, page transitions, scroll-driven sections, small interactions), within these guardrails, which become spec acceptance criteria:
  - Content is readable immediately and never waits on an animation.
  - No scroll-jacking: native scroll speed, no snapping. Pinning is allowed only inside the Case study.
  - `prefers-reduced-motion` gets a fully static version that's just as good.
  - Performance budget: mobile LCP under 2.5s, no layout shift.
  - Time-boxed so motion doesn't delay launch by more than a few days.

  The `impeccable` session designs the motion within these rules.
- **Juice Bros Case study visuals:** screenshots and short recordings of the live site and Player tools (recordings must respect reduced motion), plus prominent links to juicebrospickleball.com and the public `juice-bros` repo. No embedded live tools.
- **Analytics:** Vercel Web Analytics only. It's cookieless, so there's no consent banner. No GA4, and no Speed Insights for now.
- **Launch target:** 2026-10-15. If it slips, cut in this order: motion polish first, then the lower-ranked signature moments. Content accuracy and accessibility are never cut.
- **Public Resume PDF:** publish a web copy of `Adrian-Luk-Resume-2026.pdf` (source: `C:\Users\Adrian\Documents`) with the phone number removed. The header otherwise has only email, "Toronto, Ontario", LinkedIn and GitHub, which are fine to publish. Never put the original with the phone number in `public/`.
- **Hero positioning:** "Senior frontend engineer" leads, with one supporting line on backend depth. The exact wording comes later, in a copywriting pass.
- **Naming:** use the resume's names. The product leads and the company goes in the byline: "Control D" / Windscribe, "btcup" / Elite Digital Agency for PepsiCo Canada.

## Open questions

- Visual direction (for the `impeccable` session).
- Which motion moments, in what rank (for the `impeccable` session, within the motion guardrails).

## Suggested skills

- `mattpocock-skills:grill-with-docs`: how this site gets built. Use it to pin down visual direction, case-study content and each feature before building, and to record decisions in the repo docs.
- `impeccable`: owns all design and UI work, including direction, layout, typography, motion, accessibility, polish and audits.
- `agent-skills:spec-driven-development`: write a short spec for the v1 scope.
- `marketing-skills:copywriting`: hero and case-study copy.
- `agent-skills:shipping-and-launch` and `agent-skills:webperf`: pre-launch check and performance pass.
