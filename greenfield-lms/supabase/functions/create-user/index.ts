// Supabase Edge Function: create-user
//
// Why this exists: creating a new login account (admin creating a teacher,
// owner creating a school's first admin, etc.) needs Supabase's Admin API,
// which requires the service_role key. That key can bypass every security
// rule in the database, so it must NEVER be sent to a browser. This function
// is the one place it's used — it runs on Supabase's servers, not the
// client's.
//
// How it decides who's allowed to create what:
//   - The caller's own login (JWT) is checked via the `profiles` table.
//   - An "owner" can create: a new school's first admin, or another owner.
//   - An "admin" can create: a teacher/student/parent, but ONLY inside
//     their own school (their school_id must match the request).
//   - Anyone else (or no valid login) is rejected.
//
// Deploy with: supabase functions deploy create-user
// (see README.md for the full walkthrough)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function syntheticEmail(username: string, schoolId: string | null) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  return schoolId ? `${clean}.${schoolId}@accounts.lmsbypetcode.invalid` : `${clean}@owner.accounts.lmsbypetcode.invalid`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace("Bearer ", "");

    const body = await req.json();
    const { username, password, role, schoolId, appUsername } = body;
    if (!username || !password || !role) {
      return new Response(JSON.stringify({ error: "username, password, and role are required" }), { status: 400, headers: corsHeaders });
    }

    // Bootstrap exception: creating an account normally requires already being logged in as an
    // owner/admin — but on a brand-new platform, there IS no owner yet to log in as. This is the
    // one deliberate hole: if zero owners exist anywhere, and the request is for a new owner
    // account, allow it without a caller session. The moment one owner exists, this closes
    // permanently — every request after that goes through the normal authorization checks below.
    const adminClientForBootstrapCheck = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { count: ownerCount } = await adminClientForBootstrapCheck
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner");
    const isBootstrap = (ownerCount || 0) === 0 && role === "owner";

    let callerProfile = null;
    if (!isBootstrap) {
      if (!callerToken) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
      }
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${callerToken}` } },
      });
      const { data: userData, error: userErr } = await callerClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });
      }
      const { data: profile } = await callerClient.from("profiles").select("role, school_id").eq("id", userData.user.id).single();
      if (!profile) {
        return new Response(JSON.stringify({ error: "No profile found for caller" }), { status: 403, headers: corsHeaders });
      }
      callerProfile = profile;
    }

    // Authorization rules
    if (isBootstrap) {
      // allowed — this is the one-time first-owner exception
    } else if (callerProfile.role === "owner") {
      if (!["owner", "admin", "teacher", "student", "parent"].includes(role)) {
        return new Response(JSON.stringify({ error: "Unknown role" }), { status: 403, headers: corsHeaders });
      }
      // Owners can provision any role for any school (e.g. seeding a new school's starter roster).
    } else if (callerProfile.role === "admin") {
      if (!["teacher", "student", "parent"].includes(role)) {
        return new Response(JSON.stringify({ error: "Admins can only create teacher, student, or parent accounts" }), { status: 403, headers: corsHeaders });
      }
      if (schoolId !== callerProfile.school_id) {
        return new Response(JSON.stringify({ error: "Admins can only create accounts within their own school" }), { status: 403, headers: corsHeaders });
      }
    } else {
      return new Response(JSON.stringify({ error: "Only owners and admins can create accounts" }), { status: 403, headers: corsHeaders });
    }

    const email = syntheticEmail(username, role === "owner" ? null : schoolId);

    // From here on, use the admin client (service_role) — this is the only
    // place in the whole system this key is used.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no real email exists to confirm — treat as verified immediately
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Could not create account" }), { status: 400, headers: corsHeaders });
    }

    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: created.user.id,
      school_id: role === "owner" ? null : schoolId,
      role,
      app_username: appUsername || username,
    });
    if (profileErr) {
      // Roll back the auth user if the profile insert failed, so we don't leave an orphaned login
      await adminClient.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ id: created.user.id, email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
