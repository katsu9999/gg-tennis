import { render } from "preact";
import { computed } from "@preact/signals";
import { currentPath, matchRoute } from "@/ui/router";
import "@/ui/theme.css";

// Phase 4 pages — added incrementally as 4.3-4.7 land
import { HomePage } from "@/ui/pages/home";
import { NewSessionPage } from "@/ui/pages/new-session";
import { NumberMapPage } from "@/ui/pages/number-map";
// import { RoundPage } from "@/ui/pages/round";
// import { HistoryPage } from "@/ui/pages/history";

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
  const r = route.value;
  switch (r.name) {
    case "home": return <HomePage />;
    case "new-session": return <NewSessionPage />;
    case "number-map": return <NumberMapPage />;
    // case "round": return <RoundPage />;
    // case "history": return <HistoryPage />;
    default:
      return <ComingSoon name={r.name} />;
  }
}

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
render(<App />, root);
