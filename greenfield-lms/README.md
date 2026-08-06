# LMSbyPetcode — Local Project

This is your LMS pulled out of Claude's artifact sandbox into a normal,
runnable React project. Do this step first, before anything involving
Supabase or WeHostYou — it proves the app itself still works once it's
not relying on Claude-specific machinery.

## 1. Install Node.js

You need Node 18 or newer. Check with:

```
node -v
```

If that fails or shows an old version, install Node from nodejs.org first.

## 2. Install dependencies

From inside this folder:

```
npm install
```

## 3. Run it locally

```
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`). Open it in
your browser — you should see the login screen exactly as it looked in
Claude, with the same quick-login buttons (Admin / Teacher / Student / Parent).

## What to check at this stage

- Log in as each role, click through every tab.
- Add a class, add a student, take attendance, enter scores, post an
  announcement — anything that writes data.
- Refresh the page. Your changes should still be there (this is the
  localStorage shim working).
- Open the same URL in a different browser (or an incognito window) —
  you'll see it starts completely fresh, with no shared data. That's
  expected and is exactly the limitation `src/storageShim.js` warns
  about at the top of the file. It's temporary, single-device storage
  only, not a real backend.

If everything above works, the app itself is solid — anything that
happens after this point is just about swapping `storageShim.js` for a
real database, and then deploying the built files to WeHostYou.

## Next step: connect a real shared database (Supabase)

Local-only storage is fine for testing solo, but real students, teachers,
and parents on different devices all need to see the *same* data. That
means swapping the storage layer for a real database — this project uses
[Supabase](https://supabase.com) (free tier is enough to start).

### 1. Create the Supabase project

1. Sign up at supabase.com and create a new project (pick any region close
   to your school).
2. Wait for it to finish provisioning (a couple of minutes).

### 2. Create the table

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste in the contents of `supabase-setup.sql` (included in this
   project) and run it. This creates the one table the app needs.

### 3. Get your API keys

1. In the dashboard, go to **Settings → API**.
2. Copy the **Project URL** and the **anon public** key.

### 4. Configure the app

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
2. Paste your Project URL and anon key into `.env`.
3. Restart `npm run dev` if it's running — Vite only reads `.env` on
   startup.

The app auto-detects the Supabase config in `.env`. With it present, all
shared school data (grades, attendance, fees, messages, everything except
"who's logged in on this browser") reads and writes to Supabase instead
of localStorage. Without it, the app quietly falls back to the
localStorage-only shim, so it's safe to test without Supabase configured.

### 5. Verify it's really shared

Open the app in two different browsers (or one normal + one incognito
window), log in as different users in each, and confirm an action in one
(e.g. posting an announcement) shows up in the other after a refresh.
That's the real multi-device behavior working.

## Real authentication (hardened security)

The setup above gets Supabase working, but with permissive access rules —
anyone with your site's public key can read/write any school's data
directly via the API, bypassing the app's role checks. `supabase-auth-migration.sql`
and the `supabase/functions/create-user` Edge Function replace that with
real, enforced-by-the-database security: every login is a real Supabase
Auth account, and Postgres itself blocks a school from ever touching
another school's data.

**Read the limitation first:** this stops cross-school access completely,
and ties every action to a real identity — but it can't achieve full
per-student privacy within a school, because each school's data is stored
as one big row per category (all students' grades in a single "results"
row), and Postgres security rules work per-row, not per-record inside a
row. See the comment at the top of `supabase-auth-migration.sql` for the
full explanation.

### Setup

1. Run `supabase-auth-migration.sql` in Supabase's SQL Editor (after
   `supabase-setup.sql`).
2. Install the Supabase CLI, then from this project folder:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase functions deploy create-user
   supabase functions deploy reset-owner-password
   ```
3. In the Supabase dashboard, go to **Edge Functions** and confirm both
   functions show `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` as available secrets (Supabase sets the
   first two automatically; add the service role key from **Settings →
   API** if it isn't already there).
4. Rebuild/restart the app (`npm run dev` or redeploy). That's it — the
   app automatically uses real Supabase Auth for every login the moment
   Supabase is configured (same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   from the earlier setup step; no separate flag to flip).

### What changes once this is deployed

- **Every login is real.** Signing in calls Supabase Auth directly — no
  more comparing a password hash stored in the shared data blob.
- **Quick-login demo buttons disappear.** Those bypassed real
  authentication, so they're hidden automatically once real auth is
  active — everyone signs in with their actual username and password.
- **Account creation goes through `create-user`.** Adding a
  teacher/student/parent, creating a school, or adding a Super Admin all
  call the Edge Function now, which creates a real Supabase Auth account
  server-side (the service_role key never reaches the browser).
- **Password recovery goes through `reset-owner-password`.** The
  Platform Owner's "Forgot password?" flow validates the recovery code
  server-side and updates the real Supabase password directly.
- **Support tickets moved.** They used to live in one shared blob (a
  real security leak — any school could technically read every other
  school's tickets, or the platform owner's password hashes, by reading
  that same row). Each school's tickets now live in that school's own
  scoped storage key, matching everything else it owns.
- **The old local password check still works as a fallback** — if you
  ever run the app without Supabase configured (e.g. testing locally,
  or inside Claude's own preview), it transparently falls back to the
  original app-level password check. Nothing breaks either way.

### Known rough edges to test before relying on this

This was built without the ability to run it against a real Supabase
project, so treat it as a strong first draft rather than "guaranteed
correct." Specifically worth testing by hand:
- Creating a brand-new school and confirming its whole seeded roster
  (admin, teachers, students, parent) can actually log in.
- The bootstrap flow on a completely fresh Supabase project (first-ever
  owner account creation).
- The owner password-reset flow end to end.
- That a logged-in teacher genuinely cannot read another school's data
  by inspecting network requests (confirms the RLS policies are doing
  their job).

## Deploying it somewhere real

Once Supabase is connected, build the production files with:

```
npm run build
```

This produces a `dist/` folder of plain static files (HTML/CSS/JS) — no
Node server needed to serve them. Any static host works: Vercel, Netlify,
Cloudflare Pages, or WeHostYou if it supports uploading a static site
build. I don't have verified, current documentation for WeHostYou's
specific upload process, so check their docs or support for the exact
steps — what you're looking for is "how do I deploy a static site /
Vite build," and pointing it at the `dist/` folder this command
produces.

Remember to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as
environment variables in whatever host you use — `npm run build` bakes
in whatever's in `.env` at build time, so a host that lets you set env
vars before building is the cleanest approach.
