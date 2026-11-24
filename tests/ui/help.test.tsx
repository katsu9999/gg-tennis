import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { HelpPage } from "@/ui/pages/help";
import { currentClub, GG_CLUB } from "@/data/club";
import { en, ja, setLocale } from "@/ui/i18n";
import { matchRouteFor } from "@/ui/router";

const RAVENS = { id: 2, slug: "ravens", name: "Ravens", locale: "en" as const, lineEnabled: false };

afterEach(() => {
  currentClub.value = GG_CLUB;
  setLocale("ja");
});

describe("HelpPage", () => {
  it("GG: Japanese, with the entry-PIN note and the LINE note", () => {
    const { getByTestId, getByText } = render(<HelpPage />);
    expect(getByTestId("help-page").textContent).toContain("使い方");
    expect(getByTestId("help-gg-entry")).toBeTruthy();
    expect(getByTestId("help-line")).toBeTruthy();
    expect(getByText(ja.help.sections[0]!.title)).toBeTruthy();
  });

  it("another club: English, club name, no GG-only notes", () => {
    currentClub.value = RAVENS;
    setLocale("en");
    const { getByTestId, queryByTestId, getByText } = render(<HelpPage />);
    const text = getByTestId("help-page").textContent ?? "";
    expect(text).toContain("Ravens");
    expect(text).toContain("How to use");
    expect(text).not.toMatch(/[ぁ-んァ-ン一-龯]/);
    expect(text).not.toContain("GG");
    expect(queryByTestId("help-gg-entry")).toBeNull();
    expect(queryByTestId("help-line")).toBeNull();
    for (const s of en.help.sections) expect(getByText(s.title)).toBeTruthy();
  });

  it("both languages have the same sections and item counts", () => {
    expect(en.help.sections.map((s) => s.items.length)).toEqual(ja.help.sections.map((s) => s.items.length));
  });
});

describe("help route", () => {
  it("is /help on the server build and hidden in the local build", () => {
    expect(matchRouteFor("/help", "gg")).toEqual({ name: "help" });
    expect(matchRouteFor("/help", "local")).toEqual({ name: "home" });
  });
});
