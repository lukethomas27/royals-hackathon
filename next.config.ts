import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this repo. Without it Next walks up to the
  // nearest lockfile, which on Luke's machine is a stray one in the OneDrive
  // Documents folder — the build then tries to resolve `react` from there and
  // times out on OneDrive cloud files (os error 426). Harmless on Vercel.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
