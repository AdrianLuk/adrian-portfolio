/**
 * Every string on the site lives here. Claims are taken verbatim from the
 * verified blurbs or the 2026 resume (see docs/HANDOFF.md, "Content accuracy").
 * Key numbers must also appear in ./verified-numbers.ts.
 */

import type { AchievementId } from "@/components/achievements";

export type KeyNumber = { value: string; label: string };

export type CaseStudySlug = "juice-bros";

export type RoleId =
  | "control-d"
  | "life-house"
  | "studio"
  | "brandish"
  | "elite-digital";

export type HighlightLink =
  | { kind: "case-study"; slug: CaseStudySlug }
  | { kind: "role"; roleId: RoleId };

export type Image = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

/** An image drawn once by a script at one fixed width, and served as is. */
export type Still = { src: string; width: number; height: number };

/**
 * Stills of one image at fixed widths, all in one shape (`frame`, any
 * width and height in proportion), each with its height to the pixel.
 */
function stillsOf(
  widths: readonly number[],
  frame: { width: number; height: number },
  src: (width: number) => string,
): Still[] {
  return widths.map((width) => ({
    src: src(width),
    width,
    height: Math.round((width * frame.height) / frame.width),
  }));
}

/** A srcset for stills of one image at fixed widths. */
export function srcSet(stills: readonly Still[]): string {
  return stills.map((s) => `${s.src} ${s.width}w`).join(", ");
}

export type Recording = {
  /** Accessible name for the video. */
  label: string;
  poster: string;
  width: number;
  height: number;
  sources: readonly { src: string; type: string }[];
};

export type Showcase = {
  name: string;
  screenshots: { desktop: Image; phone: Image };
  recording?: Recording;
};

export type PlayerTool = Showcase & {
  url: string;
  summary: string;
  /** Booking Buddy needs an account; the others do not. Never generalise. */
  access: "open" | "account";
  accessNote: string;
};

export type CaseStudy = {
  slug: CaseStudySlug;
  title: string;
  byline: string;
  metaTitle: string;
  metaDescription: string;
  sections: readonly {
    id: "problem" | "what-i-did" | "approach" | "outcome";
    heading: string;
    paragraphs: readonly string[];
  }[];
  links: readonly { label: string; href: string }[];
  home: Showcase;
  tools: readonly PlayerTool[];
};

export type HighlightId = "control-d" | "life-house" | "juice-bros" | "bt-cup";

export type Highlight = {
  id: HighlightId;
  title: string;
  /** As the home page shows it, e.g. "Windscribe" for Control D. */
  byline: string;
  /**
   * The employer's name, for machine-facing copy (llms.txt), where it stands
   * in for the byline. Only Control D sets it: Control D is a sister company
   * of Windscribe, not a product of it. Never derive it by trimming `byline`.
   */
  organization?: string;
  /** One paragraph, or short lines a phone visitor can scan (shown as a list). */
  paragraph: string | readonly string[];
  /** Two verified numbers; Juice Bros has none (no stable figures, and usage numbers are never claimed). */
  keyNumbers: readonly [] | readonly [KeyNumber, KeyNumber];
  link: HighlightLink;
  /** A link under `link`, shown as a play button. Only Juice Bros has one: its court's Rally game. */
  secondLink?: { label: string; href: string };
  /** A short silent clip above `secondLink`, showing where it goes. */
  clip?: Recording;
};

export type Role = {
  id: RoleId;
  title: string;
  /** As the Resume page shows it, e.g. "Control D (Windscribe)". */
  company: string;
  /**
   * The employer's name, for machine-facing copy (JSON-LD), where it differs
   * from `company`; without it, `company` is the name. Only Control D sets it:
   * Control D is a sister company of Windscribe, not a product of it. Never
   * derive it by trimming `company`.
   */
  organization?: string;
  summary: string;
  /** A month and year, like "Mar 2024". */
  start: string;
  /** A month and year, like "Mar 2024". */
  end: string;
  bullets: readonly string[];
};

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A Role's date ("Mar 2024") as an ISO year and month ("2024-03"). Throws on
 * anything else, so a date that changes shape fails the build instead of
 * reaching search engines as a guess.
 */
export function isoMonth(date: string) {
  const match = /^([A-Z][a-z]{2}) (\d{4})$/.exec(date);
  const month = match ? months.indexOf(match[1]) + 1 : 0;
  if (!match || month === 0) {
    throw new Error(`Can't read "${date}" as a month and year like "Mar 2024"`);
  }
  return `${match[2]}-${String(month).padStart(2, "0")}`;
}

export type SideProject = {
  id: string;
  name: string;
  url: string;
  year: string;
  bullets: readonly string[];
};

export type ContactChannel = {
  id: "email" | "linkedin" | "github";
  label: string;
  text: string;
  href: string;
};

export const person = {
  name: "Adrian Luk",
  location: "Toronto, Ontario",
} as const;

export const meta = {
  title: "Adrian Luk, senior frontend engineer in Toronto",
  description:
    "Senior frontend engineer in Toronto. React and TypeScript, plus the back end when it needs building. My work at Control D, Life House, Juice Bros and BT Cup.",
} as const;

/** Where the site lives; link previews resolve their images against it. */
export const siteUrl = "https://adrianluk.com";

/**
 * A route's link preview. The image is a 1200 by 630 still in public/, drawn
 * by scripts/share-stills.mjs from the settled hero frame; every route but
 * home captions it with its own title.
 */
export type ShareCard = {
  path: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  caption?: { eyebrow?: string; title: string };
};

