import path from "node:path";
import type { NextConfig } from "next";

// `output: "standalone"` is what app/Dockerfile ships; the tracing root is the workspace root so the standalone
// bundle carries the hoisted node_modules of the pnpm workspace. Build runs from app/ (pnpm --filter app build).
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  reactStrictMode: true,
};

export default nextConfig;
