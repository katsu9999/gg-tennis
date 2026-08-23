import type { MatchResult, Member } from "@/engine/models";
import type { SessionAttendance } from "@/engine/ranking";
import type { RsvpPublicRow } from "./rsvp-repository";

/**
 * Per-member data export schema. Versioned so a future change can be detected
 * by consumers (e.g. when v1.5 adds member-auth and per-RSVP edit history).
 */
export interface MemberExport {
  schemaVersion: 1;
  exportedAt: string;
  member: Member;
  attendance: { sessionId: string; date: string; location: string }[];
  matchesParticipated: {
    sessionId: string;
    team: "A" | "B";
    teammates: number[];
    opponents: number[];
    winner: "A" | "B";
    at: string;
  }[];
  rsvps: {
    plannedSessionId: string;
    status: RsvpPublicRow["status"];
    note: string | null;
    updatedAt: string;
  }[];
}

/**
 * Pure aggregator. Takes already-loaded raw data and produces the export
 * schema. No I/O — fully unit-testable.
 */
export function buildMemberExport(input: {
  member: Member;
  /** All sessions where this member may have appeared (caller fetches; we filter). */
  sessions: (SessionAttendance & { location: string })[];
  /** All matches (caller fetches; we filter to ones involving the member). */
  matches: MatchResult[];
  /** All RSVPs for this member (caller pre-filtered). */
  rsvps: RsvpPublicRow[];
}): MemberExport {
  const { member, sessions, matches, rsvps } = input;

  const attendance = sessions
    .filter((s) => s.attendeeMemberIds.includes(member.id))
    .map((s) => ({
      sessionId: s.sessionId,
      date: s.date.toISOString(),
      location: s.location,
    }));

  const matchesParticipated = matches
    .filter((m) => m.teamA.includes(member.id) || m.teamB.includes(member.id))
    .map((m) => {
      const onA = m.teamA.includes(member.id);
      const ownTeam = onA ? m.teamA : m.teamB;
      const otherTeam = onA ? m.teamB : m.teamA;
      return {
        sessionId: m.sessionId,
        team: (onA ? "A" : "B") as "A" | "B",
        teammates: ownTeam.filter((id) => id !== member.id),
        opponents: otherTeam,
        winner: m.winner,
        at: m.at.toISOString(),
      };
    });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    member,
    attendance,
    matchesParticipated,
    rsvps: rsvps
      .filter((r) => r.member_id === member.id)
      .map((r) => ({
        plannedSessionId: r.planned_session_id,
        status: r.status,
        note: r.note,
        updatedAt: r.updated_at,
      })),
  };
}

/**
 * Side-effecty: fetches the member, sessions, matches, and rsvps from Supabase,
 * then synthesises a download in the browser. Throws on any DB error.
 */
export async function exportMemberData(memberId: number): Promise<void> {
  // Defensive: the local flavour hides the per-member export button (its
  // settings page has a whole-device export instead) — fail loudly if some
  // future code path reaches this anyway.
  const { IS_LOCAL } = await import("@/flavor");
  if (IS_LOCAL) throw new Error("per-member export is not available in the local flavour");
  // Lazy import: a static one would evaluate supabase-client at module load,
  // which throws without VITE_SUPABASE_* env — the local (device-only)
  // flavour bundles this page module but must never execute this path.
  const { supabase } = await import("./supabase-client");
  const [memberRes, sessionsRes, matchesRes, rsvpsRes] = await Promise.all([
    supabase.from("members").select("*").eq("id", memberId).single(),
    supabase.from("sessions").select("id,date,location,attendees").eq("status", "past"),
    supabase.from("match_log").select("*"),
    // self_token is not anon-readable (migration 0008) — select("*") would
    // fail with permission-denied, and the token has no place in an export.
    supabase
      .from("rsvps")
      .select("planned_session_id, member_id, status, note, updated_at, updated_by")
      .eq("member_id", memberId),
  ]);

  if (memberRes.error) throw memberRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (matchesRes.error) throw matchesRes.error;
  if (rsvpsRes.error) throw rsvpsRes.error;

  type SessionRow = { id: string; date: string; location: string; attendees: unknown[] };

  const sessions: (SessionAttendance & { location: string })[] = (sessionsRes.data ?? []).map((row) => {
    const r = row as SessionRow;
    const memberIds: number[] = [];
    for (const a of r.attendees) {
      const obj = a as { ref?: { kind?: string; memberId?: number } };
      if (obj.ref?.kind === "member" && typeof obj.ref.memberId === "number") {
        memberIds.push(obj.ref.memberId);
      }
    }
    return {
      sessionId: r.id,
      date: new Date(r.date),
      location: r.location,
      attendeeMemberIds: memberIds,
    };
  });

  type MatchRow = {
    session_id: string;
    round_index: number;
    court_type: "doubles" | "singles";
    team_a: number[];
    team_b: number[];
    winner: "A" | "B";
    played_at: string;
  };

  const matches: MatchResult[] = (matchesRes.data ?? []).map((row) => {
    const r = row as MatchRow;
    return {
      sessionId: r.session_id,
      roundIndex: r.round_index,
      courtType: r.court_type,
      teamA: r.team_a,
      teamB: r.team_b,
      winner: r.winner,
      at: new Date(r.played_at),
    };
  });

  const m = memberRes.data as { id: number; name: string; status: string; gender?: string; created_at: string };
  const member: Member = {
    id: m.id,
    name: m.name,
    status: m.status as Member["status"],
    gender: m.gender === "male" || m.gender === "female" ? m.gender : "unknown",
    createdAt: new Date(m.created_at),
  };

  const data = buildMemberExport({
    member,
    sessions,
    matches,
    rsvps: (rsvpsRes.data ?? []) as RsvpPublicRow[],
  });

  // Trigger JSON download via Blob — browser-only.
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gg-member-${memberId}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}
