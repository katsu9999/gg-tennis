import { render } from "preact";
import { computed } from "@preact/signals";
import { currentPath, matchRoute } from "@/ui/router";
import { sessionStore } from "@/ui/stores";
import "@/ui/theme.css";

// Re-hydrate any ongoing session from the DB on cold start. Without this,
// reopening the PWA after a phone-lock / tab-close shows the home "ライブ中"
// badge (because liveSessionStore queries the DB) but sessionStore is empty
// — so visiting /session/round renders "セッションが開始されていません" and
// the operator loses today's match.
void sessionStore.resume();

// Phase 4+ pages — added incrementally
import { AppDialogHost } from "@/ui/components/app-dialog";
import { HomePage } from "@/ui/pages/home";
import { NewSessionPage } from "@/ui/pages/new-session";
import { NumberMapPage } from "@/ui/pages/number-map";
import { RoundPage } from "@/ui/pages/round";
import { HistoryPage } from "@/ui/pages/history";
import { RosterPage } from "@/ui/pages/roster";
import { PlannedSessionsPage } from "@/ui/pages/planned-sessions";
import { PublicRsvpPage } from "@/ui/pages/public-rsvp";
import { RankingPage } from "@/ui/pages/ranking";
import { PastSessionsPage } from "@/ui/pages/past-sessions";
import { PrivacyPage } from "@/ui/pages/privacy";
import { SettingsPage } from "@/ui/pages/settings";
import { SettingsLocalPage } from "@/ui/pages/settings-local";
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
    case "history": return <HistoryPage />;
    case "roster": return <RosterPage />;
    case "planned-sessions": return <PlannedSessionsPage />;
    case "public-rsvp": return <PublicRsvpPage token={r.params.token} />;
    case "ranking": return <RankingPage />;
    case "past-sessions": return <PastSessionsPage />;
    case "privacy": return <PrivacyPage />;
    case "settings": return IS_LOCAL ? <SettingsLocalPage /> : <SettingsPage />;
    default:
      return <ComingSoon name={(r as { name: string }).name} />;
  }
}

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
render(<App />, root);
