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
  - 2–3 case studies: Juice Bros, the Control D accessibility overhaul, btcup (PepsiCo Canada contest platform at Elite Digital)
  - Resume link
  - Contact
  - Polish after it ships.
- **Why the site matters:** targeting senior frontend-leaning roles (Toronto and remote Canada), often at startups where founders click through links. The strongest craft work (Studio GSAP scroll engine, canvas route transitions, Control D) isn't publicly showable, so the portfolio must *demonstrate* motion, accessibility and polish, not just describe them.

## Technical notes

- Scaffolded 2026-09-25 with Next 16.3.6, React 19.2.8, Tailwind v4 (CSS-first `@theme inline`, no `tailwind.config.js`).
- Read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- `middleware.ts` is renamed `proxy.ts` in Next 16. The portfolio shouldn't need it.
- GSAP/motion sections are client components; everything else stays a server component. Respect `prefers-reduced-motion`.
- Accessibility bar: axe-clean, keyboard navigable, visible focus.

## Content accuracy (important)

Take case-study claims from the resume or blurbs wording. Don't embellish.

- **Control D:** the a11y overhaul covered ~248 components and has a cypress-axe WCAG 2.1 AA suite over 96 routes. The statistics panel redesign was **not** his. The Gatsby→Next migration was a colleague's work.
- **btcup:** "Architected" applies only to the data model, REST API and React front end. Colleagues built the SAML SSO middleware, most of the admin panel, and the scoring engine.
- **Studio:** he inherited a dormant prototype and did not start the project.

If a detail isn't in the resume, the blurbs, or the project context, ask Adrian instead of inventing it.

## Open questions

1. Is adrianluk.com available to repurchase? It lapsed. Fallback: `.dev` or `.ca`.
2. Visual direction: undecided. Doesn't need to match Juice Bros (court-green / neon-yellow).
3. Final case-study list and depth of each.
4. Email address at the domain?

## Suggested skills

- `mattpocock-skills:grill-with-docs`: how this site gets built. Use it to pin down visual direction, case-study content and each feature before building, and to record decisions in the repo docs.
- `impeccable`: owns all design and UI work, including direction, layout, typography, motion, accessibility, polish and audits.
- `agent-skills:spec-driven-development`: write a short spec for the v1 scope.
- `marketing-skills:copywriting`: hero and case-study copy.
- `agent-skills:shipping-and-launch` and `agent-skills:webperf`: pre-launch check and performance pass.
