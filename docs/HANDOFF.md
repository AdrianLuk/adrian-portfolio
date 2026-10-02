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
  - Four Highlights on the home page, in this order: Control D (the full senior role), Life House (the hotel booking widget), Juice Bros, BT Cup (PepsiCo Canada contest platform at Elite Digital)
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
- **BT Cup:** "Architected" applies only to the data model, REST API and React front end. Colleagues built the SAML SSO middleware, most of the admin panel, and the scoring engine.
- **BT Cup outcome:** the number of contests and the time span are unknown, so state neither. The outcome rests on scale (11,750 provisioned, roughly 2,000 enrolled per contest, the resume's figure; the blurbs' ~2,180 is retired as of 2026-10-02) and his share of the codebase.
- **Juice Bros outcome:** there are no usage numbers, and the Player tools are mainly used by Adrian himself. Never claim traffic, users or adoption. The outcome is that the site is live and shipped, and he built the tools for his own play and uses them. The link to the live site is the proof. Its Highlight carries no key numbers (decided 2026-10-02): the Player tools keep growing, so never state a count, and not all are no-login.
- **Life House (Full Stack Developer, Oct 2022 to Feb 2024; from the 2026 resume):** primary frontend engineer on the guest-facing booking widget, an embeddable React and TypeScript booking flow hotels dropped onto their own sites with one script tag; scoped every generated CSS rule to the widget container with a custom Emotion stylis plugin (no Shadow DOM, no iframe); retrofitted five languages and multi-currency onto a shipped UI (88 files, 22 i18next namespaces, Contentful over GraphQL); built bulk rate editing for operators; top contributor on the revenue and marketing dashboards over an Apollo Federation gateway; backend work in a NestJS GraphQL subgraph over the Mews and Cloudbeds APIs. Describe the widget role as "primary frontend engineer" (the resume) or "top contributor"; drop the blurbs' "top committer" (decided 2026-10-02). Don't claim he built it alone.
- **Studio:** he inherited a dormant prototype and did not start the project.

If a detail isn't in the resume, the blurbs, or the project context, ask Adrian instead of inventing it.

## Answered (2026-09-26)

