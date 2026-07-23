import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pglhlesnyfncaupiwkwz.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
