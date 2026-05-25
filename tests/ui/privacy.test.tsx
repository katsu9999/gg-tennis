import { describe, expect, it, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { PrivacyPage, resetPrivacyState } from "@/ui/pages/privacy";

beforeEach(() => {
  resetPrivacyState();
});

describe("PrivacyPage", () => {
  it("renders Japanese content by default", () => {
    const { getByTestId } = render(<PrivacyPage />);
    expect(getByTestId("privacy-body").textContent).toContain("プライバシーノーティス");
  });

  it("toggles to English when 'English' clicked", () => {
    const { getByTestId } = render(<PrivacyPage />);
    fireEvent.click(getByTestId("lang-en"));
    expect(getByTestId("privacy-body").textContent).toContain("Privacy Notice");
  });

  it("mentions UK GDPR data subject rights (deletion + export)", () => {
    const { getByTestId } = render(<PrivacyPage />);
    expect(getByTestId("privacy-body").textContent).toContain("削除権");
    fireEvent.click(getByTestId("lang-en"));
    expect(getByTestId("privacy-body").textContent).toContain("erasure");
  });

  it("references the EU/UK Supabase region", () => {
    const { getByTestId } = render(<PrivacyPage />);
    expect(getByTestId("privacy-body").textContent).toContain("London");
  });
});
