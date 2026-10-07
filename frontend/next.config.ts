import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same origin for the browser, so the httpOnly session cookie works without CORS (D3).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/:path*` }];
  },
};

export default nextConfig;
