import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    globals: true,
    environment: "jsdom",
    coverage: { reporter: ["text", "html"], lines: 80, statements: 80, branches: 75 },
  },
});
