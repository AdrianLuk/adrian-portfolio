import type { HighlightId, KeyNumber } from "./site";

type VerifiedNumber = KeyNumber & {
  /** Where the number is stated: the 2026 resume, the verified blurbs, or PRODUCT.md's evidence. */
  source: "resume" | "blurbs" | "project context";
  /** The verbatim passage that states it. */
  evidence: string;
};

/**
 * The only key numbers a Highlight may show. Add an entry here only with a
 * verbatim quote from its source; never derive or round a number.
 */
export const verifiedNumbers: Record<HighlightId, readonly VerifiedNumber[]> = {
  "control-d": [
    {
      value: "4",
      label: "identity providers behind one sign-on",
      source: "resume",
      evidence:
        "implementing SSO for four identity providers ... all behind one entry point",
    },
    {
      value: "96",
      label: "routes under a WCAG 2.1 AA suite",
      source: "resume",
      evidence:
        "Built the cypress-axe suite that keeps it passing: WCAG 2.1 A/AA assertions across 96 routes",
    },
  ],
  "life-house": [
    {
      value: "1",
      label: "script tag to embed it",
      source: "resume",
      evidence:
        "booking flow hotels dropped onto their own sites with one script tag",
    },
    {
      value: "5",
      label: "languages retrofitted",
      source: "resume",
      evidence:
        "Retrofitted five languages and multi-currency support onto a UI that had already shipped",
    },
  ],
  "juice-bros": [],
  "bt-cup": [
    {
      value: "11,750",
      label: "employees provisioned",
      source: "blurbs",
      evidence: "with 11,750 employees provisioned",
    },
    {
      value: "~2,000",
      label: "enrolled per contest",
      source: "resume",
      evidence: "Roughly 2,000 field employees enrolled per contest",
    },
  ],
};
