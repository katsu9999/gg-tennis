import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { target: "es2022", sourcemap: true },
  server: { port: 5173 },
});
