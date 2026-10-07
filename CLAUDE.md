@AGENTS.md

# adrian-portfolio

Adrian's public portfolio (adrianluk.com). Read `docs/HANDOFF.md` first: it holds the locked decisions, v1 scope, and the content-accuracy rules for case studies.

- Static site: no auth, no database, no backend, no monorepo.
- Client components only for motion (GSAP); everything else is a server component. Respect `prefers-reduced-motion`.
- Must be axe-clean, keyboard navigable, with visible focus.
- Never invent case-study details. If it isn't in the resume or blurbs, ask.

## Working here

- New worktree: run `npm ci` in it before `next dev` or `next build`. Turbopack can't use a linked `node_modules`.
- Seeing the world: `node scripts/hero-shots.mjs <base-url> <out-prefix>` photographs the settled hero (desktop and phone) and a frame of the opening. Use it for visual checks and PR screenshots; a Chrome automation window freezes the canvas.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for AdrianLuk/adrian-portfolio, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
