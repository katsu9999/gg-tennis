import type { JSX } from "preact";
import type { AttendeeRef, Court } from "@/engine/models";

export interface CourtViewProps {
  court: Court;
  /** memberId → todayNumber lookup. Guests use guestName fallback. */
  todayNumbers: Record<number, number>;
  /** ref → name. Null if not resolvable. */
  nameFor: (ref: AttendeeRef) => string | null;
  onSetWinner: (winner: "A" | "B" | null) => void;
  showNames?: boolean;
  /** When false, team sides render as plain display (no winner taps).
   *  The local flavour cuts winner recording entirely. Default true. */
  winnerTapEnabled?: boolean;
}

function refLabel(
  ref: AttendeeRef,
  todayNumbers: Record<number, number>,
  nameFor: (ref: AttendeeRef) => string | null,
  showNames?: boolean,
): string {
  if (showNames) {
    const n = nameFor(ref);
    if (n) return n;
  }
  if (ref.kind === "member") {
    const num = todayNumbers[ref.memberId];
    return num != null ? String(num) : "?";
  }
  return "G";
}

export function CourtView(props: CourtViewProps) {
  const { court, todayNumbers, nameFor, onSetWinner, showNames, winnerTapEnabled = true } = props;
  const winA = court.winner === "A";
  const winB = court.winner === "B";
  const tap = (winner: "A" | "B" | null) => {
    if (winnerTapEnabled) onSetWinner(winner);
  };

  const sideStyleBase: JSX.CSSProperties = {
    border: "none",
    padding: "10px 8px",
    margin: 0,
    borderRadius: 10,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    gap: 6,
    minHeight: 64,
    cursor: winnerTapEnabled ? "pointer" : "default",
  };

  const teamAStyle: JSX.CSSProperties = {
    ...sideStyleBase,
    background: winA ? "var(--lime)" : "rgba(11, 20, 16, 0.20)",
    color: winA ? "var(--ink)" : "#fff",
    position: "relative",
  };

  const teamBStyle: JSX.CSSProperties = {
    ...sideStyleBase,
    background: winB ? "var(--lime)" : "#fff",
    color: "var(--ink)",
    position: "relative",
  };

  return (
    <div class="card" style={{ marginBottom: 8, padding: 8 }} data-court-number={court.number}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <strong style={{ letterSpacing: "0.05em", fontSize: 13 }}>COURT {court.number}</strong>
        <span class={court.type === "doubles" ? "tag-d" : "tag-s"} style={{ fontSize: 11 }}>
          {court.type === "doubles" ? "ダブルス" : "シングルス"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          background: "var(--green)",
          borderRadius: 12,
          padding: 6,
          border: "3px solid #fff",
          boxShadow: "inset 0 0 0 1px var(--green)",
          position: "relative",
        }}
      >
        <button
          type="button"
          data-testid="team-a"
          aria-label="Team A wins"
          onClick={() => tap(winA ? null : "A")}
          style={teamAStyle}
        >
          {winA && (
            <span aria-hidden style={{ position: "absolute", top: 6, left: 8, fontSize: 16, fontWeight: 900 }}>
              ✓
            </span>
          )}
          {court.teamA.map((r, i) => (
            <span key={i} class="number-badge">{refLabel(r, todayNumbers, nameFor, showNames)}</span>
          ))}
        </button>
        <button
          type="button"
          data-testid="team-b"
          aria-label="Team B wins"
          onClick={() => tap(winB ? null : "B")}
          style={teamBStyle}
        >
          {winB && (
            <span aria-hidden style={{ position: "absolute", top: 6, right: 8, fontSize: 16, fontWeight: 900 }}>
              ✓
            </span>
          )}
          {court.teamB.map((r, i) => (
            <span key={i} class="number-badge">{refLabel(r, todayNumbers, nameFor, showNames)}</span>
          ))}
        </button>
      </div>
    </div>
  );
}
