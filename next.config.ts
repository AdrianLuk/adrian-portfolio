import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One host for search engines: www answers with a permanent redirect to the
  // bare domain, keeping the path.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.adrianluk.com" }],
        destination: "https://adrianluk.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
