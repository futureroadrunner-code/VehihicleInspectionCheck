import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ASCA Vehicle Check",
    short_name: "Vehicle Check",
    description: "Daily vehicle inspection. Saved on the phone; the week goes to the office after Friday.",
    start_url: "/check",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f8f8",
    theme_color: "#f8f8f8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
