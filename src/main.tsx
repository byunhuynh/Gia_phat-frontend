// Fonts via Google Fonts (Outfit + Syne) — loaded in index.html
// FontAwesome icons
import "@fortawesome/fontawesome-free/css/all.min.css";
// Global styles + Tailwind
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);

// ─── PWA Service Worker ───────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("PWA ready"))
      .catch((err) => console.error("SW error:", err));
  });
}
