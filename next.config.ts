import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone server — ideal for Docker / VPS
  output: "standalone",
};

export default nextConfig;
