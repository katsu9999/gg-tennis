import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal } = await import("@preact/signals");
  return {
    listAllClubs: vi.fn().mockResolvedValue([
      { id: 1, slug: "gg", name: "Golders Green Tennis Club", locale: "ja", lineEnabled: true },
    ]),
    createNewClub: vi.fn().mockResolvedValue(2),
    pinStore: {
      isUnlocked: signal(true),
      verifying: signal(false),
      lastError: signal(null),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue("gg-pin-1"),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { ClubsPage, resetClubsState, slugFromName } from "@/ui/pages/clubs";
import { createNewClub } from "@/ui/stores";
import { currentClub, GG_CLUB } from "@/data/club";

beforeEach(() => {
  resetClubsState();
  vi.mocked(createNewClub).mockClear();
  currentClub.value = GG_CLUB;
});
afterEach(() => { currentClub.value = GG_CLUB; });

describe("ClubsPage（クラブの追加）", () => {
  it("クラブ名から URL 用の名前を作る", () => {
    expect(slugFromName("Hampstead Social Tennis")).toBe("hampstead-social-tennis");
    expect(slugFromName("  St. John's  ")).toBe("st-john-s");
  });

  it("名前・言語・PIN を入れると、GG の PIN を添えて作成する", async () => {
    const { getByTestId, findByTestId } = render(<ClubsPage />);
    await findByTestId("club-row-gg");
    fireEvent.input(getByTestId("club-name"), { target: { value: "Hampstead Social" } });
    fireEvent.input(getByTestId("club-pin"), { target: { value: "abcdef" } });
    fireEvent.input(getByTestId("club-pin2"), { target: { value: "abcdef" } });
    const btn = getByTestId("club-create") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => expect(createNewClub).toHaveBeenCalledWith({
      adminPin: "gg-pin-1", slug: "hampstead-social", name: "Hampstead Social", locale: "en", pin: "abcdef",
    }));
    await findByTestId("club-created");
  });

  it("PIN が6文字未満・確認と不一致なら作れない", () => {
    const { getByTestId } = render(<ClubsPage />);
    fireEvent.input(getByTestId("club-name"), { target: { value: "X Club" } });
    fireEvent.input(getByTestId("club-pin"), { target: { value: "abc" } });
    fireEvent.input(getByTestId("club-pin2"), { target: { value: "abc" } });
    expect((getByTestId("club-create") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(getByTestId("club-pin"), { target: { value: "abcdef" } });
    fireEvent.input(getByTestId("club-pin2"), { target: { value: "abcdeg" } });
    expect((getByTestId("club-create") as HTMLButtonElement).disabled).toBe(true);
  });

  it("GG 以外のクラブの画面からは使えない", () => {
    currentClub.value = { id: 2, slug: "hampstead", name: "Hampstead", locale: "en", lineEnabled: false };
    const { queryByTestId } = render(<ClubsPage />);
    expect(queryByTestId("club-create")).toBeNull();
  });
});

describe("GG 以外のクラブでは LINE を使わない", () => {
  it("lineAvailable は GG だけ true", async () => {
    const { lineAvailable } = await import("@/ui/line-notify");
    expect(lineAvailable()).toBe(true);
    currentClub.value = { id: 2, slug: "hampstead", name: "Hampstead", locale: "en", lineEnabled: false };
    expect(lineAvailable()).toBe(false);
  });
});

describe("プライバシー表記のクラブ名", () => {
  it("GG 以外ではクラブ名に差し替え、HTML は無害化する", async () => {
    const { privacyTextForClub } = await import("@/ui/pages/privacy");
    expect(privacyTextForClub("Golders Green Tennis Club — Contact")).toBe("Golders Green Tennis Club — Contact");
    currentClub.value = { id: 2, slug: "x", name: "A<b>&B", locale: "en", lineEnabled: false };
    expect(privacyTextForClub("Golders Green Tennis Club — Contact")).toBe("A&lt;b&gt;&amp;B — Contact");
  });
});
