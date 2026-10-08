import { llmsTxt } from "../llms-txt";

// Built once at build time: the text comes only from the content module.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
