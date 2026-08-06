import { supabase } from "./supabaseClient.js";

/**
 * The app's usernames aren't globally unique (two schools can both have a
 * "tunde"), but Supabase Auth needs a unique email per account. These
 * functions build a deterministic, non-deliverable email from a username +
 * school, so the same username always maps to the same login without ever
 * needing to store or send a real email address.
 */
function studentEmail(username, schoolId) {
  const clean = String(username).trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${clean}.${schoolId}@accounts.lmsbypetcode.invalid`;
}
function ownerEmail(username) {
  const clean = String(username).trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${clean}@owner.accounts.lmsbypetcode.invalid`;
}

window.auth = {
  /** Signs in a school member (admin/teacher/student/parent) */
  async signIn(username, password, schoolId) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: studentEmail(username, schoolId), password });
    if (error) throw error;
    return data;
  },

  /** Signs in the platform owner (no school context) */
  async signInOwner(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: ownerEmail(username), password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** Reads the caller's own role/school from the profiles table (relies on their own RLS "read own profile" access) */
  async getMyProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;
    const { data, error } = await supabase.from("profiles").select("role, school_id, app_username").eq("id", userData.user.id).single();
    if (error) return null;
    return data;
  },

  /**
   * Securely creates a new login account by calling the create-user Edge Function
   * (which uses the service_role key server-side — never in the browser).
   * Must be called while signed in as an owner or admin; the function itself
   * re-checks that the caller is allowed to create this kind of account.
   */
  async createAccount({ username, password, role, schoolId, appUsername }) {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { username, password, role, schoolId, appUsername },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  /** Resets the owner's real Supabase Auth password using a valid recovery code (works while signed out) */
  async resetOwnerPassword({ username, code, newPassword }) {
    const { data, error } = await supabase.functions.invoke("reset-owner-password", {
      body: { username, code, newPassword },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },
};
