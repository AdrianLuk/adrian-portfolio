---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/layout.tsx"]
---

# Home page (src/app/page.tsx)

Scope: the home page of adrianluk.com, and the world every other route lives inside (Case study, Resume page, 404). Visitor mode: Experience.

Audience and job: hiring managers, founders and senior engineers deciding in under a minute whether Adrian is worth an interview; many on phones. Proof: the build itself (motion, accessibility, performance) plus the verified Highlights. Action: open the Juice Bros Case study, the Resume page, or contact.

Constraints (binding, from docs/HANDOFF.md and PRODUCT.md): content readable immediately; no scroll-jacking (native scroll speed, no snapping; pinning only inside the Case study); a fully static reduced-motion version that is just as good; mobile LCP under 2.5s, no layout shift; WCAG 2.1 AA; no claims beyond the verified blurbs; no Avatar/Pandora IP (no Na'vi, no named Pandora places or creatures); the world is Adrian's own, techy and cyberpunk-esque, with no flora required.

## Direction contract

THESIS: adrianluk.com is one luminous night world of light-structures, techy and cyberpunk-esque, and every page is a place in it; the camera, not the layout, is the navigation. It refuses the hero-plus-card-grid portfolio and the flat-black-with-neon-edges template: here the dark is a sky over a terrain, the glow comes from objects with volume and distance, and there is no neon stroke on a flat panel anywhere.

OWN-WORLD: Drenched colour: deep indigo sky and ground (#0B1026 to #121B3A, never pure black), volumetric fog #1E2B5C, cyan #3DF2E6 and violet #9B6CFF as the light of the world (emitted by towers, conduits and holographic panels, never by text outlines), hot magenta #FF6FD8 for data motes only, one warm ember #FFB347 reserved for the primary action, text #EAF2FF. Display face Anybody (a wide static cut is extruded into the 3D name monument; its narrow width sets HUD labels, so no mono face is needed); body Hanken Grotesk. Components are lit objects in the world: Highlights are holographic panels standing at their sites, links and panels brighten on hover and focus, the focus ring is a scanning ring that pulses once, primary buttons are ember-filled. Procedural WebGL terrain, light-structures, fog and motes; no photographs, no flora required.

STORY: the visitor flies first-person down a valley of lit ridges and structures, the name plate glowing ahead, and the camera arrives and settles on ADRIAN LUK with "Senior frontend engineer" beneath it; scrolling carries them along a route past four lit sites (Control D, Life House, Juice Bros, BT Cup), each a holographic panel on the terrain, to Hong Kong, across Victoria Harbour at the valley's end, where the contact copy waits and the page closes on the city whole. They understand he builds motion with judgment and leave with a reason to reply.

FIRST VIEWPORT: full-bleed canvas world; ADRIAN LUK as a monumental extruded 3D name standing in the terrain (one line on desktop, ADRIAN over LUK on phones), lit by two sweeping beams and emissive edges, glowing ahead at the end of the valley from the first frame while the full name sits in the nav bar as the DOM H1 (the real, accessible name and the LCP element); the camera flies down the valley for about 4.5s, banking and yawing with the terrain like a jet following the valley floor, the plate dead centre ahead the whole way; it fills the frame, turns in from about 40 degrees and settles frontal by about 5.5s; the senior-frontend line and the one backend line sit beneath it; a slim top bar set into the sky (name mark left, Work · Resume · Contact right); the flight and arrival take 5 to 6 seconds while four self-aware opening credits appear as cards anchored in the world ("A portfolio by: Adrian Luk", "Starring: Adrian Luk, as himself", "Motion by: Adrian Luk (yes, also me)", "Budget: one Vercel Hobby plan"), each readable for over a second, DOM text positioned in 3D; the Skip control is the last credit ("You can skip this. I'd rather you didn't.") and also serves as the reduced-motion entry; then the primary action, "See the work", in ember, lands at the bottom-left of the name block. The first Highlight glows at the horizon, the scroll cue. One bookend line closes the contact ("The end. (Hire me.)"); Highlights are played straight, and no joke sits inside a claim.

FORM: user-pinned direction (a luminous night world, techy and cyberpunk-esque, with a cinematic fly-in), replacing the roll; it was not on the seven-candidate list. Seed key 3dfd4b94, mode experience, code-led (no image generation in the harness).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Motion plan (ranked; v1 ships 1-2 and the reduced-motion version)

1. Flight hero with the name monument and opening credits: a first-person flight down a valley of lit ridges and structures (the Avatar-style flight into a world as the device), the camera banking left and right with the terrain, fighter-jet style, the plate glowing dead centre ahead, then arrival: the camera turns onto ADRIAN LUK as extruded 3D letters (the 20th Century Fox arrival as the device, nothing of its fanfare, plinth or composition), beams sweeping the letterforms, settling frontal in 5 to 6s while four self-aware credit cards appear in the world (Deadpool-style fourth-wall titles; the device, never the film's lines); skippable; the DOM H1 is present at t=0 in the nav bar as the LCP element and the plate matches it at settle; no post-processing bloom (emissive materials and light sprites instead); credits are DOM text, static captions under reduced motion. No credits along the scroll.
2. Scroll-driven camera path: ScrollTrigger scrub moves the camera along the path; Highlights are lit sites the camera approaches; native scroll speed, no pinning on the home page.
3. Route transitions: the camera flies to the destination place with the canvas persisting across routes. Shipped after launch between home and the Resume page (issue #57): a short flight along the scroll route, the new page's copy arriving as the camera lands. The Case study, `/play` and the 404 keep the crossfade until they have a place in the world (the Juice Bros district, say).
4. Pointer and focus micro-motion: light-structures and panels tilt a few degrees toward the pointer, motes drift, the focus ring pulses once, links brighten.
5. Case study scroll scenes: pinned sequences for the Player tools (the one place pinning is allowed). Phase 2.

Reduced motion: the settled hero frame rendered once (static canvas or pre-rendered frame) with the motes frozen in place as scenery (decided 2026-10-02: nothing drifts), no fly-in, no camera scrub; layout, colour and content identical.

Performance: canvas DPR capped at 1.5, low-poly terrain with shader fog, particle count scaled to device, rendering paused when offscreen or hidden, the H1 text is the LCP element and the canvas fades in behind it.

## Phase 1 (v1, by 2026-10-15)

Home page with the fly-in hero and the scroll camera; Highlights as lit sites; Case study and Resume page on the same world as a quieter static night backdrop with motes; route crossfades; the 404 as "lost in the fog".

## Unresolved

Exact type sizes, the terrain's silhouette, the light-structures' forms, and the Player tools' scene composition are build decisions. Photo placement waits on Adrian's photo (placeholder in v1).
