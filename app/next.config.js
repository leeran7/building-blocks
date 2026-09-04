/** @type {import('next').NextConfig} */
const path = require("path");
const { createRequire } = require("module");

// Node's package "exports" block require.resolve of dist/esm2017/index.js.
// Resolve the package root, then join the browser ESM file the webpack alias
// needs (Next SWC cannot parse undici private fields in the Node ESM entry).
function resolveFirebaseAuthBrowserEsm() {
  const firebaseRequire = createRequire(require.resolve("firebase/package.json"));
  const authRoot = path.dirname(firebaseRequire.resolve("@firebase/auth/package.json"));
  return path.join(authRoot, "dist/esm2017/index.js");
}

const securityHeaders = [
  // SAMEORIGIN (not DENY): Firebase's auth handler, proxied onto our own domain
  // via the /__/auth rewrites below, frames /__/auth/iframe same-origin.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.stripe.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com wss://*.firebaseio.com",
      // 'self' — the auth handler is proxied onto our own domain (/__/auth), so
      // its iframe is same-origin. Plus Stripe, Google, and the Firebase domain.
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://*.firebaseapp.com https://apis.google.com",
    ].join("; "),
  },
];

const nextConfig = {
  experimental: {},
  transpilePackages: ["firebase", "@firebase/auth", "@firebase/app", "@firebase/storage", "@firebase/firestore"],
  webpack: (config) => {
    // next-flight-client-module-loader (RSC) also runs on server webpack for
    // client components, resolving @firebase/auth → node-esm/index.js → undici
    // (uses private class fields, incompatible with Next.js 14 SWC transform).
    // Alias to browser ESM bundle in BOTH server and client webpack configs.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@firebase/auth$": resolveFirebaseAuthBrowserEsm(),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Belt-and-suspenders on top of robots.txt's disallow: an HTTP-level
        // noindex means compliant crawlers that already indexed an admin URL
        // (or ignore robots.txt) still won't list it, since this applies
        // regardless of the client-side auth gate in admin/social/layout.tsx.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
  // Serve Firebase Auth's handler on our own domain so authDomain can be
  // www.doomstack.lol (recommended for signInWithRedirect — avoids Safari
  // third-party-cookie breakage). Proxies the __/auth + __/firebase helper
  // paths to the Firebase project. Keep the target in sync with the project id.
  async rewrites() {
    const fbHost = "https://building-blocks-88190.firebaseapp.com";
    return [
      { source: "/__/auth/:path*", destination: `${fbHost}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${fbHost}/__/firebase/:path*` },
    ];
  },
  // Canonical host is www.doomstack.lol (PUBLIC_CONFIG.siteUrl). Redirect the
  // apex to it so search engines never see both as separate indexable hosts.
  // No-op if the apex isn't pointed at this Vercel project.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "doomstack.lol" }],
        destination: "https://www.doomstack.lol/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
