import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

describe("third-party resource guard (GDPR §17.5)", () => {
  it("index.html does not pull fonts/scripts/images from external origins", () => {
    const html = readFileSync("index.html", "utf8");
    // Catch both `https?://...` and protocol-relative `//host/...`
    const externalRefs = html.match(/(href|src)=["'](?:https?:)?\/\/[^"']+/gi) ?? [];
    expect(externalRefs).toEqual([]);
  });

  it("no source file imports from third-party fonts, CDNs, or trackers", () => {
    const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "src/**/*.css" "*.html"', { encoding: "utf8" })
      .split("\n").filter(Boolean);
    const bad: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      if (/fonts\.(googleapis|gstatic)\.com/.test(content)) bad.push(f);
      if (/cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/.test(content)) bad.push(f);
      if (/google-analytics\.com|googletagmanager\.com/.test(content)) bad.push(f);
      if (/hotjar\.com|fullstory\.com|logrocket\.com/.test(content)) bad.push(f);
      if (/mixpanel\.com|segment\.(io|com)|amplitude\.com/.test(content)) bad.push(f);
      if (/sentry\.io|bugsnag\.com|datadoghq\.com/.test(content)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
