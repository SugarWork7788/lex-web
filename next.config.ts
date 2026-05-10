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
  // PDF-01 / Phase 2 plan 02-03 — pin the @sparticuz/chromium binary into the
  // Vercel function bundle for /api/audit/pdf. NFT static analysis can't see
  // through chromium.executablePath() (computed at runtime), so we explicitly
  // include the brotli archives via this glob.
  //
  // Top-level key per Next 16 (verified against
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  // line 90 — was under `experimental.*` in Next 14, promoted to stable since v15).
  //
  // If first deploy fails with "Could not find Chromium (rev. ...)", widen the
  // glob to also include `node_modules/@sparticuz/chromium/lib/**/*` per
  // RESEARCH §Pitfall 3.
  //
  // Do NOT add `serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"]`
  // — Next 16 auto-externalises both packages out of the box.
  outputFileTracingIncludes: {
    "/api/audit/pdf": ["node_modules/@sparticuz/chromium/bin/**/*"],
  },
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
