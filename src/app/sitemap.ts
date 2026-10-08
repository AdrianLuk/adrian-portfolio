import type { MetadataRoute } from "next";
import { shareCards, siteUrl } from "@/content/site";

/** Every public route, one per link preview: each route has one. */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(shareCards).map((card) => ({
    url: new URL(card.path, siteUrl).href,
  }));
}
