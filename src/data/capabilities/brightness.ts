export interface Brightness {
  isSupported(): boolean;
  setMax(): Promise<void>;
  reset(): Promise<void>;
}

/**
 * Web implementation: noop, since browsers cannot control screen brightness.
 * UI shows a hint instead. v1.5 Capacitor swaps this for a native plugin
 * that actually drives the device brightness slider.
 */
export function createWebBrightness(): Brightness {
  return {
    isSupported() { return false; },
    async setMax() { /* noop on Web — UI shows a manual-brightness hint */ },
    async reset() { /* noop */ },
  };
}
