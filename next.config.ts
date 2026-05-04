import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/court", destination: "/courts", permanent: true },
      { source: "/court/:path*", destination: "/courts/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
