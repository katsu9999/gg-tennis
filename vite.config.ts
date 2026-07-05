import { defineConfig, type PluginOption } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// "local" = device-only Google Play flavour ("Court Shuffle"). The alias
// below swaps the composition root so the Supabase client never enters the
// local bundle (enforced by tests/data/local-flavor-guard.test.ts); the PWA
// plugin is dropped because the Capacitor shell owns app updates — no
// service worker means no stale-cache class of bugs.
const isLocalFlavor = process.env.VITE_FLAVOR === "local";

const pwaPlugin: PluginOption[] = isLocalFlavor
  ? []
  : [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/*"],
        manifest: {
          name: "GG — Tennis Court Shuffle",
          short_name: "GG",
          description: "テニスクラブの公平なコート割り振り",
          theme_color: "#0b1410",
          background_color: "#eef1ea",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Default cache for static assets; runtime cache for Supabase REST.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => /\.supabase\.co\/rest\//.test(url.href),
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-api",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
      }),
    ];

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? "/",
  plugins: [preact(), ...pwaPlugin],
  resolve: {
    alias: [
      // Must come before the generic "@" alias: exact-match the composition
      // root so the local flavour wires local repositories/stores.
      ...(isLocalFlavor
        ? [{ find: /^@\/ui\/stores$/, replacement: path.resolve(__dirname, "src/ui/stores.local.ts") }]
        : []),
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  build: { target: "es2022", sourcemap: true },
  server: { port: 5173 },
});
