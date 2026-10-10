import Link from "next/link";
import { NotFoundVariants } from "@/components/not-found-variants";
import { WorldBackdrop } from "@/components/world-backdrop";
import { notFound } from "@/content/site";

export default function NotFound() {
  return (
    <NotFoundVariants copy={notFound} backdrop={<WorldBackdrop parallax />}>
      <p>
        <Link
          href="/"
          className="font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 hover:decoration-cyan"
        >
          {notFound.homeLink}
        </Link>
      </p>
    </NotFoundVariants>
  );
}
