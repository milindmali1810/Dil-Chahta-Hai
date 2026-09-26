import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vacation photos: serve AVIF (smallest) to phones that support it, WebP otherwise.
  images: { formats: ["image/avif", "image/webp"] },
  // A3: the organiser link carries a secret token in its URL, so never send the
  // URL to other sites (Referer) and keep every page out of search engines.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
