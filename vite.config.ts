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

// クラブ専用の公開（VITE_FIXED_CLUB、例: ravens）では、ホーム画面のアプリ名と
// タブの題名をそのクラブのものにする（VITE_APP_NAME / VITE_APP_SHORT_NAME）。
const fixedClub = (process.env.VITE_FIXED_CLUB ?? "").trim();
const appName = process.env.VITE_APP_NAME?.trim() || "GG — Tennis Court Shuffle";
const appShortName = process.env.VITE_APP_SHORT_NAME?.trim() || "GG";
const appLang = fixedClub ? "en" : "ja";

const escapeHtml = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const htmlBrand: PluginOption = {
  name: "club-html-brand",
  transformIndexHtml: (html) =>
    html
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(appName)}</title>`)
      .replace('<html lang="ja">', `<html lang="${appLang}">`),
};

const pwaPlugin: PluginOption[] = isLocalFlavor
  ? []
  : [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/*"],
        manifest: {
          name: appName,
          short_name: appShortName,
          description: fixedClub ? "Fair court rotation for tennis clubs" : "テニスクラブの公平なコート割り振り",
          lang: appLang,
          theme_color: "#0b1410",
          background_color: "#eef1ea",
          display: "standalone",
          orientation: "any",
          // マニフェストの場所（Base 込み）からの相対。ホーム画面から開いたときは
          // ?pwa=1 を見て、最後に使ったクラブ（/c/<slug>）へ移る（main.tsx）。
          start_url: "./?pwa=1",
          scope: "./",
          icons: [
            // マニフェストからの相対（Base 込み）。"/icons/…" だと github.io 直下を見てしまう。
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
  plugins: [preact(), htmlBrand, ...pwaPlugin],
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
