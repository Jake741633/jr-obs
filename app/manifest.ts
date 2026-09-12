import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JR OS",
    short_name: "JR OS",
    description: "Your JR Electrical Services workspace for the office and on site.",
    lang: "en-GB",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icons/jr-os-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/jr-os-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/jr-os-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
