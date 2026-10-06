/**
 * Every string on the site lives here. Claims are taken verbatim from the
 * verified blurbs or the 2026 resume (see docs/HANDOFF.md, "Content accuracy").
 * Key numbers must also appear in ./verified-numbers.ts.
 */

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
  byline: string;
  /** One paragraph, or (Control D, the whole role) exactly three lines. */
  paragraph: string | readonly [string, string, string];
  /** Two verified numbers; Juice Bros has none (no stable figures, and usage numbers are never claimed). */
  keyNumbers: readonly [] | readonly [KeyNumber, KeyNumber];
  link: HighlightLink;
};

export type Role = {
  id: RoleId;
  title: string;
  company: string;
  summary: string;
  start: string;
  end: string;
  bullets: readonly string[];
};

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
  title: "Adrian Luk, senior frontend engineer",
  description:
    "Senior frontend engineer in Toronto. React and TypeScript, plus the back end when it needs building.",
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
  { label: "Contact", href: "/#contact" },
] as const;

export const hero = {
  label: "Introduction",
  titleLine: "Senior frontend engineer",
  backendLine: "React and TypeScript, plus the back end when it needs building.",
  primaryAction: { label: "See the work", href: `#${highlightAnchor("control-d")}` },
} as const;

export const credits = {
  label: "Opening credits",
  lines: [
    "A portfolio by: Adrian Luk",
    "Starring: Adrian Luk, as himself",
    "Motion by: Adrian Luk (yes, also me)",
    "Budget: one Claude subscription",
  ],
  skip: "You can skip this. I'd rather you didn't.",
} as const;

export const work = { heading: "Work" } as const;

const mediaBase = "/case-studies/juice-bros";

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
    paragraph:
      "Primary frontend engineer on the guest-facing booking widget, an embeddable React and TypeScript booking flow hotels dropped onto their own sites with one script tag. Scoped every generated CSS rule to the widget container with a custom Emotion stylis plugin, avoiding both Shadow DOM and an iframe. Retrofitted five languages and multi-currency support onto a UI that had already shipped: 88 files, 22 i18next namespaces, served from Contentful over GraphQL. Built bulk rate editing for hotel operators.",
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
  },
  {
    id: "bt-cup",
    title: "BT Cup",
    byline: "Elite Digital Agency for PepsiCo Canada",
    paragraph:
      "BT Cup was a contest platform PepsiCo Canada used to run retail display-execution competitions for its field sales force, with 11,750 employees provisioned and roughly 2,000 enrolled per contest. On a 14-contributor codebase (Laravel 5.8 and React 16), I designed the domain schema, wrote about 91% of the REST API and about half of the front end, and made the call to move the front end from Vue to React.",
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
  metaTitle: "Adrian Luk, resume",
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

export const contact = {
  heading: "Contact",
  lead: "The full history is on the resume. For anything else, write to me.",
  resume: { label: "Resume", href: "/resume" },
  channels: [
    {
      id: "email",
      label: "Email",
      text: "adrianluk618@gmail.com",
      href: "mailto:adrianluk618@gmail.com",
    },
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
  bookend: "The end. (Hire me.)",
} as const satisfies {
  heading: string;
  lead: string;
  resume: { label: string; href: string };
  channels: readonly ContactChannel[];
  bookend: string;
};

export const notFound = {
  heading: "Lost in the fog",
  body: "Nothing out here but fog. This page doesn't exist, or it drifted off.",
  homeLink: "Back to the home page",
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
} as const satisfies Record<"home" | "resume" | CaseStudySlug, ShareCard>;

/**
 * The quieter world behind every route but home: stills of the valley, drawn
 * by scripts/share-stills.mjs, landscape up to a 4K screen and portrait for
 * phones and tablets.
 */
export const backdrop = {
  landscape: [1280, 1920, 2560, 3840].map((width) => ({
    src: `/world/backdrop-${width}.webp`,
    width,
  })),
  portrait: [645, 1290, 2048].map((width) => ({
    src: `/world/backdrop-portrait-${width}.webp`,
    width,
  })),
} as const;

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
