const allowedOrigins = [
  "192.168.10.27:3002",
  "192.168.10.27",
  "172.20.0.91",
  "localhost:3002",
  "localhost",
];

if (process.env.APP_URL) {
  try {
    const url = new URL(process.env.APP_URL);
    if (!allowedOrigins.includes(url.host)) {
      allowedOrigins.push(url.host);
    }
    if (url.hostname && !allowedOrigins.includes(url.hostname)) {
      allowedOrigins.push(url.hostname);
    }
  } catch (e) {
    // Ignore invalid URL
  }
}

// Zoom's Meeting SDK loads its JS/WASM/media from *.zoom.us and opens its own
// websocket connections there, so the CSP below allows that origin broadly
// rather than pinning exact subdomains (they vary by data-center, e.g.
// us04st1.zoom.us) — a narrower allowlist would risk silently breaking calls
// on a region we didn't test. 'unsafe-inline'/'unsafe-eval' on script-src are
// required because Next.js injects inline hydration scripts without a nonce
// today, and the Zoom SDK itself needs eval for its WASM bootstrap.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.zoom.us",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.zoom.us wss://*.zoom.us",
  "media-src 'self' blob: https://*.zoom.us",
  "frame-src 'self' https://*.zoom.us",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We rely on `tsc` for type safety; don't let lint block production builds.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Board papers can be large; allow bigger server action payloads.
    serverActions: {
      bodySizeLimit: "25mb",
      allowedOrigins,
    },
  },
  webpack: (config) => {
    // @zoom/meetingsdk's bundle has a conditional require for
    // "@zoom/download-manager" (an optional offline-asset helper that is not
    // published to npm and is never reached in the browser). Webpack still tries
    // to resolve it and fails the whole build, so map it to an empty module.
    config.resolve.alias = { ...config.resolve.alias, "@zoom/download-manager": false };
    return config;
  },
  async headers() {
    return [
      {
        // The embedded Zoom call needs SharedArrayBuffer for gallery view
        // (multiple video tiles at once), which browsers only expose on a
        // cross-origin isolated page. These MUST be site-wide, not scoped to
        // the room route: crossOriginIsolated is fixed when the DOCUMENT
        // loads, and with SPA navigation the live document may have been
        // loaded from any URL (login, dashboard, …) before the user clicks
        // into the room — scoping the headers to the room route left gallery
        // view capped at one video tile unless the user happened to hard
        // refresh on the room page itself. COEP is `credentialless` rather
        // than `require-corp` because the Meeting SDK loads its WebAssembly
        // from Zoom's CDN, which `require-corp` would block.
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Permissions-Policy", value: "display-capture=(self)" },
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
