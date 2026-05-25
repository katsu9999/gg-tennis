export type MemberId = number;
export type GuestId = string;
export type AttendeeRef =
  | { kind: "member"; memberId: MemberId }
  | { kind: "guest"; guestId: GuestId };

export interface Member {
  id: MemberId;
  name: string;
  status: "active" | "archived";
  createdAt: Date;
}

export interface Attendee {
  ref: AttendeeRef;
  todayNumber: number;
  isGuest: boolean;
  guestName?: string;
}

export type CourtType = "doubles" | "singles";
export type Winner = "A" | "B" | "none";

export interface Court {
  number: number;
  type: CourtType;
  teamA: AttendeeRef[];
  teamB: AttendeeRef[];
  winner: Winner;
}

export interface Round {
  index: number;
  courts: Court[];
  resters: AttendeeRef[];
}

export interface MatchResult {
  sessionId: string;
  roundIndex: number;
  courtType: CourtType;
  teamA: MemberId[];
  teamB: MemberId[];
  winner: "A" | "B";
  at: Date;
}

export interface RoundPlan {
  doublesCourts: number;
  singlesCourts: number;
  seated: number;
  resters: number;
}

export interface PairHistory {
  partnerW: Map<string, number>;
  opponentW: Map<string, number>;
}

/** Accumulating partner/opponent counts within a single session, weighted heavily by the round builder. */
export interface SameSessionStats {
  partner: Map<string, number>;
  opp: Map<string, number>;
}

export function pairKey(a: MemberId, b: MemberId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Extract member ids (canonical sentinel) from a list of attendees; guests are silently dropped. */
export function memberIdsFrom(refs: readonly AttendeeRef[]): MemberId[] {
  return refs.filter((r): r is { kind: "member"; memberId: MemberId } => r.kind === "member").map(r => r.memberId);
}
