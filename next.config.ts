import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain static files (out/) served by Cloudflare; the one server piece,
  // /api/submit, is the Worker in worker/index.ts.
  output: "export",
};

export default nextConfig;
