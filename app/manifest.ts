import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Resume Interview Coach",
    short_name: "Interview Coach",
    description: "Resume-aware mock interviews, voice practice, coding exercises, and readiness reports.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8f7",
    theme_color: "#0e746a",
    orientation: "portrait-primary",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
