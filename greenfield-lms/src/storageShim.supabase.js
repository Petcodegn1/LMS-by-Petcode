/**
 * Supabase-backed replacement for Claude's window.storage API.
 *
 * SHARED data (grades, messages, fees, timetable, announcements, etc.) is
 * read from and written to a real Postgres table via Supabase, so every
 * student, teacher, and parent — on any device — sees the same data.
 *
 * PERSONAL data (which account is logged in on *this* browser, and this
 * browser's dark-mode preference) stays in localStorage. That's correct
 * here, not a shortcut: this app doesn't have per-user Supabase Auth
 * sessions, so "personal" in this app really means "this device's
 * settings", which localStorage is the right tool for.
 *
 * SECURITY NOTE: because there's no server-side auth check, the Supabase
 * table below is reachable by anyone who has the public anon key (which
 * ships inside your built frontend — that's normal for Supabase, but it
 * means the Row Level Security policies below are permissive by design.
 * A technically sophisticated visitor could read or write the shared
 * table directly via Supabase's REST API, bypassing the app's UI-level
 * role checks entirely. That's an acceptable tradeoff for getting a real
 * school LMS running quickly, but it is NOT the same as a properly
 * access-controlled backend. If that risk matters for your school
 * (sensitive grades/fees data), the next real step is moving writes
 * behind Supabase Edge Functions (or a small backend) that checks who's
 * allowed to do what before touching the database.
 */

import { supabase } from "./supabaseClient.js";

function personalKey(key) {
  return `lms:personal:${key}`;
}

window.storage = {
  async get(key, shared = false) {
    if (!shared) {
      const raw = localStorage.getItem(personalKey(key));
      if (raw === null) throw new Error(`Key not found: ${key}`);
      return { key, value: raw, shared };
    }
    const { data, error } = await supabase.from("lms_storage").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Key not found: ${key}`);
    return { key, value: data.value, shared };
  },

  async set(key, value, shared = false) {
    if (!shared) {
      localStorage.setItem(personalKey(key), value);
      return { key, value, shared };
    }
    const { error } = await supabase.from("lms_storage").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    if (!shared) {
      const existed = localStorage.getItem(personalKey(key)) !== null;
      localStorage.removeItem(personalKey(key));
      return { key, deleted: existed, shared };
    }
    const { error } = await supabase.from("lms_storage").delete().eq("key", key);
    if (error) throw error;
    return { key, deleted: true, shared };
  },

  async list(prefix = "", shared = false) {
    if (!shared) {
      const scope = "lms:personal:";
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith(scope + prefix))
        .map((k) => k.slice(scope.length));
      return { keys, prefix, shared };
    }
    const { data, error } = await supabase.from("lms_storage").select("key").like("key", `${prefix}%`);
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix, shared };
  },
};
