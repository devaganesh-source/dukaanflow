
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DukaanFlow — Retailer Ordering",
    short_name: "DukaanFlow",
    description:
      "Fast, AI-assisted FMCG ordering for retailers and distributors.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f4",
    theme_color: "#176b52",
    icons: [
      {
        src: "/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
