import { render } from "preact";
import { computed } from "@preact/signals";
import { clubSlugFromPath, currentPath, matchRoute, setClubPrefix } from "@/ui/router";
import { loadClub, sessionStore } from "@/ui/stores";
import { currentClub, type Club } from "@/data/club";
import { setLocale } from "@/ui/i18n";
import "@/ui/theme.css";

// Re-hydrate any ongoing session from the DB on cold start. Without this,
// reopening the PWA after a phone-lock / tab-close shows the home "ライブ中"
// badge (because liveSessionStore queries the DB) but sessionStore is empty
// — so visiting /session/round renders "セッションが開始されていません" and
// the operator loses today's match.
// （起動時の resume はクラブが決まってから boot() で行う。先に走ると GG の
// 未終了セッションを別クラブの画面に読み込んでしまう。）

// Android hardware back button (Capacitor shell). IS_LOCAL is a build-time
// constant, so the GG bundle drops both the branch and the chunk.
if (IS_LOCAL) {
  void import("@/native/back-button").then((m) => m.registerAndroidBackButton());
}

// Phase 4+ pages — added incrementally
import { AppDialogHost, appDialog } from "@/ui/components/app-dialog";
import { HomePage } from "@/ui/pages/home";
import { NewSessionPage } from "@/ui/pages/new-session";
import { NumberMapPage } from "@/ui/pages/number-map";
import { RoundPage } from "@/ui/pages/round";
import { EditAttendeesPage } from "@/ui/pages/edit-attendees";
import { HistoryPage } from "@/ui/pages/history";
import { RosterPage } from "@/ui/pages/roster";
import { PlannedSessionsPage } from "@/ui/pages/planned-sessions";
import { PublicRsvpPage } from "@/ui/pages/public-rsvp";
import { RankingPage } from "@/ui/pages/ranking";
import { PastSessionsPage } from "@/ui/pages/past-sessions";
import { PrivacyPage } from "@/ui/pages/privacy";
import { SettingsPage } from "@/ui/pages/settings";
import { SettingsLocalPage } from "@/ui/pages/settings-local";
import { ClubsPage } from "@/ui/pages/clubs";
import { IS_LOCAL } from "@/flavor";

const route = computed(() => matchRoute(currentPath.value));

function ComingSoon({ name }: { name: string }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2>Page "{name}" — coming soon</h2>
      <p class="muted">Phase 4+ implementation in progress.</p>
      <p><a href="/">← Home</a></p>
    </main>
  );
}

function App() {
  return (
    <>
      <CurrentPage />
      <AppDialogHost />
    </>
  );
}

function CurrentPage() {
  const r = route.value;
  switch (r.name) {
    case "home": return <HomePage />;
    case "new-session": return <NewSessionPage />;
    case "number-map": return <NumberMapPage />;
    case "round": return <RoundPage />;
    case "edit-attendees": return <EditAttendeesPage />;
    case "history": return <HistoryPage />;
    case "roster": return <RosterPage />;
    case "planned-sessions": return <PlannedSessionsPage />;
    case "public-rsvp": return <PublicRsvpPage token={r.params.token} />;
    case "ranking": return <RankingPage />;
    case "past-sessions": return <PastSessionsPage />;
    case "privacy": return <PrivacyPage />;
    case "clubs": return <ClubsPage />;
    case "settings": return IS_LOCAL ? <SettingsLocalPage /> : <SettingsPage />;
    default:
      return <ComingSoon name={(r as { name: string }).name} />;
  }
}

function ClubNotFound({ slug, error }: { slug: string; error?: string }) {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2>Club not found / クラブが見つかりません</h2>
      <p class="muted">/c/{slug}</p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
const appRoot: HTMLElement = root;

// 複数クラブ: URL の /c/<slug> からクラブを決めてから描画する。リポジトリは
// currentClub を見てデータを絞るので、決まる前に何かを読み込んではいけない。
const LAST_CLUB_KEY = "gg.lastClubSlug";

async function boot(): Promise<void> {
  const slug = IS_LOCAL ? null : clubSlugFromPath(location.pathname);
  // ホーム画面のアイコンから開くと start_url（クラブ接頭辞なし）になる。最後に
  // 開いたクラブが GG 以外なら、そのクラブへ移る。
  if (!IS_LOCAL) {
    try {
      const last = localStorage.getItem(LAST_CLUB_KEY);
      if (!slug && new URLSearchParams(location.search).has("pwa") && last && last !== "gg") {
        location.replace(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/c/${last}/`);
        return;
      }
      if (!slug || slug === "gg") localStorage.setItem(LAST_CLUB_KEY, "gg");
    } catch {
      /* プライベートモード等で localStorage が使えなくても起動は続ける */
    }
  }
  if (slug && slug !== "gg") {
    let club: Club | null = null;
    try {
      club = await loadClub(slug);
    } catch (e) {
      render(<ClubNotFound slug={slug} error={e instanceof Error ? e.message : String(e)} />, appRoot);
      return;
    }
    if (!club) {
      render(<ClubNotFound slug={slug} />, appRoot);
      return;
    }
    currentClub.value = club;
    try { localStorage.setItem(LAST_CLUB_KEY, club.slug); } catch { /* 同上 */ }
    setClubPrefix(club.slug);
    setLocale(club.locale);
    document.title = `${club.name} — Court Shuffle`;
  }
  void sessionStore.resume();
  render(<App />, appRoot);

  // GG は起動時にクラブを読まない（オフライン起動を止めないため）。代わりに裏で
  // 1回確かめ、DB 更新（0012）がまだなら知らせる。アプリが先に出てしまうと
  // club_id 列が無くて名簿もセッションも読めない。
  if (!IS_LOCAL && !slug) {
    loadClub("gg").catch((e: unknown) => {
      const o = e as { code?: string; message?: string };
      if (o?.code === "42703" || /column .*(slug|club_id)/i.test(o?.message ?? "")) {
        void appDialog.alert(
          "DB update 0012 (clubs) has not been applied yet.\nデータベースの更新（0012）がまだ適用されていません。",
        );
      }
    });
  }
}

void boot();
