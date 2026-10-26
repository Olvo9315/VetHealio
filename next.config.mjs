import { createRequire } from "module";
import createNextIntlPlugin from "next-intl/plugin";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

// Release shown in the app and /api/version. Release deploys pass APP_RELEASE (the git tag);
// anything else is marked as a dev build of the package version.
const appRelease = process.env.APP_RELEASE || `v${pkg.version}-dev`;

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",
  },
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  buildExcludes: [/middleware-manifest\.json$/],
});

const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appRelease,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
};

export default withPWA(withNextIntl(nextConfig));
