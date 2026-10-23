import type { MetadataRoute } from "next";

// Makes Inkfight installable ("Add to Home screen" / "Install app"): opens full
// screen without the browser bar, like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inkfight",
    short_name: "Inkfight",
    description: "Draw a stick figure. Scan it. Make it fight.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
