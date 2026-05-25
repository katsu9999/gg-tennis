import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/data/gdpr-export", () => ({
  exportMemberData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const all = signal([
    { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
    { id: 3, name: "田中", status: "archived" as const, createdAt: new Date() },
  ]);
  return {
    rosterStore: {
      all,
      active: computed(() => all.value.filter((m) => m.status === "active")),
      archived: computed(() => all.value.filter((m) => m.status === "archived")),
      load: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockImplementation(async (name: string) => {
        all.value = [
          ...all.value,
          { id: 99, name, status: "active" as const, createdAt: new Date() },
        ];
      }),
      rename: vi.fn().mockImplementation(async (id: number, name: string) => {
        all.value = all.value.map((m) => (m.id === id ? { ...m, name } : m));
      }),
      archive: vi.fn().mockImplementation(async (id: number) => {
        all.value = all.value.map((m) => (m.id === id ? { ...m, status: "archived" as const } : m));
      }),
      unarchive: vi.fn().mockImplementation(async (id: number) => {
        all.value = all.value.map((m) => (m.id === id ? { ...m, status: "active" as const } : m));
      }),
      hardDelete: vi.fn().mockImplementation(async (id: number) => {
        all.value = all.value.filter((m) => m.id !== id);
      }),
    },
    pinStore: {
      isUnlocked: signal(true),  // Default: PIN is already unlocked in tests.
      verifying: signal(false),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue("test-pin"),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { RosterPage, resetRosterState } from "@/ui/pages/roster";
import { rosterStore, pinStore } from "@/ui/stores";
import { exportMemberData } from "@/data/gdpr-export";

const r = rosterStore as unknown as {
  add: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  unarchive: ReturnType<typeof vi.fn>;
  hardDelete: ReturnType<typeof vi.fn>;
  all: { value: { id: number; name: string; status: "active" | "archived" }[] };
};
const p = pinStore as unknown as {
  isUnlocked: { value: boolean };
  getPin: ReturnType<typeof vi.fn>;
};
const exp = exportMemberData as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetRosterState();
  r.add.mockClear();
  r.rename.mockClear();
  r.archive.mockClear();
  r.unarchive.mockClear();
  r.hardDelete.mockClear();
  exp.mockClear();
  p.isUnlocked.value = true;
  p.getPin.mockReturnValue("test-pin");
  r.all.value = [
    { id: 1, name: "佐藤", status: "active" },
    { id: 2, name: "山本", status: "active" },
    { id: 3, name: "田中", status: "archived" },
  ];
});

describe("RosterPage", () => {
  it("renders active and archived sections with member names", () => {
    const { getByText, getByTestId } = render(<RosterPage />);
    expect(getByTestId("row-1")).toBeDefined();
    expect(getByTestId("row-2")).toBeDefined();
    expect(getByTestId("row-3")).toBeDefined();
    expect(getByText("佐藤")).toBeDefined();
    expect(getByText("田中")).toBeDefined();
  });

  it("adding a new member calls rosterStore.add with name and PIN", async () => {
    const { getByTestId } = render(<RosterPage />);
    fireEvent.input(getByTestId("new-member-input"), { target: { value: "新規会員" } });
    fireEvent.click(getByTestId("new-member-add"));
    await waitFor(() => expect(r.add).toHaveBeenCalledWith("新規会員", "test-pin"));
  });

  it("clicking archive on an active member calls rosterStore.archive", async () => {
    const { getByTestId } = render(<RosterPage />);
    fireEvent.click(getByTestId("archive-1"));
    await waitFor(() => expect(r.archive).toHaveBeenCalledWith(1, "test-pin"));
  });

  it("clicking unarchive on an archived member calls rosterStore.unarchive", async () => {
    const { getByTestId } = render(<RosterPage />);
    fireEvent.click(getByTestId("unarchive-3"));
    await waitFor(() => expect(r.unarchive).toHaveBeenCalledWith(3, "test-pin"));
  });

  it("rename flow: switch to input, edit, save, calls rosterStore.rename", async () => {
    const { getByTestId } = render(<RosterPage />);
    fireEvent.click(getByTestId("rename-1"));
    fireEvent.input(getByTestId("rename-input-1"), { target: { value: "佐藤改" } });
    fireEvent.click(getByTestId("rename-save-1"));
    await waitFor(() => expect(r.rename).toHaveBeenCalledWith(1, "佐藤改", "test-pin"));
  });

  it("export button calls exportMemberData with the right id", async () => {
    const { getByTestId } = render(<RosterPage />);
    fireEvent.click(getByTestId("export-1"));
    await waitFor(() => expect(exp).toHaveBeenCalledWith(1));
  });

  it("delete button opens the confirmation modal", () => {
    const { getByTestId, queryByTestId } = render(<RosterPage />);
    expect(queryByTestId("delete-modal")).toBeNull();
    fireEvent.click(getByTestId("delete-1"));
    expect(getByTestId("delete-modal")).toBeDefined();
  });

  it("confirming delete calls rosterStore.hardDelete and closes the modal", async () => {
    const { getByTestId, queryByTestId } = render(<RosterPage />);
    fireEvent.click(getByTestId("delete-1"));
    fireEvent.click(getByTestId("delete-confirm"));
    await waitFor(() => expect(r.hardDelete).toHaveBeenCalledWith(1, "test-pin"));
    await waitFor(() => expect(queryByTestId("delete-modal")).toBeNull());
  });
});
