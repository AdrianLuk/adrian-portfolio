import { NotFoundVariants } from "@/components/not-found-variants";
import { WorldBackdrop } from "@/components/world-backdrop";
import { notFound } from "@/content/site";

export default function NotFound() {
  return <NotFoundVariants copy={notFound} backdrop={<WorldBackdrop parallax />} />;
}
