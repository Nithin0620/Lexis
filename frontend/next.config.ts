import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Turbopack CSS loader */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
