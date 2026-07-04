import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/preact";
import { appDialog, AppDialogHost } from "@/ui/components/app-dialog";

// window.confirm/alert are unreliable in iOS standalone PWAs (they can be
// suppressed and return false immediately), so the app uses this in-app
// dialog instead. See fix/ios-pwa-safe-area-dialogs.
describe("appDialog", () => {
  afterEach(() => {
    appDialog.current.value = null;
    cleanup();
  });

  it("confirm() resolves true when OK is tapped", async () => {
    const { getByTestId } = render(<AppDialogHost />);
    const p = appDialog.confirm("終了しますか？");
    await waitFor(() => getByTestId("app-dialog-ok"));
    fireEvent.click(getByTestId("app-dialog-ok"));
    await expect(p).resolves.toBe(true);
  });

  it("confirm() resolves false when キャンセル is tapped", async () => {
    const { getByTestId } = render(<AppDialogHost />);
    const p = appDialog.confirm("終了しますか？");
    await waitFor(() => getByTestId("app-dialog-cancel"));
    fireEvent.click(getByTestId("app-dialog-cancel"));
    await expect(p).resolves.toBe(false);
  });

  it("alert() shows the message and resolves when OK is tapped", async () => {
    const { getByTestId, getByText, queryByTestId } = render(<AppDialogHost />);
    const p = appDialog.alert("保存に失敗しました");
    await waitFor(() => getByText("保存に失敗しました"));
    expect(queryByTestId("app-dialog-cancel")).toBeNull();
    fireEvent.click(getByTestId("app-dialog-ok"));
    await expect(p).resolves.toBeUndefined();
  });

  it("renders multi-line messages on separate lines", async () => {
    const { getByTestId } = render(<AppDialogHost />);
    void appDialog.confirm("1行目\n2行目");
    await waitFor(() => getByTestId("app-dialog-message"));
    expect(getByTestId("app-dialog-message").textContent).toContain("1行目");
    expect(getByTestId("app-dialog-message").textContent).toContain("2行目");
  });

  it("a second dialog replaces the first, resolving it false so callers never hang", async () => {
    render(<AppDialogHost />);
    const first = appDialog.confirm("最初");
    const second = appDialog.confirm("次");
    await expect(first).resolves.toBe(false);
    appDialog.current.value?.resolve(true);
    await expect(second).resolves.toBe(true);
  });

  it("renders nothing when no dialog is open", () => {
    const { queryByTestId } = render(<AppDialogHost />);
    expect(queryByTestId("app-dialog-ok")).toBeNull();
  });
});
