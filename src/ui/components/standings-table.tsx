import type { AttendeeRef, Round } from "@/engine/models";
import { computeStandings, hasAnyResult } from "@/engine/standings";
import { t } from "@/ui/i18n";

/** その日の順位表（勝敗だけで決まる。年間ランキングとは別）。 */
export function StandingsTable(props: {
  rounds: readonly Pick<Round, "courts">[];
  attendees: readonly { ref: AttendeeRef; todayNumber: number; guestName?: string }[];
  nameFor: (ref: AttendeeRef) => string | null;
  testId?: string;
}) {
  if (!hasAnyResult(props.rounds)) {
    return <p class="muted" style={{ fontSize: 13 }}>{t.standings.empty}</p>;
  }
  const rows = computeStandings(props.rounds, props.attendees);
  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank));
  const cell = { padding: "4px 6px", borderBottom: "1px solid var(--line)" } as const;
  return (
    <table data-testid={props.testId ?? "standings"} style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
          <th style={cell}>{t.standings.rank}</th>
          <th style={cell}>{t.standings.player}</th>
          <th style={{ ...cell, textAlign: "right" }}>{t.standings.wins}</th>
          <th style={{ ...cell, textAlign: "right" }}>{t.standings.losses}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const a = props.attendees.find((x) => JSON.stringify(x.ref) === JSON.stringify(r.ref));
          const name = props.nameFor(r.ref) ?? a?.guestName ?? t.standings.guest;
          return (
            <tr key={JSON.stringify(r.ref)} data-testid="standings-row">
              <td style={{ ...cell, fontWeight: 800, width: 40 }}>{medal(r.rank)}</td>
              <td style={cell}>
                <span class="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{r.todayNumber}</span> {name}
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{r.wins}</td>
              <td style={{ ...cell, textAlign: "right" }}>{r.losses}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
