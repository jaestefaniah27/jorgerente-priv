import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 ships a native addon; keep it out of the server bundle
  // and require()'d at runtime instead.
  serverExternalPackages: ["better-sqlite3"],

  async headers() {
    return [
      {
        // The worker lives at /kanban/sw.js, so by default it could only
        // claim the "/kanban/" scope — which does not cover the global view
        // at "/kanban" (no trailing slash). This header lets it register
        // one level up so it covers the whole module.
        source: "/kanban/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/kanban" }],
      },
    ];
  },
};

export default nextConfig;
