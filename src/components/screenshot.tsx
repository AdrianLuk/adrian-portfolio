import Image from "next/image";
import type { Image as ImageContent } from "@/content/site";

/** A phone held sideways (Pickle Point Pal) is wider than a portrait one. */
export const isSideways = (image: ImageContent) => image.width > image.height;

/**
 * A screenshot at its own size. `decorative` drops the alt text, for a copy
 * shown beside one that carries it (the Player tools' stage).
 */
export function Screenshot({
  image,
  decorative = false,
  className,
}: {
  image: ImageContent;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={image.src}
      alt={decorative ? "" : image.alt}
      width={image.width}
      height={image.height}
      unoptimized
      className={className}
    />
  );
}
