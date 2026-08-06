// Supabase Edge Function: reset-owner-password
//
// Handles the "Forgot password?" flow for the Platform Owner login.
// Deliberately callable WITHOUT being logged in (that's the whole point —
// the person has just told us they can't log in). Security instead comes
// from requiring a valid, unused recovery code, which was only ever shown
// once at account-creation time and is checked as a one-way hash — same
// approach as the password itself.
//
// Deploy with: supabase functions deploy reset-owner-password

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, code, newPassword } = await req.json();
    if (!username || !code || !newPassword) {
      return new Response(JSON.stringify({ error: "username, code, and newPassword are required" }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: row, error: readErr } = await adminClient.from("lms_storage").select("value").eq("key", "platform_registry").maybeSingle();
    if (readErr || !row) {
      return new Response(JSON.stringify({ error: "Could not read platform registry" }), { status: 500, headers: corsHeaders });
    }
    const registry = JSON.parse(row.value);
    const owner = (registry.owners || []).find((o: any) => o.username === username.trim().toLowerCase());
    if (!owner || !owner.authId) {
      return new Response(JSON.stringify({ error: "Recovery code not valid" }), { status: 400, headers: corsHeaders });
    }

    const codeHash = await sha256Hex(code.trim().toUpperCase());
    const remainingHashes: string[] = owner.recoveryCodeHashes || [];
    if (!remainingHashes.includes(codeHash)) {
      return new Response(JSON.stringify({ error: "Recovery code not valid or already used" }), { status: 400, headers: corsHeaders });
    }

    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(owner.authId, { password: newPassword });
    if (updateAuthErr) {
      return new Response(JSON.stringify({ error: updateAuthErr.message }), { status: 400, headers: corsHeaders });
    }

    // Burn the used code so it can't be replayed
    const updatedOwners = registry.owners.map((o: any) =>
      o.id === owner.id ? { ...o, recoveryCodeHashes: remainingHashes.filter((h) => h !== codeHash) } : o
    );
    await adminClient.from("lms_storage").update({ value: JSON.stringify({ ...registry, owners: updatedOwners }), updated_at: new Date().toISOString() }).eq("key", "platform_registry");

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
