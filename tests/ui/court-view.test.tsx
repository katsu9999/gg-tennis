import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { CourtView } from "@/ui/components/court-view";
import type { AttendeeRef, Court } from "@/engine/models";

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });

const baseCourt: Court = {
  number: 1,
  type: "doubles",
  teamA: [ref(1), ref(2)],
  teamB: [ref(3), ref(4)],
  winner: "none",
};

const todayNumbers = { 1: 7, 2: 3, 3: 1, 4: 5 };
const noNames = () => null;

describe("CourtView", () => {
  it("renders the court-type tag and 4 today-numbers in doubles", () => {
    const { getByText } = render(
      <CourtView court={baseCourt} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={() => {}} />,
    );
    expect(getByText("ダブルス")).toBeDefined();
    expect(getByText("7")).toBeDefined();
    expect(getByText("3")).toBeDefined();
    expect(getByText("1")).toBeDefined();
    expect(getByText("5")).toBeDefined();
    expect(getByText(/COURT 1/)).toBeDefined();
  });

  it("renders the singles tag when court.type is singles", () => {
    const court: Court = { ...baseCourt, type: "singles", teamA: [ref(1)], teamB: [ref(2)] };
    const { getByText } = render(
      <CourtView court={court} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={() => {}} />,
    );
    expect(getByText("シングルス")).toBeDefined();
  });

  it("calls onSetWinner('A') when team A button tapped", () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <CourtView court={baseCourt} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={fn} />,
    );
    fireEvent.click(getByTestId("team-a"));
    expect(fn).toHaveBeenCalledWith("A");
  });

  it("calls onSetWinner('B') when team B button tapped", () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <CourtView court={baseCourt} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={fn} />,
    );
    fireEvent.click(getByTestId("team-b"));
    expect(fn).toHaveBeenCalledWith("B");
  });

  it("emits null when tapping team A that is already the winner (deselect)", () => {
    const fn = vi.fn();
    const won: Court = { ...baseCourt, winner: "A" };
    const { getByTestId } = render(
      <CourtView court={won} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={fn} />,
    );
    fireEvent.click(getByTestId("team-a"));
    expect(fn).toHaveBeenCalledWith(null);
  });

  it("emits null when tapping team B that is already the winner (deselect)", () => {
    const fn = vi.fn();
    const won: Court = { ...baseCourt, winner: "B" };
    const { getByTestId } = render(
      <CourtView court={won} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={fn} />,
    );
    fireEvent.click(getByTestId("team-b"));
    expect(fn).toHaveBeenCalledWith(null);
  });

  it("emits 'B' when tapping team B while A is currently the winner (switch)", () => {
    const fn = vi.fn();
    const won: Court = { ...baseCourt, winner: "A" };
    const { getByTestId } = render(
      <CourtView court={won} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={fn} />,
    );
    fireEvent.click(getByTestId("team-b"));
    expect(fn).toHaveBeenCalledWith("B");
  });

  it("renders ✓ on the winning side when winner='A'", () => {
    const won: Court = { ...baseCourt, winner: "A" };
    const { container } = render(
      <CourtView court={won} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={() => {}} />,
    );
    const a = container.querySelector('[data-testid="team-a"]')!;
    expect(a.textContent).toContain("✓");
  });

  it("renders names when showNames=true and nameFor returns a string", () => {
    const names: Record<number, string> = { 1: "佐藤", 2: "山本", 3: "田中", 4: "鈴木" };
    const nameFor = (r: AttendeeRef) => (r.kind === "member" ? names[r.memberId] ?? null : null);
    const { getByText } = render(
      <CourtView court={baseCourt} todayNumbers={todayNumbers} nameFor={nameFor} onSetWinner={() => {}} showNames />,
    );
    expect(getByText("佐藤")).toBeDefined();
    expect(getByText("山本")).toBeDefined();
  });

  it("falls back to G for guests when showNames is false", () => {
    const guestCourt: Court = {
      ...baseCourt,
      teamA: [ref(1), { kind: "guest", guestId: "g1" }],
    };
    const { container } = render(
      <CourtView court={guestCourt} todayNumbers={todayNumbers} nameFor={noNames} onSetWinner={() => {}} />,
    );
    expect(container.textContent).toContain("G");
  });
});
