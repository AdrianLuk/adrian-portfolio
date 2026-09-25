@AGENTS.md

# adrian-portfolio

Adrian's public portfolio (adrianluk.com). Read `docs/HANDOFF.md` first: it holds the locked decisions, v1 scope, and the content-accuracy rules for case studies.

- Static site: no auth, no database, no backend, no monorepo.
- Client components only for motion (GSAP); everything else is a server component. Respect `prefers-reduced-motion`.
- Must be axe-clean, keyboard navigable, with visible focus.
- Never invent case-study details. If it isn't in the resume or blurbs, ask.
