import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// If Supabase env vars are set, use the real shared-database backend (plus real
// Supabase Auth for real access control) so every device sees the same data and
// logins are actually authenticated server-side. Otherwise fall back to the
// localStorage-only shim (single-device, app-level password check only) —
// useful for a quick local test drive, and how the app runs inside Claude's
// artifact preview where there's no real backend at all.
window.USE_REAL_AUTH = hasSupabaseConfig;
if (hasSupabaseConfig) {
  await import("./storageShim.supabase.js");
  await import("./authShim.js");
} else {
  console.warn(
    "No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY found — running with the localStorage-only shim. " +
      "Data will NOT be shared across devices, and there's no real authentication. See README.md to connect Supabase."
  );
  await import("./storageShim.js");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
