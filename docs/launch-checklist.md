# Launch checklist

Run against production (https://adrianluk.com) on 2026-10-06, from the commit that was `main` at the time (4a1e5fa). Re-run it after any change to the domain, analytics, the 404 or the resume files.

| Check | Result | How it was checked |
| --- | --- | --- |
| Domain attached on Vercel | Pass | `adrianluk.com` and `www.adrianluk.com` both answer 200 from Vercel (`server: Vercel`, `x-vercel-id` present). |
| Analytics live | Pass for the script; one step is manual | Web Analytics is enabled: the page injects its script, served first-party at `/<hash>/script.js` with a 200, and `window.va` queues the pageview. Headless browsers aren't counted as visits, so confirm that a real visit appears under Analytics in the Vercel dashboard. |
| 404 verified | Pass | An unknown path returns HTTP 404 with the "Lost in the fog" page. |
| Resume PDF verified | Pass | `/Adrian-Luk-Resume-2026.pdf` returns 200 as `application/pdf` and is byte-identical to `public/Adrian-Luk-Resume-2026.pdf`; the `.docx` returns 200. `src/content/resume-files.test.ts` checks that the PDF, the DOCX and the Resume page agree and that neither file carries a phone number or a `tel:` link. |
| All CI gates green | Pass | The CI run on `main` at 4a1e5fa succeeded: lint, typecheck, Vitest, Lighthouse CI (layout shift, accessibility 100, LCP on the Case study and Resume page) and Playwright. |

## Repo visibility

The repo was scanned for secrets, tokens, a phone number and private references (a hostname and a private document link in the docs were removed); none remain. The repo is already public. Pinning it on the GitHub profile is Adrian's step: profile, "Customize your pins", pick `adrian-portfolio`.
