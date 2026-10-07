# adrianluk.com

The portfolio of Adrian Luk, a senior frontend engineer. The site is built as one night world: a procedural WebGL valley the camera flies down, arriving at the name, then carried on by the scroll past four lit sites (the Highlights) to an outpost where the resume and contact wait.

It's meant to be the proof of its own claims, so it's held to these:

- **Accessible:** WCAG 2.1 AA, axe-clean on every route, fully keyboard navigable with a visible focus ring. The WebGL canvas is decorative (`aria-hidden`); the name, the credits and all the content are real DOM text.
- **Reduced motion that's just as good:** under `prefers-reduced-motion` the world renders once, still, with no fly-in and no scrubbed camera.
- **No scroll-jacking:** the camera follows native scroll. Nothing pins or snaps.
- **No layout shift**, and the content never waits on an animation.

## Stack

Next.js 16 (App Router) with React 19 and TypeScript, Tailwind v4, Three.js for the world, and GSAP (ScrollTrigger) for the opening and the scroll route. It's a static site on Vercel: no backend, database, auth or forms. Vercel Web Analytics is the only analytics (cookieless).

Motion lives in client components (`src/components/hero-world.tsx` and what it loads); everything else is a server component.

## Layout

```
src/app/              routes: home, /work/[slug] (the Case study), /resume, 404
src/content/site.ts   the site's copy and content, typed, in one module
src/components/       the hero, the Highlight panels, the scroll route
src/components/world/ the WebGL world: terrain, structures, sky, the name plate,
                      and the flight and route paths as pure, unit-tested maths
e2e/                  Playwright specs over the production build
```

## Running it

Node 22.

```bash
npm install
npm run dev          # http://localhost:3000
```

## Checks

```bash
npm run lint
npm run typecheck
npm test             # Vitest: the content module and the world's maths
npm run test:e2e     # Playwright, against a production build
```

The Playwright suite builds and serves the site on port 3100 (set `E2E_PORT` to run a second copy alongside). It checks what a visitor or a tool can see: axe on every route at desktop and phone widths, keyboard walks with visible focus, the opening's states and timing, reduced motion, and that scrolling is never hijacked. CI runs all of it on every pull request. There's no Lighthouse gate: the site favours its motion over load-speed scores.

## Docs

- `docs/HANDOFF.md`: scope, decisions and the content-accuracy rules every claim on the site follows.
- `docs/launch-checklist.md`: the pre-launch checks and their results.
- `CONTEXT.md`: the project's vocabulary (Project, Highlight, Case study, Role, and so on).
- `PRODUCT.md`: who the site is for and what it must do.
- `.impeccable/surfaces/src-app-page-tsx.md`: the home page's design direction and motion plan.
