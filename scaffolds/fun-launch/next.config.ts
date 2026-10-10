import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // DLMM SDK's ESM build has a directory import Node can't load as an external; bundle it instead
  transpilePackages: ['@meteora-ag/dlmm'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
