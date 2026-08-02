import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell for the LOCAL flavour only ("Court Shuffle" on Google
 * Play). The GG flavour stays a plain PWA on GitHub Pages.
 *
 * ⚠️ appId, androidScheme and hostname are FROZEN as of v1.0:
 * IndexedDB is partitioned by WebView origin, which Capacitor derives from
 * scheme + hostname. Changing either in a later release silently orphans
 * every user's data. (P5 review #8)
 */
const config: CapacitorConfig = {
  appId: "uk.katsulabs.courtshuffle",
  appName: "Court Shuffle",
  webDir: "dist-local",
  android: {
    // Explicit defaults, pinned on purpose — see the freeze note above.
    // Origin: https://localhost
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
};

export default config;
