import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corhaus Pilates",
    short_name: "Corhaus",
    description: "Premium Pilates and wellness studio. Book your classes with ease.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F2", // brand-cream
    theme_color: "#1C1C2E", // brand-navy
    icons: [
      {
        src: "/icon-192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icon-192-maskable.jpg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "maskable",
      },
      {
        src: "/icon-512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}
