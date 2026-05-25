import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const loadByToken = vi.fn();
  const listActive = vi.fn();
  const listForSession = vi.fn();
  const publicUpsertWithToken = vi.fn().mockResolvedValue(undefined);

  return {
    plannedSessionRepo: { loadByToken },
    rsvpRepo: { listForSession, publicUpsertWithToken },
    memberRepo: { listActive },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { PublicRsvpPage, resetPublicRsvpState } from "@/ui/pages/public-rsvp";
import { plannedSessionRepo, rsvpRepo, memberRepo } from "@/ui/stores";

const ps = plannedSessionRepo as unknown as { loadByToken: ReturnType<typeof vi.fn> };
const rs = rsvpRepo as unknown as {
  listForSession: ReturnType<typeof vi.fn>;
  publicUpsertWithToken: ReturnType<typeof vi.fn>;
};
const ms = memberRepo as unknown as { listActive: ReturnType<typeof vi.fn> };

const sampleSession = {
  id: "p1",
  date: "2026-06-01",
  location: "Golders Hill",
  court_count: 3,
  allow_singles: true,
  public_rsvp_token: "abc123",
  show_going_list_on_public: true,
  created_at: "2026-05-01T00:00:00Z",
  created_by: "admin@example.com",
};

const sampleMembers = [
  { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
  { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
];

beforeEach(() => {
  resetPublicRsvpState();
  ps.loadByToken.mockReset();
  rs.listForSession.mockReset();
  rs.publicUpsertWithToken.mockReset();
  rs.publicUpsertWithToken.mockResolvedValue(undefined);
  ms.listActive.mockReset();
  localStorage.clear();
  // Remove any noindex meta from previous tests
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});

afterEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});

describe("PublicRsvpPage", () => {
  it("injects noindex meta tag on mount (GDPR §17.6)", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([]);
    ms.listActive.mockResolvedValue(sampleMembers);

    render(<PublicRsvpPage token="abc123" />);
    await waitFor(() => {
      const meta = document.head.querySelector('meta[name="robots"]');
      expect(meta).not.toBeNull();
      expect(meta!.getAttribute("content")).toBe("noindex,nofollow");
    });
  });

  it("renders invalid-link message when loadByToken returns null", async () => {
    ps.loadByToken.mockResolvedValue(null);
    const { findByText } = render(<PublicRsvpPage token="bad" />);
    expect(await findByText(/このリンクは無効です/)).toBeDefined();
  });

  it("renders session metadata and member options", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId, getByText } = render(<PublicRsvpPage token="abc123" />);
    await findByTestId("rsvp-title");
    expect(getByText(/2026-06-01 @ Golders Hill/)).toBeDefined();
    expect(getByText("佐藤")).toBeDefined();
    expect(getByText("山本")).toBeDefined();
  });

  it("shows the going-list as names when show_going_list_on_public is true", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([
      { planned_session_id: "p1", member_id: 1, status: "going", note: null, updated_at: "", updated_by: "self_public_link", self_token: "t" },
    ]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId } = render(<PublicRsvpPage token="abc123" />);
    const list = await findByTestId("going-list");
    expect(list.textContent).toContain("佐藤");
  });

  it("hides the names list and shows a count when show_going_list_on_public is false", async () => {
    ps.loadByToken.mockResolvedValue({ ...sampleSession, show_going_list_on_public: false });
    rs.listForSession.mockResolvedValue([
      { planned_session_id: "p1", member_id: 1, status: "going", note: null, updated_at: "", updated_by: "self_public_link", self_token: "t" },
    ]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId, queryByTestId } = render(<PublicRsvpPage token="abc123" />);
    expect(await findByTestId("going-count")).toBeDefined();
    expect(queryByTestId("going-list")).toBeNull();
  });

  it("submitting an RSVP calls publicUpsertWithToken with self_token", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId, getByTestId } = render(<PublicRsvpPage token="abc123" />);
    await findByTestId("rsvp-title");

    // Select member 1
    fireEvent.change(getByTestId("rsvp-member-select"), { target: { value: "1" } });
    // Click 行く
    fireEvent.click(getByTestId("rsvp-submit-going"));

    await waitFor(() => expect(rs.publicUpsertWithToken).toHaveBeenCalled());
    const call = rs.publicUpsertWithToken.mock.calls[0]![0] as { planned_session_id: string; member_id: number; status: string; self_token: string };
    expect(call.planned_session_id).toBe("p1");
    expect(call.member_id).toBe(1);
    expect(call.status).toBe("going");
    expect(typeof call.self_token).toBe("string");
    expect(call.self_token.length).toBeGreaterThan(0);

    // The self_token is persisted to LocalStorage
    expect(localStorage.getItem("gg:rsvp-self-token:p1")).toBe(call.self_token);
  });

  it("reuses the same self_token on a second submission from the same browser", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId, getByTestId } = render(<PublicRsvpPage token="abc123" />);
    await findByTestId("rsvp-title");
    fireEvent.change(getByTestId("rsvp-member-select"), { target: { value: "1" } });
    fireEvent.click(getByTestId("rsvp-submit-going"));
    await waitFor(() => expect(rs.publicUpsertWithToken).toHaveBeenCalledTimes(1));
    fireEvent.click(getByTestId("rsvp-submit-not_going"));
    await waitFor(() => expect(rs.publicUpsertWithToken).toHaveBeenCalledTimes(2));

    const first = rs.publicUpsertWithToken.mock.calls[0]![0] as { self_token: string };
    const second = rs.publicUpsertWithToken.mock.calls[1]![0] as { self_token: string };
    expect(second.self_token).toBe(first.self_token);
  });

  it("disables RSVP buttons until a member is selected", async () => {
    ps.loadByToken.mockResolvedValue(sampleSession);
    rs.listForSession.mockResolvedValue([]);
    ms.listActive.mockResolvedValue(sampleMembers);

    const { findByTestId, getByTestId } = render(<PublicRsvpPage token="abc123" />);
    await findByTestId("rsvp-title");
    expect((getByTestId("rsvp-submit-going") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(getByTestId("rsvp-member-select"), { target: { value: "1" } });
    expect((getByTestId("rsvp-submit-going") as HTMLButtonElement).disabled).toBe(false);
  });
});
