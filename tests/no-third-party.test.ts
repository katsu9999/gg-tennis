import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

describe("third-party resource guard (GDPR §17.5)", () => {
  it("index.html does not pull fonts/scripts/images from external origins", () => {
    const html = readFileSync("index.html", "utf8");
    const externalRefs = html.match(/(href|src)=["']https?:\/\/[^"']+/gi) ?? [];
    expect(externalRefs).toEqual([]);
  });

  it("no source file imports from Google Fonts or CDN", () => {
    const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "src/**/*.css" "*.html"', { encoding: "utf8" })
      .split("\n").filter(Boolean);
    const bad: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      if (/fonts\.(googleapis|gstatic)\.com/.test(content)) bad.push(f);
      if (/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/.test(content)) bad.push(f);
      if (/google-analytics\.com|googletagmanager\.com/.test(content)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
