import type { NextConfig } from "next";

const localAssetOrigin = process.env.LOCAL_ASSET_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Enable standalone output for Plesk deployment
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gafiwshop.xyz",
      },
      {
        protocol: "https",
        hostname: "cdn-icons-png.flaticon.com",
      },
      {
        protocol: "https",
        hostname: "img5.pic.in.th",
      },
      {
        protocol: "https",
        hostname: "img1.pic.in.th",
      },
      {
        protocol: "https",
        hostname: "img2.pic.in.th",
      },
      {
        protocol: "https",
        hostname: "img.rdcw.co.th",
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ]
  },
  async rewrites() {
    if (!localAssetOrigin) {
      return [];
    }

    return [
      {
        source: "/uploads/:path*",
        destination: `${localAssetOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
