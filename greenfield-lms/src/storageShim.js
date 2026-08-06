/**
 * TEMPORARY local stand-in for Claude's window.storage API.
 *
 * The app was originally built as a Claude artifact, where `window.storage`
 * is provided automatically and persists across sessions. Outside Claude,
 * that object doesn't exist — so this file fakes it using the browser's
 * localStorage, just so the app runs on your machine and you can verify
 * every screen still works after moving it into a real project.
 *
 * IMPORTANT: localStorage is per-browser, per-device. Two different
 * students logging in on two different computers will NOT see each
 * other's data with this shim — it's for local testing only.
 * Before real students/teachers/parents use this, replace this file's
 * implementation with real calls to a backend (see storageShim.supabase.js
 * once you're ready for that step).
 */

function keyFor(key, shared) {
  return `lms:${shared ? "shared" : "personal"}:${key}`;
}

window.storage = {
  async get(key, shared = false) {
    const raw = localStorage.getItem(keyFor(key, shared));
    if (raw === null) {
      throw new Error(`Key not found: ${key}`);
    }
    return { key, value: raw, shared };
  },

  async set(key, value, shared = false) {
    localStorage.setItem(keyFor(key, shared), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    const existed = localStorage.getItem(keyFor(key, shared)) !== null;
    localStorage.removeItem(keyFor(key, shared));
    return { key, deleted: existed, shared };
  },

  async list(prefix = "", shared = false) {
    const scope = `lms:${shared ? "shared" : "personal"}:`;
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(scope + prefix))
      .map((k) => k.slice(scope.length));
    return { keys, prefix, shared };
  },
};
