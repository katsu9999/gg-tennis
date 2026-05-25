import { render } from "preact";

function App() {
  return <div style={{ fontFamily: "system-ui", padding: "20px" }}>GG — Tennis Court Shuffle (bootstrap)</div>;
}

const root = document.getElementById("app");
if (!root) throw new Error("#app missing");
render(<App />, root);