export const nav = [
  { label: "Work", href: "/#work" },
  { label: "Resume", href: "/resume" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/#contact" },
] as const;

export const hero = {
  label: "Introduction",
  titleLine: "Senior frontend engineer",
  backendLine: "React and TypeScript, plus the back end when it needs building.",
  primaryAction: { label: "See the work", href: `#${highlightAnchor("control-d")}` },
  /** The cue at the settled hero's foot on a phone. */
  scrollHint: "Scroll",
} as const;

export const credits = {
  label: "Opening credits",
  lines: [
    "A website by: Adrian Luk",
    "Starring: Adrian Luk, as himself",
    "Motion by: Adrian Luk (yes, also me)",
    "Budget: one Claude subscription",
  ],
  skip: "You can skip this. I'd rather you didn't.",
} as const;

export const work = { heading: "Work" } as const;

const mediaBase = "/case-studies/juice-bros";

/** Into the Rally game, from the Juice Bros Highlight and Case study. Says it's a game; the jokes stay inside it. */
export const rallyLink = { label: "Play pickleball against Dinkbot", href: "/rally" } as const;

/** Into the Home Run Derby, from the About page's baseball section. Says it's a game, as `rallyLink` does. */
export const derbyLink = { label: "Bat against Curvebot", href: "/derby" } as const;

/** Into the Shootout, from the About page's gaming section. Says it's a game, as `derbyLink` does. */
export const shootoutLink = { label: "Shoot against the training bots", href: "/shootout" } as const;

/** A rally in the Rally game, over its link in the Juice Bros Highlight and on the About page. */
export const rallyClip: Recording = {
  label: "A rally in the Rally game: the player and Dinkbot trading shots across the floodlit court.",
  poster: `${mediaBase}/rally-game-poster.webp`,
  width: 720,
  height: 540,
  sources: [
    { src: `${mediaBase}/rally-game.webm`, type: "video/webm" },
    { src: `${mediaBase}/rally-game.mp4`, type: "video/mp4" },
  ],
};

const derbyMedia = "/home-run-derby";

/** A home run in the Home Run Derby, over its play button. Recorded by scripts/derby-clip.mjs. */
export const derbyClip: Recording = {
  label: "A home run in the Home Run Derby, from behind home plate: Curvebot pitches, the batter swings, and a broadcast shot traces the ball high toward left field, under Curvebot's line: \"Gone. Curvebot watched that one leave.\"",
  poster: `${derbyMedia}/home-run-poster.webp`,
  width: 720,
  height: 540,
  sources: [
    { src: `${derbyMedia}/home-run.webm`, type: "video/webm" },
    { src: `${derbyMedia}/home-run.mp4`, type: "video/mp4" },
  ],
};

const shootoutMedia = "/shootout";

/** A round of the Shootout, over its play button. Recorded by scripts/shootout-clip.mjs. */
export const shootoutClip: Recording = {
  label: "A round of the Shootout, from the Arena's stage roof: training bots outlined in red pop up round Victoria Harbour, on the shore, a lit pad on the water and a Hong Kong roof, and the six-shooter in the corner drops them one by one.",
  poster: `${shootoutMedia}/round-poster.webp`,
  width: 720,
  height: 540,
  sources: [
    { src: `${shootoutMedia}/round.webm`, type: "video/webm" },
    { src: `${shootoutMedia}/round.mp4`, type: "video/mp4" },
  ],
};

export const caseStudies = [
  {
    slug: "juice-bros",
    title: "Juice Bros",
    byline: "Side project",
    metaTitle: "Juice Bros case study | Adrian Luk",
    metaDescription:
      "How I scoped, built and run the Juice Bros pickleball site as its only engineer, plus the free Player tools I built for my own play.",
    sections: [
      {
        id: "problem",
        heading: "The problem",
        paragraphs: [
          "Juice Bros is a pickleball media brand with a podcast. It needed a website, and I'm the only engineer on it.",
          "That made scope the problem: a deliberately tight MVP that one person could ship, with content structured so the site could grow without a CMS.",
        ],
      },
      {
        id: "what-i-did",
        heading: "What I did",
        paragraphs: [
          "I scoped a deliberately tight MVP, chose the stack and built the site. I integrated the podcast's YouTube feed and a Beehiiv newsletter.",
          "On top of that I built a suite of free web tools for pickleball players, the Player tools below.",
        ],
      },
      {
        id: "approach",
        heading: "Approach",
        paragraphs: [
          "The stack is Next.js App Router, TypeScript, Tailwind, shadcn/ui and Vercel. I modeled content as typed data, so the site can grow without a CMS.",
          "I built the tools for my own play, and they live on the same site as the show.",
        ],
      },
      {
        id: "outcome",
        heading: "Outcome",
        paragraphs: [
          "Juice Bros is live. I built it, I run it, and I'm its only engineer. I built the Player tools for my own play.",
          "The live site is the proof, and the source is public.",
        ],
      },
    ],
    links: [
      {
        label: "Visit juicebrospickleball.com",
        href: "https://juicebrospickleball.com",
      },
      {
        label: "Read the juice-bros source on GitHub",
        href: "https://github.com/AdrianLuk/juice-bros",
      },
      rallyLink,
      {
        label: "Open Booking Buddy",
        href: "https://juicebrospickleball.com/booking-buddy",
      },
      {
        label: "Open Pickle Point Pal",
        href: "https://juicebrospickleball.com/tools/pickle-point-pal",
      },
      {
        label: "Open Match Mixer",
        href: "https://juicebrospickleball.com/tools/match-mixer",
      },
      {
        label: "Open On Deck",
        href: "https://juicebrospickleball.com/on-deck",
      },
      {
        label: "Open Drum Roll",
        href: "https://juicebrospickleball.com/tools/drum-roll",
      },
    ],
    home: {
      name: "The site",
      screenshots: {
        desktop: {
          src: `${mediaBase}/home-desktop.webp`,
          width: 1440,
          height: 900,
          alt: "The Juice Bros home page on desktop: the two hosts either side of the logo, the headline 'Pickleball, from two guys still trying to get good at it', and Watch on YouTube and Listen on Spotify buttons.",
        },
        phone: {
          src: `${mediaBase}/home-phone.webp`,
          width: 780,
          height: 1688,
          alt: "The Juice Bros home page on a phone: the hosts and logo, the same headline stacked over three lines, and the YouTube and Spotify buttons.",
        },
      },
    },
    tools: [
      {
        name: "Booking Buddy",
        url: "https://juicebrospickleball.com/booking-buddy",
        summary:
          "Poll your group on a time, then keep everyone's court bookings in one place.",
        access: "account",
        accessNote: "Needs an account. These are its public entry screens.",
        screenshots: {
          desktop: {
            src: `${mediaBase}/booking-buddy-desktop.webp`,
            width: 1440,
            height: 900,
            alt: "Booking Buddy's public entry page on desktop: the headline 'Sort out the next game without the group-chat spiral' beside two pinned cards showing a booked Saturday court and a Thursday proposal, each with yes, maybe and no replies.",
          },
          phone: {
            src: `${mediaBase}/booking-buddy-phone.webp`,
            width: 780,
            height: 1688,
            alt: "Booking Buddy's public entry page on a phone: the headline and a Get started button above a pinned booking card.",
          },
        },
      },
      {
        name: "Pickle Point Pal",
        url: "https://juicebrospickleball.com/tools/pickle-point-pal",
        summary:
          "Keep score and track serves like a referee: the three-number score call, server one or two, and side-outs, with every tap undoable.",
        access: "open",
        accessNote: "No sign-up. The phone view is held sideways, as it's meant to be.",
        screenshots: {
          desktop: {
            src: `${mediaBase}/pickle-point-pal-desktop.webp`,
            width: 1440,
            height: 900,
            alt: "Pickle Point Pal on desktop mid-match: the score called as 1-3-2, Cat and Dee serving, a court diagram with the server highlighted, and rally buttons for each team.",
          },
          phone: {
            src: `${mediaBase}/pickle-point-pal-phone.webp`,
            width: 1688,
            height: 780,
            alt: "Pickle Point Pal on a phone held sideways: the score called as 1-3-2 in the centre, a court diagram below it, and a large rally button for each team on either side.",
          },
        },
        recording: {
          label: "Pickle Point Pal in use: setting up a doubles match, the coin toss, then scoring rallies as the call and server change.",
          poster: `${mediaBase}/pickle-point-pal-poster.webp`,
          width: 844,
          height: 390,
          sources: [
            { src: `${mediaBase}/pickle-point-pal.webm`, type: "video/webm" },
            { src: `${mediaBase}/pickle-point-pal.mp4`, type: "video/mp4" },
          ],
        },
      },
      {
        name: "Match Mixer",
        url: "https://juicebrospickleball.com/tools/match-mixer",
        summary:
          "Paste your player list and get a doubles round robin where nobody partners the same person twice.",
        access: "open",
        accessNote: "No sign-up, and nothing you type is kept on a server.",
        screenshots: {
          desktop: {
            src: `${mediaBase}/match-mixer-desktop.webp`,
            width: 1440,
            height: 900,
            alt: "Match Mixer on desktop: format options and an eight-name player list on the left, and a generated board of rounds with two courts per round on the right.",
          },
          phone: {
            src: `${mediaBase}/match-mixer-phone.webp`,
            width: 780,
            height: 1688,
            alt: "Match Mixer on a phone: the generated board listing each round and court as a pair of doubles teams.",
          },
        },
        recording: {
          label: "Match Mixer in use: typing eight names, making the board and reading the rounds it generates.",
          poster: `${mediaBase}/match-mixer-poster.webp`,
          width: 960,
          height: 610,
          sources: [
            { src: `${mediaBase}/match-mixer.webm`, type: "video/webm" },
            { src: `${mediaBase}/match-mixer.mp4`, type: "video/mp4" },
          ],
        },
      },
      {
        name: "On Deck",
        url: "https://juicebrospickleball.com/on-deck",
        summary:
          "Live court rotation for club socials: players scan a sign to join the queue, and it calls the next foursome as courts free up.",
        access: "account",
        accessNote:
          "Organizers need an account, players don't. These are from the demo night, which needs no sign-up.",
        screenshots: {
          desktop: {
            src: `${mediaBase}/on-deck-desktop.webp`,
            width: 1440,
            height: 900,
            alt: "On Deck's demo night on desktop: Floor, Display and Kiosk tabs above a grid of courts, each listing the four players on it with a Court done button.",
          },
          phone: {
            src: `${mediaBase}/on-deck-phone.webp`,
            width: 780,
            height: 1688,
            alt: "On Deck's demo night on a phone: courts stacked one per row, each listing four players above a large Court done button.",
          },
        },
      },
      {
        name: "Drum Roll",
        url: "https://juicebrospickleball.com/tools/drum-roll",
        summary:
          "Spin a wheel to pick a name, or add prizes and run the whole raffle. No paper tickets.",
        access: "open",
        accessNote: "No sign-up.",
        screenshots: {
          desktop: {
            src: `${mediaBase}/drum-roll-desktop.webp`,
            width: 1440,
            height: 900,
            alt: "Drum Roll on desktop: a wheel divided into five names, a Spin button beneath it and the On the wheel list starting below.",
          },
          phone: {
            src: `${mediaBase}/drum-roll-phone.webp`,
            width: 780,
            height: 1688,
            alt: "Drum Roll on a phone: a full-width wheel divided into five names, with a Spin button beneath it.",
          },
        },
      },
    ],
  },
] as const satisfies readonly CaseStudy[];

export const highlights = [
  {
    id: "control-d",
    title: "Control D",
    byline: "Windscribe",
    organization: "Control D",
    paragraph: [
      "I built single sign-on across four identity providers (Okta, Google, Microsoft Entra ID and Tailscale), including the OAuth/OIDC work in our PHP REST API.",
      "I built the org-level scheduled Reports feature end to end, from the backend scheduling through to the interface organizations use to set reports up.",
      "When an external WCAG 2.1 audit put an accessibility deadline on our SOC certification, I took on the remediation across roughly 248 components in the dashboard, the authenticated app and the public marketing pages, and built a cypress-axe harness that checks 96 routes against WCAG 2.1 AA to keep it from regressing.",
    ],
    keyNumbers: [
      { value: "4", label: "identity providers behind one sign-on" },
      { value: "96", label: "routes under a WCAG 2.1 AA suite" },
    ],
    link: { kind: "role", roleId: "control-d" },
  },
  {
    id: "life-house",
    title: "Life House",
    byline: "Guest-facing booking widget",
    paragraph: [
      "Primary frontend engineer on the guest-facing booking widget, an embeddable React and TypeScript booking flow hotels dropped onto their own sites with one script tag.",
      "Scoped every generated CSS rule to the widget container with a custom Emotion stylis plugin, avoiding both Shadow DOM and an iframe.",
      "Retrofitted five languages and multi-currency support onto a UI that had already shipped: 88 files, 22 i18next namespaces, served from Contentful over GraphQL.",
      "Built bulk rate editing for hotel operators.",
    ],
    keyNumbers: [
      { value: "1", label: "script tag to embed it" },
      { value: "5", label: "languages retrofitted" },
    ],
    link: { kind: "role", roleId: "life-house" },
  },
  {
    id: "juice-bros",
    title: "Juice Bros",
    byline: "Side project",
    paragraph:
      "I'm the sole engineer on Juice Bros, a pickleball media brand. I scoped a deliberately tight MVP, chose the stack (Next.js App Router, TypeScript, Tailwind, shadcn/ui, Vercel), modeled content as typed data so the site could grow without a CMS, and integrated the podcast's YouTube feed and a Beehiiv newsletter. On top of that I built a suite of free web tools for pickleball players.",
    keyNumbers: [],
    link: { kind: "case-study", slug: "juice-bros" },
    secondLink: rallyLink,
    clip: rallyClip,
  },
  {
    id: "bt-cup",
    title: "BT Cup",
    byline: "Elite Digital Agency for PepsiCo Canada",
    paragraph: [
      "BT Cup was a contest platform PepsiCo Canada used to run retail display-execution competitions for its field sales force, with 11,750 employees provisioned and roughly 2,000 enrolled per contest.",
      "On a 14-contributor codebase (Laravel 5.8 and React 16), I designed the domain schema and wrote about 91% of the REST API and about half of the front end.",
      "I made the call to move the front end from Vue to React.",
    ],
    keyNumbers: [
      { value: "11,750", label: "employees provisioned" },
      { value: "~2,000", label: "enrolled per contest" },
    ],
    link: { kind: "role", roleId: "elite-digital" },
  },
] as const satisfies readonly Highlight[];

export const roles = [
  {
    id: "control-d",
    title: "Senior Software Engineer",
    company: "Control D (Windscribe)",
    organization: "Control D",
    summary:
      "DNS security and content filtering platform for consumer, business and MSP customers",
    start: "Mar 2024",
    end: "Apr 2026",
    bullets: [
      "Led an accessibility overhaul of the customer dashboard, organization portal and marketing site, remediating 248 React components against an external WCAG 2.1 AA audit on a compliance deadline.",
      "Built the cypress-axe suite that keeps it passing: WCAG 2.1 A/AA assertions across 96 routes, each run in desktop and mobile at both light and dark themes, with network calls stubbed so results stay deterministic.",
      "Fixed focus management in the shared primitives instead of page by page. Modal and tray dialogs moved onto react-focus-lock, popups regained focus restoration, and colour contrast moved into the theme palette for both modes.",
      "Added keyboard navigation to card, row and filter components that had been mouse-only.",
      "Sole engineer on the PHP REST API, implementing SSO for four identity providers over 18 months, covering internal admins, customer organizations and personal users: Okta with group-to-role mapping, Google, Microsoft Entra ID with per-tenant OIDC discovery and PKCE, and Tailscale, all behind one entry point.",
      "Owned the HubSpot integration in production for 18 months. A PHP client created contacts, companies, deals, invoices and line items, driven by Stripe webhooks for payment, subscription and payment-method events.",
      "Built org-level scheduled reporting: React and RTK Query on the front, a PHP controller and cron behind it, branded PDFs out the other end.",
    ],
  },
  {
    id: "life-house",
    title: "Full Stack Developer",
    company: "Life House",
    summary: "Revenue management SaaS for independent hotels",
    start: "Oct 2022",
    end: "Feb 2024",
    bullets: [
      "Primary frontend engineer on the guest-facing booking widget, an embeddable React and TypeScript booking flow hotels dropped onto their own sites with one script tag.",
      "Scoped every generated CSS rule to the widget container with a custom Emotion stylis plugin, avoiding both Shadow DOM and an iframe. Wrote the html-tag and keyframe exclusions that global and animation rules needed to survive it.",
      "Retrofitted five languages and multi-currency support onto a UI that had already shipped: 88 files, 22 i18next namespaces, served from Contentful over GraphQL.",
      "Built bulk rate editing for hotel operators. Date-range and weekday filters apply price overrides in one mutation, and the override editor derives per-night and percentage inputs from each other.",
      "Top contributor on the revenue and marketing dashboards, covering occupancy, ADR, RevPAR, competitor rates and booking pace over an Apollo Federation GraphQL gateway.",
      "Contributed to a published Radix design system shared by the admin and guest apps, and built a NestJS GraphQL subgraph over the Mews and Cloudbeds PMS APIs.",
    ],
  },
  {
    id: "studio",
    title: "Frontend Engineer",
    company: "Studio",
    summary: "Brand and digital design agency",
    start: "Mar 2022",
    end: "Aug 2022",
    bullets: [
      "Sole developer after taking over a stalled prototype of the agency's marketing site. Rebuilt the landing page, navigation and case-study system over roughly 170 pull requests, writing about 70% of the shipped source.",
      "Built the scroll engine driving the site: four coordinated GSAP ScrollTriggers per section for active state, page-chrome theming, paint gating on offscreen content and pinned stacked-section reveals, with offsets resolved per section and per breakpoint and full teardown on resize.",
      "Rendered route transitions on canvas. GSAP timelines paint staggered DPR-scaled ripples out from the click point, and navigation fires from the animation's completion callback.",
      "Wrote the deploy pipeline: three GitHub Actions workflows to Firebase Hosting production and dev, plus an ephemeral preview channel per pull request.",
    ],
  },
  {
    id: "brandish",
    title: "Full Stack Web Developer",
    company: "Brandish Agency",
    summary: "Digital agency; WordPress, headless and custom client builds",
    start: "Mar 2020",
    end: "Mar 2022",
    bullets: [
      "Led development on the agency's main client accounts. Majority author on six of nine repositories, sole author on four, and primary merge integrator on every multi-developer project.",
      "Built a college website on a Timber/Twig WordPress theme with 8 custom post types and 67 ACF field groups, including an embedded React SPA program catalogue with Context API, custom hooks, react-query and React Testing Library coverage.",
      "Built the agency's own site headless: a Gatsby front end sourcing WordPress over WPGraphQL, on Netlify, with a serverless function handling forms.",
      "Wrote the CI pipeline for the largest client project. Builds fire only when source actually changes, with three-tier dependency caching, a two-stage React-then-theme build and deploy webhooks across four environments.",
      "Standardized a reusable theme build scaffold and a shared Elementor widget plugin across client projects. Mentored a junior developer.",
    ],
  },
  {
    id: "elite-digital",
    title: "Full Stack Developer",
    company: "Elite Digital Agency",
    summary: "Digital agency; enterprise applications and client web builds",
    start: "May 2018",
    end: "Mar 2020",
    bullets: [
      "Architected the data model, REST API and React front end of an internal retail-execution contest platform for PepsiCo Canada. Roughly 2,000 field employees enrolled per contest, against a provisioned user base of 11,750.",
      "Designed the domain schema behind it, mapping a six-level national field sales hierarchy across nine roles with per-contest role assignment, and owned the REST API layer the whole front end runs on.",
      "Replaced the application's Vue front end with React and built the architecture that followed: eleven contexts, custom hooks, dynamic-import code splitting, an error boundary and skeleton loading.",
      "Built the submission and moderation flow: multi-photo upload with an in-browser image editor, a review queue, conversion-rate leaderboards and client-rendered PDF report cards, bilingual English and French.",
      "Tracked down production performance problems: a memory leak in a gallery endpoint over roughly 85,000 records, a missing-index migration on hot tables, and a query that ran on every authenticated request.",
      "Built a bilingual dual-market WordPress theme serving Canadian and US sites from one codebase with runtime country detection and per-market taxonomies.",
    ],
  },
] as const satisfies readonly Role[];

export const sideProjects = [
  {
    id: "juice-bros",
    name: "Juice Bros",
    url: "https://juicebrospickleball.com",
    year: "2026",
    bullets: [
      "Brand platform for a pickleball podcast, built in Next.js and TypeScript. Episode archive, newsletter integration and a set of free tools for players.",
    ],
  },
] as const satisfies readonly SideProject[];

export const resume = {
  metaTitle: "Resume | Adrian Luk, senior frontend engineer",
  metaDescription:
    "Where Adrian Luk has worked as a frontend and full-stack engineer, newest first, with a PDF to download.",
  heading: "Resume",
  intro: "Where I've worked, newest first, and one project of my own.",
  rolesHeading: "Experience",
  sideProjectsHeading: "Side projects",
  /** In public/; web copies of the 2026 resume with the phone number removed. */
  pdfHref: "/Adrian-Luk-Resume-2026.pdf",
  docxHref: "/Adrian-Luk-Resume-2026.docx",
  download: { pdf: "Download PDF", docx: "Download Word version (.docx)" },
} as const;

const email = {
  id: "email",
  label: "Email",
  text: "adrianluk618@gmail.com",
  href: "mailto:adrianluk618@gmail.com",
} as const satisfies ContactChannel;

export const contact = {
  heading: "Contact",
  lead: "The full history is on the resume. For anything else, write to me.",
  resume: { label: "Resume", href: "/resume" },
  channels: [
    email,
    {
      id: "linkedin",
      label: "LinkedIn",
      text: "linkedin.com/in/adrian-luk",
      href: "https://www.linkedin.com/in/adrian-luk",
    },
    {
      id: "github",
      label: "GitHub",
      text: "github.com/AdrianLuk",
      href: "https://github.com/AdrianLuk",
    },
  ],
  /**
   * Adrian's photo beside the channels: cropped to head and shoulders and
   * graded into the night by scripts/portrait.mjs, at fixed widths in one
   * 4:5 shape.
   */
  portrait: {
    alt: "Adrian Luk",
    stills: stillsOf(
      [240, 480, 720],
      { width: 4, height: 5 },
      (width) => `/contact/adrian-luk-${width}.webp`,
    ),
  },
  /**
   * Off the clock lives on the About page: here, one line pointing there, and
   * the way into the Derby, its clip first. Its panel is the scroll route's
   * stop at the Diamond (src/components/home-panels.ts): the clip lengthens
   * it, so the camera holds on the park a little longer.
   */
  offClock: {
    id: "off-the-clock",
    heading: "Off the clock",
    text: "Pickleball, baseball, K-pop concerts and gaming.",
    link: { label: "More on the About page", href: "/about" },
    derby: { label: "Bat in the Home Run Derby", href: derbyLink.href },
    clip: derbyClip,
  },
  /**
   * How the site itself is built: each fact one the public repo bears out,
   * so a visitor can check it there.
   */
  built: {
    heading: "How this site is built",
    lead: "The site is part of the work, and its source is public, so you can check any of this.",
    facts: [
      "I built the world in WebGL with Three.js, all from code.",
      "Between the home page and the resume, the camera flies through it instead of fading.",
      "Its weather is Toronto's, checked on the server at most once an hour.",
      "With reduced motion on, the world holds still and every page keeps all its content.",
      "Every page is checked with axe in CI, and all of it works from the keyboard.",
    ],
    source: {
      label: "Read the source on GitHub",
      href: "https://github.com/AdrianLuk/adrian-portfolio",
    },
  },
  /** The last word; its "Hire me" links to the Email channel. */
  bookend: {
    text: "The end. (Hire me.)",
    link: { label: "Hire me", href: email.href },
  },
} as const satisfies {
  heading: string;
  lead: string;
  resume: { label: string; href: string };
  channels: readonly ContactChannel[];
  portrait: { alt: string; stills: readonly Still[] };
  offClock: {
    id: string;
    heading: string;
    text: string;
    link: { label: string; href: string };
    derby: { label: string; href: string };
    clip: Recording;
  };
  built: {
    heading: string;
    lead: string;
    facts: readonly string[];
    source: { label: string; href: string };
  };
  bookend: { text: string; link: { label: string; href: string } };
};

/**
 * The Encore, at the About page's K-pop stop: the camera comes into the
 * Arena, and the ticket wall lists the K-pop concerts Adrian has been to
 * (Personal facts, docs/HANDOFF.md). Each ticket's light is its group's
 * colour where it has one (TWICE's apricot and neon magenta, per JYP), else
 * the world's palette. Text and colour only: no logos.
 */
/** The world's palette, as the page's theme names it (src/app/globals.css). */
const world = {
  cyan: "var(--color-cyan)",
  violet: "var(--color-violet)",
  magenta: "var(--color-magenta)",
  green: "var(--color-green)",
} as const;

export const encore = {
  lead: "The K-pop concerts I've been to, so far.",
  wallLabel: "Concert tickets",
  // Oldest first.
  tickets: [
    { group: "aespa", year: 2025, colors: [world.cyan] },
    { group: "Stray Kids", year: 2025, colors: [world.violet] },
    { group: "BLACKPINK", year: 2025, colors: ["#F7A7BB"] },
    { group: "BABYMONSTER", year: 2025, colors: ["#E8132E"] },
    { group: "aespa", year: 2026, colors: [world.green] },
    { group: "EVERGLOW", year: 2026, colors: [world.magenta] },
    { group: "IVE", year: 2026, colors: [world.cyan] },
    { group: "TWICE", year: 2026, colors: ["#FCC89B", "#FF5FA2"] },
    { group: "BTS", year: 2026, colors: ["#A15EE6"] },
    { group: "XG", year: 2026, colors: [world.green] },
  ],
} as const satisfies {
  lead: string;
  wallLabel: string;
  tickets: readonly { group: string; year: number; colors: readonly string[] }[];
};

/**
 * The About page, along the Hobby route: the intro first (work, roots, the
 * hobbies and the side project, each claim from the resume or the Personal
 * facts), then Off the clock's lines (Personal facts, docs/HANDOFF.md), each section's as bullets in a
 * panel beside its stop: pickleball at the court, baseball at the Diamond,
 * K-pop in the Arena with the ticket wall, then the gaming line. The first
 * three panels' ids are the route's stops (src/components/hobby-scroll.tsx).
 */
export const about = {
  path: "/about",
  eyebrow: "About",
  heading: "Off the clock",
  intro: [
    "I'm Adrian, a senior frontend engineer in Toronto. I've worked in React and TypeScript since 2018, and I do the back end when it needs building. Most recently I was at Control D, where I led an accessibility overhaul across 248 components and built single sign-on for four identity providers.",
    "I was born and raised in Canada, and my parents and family are from Hong Kong.",
    // A word joiner after K-pop's hyphen, so a phone doesn't break the word there.
    "Off the clock, it's pickleball, baseball, K-⁠pop concerts and gaming. Pickleball even made it into my side project. I'm the only engineer on Juice Bros, a pickleball media brand, and I built its player tools for my own play.",
    "Each hobby has its own stop further down, and three come with a game you can play: pickleball at the court, a home run derby at the ballpark, and a shootout on the Arena's stage.",
  ],
  pickleball: {
    id: "pickleball",
    heading: "Pickleball",
    lines: ["Pickleball has been my main hobby since 2023."],
    clip: rallyClip,
    play: rallyLink,
    caseStudy: { label: "Juice Bros case study", href: "/work/juice-bros" },
  },
  baseball: {
    id: "baseball",
    heading: "Baseball",
    lines: ["Played competitively for 15 years: pitcher, middle infield and center field."],
    clip: derbyClip,
    play: derbyLink,
  },
  kpop: {
    id: "kpop",
    heading: "K-pop",
    lines: ["I go to K-pop concerts regularly."],
    // The Encore's ticket wall, under its lead.
    wallLead: encore.lead,
  },
  gaming: {
    id: "gaming",
    heading: "Gaming",
    lines: ["Overwatch and League of Legends. Some habits stick: try recalling."],
    clip: shootoutClip,
    play: shootoutLink,
  },
  metaTitle: "Off the clock: Adrian Luk",
  metaDescription:
    "Adrian Luk outside work: pickleball since 2023, 15 years of competitive baseball, K-pop concerts, Overwatch and League of Legends.",
} as const;

/** Adrian's profiles elsewhere: every contact channel but email. */
export const profiles = contact.channels.filter(
  (channel) => channel.id !== "email",
);

/** The line at the foot of every page. */
export const footer = {
  source: { label: "Source on GitHub", href: contact.built.source.href },
} as const;

/** The Achievements: the footer's counter, its list and the toasts. */
export const achievements = {
  label: "Achievements",
  /** The counter's "2 of 7". */
  of: "of",
  /** Joins the names in a toast of two: "Dinkbot down and First Blood". */
  and: "and",
  names: {
    "first-blood": "First Blood",
    "back-to-base": "Back to base",
    encore: "Encore!",
    "full-rotation": "Full rotation",
    "back-to-back-to-back": "Back-to-back-to-back",
    "dinkbot-down": "Dinkbot down",
    "three-for-one": "Three for one",
  } satisfies Record<AchievementId, string>,
  unearned: "???",
  unearnedLabel: "Not earned yet",
  toast: { one: "Achievement earned", many: "Achievements earned" },
  close: "Close",
} as const;

/**
 * The Recall: how long it channels, in ms, and its announcements to a screen
 * reader: as it starts, if it's cancelled, and as it completes.
 */
export const recall = {
  channelMs: 3000,
  started: "Recalling home. Keep holding.",
  cancelled: "Recall cancelled.",
  done: "Recalled home.",
} as const;

/**
 * The 404's five themed variants, in the order a browser sees them (the
 * rotation in src/components/not-found-rotation.ts). Each has a heading and a
 * line; the home link is the same on all.
 */
export const notFound = {
  variants: [
    { theme: "Baseball", heading: "Foul ball", line: "That one landed out of play." },
    { theme: "Overwatch", heading: "Heroes never die", line: "This page did." },
    {
      theme: "League of Legends",
      heading: "Page slain",
      line: "Recall to base:",
      // Its line, and a Recall button after it, can be held to recall home (src/components/recall-hold.ts).
      recall: true,
    },
    {
      theme: "K-pop",
      heading: "On hiatus",
      line: "This page went on indefinite hiatus. No comeback announced.",
    },
    {
      theme: "Pickleball",
      heading: "Side out",
      line: "Foot fault: this page stepped in the kitchen.",
    },
  ],
  next: "I've got another excuse",
  // Draft lines for Adrian to approve: the Recall button, and what a screen reader hears.
  recall: {
    label: "Recall",
    hint: "Press and hold to recall.",
    start: "Recalling…",
    cancel: "Recall cancelled.",
    done: "Back to base.",
  },
  homeLink: "Back to the home page",
} as const;

/**
 * The Rally game on /rally. The page's own copy is plain; the game's UI (the
 * start, pause and game-over screens and the point lines) is the one place
 * after the credits and the bookend where the copy may joke, and it makes no
 * claims about Juice Bros.
 */
export const rally = {
  metaTitle: "Rally on the Juice Bros court | Adrian Luk",
  metaDescription:
    "A short pickleball game on the Juice Bros court, against a bot: side-out scoring, first to 11, win by 2.",
  eyebrow: "Rally game",
  heading: "Juice Bros court",
  hint: {
    keys: "Arrow keys move. Space serves; hold it to dink. Esc or P pauses.",
    touch: "Drag anywhere on the court to move. Tap to serve; hold Dink to dink.",
    swing: "Your swing is automatic: get to the ball.",
  },
  caseStudyLink: { label: "Read the Juice Bros case study", href: "/work/juice-bros" },
  game: {
    label: "Pickleball rally",
    loading: "Lighting the court…",
    unavailable:
      "This browser can't draw the court (WebGL is off or unsupported), so the game can't run here.",
    start: {
      title: "Ready when you are",
      line: "First to 11, win by 2; only the server scores. Dinkbot dinks. So can you.",
      action: "Start",
    },
    slowMode: {
      label: "Slow mode",
      description: "Half speed, for the ball and Dinkbot alike.",
    },
    pause: "Pause",
    resume: "Resume",
    paused: {
      title: "Paused",
      line: "Dinkbot is pretending not to mind.",
    },
    /** Who serves, as the score call says it: "5–3, you serve". */
    serves: { player: "you serve", ai: "Dinkbot serves" },
    serveHint: "Space or tap to serve",
    dink: "Dink",
    point: {
      won: "Point to you",
      lost: "Point to Dinkbot",
      sideOut: "Side out",
      reasons: {
        out: "out",
        net: "into the net",
        "double-bounce": "two bounces",
        fault: "a fault",
      },
    },
    over: {
      won: "You win. Dinkbot would like a word.",
      lost: "Dinkbot wins. It's been practicing.",
      action: "Play again",
    },
    /** The player is Adrian, by the name on his back. */
    score: { player: "Adrian", ai: "Dinkbot" },
  },
} as const;

/**
 * The Home Run Derby on /derby. As the Rally game's, the page's own
 * copy is plain; Curvebot's lines may joke, and make no claims. Curvebot's lines are drafts for Adrian to approve (#91).
 */
export const derby = {
  metaTitle: "Home Run Derby at the Diamond | Adrian Luk",
  metaDescription:
    "Bat against a bot, Curvebot, at the Diamond: ten pitches, and your swing's timing decides each one.",
  eyebrow: "Home Run Derby",
  heading: "The Diamond",
  hint: {
    timing: "Swing as the pitch reaches the plate: your timing decides where it goes.",
    keys: "Space swings. Esc or P pauses.",
    touch: "Tap anywhere on the field to swing.",
  },
  rallyLink,
  game: {
    label: "Home Run Derby",
    loading: "Lighting the Diamond…",
    unavailable:
      "This browser can't draw the Diamond (WebGL is off or unsupported), so the game can't run here.",
    start: {
      title: "Batter up",
      line: "Ten pitches. Curvebot throws, you swing.",
      action: "Start",
    },
    slowMode: {
      label: "Slow mode",
      description: "Half speed, for every pitch.",
    },
    pause: "Pause",
    resume: "Resume",
    paused: {
      title: "Paused",
      line: "Curvebot is checking the runner at first.",
    },
    /** The count, over the field: "Pitch 3/10". */
    pitch: "Pitch",
    pitches: { fastball: "Fastball", curveball: "Curveball", changeup: "Changeup" },
    outcomes: {
      "home-run": "Gone. Curvebot watched that one leave.",
      "fly-out": "Caught at the warning track.",
      foul: "Foul ball. Straighten it out.",
      strike: "Strike. That one broke late.",
    },
    /** A home run's distance: "412 feet". */
    feet: "feet",
    swingHint: "Space or tap to swing",
    over: {
      title: "That's ten",
      count: { one: "home run", other: "home runs" },
      /** Curvebot's line by the home-run count: the first band whose `upTo` reaches it. */
      bands: [
        { upTo: 0, line: "Curvebot would like this on the scoreboard." },
        { upTo: 3, line: "Solid. Curvebot is mildly concerned." },
        { upTo: 6, line: "Curvebot wants a rematch." },
        { upTo: 10, line: "Curvebot is calling the bullpen." },
      ],
      action: "Play again",
    },
    /** After a game with a home run: the longest, again, its distance under the banner. */
    play: {
      title: "Play of the Game",
      again: "Watch again",
      done: "Done",
    },
    score: { homeRuns: "Home runs" },
  },
} as const;

/**
 * The Shootout on /shootout. As the Derby's, the page's own copy is plain;
 * the game's lines may joke, and make no claims. No Cassidy names, art or
 * sounds (#91's rule): the ultimate is just "Ultimate", its 12:00 clock the
 * only nod. The targets are always "bots".
 */
export const shootout = {
  metaTitle: "Shootout on the Arena's stage | Adrian Luk",
  metaDescription:
    "Shoot training bots from the Arena's stage roof, across Victoria Harbour from Hong Kong: drag to aim, lift to shoot, and charge an ultimate.",
  eyebrow: "Shootout",
  heading: "The Arena's stage",
  hint: {
    aim: "Training bots pop up all round the harbour. Headshots and long shots score more.",
    keys: "Click to aim with the mouse (Esc frees it), and click to shoot. Arrow keys aim, Space shoots, N snaps to the next bot, Q is the ultimate. Esc or P pauses.",
    touch: "Drag to aim, and lift your thumb to shoot.",
  },
  aboutLink: { label: "Back to the About page", href: "/about" },
  game: {
    label: "Shootout",
    loading: "Lighting the Arena…",
    unavailable: "This game needs WebGL, which this browser has off or doesn't support.",
    start: {
      title: "Training round",
      line: "No ammo, no timer. Shoot as long as you like.",
      action: "Start",
    },
    slowMode: {
      label: "Slow mode",
      description: "Half-speed pop-ups, no strafing, no recoil.",
    },
    pause: "Pause",
    resume: "Resume",
    paused: {
      title: "Paused",
      line: "The training bots are holding still. Mostly.",
    },
    reset: "Reset",
    score: { score: "Score", bots: "Bots", headshots: "Headshots", headshotsShort: "HS", best: "Best" },
    ultimate: {
      label: "Ultimate",
      /** Its ring's label as it charges: "Ultimate, 40% charged". */
      charged: "charged",
      ready: "Ready",
      fire: "Fire",
      /** What a screen reader hears. */
      readyLine: "Ultimate ready.",
      runningLine: "Ultimate. Tap the ring or press Q to fire.",
      /** The one nod, over the screen while it runs. */
      clock: "12:00",
    },
    /** A bot up, as a screen reader hears it: "Bot up on the shore, to your left." */
    up: "Bot up",
    where: {
      rim: "on the Arena's rim",
      shore: "on the shore",
      pad: "on the harbour",
      roof: "on a Hong Kong roof",
      tower: "on a light tower at the Diamond",
    },
    direction: {
      ahead: "ahead",
      left: "to your left",
      right: "to your right",
      behind: "behind you",
    },
    headshot: "Headshot.",
    longShot: "Long shot.",
    /** The score, announced after a kill: "Score 450." */
    scoreLine: "Score",
  },
} as const;

const settledFrameAlt =
  "Adrian Luk's name in lit 3D letters on a night valley floor, between glowing towers, with Toronto's skyline and the CN Tower behind.";

const juiceBros = caseStudies[0];

export const shareCards = {
  home: {
    path: "/",
    title: meta.title,
    description: meta.description,
    image: "/share/home.png",
    imageAlt: settledFrameAlt,
  },
  resume: {
    path: "/resume",
    title: resume.metaTitle,
    description: resume.metaDescription,
    image: "/share/resume.png",
    imageAlt: `${settledFrameAlt} Captioned "${resume.heading}".`,
    caption: { title: resume.heading },
  },
  "juice-bros": {
    path: `/work/${juiceBros.slug}`,
    title: juiceBros.metaTitle,
    description: juiceBros.metaDescription,
    image: `/share/work-${juiceBros.slug}.png`,
    imageAlt: `${settledFrameAlt} Captioned "Case study: ${juiceBros.title}".`,
    caption: { eyebrow: "Case study", title: juiceBros.title },
  },
  play: {
    path: "/rally",
    title: rally.metaTitle,
    description: rally.metaDescription,
    image: "/share/rally.png",
    imageAlt: `${settledFrameAlt} Captioned "${rally.eyebrow}: ${rally.heading}".`,
    caption: { eyebrow: rally.eyebrow, title: rally.heading },
  },
  derby: {
    path: "/derby",
    title: derby.metaTitle,
    description: derby.metaDescription,
    image: "/share/derby.png",
    imageAlt: `${settledFrameAlt} Captioned "${derby.eyebrow}: ${derby.heading}".`,
    caption: { eyebrow: derby.eyebrow, title: derby.heading },
  },
  shootout: {
    path: "/shootout",
    title: shootout.metaTitle,
    description: shootout.metaDescription,
    image: "/share/shootout.png",
    imageAlt: `${settledFrameAlt} Captioned "${shootout.eyebrow}: ${shootout.heading}".`,
    caption: { eyebrow: shootout.eyebrow, title: shootout.heading },
  },
  about: {
    path: about.path,
    title: about.metaTitle,
    description: about.metaDescription,
    image: "/share/about.png",
    imageAlt: `${settledFrameAlt} Captioned "${about.eyebrow}: ${about.heading}".`,
    caption: { eyebrow: about.eyebrow, title: about.heading },
  },
} as const satisfies Record<
  "home" | "resume" | "play" | "derby" | "shootout" | "about" | CaseStudySlug,
  ShareCard
>;

/**
 * Stills of one world frame, drawn by scripts/share-stills.mjs to
 * `/world/<name>-<width>.webp`: landscape up to a 4K screen and portrait for
 * phones and tablets, each in the shape of the screen it is shot at. A
 * still's name is also its `data-backdrop` on the page.
 */
export type StillName =
  | "valley"
  | "court"
  | "skyline"
  | "diamond"
  | "arena"
  | "shootout"
  | RouteStillName;

/** A stop on home's scroll route after the settled view: each Lit site's (by its Highlight), the Diamond's, Hong Kong's. */
export type RouteStop = HighlightId | "diamond" | "hong-kong";
export type RouteStillName = `route-${RouteStop}`;

function worldStills(name: StillName) {
  return {
    landscape: stillsOf(
      [1280, 1920, 2560, 3840],
      { width: 2560, height: 1440 },
      (width) => `/world/${name}-${width}.webp`,
    ),
    portrait: stillsOf(
      [645, 1290, 2048],
      { width: 1366, height: 2960 },
      (width) => `/world/${name}-portrait-${width}.webp`,
    ),
  } as const;
}

/** The quieter world behind every route but home and the court: the valley. */
export const valleyStills = worldStills("valley");

/**
 * The Juice Bros Case study's first paint: the world as the camera holds it
 * at the court, which the live world fades in over (and which stays without
 * WebGL).
 */
export const courtStills = worldStills("court");

/**
 * The Resume page's first paint, likewise: the world as the camera holds it
 * at the Skyline.
 */
export const skylineStills = worldStills("skyline");

/**
 * The Home Run Derby's first paint, likewise: the world as the camera holds
 * it behind the Diamond's home plate.
 */
export const diamondStills = worldStills("diamond");

/**
 * The About page's K-pop stop where the world isn't live behind it (without
 * WebGL, or under reduced motion): the Arena from inside, its show on.
 */
export const arenaStills = worldStills("arena");

/**
 * The Shootout's first paint, likewise: the world as the camera holds it on
 * the Arena's stage roof, facing Hong Kong; and what stays without WebGL.
 */
export const shootoutStills = worldStills("shootout");

/**
 * Home's scroll route under reduced motion, where the world stays the hero's
 * still frame: each stop as the camera holds it there, behind that stop's
 * stretch of the page.
 */
export const routeStills = Object.fromEntries(
  [...highlights.map((h) => h.id), "diamond", "hong-kong"].map((stop) => {
    const name = `route-${stop}` as RouteStillName;
    return [name, worldStills(name)];
  }),
) as Record<RouteStillName, ReturnType<typeof worldStills>>;

/** The id of a Highlight's panel on the home page, and its in-page anchor. */
export function highlightAnchor(id: HighlightId): string {
  return `highlight-${id}`;
}

export function hrefFor(link: HighlightLink): string {
  return link.kind === "role" ? `/resume#${link.roleId}` : `/work/${link.slug}`;
}

/** "https://juicebrospickleball.com" -> "juicebrospickleball.com" */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function linkLabelFor(highlight: Highlight): string {
  return highlight.link.kind === "role"
    ? `${highlight.title} on the resume`
    : `Read the ${highlight.title} case study`;
}
