import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      // Next's development runtime uses eval-backed source maps and a local
      // HMR WebSocket. Keep those allowances out of production builds.
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
      // Safari/WebKit rewrites even 127.0.0.1 and LAN assets to https here, which
      // leaves the plain-http dev server unstyled on iPhones and in WebKit tests.
      ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // graphile-worker loads presets and task files through dynamic requires.
  serverExternalPackages: ["graphile-worker"],
  // The app is normally opened through 127.0.0.1 in local development.
  // Next 16 otherwise refuses the development HMR resource as cross-origin,
  // which leaves client components rendered but not interactive.
  // DEV_LAN_ORIGINS (comma-separated hosts, e.g. a Mac's Wi-Fi IP) lets a phone on the
  // same network open the dev server and hydrate.
  allowedDevOrigins: ["127.0.0.1", "localhost", ...(process.env.DEV_LAN_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean) ?? [])],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
