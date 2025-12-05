import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/theme.css";


// lazy import Visit so it doesn't bloat main app
async function mount() {
  const pathname = window.location.pathname;
  if (pathname === "/visit") {
    // visitor public page
    const { default: Visit } = await import("./pages/Visit.jsx");
    createRoot(document.getElementById("root")).render(<Visit />);
  } else {
    // normal authenticated app
    createRoot(document.getElementById("root")).render(<App />);
  }

  // PWA: register service worker
  if ("serviceWorker" in navigator) {
    import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  }
}
mount();
