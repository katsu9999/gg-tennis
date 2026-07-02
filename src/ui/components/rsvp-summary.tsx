import type { RsvpPublicRow } from "@/data/rsvp-repository";
import type { Member } from "@/engine/models";

interface Props {
  rsvps: RsvpPublicRow[];
  activeMembers: Member[];
  /** When set, "going" names are joined with comma; otherwise wrapped in pill chips. */
  layout?: "chips" | "lines";
}

export function RsvpSummary({ rsvps, activeMembers, layout = "lines" }: Props) {
  const byMemberId = new Map(activeMembers.map((m) => [m.id, m] as const));
  const byStatus = (s: RsvpPublicRow["status"]) =>
    rsvps
      .filter((r) => r.status === s)
      .map((r) => byMemberId.get(r.member_id)?.name ?? `#${r.member_id}`);

  const going = byStatus("going");
  const maybe = byStatus("maybe");
  const notGoing = byStatus("not_going");
  const answeredIds = new Set(rsvps.map((r) => r.member_id));
  const unanswered = activeMembers
    .filter((m) => !answeredIds.has(m.id))
    .map((m) => m.name);

  function fmt(names: string[]): string {
    return names.length === 0 ? "—" : names.join(", ");
  }

  if (layout === "chips") {
    return (
      <div data-testid="rsvp-summary-chips" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          ✅ <strong>行く ({going.length})</strong>:{" "}
          <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", verticalAlign: "middle" }}>
            {going.slice(0, 5).map((n) => (
              <span
                key={n}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  borderRadius: 99,
                  padding: "2px 10px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {n}
              </span>
            ))}
            {going.length > 5 && (
              <span class="muted" style={{ fontSize: 13, fontWeight: 700 }}>+{going.length - 5}</span>
            )}
            {going.length === 0 && <span class="muted">まだいません</span>}
          </span>
        </div>
        <div class="muted" style={{ fontSize: 13 }}>
          ❓ 未定 {maybe.length}人 · ❌ 行かない {notGoing.length}人 · ⬜ 未回答 {unanswered.length}人
        </div>
      </div>
    );
  }

  return (
    <div data-testid="rsvp-summary-lines">
      <p style={{ margin: "4px 0" }}>✅ <strong>行く ({going.length})</strong>: {fmt(going)}</p>
      <p style={{ margin: "4px 0" }}>❓ <strong>未定 ({maybe.length})</strong>: {fmt(maybe)}</p>
      <p style={{ margin: "4px 0" }}>❌ <strong>行かない ({notGoing.length})</strong>: {fmt(notGoing)}</p>
      <p style={{ margin: "4px 0" }} class="muted">⬜ 未回答 ({unanswered.length}): {fmt(unanswered)}</p>
    </div>
  );
}
