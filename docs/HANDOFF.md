# adrianluk.com: decisions, scope and content rules

The source of truth for the site's scope, decisions and content-accuracy rules. Read it before changing content or structure; where a newer spec or issue is more specific, that wins.

## References

- **Verified experience copy** (the "blurbs": a bullet and a paragraph per role), kept outside the repo. Every factual claim on the site comes from it or the resume.
- **Resume:** `Adrian-Luk-Resume-2026.pdf` and `.docx`. The copies in `public/` are web versions with the phone number (text and `tel:` link) removed; the originals stay out of the repo. Redo the removal in both whenever the resume changes, and keep the Resume page in step (`src/content/resume-files.test.ts` checks that the page, the PDF and the DOCX agree).

## Decisions

- **This repo is the public portfolio only:** static, no auth, no database, no backend, no monorepo. Adrian's private tools live elsewhere and are never shown or linked. If another site should share the look, copy the Tailwind theme; extract a shared package only if the duplication starts to hurt.
- **Stack:** Next.js (App Router), TypeScript, Tailwind v4, on Vercel.
- **Why the site is built this way:** it targets senior frontend-leaning roles (Toronto and remote Canada), often at startups where founders click through links. The strongest craft work (a GSAP scroll engine, canvas route transitions, the Control D accessibility overhaul) can't be shown publicly, so the portfolio *demonstrates* motion, accessibility and polish in its own build rather than describing them.
- **v1 scope**, kept small so it ships:
  - Hero
  - Four Highlights on the home page, in this order: Control D (the full senior role), Life House (the hotel booking widget), Juice Bros, BT Cup (the PepsiCo Canada contest platform at Elite Digital)
  - One full Case study: Juice Bros
  - Resume page (with PDF download)
  - Contact
  - Polish after it ships.
