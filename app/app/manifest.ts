import type { MetadataRoute } from "next";

/** The web app manifest (BUG_009): the name and icons an installed or docked app shows. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qwen Local",
    short_name: "Qwen Local",
    description: "A self-hosted image generation workstation",
    start_url: "/",
    display: "standalone",
    background_color: "#171717",
    theme_color: "#171717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
