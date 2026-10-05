import type { Metadata } from "next";
import { person, siteUrl, type ShareCard } from "@/content/site";

/**
 * A route's title, description and link preview (Open Graph and Twitter). A
 * route sets all of it at once: Next merges metadata shallowly, so a page's
 * own `openGraph` replaces the layout's rather than adding to it.
 */
export function shareMetadata(card: ShareCard): Metadata {
  const images = [
    { url: card.image, width: 1200, height: 630, alt: card.imageAlt },
  ];
  return {
    metadataBase: new URL(siteUrl),
    title: card.title,
    description: card.description,
    openGraph: {
      title: card.title,
      description: card.description,
      url: card.path,
      siteName: person.name,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: card.title,
      description: card.description,
      images,
    },
  };
}