- **Case studies:** only Juice Bros gets a full Case study. Control D, Life House and BT Cup are Highlights only (the verified paragraph and key numbers), each linking to its Role on the Resume page, with no page of their own: there are no showable visuals, and not enough detail for a full write-up without padding. Any of them can be promoted to a Case study later. A Case study covers the problem, what Adrian did, the approach and the outcome. Studio isn't on the site.
- **Highlight order:** Control D, Life House, Juice Bros, BT Cup. The Control D Highlight presents the whole senior role (SSO across four identity providers, the scheduled Reports feature end to end, the a11y overhaul with its 96-route suite), not an accessibility story: the site doesn't lead with a11y.
- **Juice Bros Case study visuals:** screenshots and short recordings of the live site and Player tools (recordings respect reduced motion), plus prominent links to juicebrospickleball.com and the public `juice-bros` repo. No embedded live tools.
- **Experience:** the Resume page lists every Role with bullets taken from the verified bullet versions, plus a "Download PDF" button. The home page has one line linking to it, and each Highlight and Case study links to its Role or Side project there. Whenever the PDF changes, update the page to match.
- **Contact:** a `mailto:` link to the Gmail address, LinkedIn (linkedin.com/in/adrian-luk) and GitHub (github.com/AdrianLuk). No email at the domain and no contact form.
- **Domain:** adrianluk.com.
- **Visual direction:** a luminous night world, techy and cyberpunk-esque (light-structures and holographic panels on a night terrain; no flora required), with a cinematic fly-in that settles on the name. Avatar is the reference for a camera flying into a world, never the source: no Na'vi, no named Pandora places or creatures. Built procedurally in WebGL (Three.js), with no photographs or supplied imagery. The full direction contract and motion plan live in the surface brief (`.impeccable/surfaces/src-app-page-tsx.md`).
  - Palette: indigo sky #0B1026 to #121B3A, fog #1E2B5C, cyan #3DF2E6, violet #9B6CFF, spore pink #FF6FD8, ember #FFB347 for the primary action only, text #EAF2FF. Type: Anybody (display, variable width) and Hanken Grotesk (body). It deliberately doesn't match Juice Bros.
  - The towers along the valley are a city: tall, wide, windowed buildings, each kept under the ridge behind it so the mountains crest above the general skyline (from the hero; past the fog's reach that rule lapses). The two gates stay slim light masts.
  - Each lit site is a landmark for its Highlight's Project, built from light, recognisable by its silhouette, and carrying the site's light where the scroll route frames it: Control D's shielded gate (a ring gate under a dome of hex cells that shimmers, the light its apex), Life House's hotel (a château, after the Royal York's shape but never named: a tower between two wings under steep copper roofs, a neon HOTEL sign and a covered drop-off, the light on its finial), Juice Bros' pickleball court (to scale, lit by low floodlights, the light a ball over the net, which alone rises over the ridge, where the hero looks straight down the valley) and BT Cup's open stadium bowl (the light in the cup of a hologram trophy that turns over the pitch). The trophy's turn and the shield's shimmer are the landmarks' only motion, and both hold still under reduced motion.
  - The outpost, where the route ends behind the contact copy, is a financial district: rows of windowed towers, some in dark glass, climbing to the tallest at the back, the tallest crowned. It stands past the fog's reach from the hero, so it may rise over the ridge, but never over the CN Tower.
  - Toronto's skyline stands on the valley's right side past the first lit site: the CN Tower (the tallest thing in the world and the one structure that rises over the mountains, in frame from the hero on desktop and phone), the Rogers Centre to its left, the financial core to its right (TD Centre, Scotia Plaza, First Canadian Place) and the Royal York's copper roofs in front of it, arranged as the view from the Islands and scaled like a postcard.
  - The home page's world has Toronto's weather: snow, rain or clear. The server fetches Open-Meteo's current weather code and caches the page with it for an hour, so a visitor's browser never calls a weather service. If the fetch fails, the season decides: snow from December to February, clear otherwise. Snow and rain fall only with motion allowed. The ground shows the weather either way, as settled snow or a wet floor. `?weather=snow|rain|clear` previews a condition. The other pages have no weather, the Resume page's live outpost included (it stands clear).
- **Motion:** rich across the site (hero, page transitions, scroll-driven sections, small interactions), within these guardrails, which are acceptance criteria:
  - Content is readable immediately and never waits on an animation.
  - No scroll-jacking: native scroll speed, no snapping. Pinning is allowed only inside the Case study.
  - `prefers-reduced-motion` gets a fully static version that's just as good.
  - No layout shift. The home page's mobile LCP is reported, not gated: the opening's title cards are big type that paints seconds in, by design, so they become the LCP. The Case study and Resume page are gated at 2.5s.
  - Time-boxed, so motion doesn't delay a launch by more than a few days.
- **Opening:** a level sideways pan across the canyon's shoulder, dropping into a first-person flight down a valley of lit ridges and structures, the camera banking left and right with the terrain (fighter-jet style), the name plate glowing dead centre ahead, then arrival; about 9s, skippable, with the full name in the nav bar from the first frame. The name plate is a monumental extruded 3D letterform that the camera arrives at, turns in and settles frontal on, with the DOM H1 matching its final pose. No post-processing bloom; glow comes from emissive materials and light sprites. During it, four self-aware opening credits appear as cards in the world (fourth-wall titles; the device only, never any film's lines or marks). The credits are the only humour on the home page until one bookend on the contact line; no credits along the scroll, and the Highlights are played straight.
- **Ranked motion plan:** 1. fly-in hero with opening credits; 2. scroll-driven camera path (ScrollTrigger scrub, native scroll); 3. route transitions as camera flights (v1 ships a crossfade); 4. pointer and focus micro-motion (flora lean, spore drift, focus pulse); 5. pinned scroll scenes inside the Case study. v1 ships 1 and 2 plus the reduced-motion version; 3 to 5 come after launch.
- **v1 phasing:** the world at reduced scope: the fly-in hero and the scroll camera on the home page, Highlights as lit sites, the Resume page standing at the outpost (the world live, from the scroll route's last stop, its camera still), the Case study on the same world as a quieter static night backdrop, and route crossfades. The full world (camera-flight transitions, pinned Case study scenes, flora micro-motion) grows after launch. If scope gets tight, cut motion polish first, then the lower-ranked signature moments. Content accuracy and accessibility are never cut.
- **Analytics:** Vercel Web Analytics only. It's cookieless, so there's no consent banner. No GA4, and no Speed Insights for now.
- **Public Resume PDF:** a web copy of `Adrian-Luk-Resume-2026.pdf` with the phone number removed. The header otherwise has only the email, "Toronto, Ontario", LinkedIn and GitHub, which are fine to publish. Never put the original, with the phone number, in `public/` (or anywhere in the repo).
- **Hero positioning:** "Senior frontend engineer" leads, with one supporting line on backend depth: "React and TypeScript, plus the back end when it needs building." Don't describe the backend work as "real backend ownership"; it overclaims.
- **Voice:** first person and plain in every factual passage. Humour lives only in the opening credits and the closing bookend, "The end. (Hire me.)" (not "Fin."), and a joke never sits inside a claim.
- **Naming:** use the resume's names. The product leads and the company goes in the byline: "Control D" / Windscribe, "BT Cup" / Elite Digital Agency for PepsiCo Canada. Spell it "BT Cup" on the site (the resume and the old repo spell it "btcup"; the web copy of the Resume PDF is updated to match).
- **Repo visibility:** public, and meant to be pinned on the GitHub profile. Its source is part of the product, so keep the docs written as neutral guidance: no private notes, no secrets, nothing that doesn't belong in front of a hiring manager.

## Technical notes

- Next 16, React 19 and Tailwind v4 (CSS-first `@theme inline`, no `tailwind.config.js`).
- Read `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`).
- `middleware.ts` is renamed `proxy.ts` in Next 16. The portfolio shouldn't need it.
- GSAP and motion sections are client components; everything else stays a server component. Respect `prefers-reduced-motion`.
- Accessibility bar: axe-clean, keyboard navigable, visible focus.
- Lighthouse CI (`lighthouserc.json`, run in the `checks` job) audits home, the Case study and the Resume page at a mobile profile, three runs each. It fails the build on any layout shift or an accessibility score under 100 on any of them, and on a median LCP over 2.5s on the Case study or Resume page; home's LCP only warns. Three.js and GSAP load after the first paint: the hero imports only `src/components/world/rigs.ts` (plain data) up front, the Resume page's outpost loads Three.js only once its first contentful paint is in, and `e2e/performance.spec.ts` fails on either page if a library is asked for before it.
- The link previews (`public/share/`) and the night backdrop behind every route but home (`public/world/`; on the Resume page it is the first paint and the fallback under the outpost's live world) are stills of the world, photographed by `scripts/share-stills.mjs` against the production build. Re-run it whenever the world or a share card changes.
- Past a 1920px screen the root font size grows at half the viewport's rate (24px at 3840 wide), so the hero's name and copy hold the frame on large monitors and TVs.
- The launch checklist and its results are in `docs/launch-checklist.md`.

## Content accuracy (important)

Take every claim from the resume or the verified experience copy. Don't embellish.

- **Control D:** the a11y overhaul covered ~248 components and has a cypress-axe WCAG 2.1 AA suite over 96 routes. The statistics panel redesign and the Gatsby-to-Next migration were colleagues' work: never credit them to Adrian.
- **Control D outcome:** the product got its SOC certification, and the a11y overhaul was Adrian's part of the work that fed into it. Word it as his contribution to a certification the company achieved, not as "he got it certified". The SOC type (2, Type I/II) isn't known, so don't state it.
- **BT Cup:** "Architected" applies only to the data model, REST API and React front end. Colleagues built the SAML SSO middleware, most of the admin panel and the scoring engine.
- **BT Cup outcome:** the number of contests and the time span are unknown, so state neither. The outcome rests on scale (11,750 provisioned and roughly 2,000 enrolled per contest, the resume's figure; an earlier ~2,180 figure is retired) and his share of the codebase.
- **Juice Bros outcome:** there are no usage numbers, and the Player tools are mainly used by Adrian himself. Never claim traffic, users or adoption. The outcome is that the site is live and shipped, and that he built the tools for his own play and uses them; the link to the live site is the proof. Its Highlight carries no key numbers: the Player tools keep growing, so never state a count, and not all are no-login.
- **Life House (Full Stack Developer, Oct 2022 to Feb 2024; from the 2026 resume):** primary frontend engineer on the guest-facing booking widget, an embeddable React and TypeScript booking flow hotels dropped onto their own sites with one script tag; scoped every generated CSS rule to the widget container with a custom Emotion stylis plugin (no Shadow DOM, no iframe); retrofitted five languages and multi-currency onto a shipped UI (88 files, 22 i18next namespaces, Contentful over GraphQL); built bulk rate editing for operators; top contributor on the revenue and marketing dashboards over an Apollo Federation gateway; backend work in a NestJS GraphQL subgraph over the Mews and Cloudbeds APIs. Describe the widget role as "primary frontend engineer" (the resume) or "top contributor", not "top committer". Never claim he built it alone.
- **Studio:** if it's ever mentioned, Adrian inherited a dormant prototype; he didn't start the project.

If a detail isn't in the resume, the verified experience copy or the project context, ask rather than invent it.
