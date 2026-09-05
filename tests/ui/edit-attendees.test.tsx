import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_SHUFFLE_CONFIG } from "@/engine/shuffle-config";
import type { Member, Round } from "@/engine/models";

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");

  const members: Member[] = [
    { id: 1, name: "佐藤", status: "active", gender: "male", createdAt: new Date() },
    { id: 2, name: "山本", status: "active", gender: "female", createdAt: new Date() },
    { id: 3, name: "田中", status: "active", gender: "male", createdAt: new Date() },
    { id: 4, name: "鈴木", status: "active", gender: "female", createdAt: new Date() },
    { id: 5, name: "遅刻太郎", status: "active", gender: "male", createdAt: new Date() },
  ];

  const allSignal = signal(members);
  const activeSignal = computed(() => allSignal.value.filter((m) => m.status === "active"));

  return {
    rosterStore: {
      all: allSignal,
      active: activeSignal,
      archived: signal([] as Member[]),
      load: vi.fn().mockResolvedValue(undefined),
    },
    sessionStore: {
      session: signal(null),
      generating: signal(false),
      changeAttendees: vi.fn().mockResolvedValue({
        added: 1, left: 0, regeneratedFrom: 2, totalRounds: 6,
      }),
      resume: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/ui/line-notify", () => ({
  offerRemainingRoundsNotify: vi.fn().mockResolvedValue(undefined),
}));

import { render, fireEvent, waitFor, screen } from "@testing-library/preact";
import { EditAttendeesPage, resetEditAttendeesState } from "@/ui/pages/edit-attendees";
import { sessionStore, rosterStore } from "@/ui/stores";
import { offerRemainingRoundsNotify } from "@/ui/line-notify";
import { appDialog } from "@/ui/components/app-dialog";
import { currentPath } from "@/ui/router";

function makeRound(index: number): Round {
  return {
    index,
    courts: [
      {
        number: 1,
        type: "doubles",
        teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
        teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 4 }],
        winner: "none",
      },
    ],
    resters: [],
  };
}

/** 6ラウンド先出し済みで R2 を表示中（index 1）。参加は 1-4 番。 */
function makeSession(roundCount = 6, currentRoundIndex = 1) {
  return {
    id: "s1",
    status: "ongoing" as const,
    plannedSessionId: null,
    date: new Date(),
    location: "X",
    courtCount: 1,
    allowSingles: true,
    attendees: [1, 2, 3, 4].map((memberId, i) => ({
      ref: { kind: "member" as const, memberId },
      todayNumber: i + 1,
      isGuest: false,
    })),
    rounds: Array.from({ length: roundCount }, (_, i) => makeRound(i)),
    currentRoundIndex,
    todayStats: new Map(),
    prevResters: [],
    prevSingles: [],
    rngSeed: 1,
    hostToken: null,
    hostLabel: null,
    createdAt: "2026-05-31T08:00:00.000Z",
    shuffleConfig: DEFAULT_SHUFFLE_CONFIG,
  };
}

beforeEach(() => {
  resetEditAttendeesState();
  vi.mocked(sessionStore.changeAttendees).mockClear();
  vi.mocked(offerRemainingRoundsNotify).mockClear();
  vi.mocked(rosterStore.load).mockClear();
  sessionStore.session.value = makeSession();
  currentPath.value = "/session/attendees";
});

describe("EditAttendeesPage", () => {
  it("今の参加者だけが選択済みで、名簿の全員が並ぶ", async () => {
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());

    // 5人ぶんのボタン、選択済みは 1-4（背景が --ink）
    for (const id of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`edit-member-${id}`).style.background).toContain("--ink");
    }
    expect(screen.getByTestId("edit-member-5").style.background).toContain("--card");
  });

  it("組み直す先があるとき、どのラウンドから組み直すか出す", async () => {
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-attendees-hint")).toBeTruthy());
    // R2 表示中 → R2 まで維持、R3 以降を組み直し
    expect(screen.getByTestId("edit-attendees-hint").textContent).toContain("R2");
    expect(screen.getByTestId("edit-attendees-hint").textContent).toContain("R3");
  });

  it("最終ラウンドを表示中なら「次のラウンドから」と出す", async () => {
    sessionStore.session.value = makeSession(2, 1);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-attendees-hint")).toBeTruthy());
    expect(screen.getByTestId("edit-attendees-hint").textContent).toContain("次のラウンド");
  });

  it("変更がなければ反映ボタンは押せない", async () => {
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());
    expect((screen.getByTestId("apply-attendees-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("途中から来た人を足して反映すると、追加後の全員で changeAttendees を呼ぶ", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(true);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());

    fireEvent.click(screen.getByTestId("edit-member-5"));
    fireEvent.click(screen.getByTestId("apply-attendees-btn"));

    await waitFor(() => expect(sessionStore.changeAttendees).toHaveBeenCalled());
    const arg = vi.mocked(sessionStore.changeAttendees).mock.calls[0]![0];
    expect([...arg.memberIds].sort()).toEqual([1, 2, 3, 4, 5]);
    confirmSpy.mockRestore();
  });

  it("途中で帰る人を外して反映すると、その人を除いた全員で呼ぶ", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(true);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-4")).toBeTruthy());

    fireEvent.click(screen.getByTestId("edit-member-4"));
    fireEvent.click(screen.getByTestId("apply-attendees-btn"));

    await waitFor(() => expect(sessionStore.changeAttendees).toHaveBeenCalled());
    const arg = vi.mocked(sessionStore.changeAttendees).mock.calls[0]![0];
    expect([...arg.memberIds].sort()).toEqual([1, 2, 3]);
    confirmSpy.mockRestore();
  });

  it("キャンセルしたら何も変えない", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(false);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());

    fireEvent.click(screen.getByTestId("edit-member-5"));
    fireEvent.click(screen.getByTestId("apply-attendees-btn"));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(sessionStore.changeAttendees).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("組み直したら LINE 再送を提案し、ラウンド画面に戻る", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(true);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());

    fireEvent.click(screen.getByTestId("edit-member-5"));
    fireEvent.click(screen.getByTestId("apply-attendees-btn"));

    await waitFor(() => expect(offerRemainingRoundsNotify).toHaveBeenCalledWith(2));
    await waitFor(() => expect(currentPath.value).toBe("/session/round"));
    confirmSpy.mockRestore();
  });

  it("組み直しがなければ LINE 再送は聞かない", async () => {
    vi.mocked(sessionStore.changeAttendees).mockResolvedValueOnce({
      added: 1, left: 0, regeneratedFrom: null, totalRounds: 2,
    });
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(true);
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-5")).toBeTruthy());

    fireEvent.click(screen.getByTestId("edit-member-5"));
    fireEvent.click(screen.getByTestId("apply-attendees-btn"));

    await waitFor(() => expect(currentPath.value).toBe("/session/round"));
    expect(offerRemainingRoundsNotify).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("2人未満になる選択では反映できない", async () => {
    render(<EditAttendeesPage />);
    await waitFor(() => expect(screen.getByTestId("edit-member-4")).toBeTruthy());

    for (const id of [2, 3, 4]) fireEvent.click(screen.getByTestId(`edit-member-${id}`));

    expect((screen.getByTestId("apply-attendees-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});
