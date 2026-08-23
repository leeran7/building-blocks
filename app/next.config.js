/** @type {import('next').NextConfig} */
const path = require("path");
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
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
      "connect-src 'self' https://api.stripe.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://accounts.google.com",
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
      "@firebase/auth$": path.resolve(
        __dirname,
        "node_modules/.pnpm/node_modules/@firebase/auth/dist/esm2017/index.js"
      ),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
