import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return [
      { source: "/settings", destination: "/settings/server", permanent: false },
      { source: "/management", destination: "/settings/cicd", permanent: true },
      { source: "/tools", destination: "/tools/sender", permanent: false },
      { source: "/sender", destination: "/tools/sender", permanent: true },
      { source: "/settings/general/:path*", destination: "/settings/containers/:path*", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
