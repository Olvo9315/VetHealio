import { createRequire } from "module";
import createNextIntlPlugin from "next-intl/plugin";

const require = createRequire(import.meta.url);

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
