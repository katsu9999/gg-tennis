import { Capacitor } from "@capacitor/core";
import { currentPath } from "@/ui/router";

/**
 * Android hardware back button ↔ custom router bridge (local flavour only).
 *
 * The app uses its own pushState router (src/ui/router.ts); without this
 * listener Capacitor's default back behaviour exits the activity from any
 * screen. Policy: inner page → walk browser history (popstate updates
 * currentPath); home → minimize the app (Android convention).
 *
 * main.tsx only reaches this module under IS_LOCAL, so the GG bundle never
 * includes Capacitor code.
 */
export function decideBackAction(path: string): "minimize" | "historyBack" {
  return path === "/" || path === "" ? "minimize" : "historyBack";
}

export async function registerAndroidBackButton(): Promise<void> {
  // Plain-browser dev (`npm run dev:local`) has no native shell.
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", () => {
    if (decideBackAction(currentPath.value) === "minimize") {
      void App.minimizeApp();
    } else {
      history.back();
    }
  });
}
