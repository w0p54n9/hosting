import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle, so it can run on cPanel (WHC) without a build step there.
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  // The host's LiteSpeed web server will otherwise keep its own copy of pages Next marks as static
  // (s-maxage) and serve that stale copy even after a new version is deployed. Tell it not to.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-LiteSpeed-Cache-Control', value: 'no-cache' }] }];
  },
};

export default nextConfig;
