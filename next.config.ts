import type { NextConfig } from "next";

// CSP designed to be safe with Next.js + React + Tailwind:
//   - script: 'self' + 'unsafe-inline' + 'unsafe-eval' (Next.js needs both for
//     runtime hydration on the App Router; tightening to nonces is a follow-up).
//   - style: 'self' + 'unsafe-inline' (Tailwind injects styles inline at build).
//   - img: data:/blob:/https: (Supabase storage, external thumbnails).
//   - connect: 'self' + Supabase host + Resend host (for first-party fetch only).
//   - frame-ancestors 'none' replaces and is stricter than X-Frame-Options.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.resend.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/court", destination: "/courts", permanent: true },
      { source: "/court/:path*", destination: "/courts/:path*", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
