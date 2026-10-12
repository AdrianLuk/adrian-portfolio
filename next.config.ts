import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One host for search engines: www and the Vercel production alias answer
  // with a permanent redirect to the bare domain, keeping the path. Preview
  // deployments have their own hosts, so they still serve.
  async redirects() {
    return ["www.adrianluk.com", "adrian-portfolio-chi-hazel.vercel.app"].map(
      (host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        destination: "https://adrianluk.com/:path*",
        permanent: true,
      }),
    );
  },
};

export default nextConfig;
