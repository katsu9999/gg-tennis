// scripts/generate-placeholder-icons.mjs
// Generates placeholder PNG icons for PWA manifest.
// IMPORTANT: Replace these with real artwork before launch.
// The operator should generate proper 192×192 and 512×512 PNGs.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const ICON_DIR = "public/icons";
mkdirSync(ICON_DIR, { recursive: true });

// 1×1 transparent PNG, 67 bytes
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const FILES = ["icon-192.png", "icon-512.png", "icon-maskable.png"];
for (const f of FILES) {
  const path = `${ICON_DIR}/${f}`;
  if (existsSync(path)) continue;
  writeFileSync(path, PNG_BYTES);
  console.log(`wrote ${path}`);
}