- **Domain:** adrianluk.com was repurchased on 2026-09-26.
- **Visual direction (decided 2026-10-02 in the `impeccable` session):** a luminous night world of Adrian's own, techy and cyberpunk-esque (light-structures and holographic panels on a night terrain; no flora required), with a cinematic fly-in that settles on his name. Avatar is the reference for the camera flying into a world, never the source: no Na'vi, no named Pandora places or creatures. Built procedurally in WebGL (Three.js), no photographs or supplied imagery. Full direction contract and motion plan live in the surface brief (`impeccable surface-brief read src/app/page.tsx`). Palette: indigo sky #0B1026 to #121B3A, fog #1E2B5C, cyan #3DF2E6, violet #9B6CFF, spore pink #FF6FD8, ember #FFB347 for the primary action only, text #EAF2FF. Type: Anybody (display, variable width) and Hanken Grotesk (body). It doesn't match Juice Bros, by design.
- **Case studies (v1, revised 2026-10-01):** only Juice Bros gets a full Case study. Control D, Life House and BT Cup are Highlights only: the verified blurb paragraph and key numbers, linking to their Role on the Resume page. Neither has its own page. Reason: there are no showable visuals, and not enough detail yet for a full write-up without padding. Either can be promoted to a Case study later. Studio was dropped on 2026-09-29.
- **Contact email:** his existing Gmail. No email at the domain for now.
- **Contact channels (2026-09-29):** a `mailto:` link to Gmail, LinkedIn (linkedin.com/in/adrian-luk), and GitHub (github.com/AdrianLuk). No contact form.
- **Case-study depth:** a Case study covers problem, what Adrian did, approach and outcome. (Superseded: the 2026-09-26 "all full write-ups" decision.)
- **Home page Highlight order (revised 2026-10-02):** Control D, Life House, Juice Bros, BT Cup. The Control D Highlight is the whole role (SSO across four identity providers, the scheduled Reports feature end to end, the a11y overhaul with its 96-route suite), not an accessibility story: Adrian doesn't want to lead with a11y. Life House was added on 2026-10-02 for the booking widget work.
- **Experience (2026-09-29):** a Resume page lists every Role with bullets taken from the blurbs' bullet versions, plus a "Download PDF" button. The home page has one line linking to it, and each Highlight and Case study links to its Role or Side project there. Whenever the PDF changes, update the page to match.
- **Repo visibility (2026-09-29):** this repo goes public at launch and gets pinned on his GitHub profile. Before launch, reword the internal notes (this file, `CONTEXT.md`) so they read as neutral guidance: keep the content-accuracy rules, and drop the third-person asides.
- **Motion (2026-10-01):** motion-rich across the site (hero, page transitions, scroll-driven sections, small interactions), within these guardrails, which become spec acceptance criteria:
  - Content is readable immediately and never waits on an animation.
  - No scroll-jacking: native scroll speed, no snapping. Pinning is allowed only inside the Case study.
  - `prefers-reduced-motion` gets a fully static version that's just as good.
  - Performance budget: mobile LCP under 2.5s, no layout shift.
  - Time-boxed so motion doesn't delay launch by more than a few days.

  - Opening: a first-person flight down a valley of lit ridges and structures, the camera banking left and right with the terrain (fighter-jet style), the name plate glowing dead centre ahead, then arrival; 5 to 6s, skippable, and the full name is in the nav bar from the first frame (the H1 is the LCP element). The name plate is a monumental extruded 3D letterform that the camera arrives at, turns in and settles frontal (the 20th Century Fox arrival as the device; none of its fanfare, plinth or composition), with the DOM H1 matching its final pose. No post-processing bloom; glow comes from emissive materials and light sprites. During it, four self-aware opening credits appear as cards in the world (Deadpool-style fourth-wall titles; the device only, never the film's lines or marks). Credits are the only humour on the home page until one bookend on the contact line; no credits along the scroll, and the Highlights are played straight.

  Ranked motion plan (from the `impeccable` session): 1. fly-in hero with opening credits; 2. scroll-driven camera path (ScrollTrigger scrub, native scroll); 3. route transitions as camera flights (v1 ships a crossfade); 4. pointer and focus micro-motion (flora lean, spore drift, focus pulse); 5. pinned scroll scenes inside the Case study. v1 ships 1 and 2 plus the reduced-motion version; 3 to 5 are phase 2.
- **Launch phasing (2026-10-02):** v1 on 2026-10-15 ships the world at reduced scope: the fly-in hero and the scroll camera on the home page, Highlights as lit sites, the Case study and Resume page on the same world as a quieter static night backdrop, route crossfades. The full world (camera-flight transitions, pinned Case study scenes, flora micro-motion) grows after launch.
- **Juice Bros Case study visuals:** screenshots and short recordings of the live site and Player tools (recordings must respect reduced motion), plus prominent links to juicebrospickleball.com and the public `juice-bros` repo. No embedded live tools.
- **Analytics:** Vercel Web Analytics only. It's cookieless, so there's no consent banner. No GA4, and no Speed Insights for now.
- **Launch target:** 2026-10-15. If it slips, cut in this order: motion polish first, then the lower-ranked signature moments. Content accuracy and accessibility are never cut.
- **Public Resume PDF:** publish a web copy of `Adrian-Luk-Resume-2026.pdf` (source: `C:\Users\Adrian\Documents`) with the phone number removed. The header otherwise has only email, "Toronto, Ontario", LinkedIn and GitHub, which are fine to publish. Never put the original with the phone number in `public/`.
- **Hero positioning:** "Senior frontend engineer" leads, with one supporting line on backend depth. The exact wording comes later, in a copywriting pass. Rejected wording: "real backend ownership". Current placeholder: "React and TypeScript, plus the back end when it needs building." The closing bookend is "The end. (Hire him.)", not "Fin."
- **Naming:** use the resume's names. The product leads and the company goes in the byline: "Control D" / Windscribe, "BT Cup" / Elite Digital Agency for PepsiCo Canada. Spell it "BT Cup" on the site (the resume and the old repo spell it "btcup"; update the Resume PDF copy to match).

## Open questions

- Visual direction (for the `impeccable` session).
- Which motion moments, in what rank (for the `impeccable` session, within the motion guardrails).

## Suggested skills

- `mattpocock-skills:grill-with-docs`: how this site gets built. Use it to pin down visual direction, case-study content and each feature before building, and to record decisions in the repo docs.
- `impeccable`: owns all design and UI work, including direction, layout, typography, motion, accessibility, polish and audits.
- `agent-skills:spec-driven-development`: write a short spec for the v1 scope.
- `marketing-skills:copywriting`: hero and case-study copy.
- `agent-skills:shipping-and-launch` and `agent-skills:webperf`: pre-launch check and performance pass.
