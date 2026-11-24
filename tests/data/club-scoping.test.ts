import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSessionRepository } from "@/data/session-repository";
import { createMemberRepository } from "@/data/member-repository";
import { createVenueRepository } from "@/data/venue-repository";
import { createPlannedSessionRepository } from "@/data/planned-session-repository";
import { createMatchLogRepository } from "@/data/match-log-repository";
import { createRsvpRepository } from "@/data/rsvp-repository";
import { createPinStore } from "@/state/pin-store";

// 複数クラブ（2026-11-22）: 別のクラブのデータを読んだり書いたりしないこと。
// 全部のクエリ・RPC に今のクラブが付くかを、呼ばれたメソッドを記録して確かめる。

type Call = { table: string; method: string; args: unknown[] };

function recordingClient(rows: unknown[] = []) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (fn: string) => ({ data: fn === "verify_club_pin" ? true : 1, error: null }));
  const from = (table: string) => {
    const result = { data: rows, error: null };
    const builder: Record<string, unknown> = {};
    const chain = new Proxy(builder, {
      get(_t, prop: string) {
        if (prop === "then") return (res: (v: unknown) => void) => res(result);
        return (...args: unknown[]) => {
          calls.push({ table, method: prop, args });
          if (prop === "single" || prop === "maybeSingle") {
            return Promise.resolve({ data: rows[0] ?? null, error: null });
          }
          return chain;
        };
      },
    });
    return chain;
  };
  const client = { from: vi.fn(from), rpc } as unknown as SupabaseClient;
  return { client, calls, rpc };
}

const CLUB = 2;
const club = () => CLUB;
const eqClub = (calls: Call[], table: string, column = "club_id") =>
  calls.some((c) => c.table === table && c.method === "eq" && c.args[0] === column && c.args[1] === CLUB);

describe("リポジトリは今のクラブだけを読む・書く", () => {
  it("セッション: 読む時はクラブで絞り、書く時はクラブを付ける", async () => {
    const { client, calls, rpc } = recordingClient([]);
    const repo = createSessionRepository(client, club);
    await repo.loadOngoing();
    await repo.loadPast();
    await repo.loadById("x");
    expect(calls.filter((c) => c.method === "eq" && c.args[0] === "club_id").length).toBe(3);
    expect(eqClub(calls, "sessions")).toBe(true);

    calls.length = 0;
    await repo.upsert({ id: "s", club_id: 1 } as never); // 古い値が入っていても今のクラブで上書き
    const up = calls.find((c) => c.method === "upsert")!;
    expect((up.args[0] as { club_id: number }).club_id).toBe(CLUB);

    calls.length = 0;
    await repo.update({ id: "s" } as never);
    expect((calls.find((c) => c.method === "update")!.args[0] as { club_id: number }).club_id).toBe(CLUB);
    expect(eqClub(calls, "sessions")).toBe(true);

    await repo.deleteById("s", "pin");
    expect(rpc).toHaveBeenCalledWith("delete_session", { p_pin: "pin", p_session_id: "s", p_club: CLUB });
  });

  it("会員: 一覧はクラブで絞り、追加・変更・削除の RPC にクラブを渡す", async () => {
    const member = { id: 5, name: "A", status: "active", gender: "unknown", created_at: "2026-01-01" };
    const { client, calls, rpc } = recordingClient([member]);
    const repo = createMemberRepository(client, club);
    await repo.listAll();
    await repo.listActive();
    expect(calls.filter((c) => c.method === "eq" && c.args[0] === "club_id" && c.args[1] === CLUB).length).toBe(2);

    await repo.add({ name: "B", pin: "p" });
    await repo.rename(5, "C", "p");
    await repo.archive(5, "p");
    await repo.unarchive(5, "p");
    await repo.setGender(5, "female", "p");
    await repo.hardDelete(5, "p");
    for (const call of rpc.mock.calls as unknown as [string, Record<string, unknown>][]) {
      expect(call[1].p_club).toBe(CLUB);
    }
    expect(rpc).toHaveBeenCalledTimes(6);
  });

  it("会場・予定セッション・RSVP・PIN もクラブ付き", async () => {
    const { client, calls, rpc } = recordingClient([{ id: "p1" }]);
    await createVenueRepository(client, club).list();
    await createVenueRepository(client, club).add("Hendon", "p");
    const planned = createPlannedSessionRepository(client, club);
    await planned.list();
    await planned.loadNext();
    await planned.loadByToken("t");
    await planned.rotateToken("p1", "p");
    await planned.delete("p1", "p");
    await createRsvpRepository(client, club).adminUpsert(
      { planned_session_id: "p1", member_id: 5, status: "going", note: null, self_token: null }, "p");
    const pin = createPinStore(client, club);
    await pin.verify("123456");
    await pin.setClubPin("654321");

    expect(eqClub(calls, "venues")).toBe(true);
    expect(calls.filter((c) => c.table === "planned_sessions" && c.method === "eq" && c.args[0] === "club_id").length).toBe(3);
    for (const call of rpc.mock.calls as unknown as [string, Record<string, unknown>][]) {
      expect([call[0], call[1].p_club]).toEqual([call[0], CLUB]);
    }
  });

  it("試合記録の一覧は、親セッションのクラブで絞る", async () => {
    const { client, calls } = recordingClient([]);
    await createMatchLogRepository(client, club).list();
    const sel = calls.find((c) => c.method === "select")!;
    expect(String(sel.args[0])).toContain("sessions!inner(club_id)");
    expect(eqClub(calls, "match_log", "sessions.club_id")).toBe(true);
  });
});
