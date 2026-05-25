/** Reads the `from` query parameter from the current page URL. */
export function getFromParam(): string | null {
  return new URLSearchParams(window.location.search).get("from");
}
