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
    shortcuts: [
      { name: "My workspace", short_name: "Workspace", url: "/app", icons: [{ src: "/icons/jr-os-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Daily assistant", short_name: "JR AI", url: "/ai/assistant", icons: [{ src: "/icons/jr-os-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Quick quote", short_name: "Quote", url: "/quotes/mobile", icons: [{ src: "/icons/jr-os-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    icons: [
      { src: "/icons/jr-os-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/jr-os-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/jr-os-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
