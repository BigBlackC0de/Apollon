import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Données locales et mutables (SQLite) : rendu dynamique classique, pas de Cache Components.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3"],
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
