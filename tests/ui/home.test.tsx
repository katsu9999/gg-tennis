import { describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { HomePage } from "@/ui/pages/home";
import { currentPath } from "@/ui/router";

describe("HomePage", () => {
  it("renders the GG header and next-session card", () => {
    const { getByText, getByTestId } = render(<HomePage />);
    expect(getByText("GG")).toBeDefined();
    expect(getByText("Tennis Court Shuffle")).toBeDefined();
    expect(getByTestId("next-session-card")).toBeDefined();
  });

  it("renders all 6 nav buttons", () => {
    const { getByText } = render(<HomePage />);
    expect(getByText("セッション開始 →")).toBeDefined();
    expect(getByText("将来セッション")).toBeDefined();
    expect(getByText("名簿")).toBeDefined();
    expect(getByText("ランキング")).toBeDefined();
    expect(getByText("過去セッション")).toBeDefined();
    expect(getByText("設定")).toBeDefined();
  });

  it("clicking 'セッション開始' navigates to /session/new", () => {
    const { getByText } = render(<HomePage />);
    fireEvent.click(getByText("セッション開始 →"));
    expect(currentPath.value).toBe("/session/new");
  });
});
