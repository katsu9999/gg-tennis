import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    globals: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/engine/**", "src/data/**", "src/state/**"],
      exclude: ["src/main.tsx", "src/ui/**", "src/sw.ts", "**/*.d.ts"],
      thresholds: { lines: 80, statements: 80, branches: 75 },
    },
  },
});
