import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle, so it can run on cPanel (WHC) without a build step there.
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
