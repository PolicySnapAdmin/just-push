# Push Thru

Push a button. Count the pushes. Beat the clock. Beat your friends.

**Live site:** https://policysnapadmin.github.io/just-push/  
**Privacy:** https://policysnapadmin.github.io/just-push/privacy.html · **Terms:** https://policysnapadmin.github.io/just-push/terms.html  
**App Store prep:** see [APP_STORE.md](./APP_STORE.md)

| Feature | Details |
|--------|---------|
| **Free push** | Unlimited taps, session + lifetime + high score |
| **Levels** | 1 push = 1 XP · scales up to level 99 |
| **Chat** | Community board (public posts) + private DMs with friends |
| **10 second** | How many can you hit before the timer hits zero? |
| **Friends** | Short codes (online) or share blobs (offline) |
| **Groups** | Create / join with invite codes, group boards |
| **Style** | 10 button colors + 10 backgrounds |
| **Backend** | Supabase (`jp_*` tables) on your existing project |
| **Host** | GitHub Pages — [open live](https://policysnapadmin.github.io/just-push/) |

## Go live checklist

Already done in this repo:

- [x] App on GitHub Pages (HTTPS)
- [x] `publicBaseUrl` set for invite links
- [x] Supabase tables (`jp_*`) + anon key in `config.js`
- [x] Anonymous auth enabled (guest play)

**You still do once in the Supabase dashboard:**

1. Open [URL Configuration](https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue/auth/url-configuration)
2. **Site URL:**
   ```text
   https://policysnapadmin.github.io/just-push/
   ```
3. **Redirect URLs** — add all of these:
   ```text
   https://policysnapadmin.github.io/just-push/**
   http://localhost:3000/**
   http://127.0.0.1:3000/**
   ```
4. Confirm [Anonymous provider](https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue/auth/providers) is **ON**

Then on two phones:

1. Open https://policysnapadmin.github.io/just-push/
2. Set a display name when prompted
3. **Friends → Share invite link** (or create a **Group** and Share)
4. Friend opens the link → auto-added / joins the group
5. Play **10 second** and check the boards

## Quick start (local)

Open `index.html` in a browser, or:

```bash
npx --yes serve .
```

## Supabase setup (one-time)

Uses the shared project **jpnaotxkcpnwgqkzxdue** with namespaced tables (`jp_profiles`, `jp_friendships`, `jp_groups`, `jp_group_members`) so PumpQuest / PolicySnap are untouched.

### 1. Run the migration(s)

**Option A — SQL Editor (easiest)**

1. Open [SQL Editor](https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue/sql/new)
2. Paste everything in `supabase/migrations/20260718000000_just_push.sql` and **Run**
3. Then paste `supabase/migrations/20260718120000_just_push_chat.sql` and **Run** (community board + friend DMs)

**Option B — CLI**

```powershell
cd C:\Users\conor\just-push
supabase login
# paste the migration in SQL editor if db query isn't available
.\deploy_backend.ps1
```

### 2. Enable auth providers

In Supabase → **Authentication → Providers**:

1. **Anonymous** — ON (guest play + auto profile)
2. **GitHub** — ON if you want “Sign in with GitHub”
   - Create a GitHub OAuth App: https://github.com/settings/developers  
   - Homepage: your Pages URL  
   - Callback: `https://jpnaotxkcpnwgqkzxdue.supabase.co/auth/v1/callback`  
   - Paste Client ID / Secret into Supabase

### 3. URL configuration

**Authentication → URL Configuration**:

- Site URL: `https://policysnapadmin.github.io/just-push/`
- Redirect URLs:
  - `https://policysnapadmin.github.io/just-push/**`
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`

### 4. Config

`config.js` already points at this project’s public anon key.  
Set `enabled: false` to force pure offline mode.

## GitHub Pages deploy

```powershell
cd C:\Users\conor\just-push
git init
git add .
git commit -m "Push Thru: free + 10s challenge + Supabase"
gh repo create just-push --public --source=. --remote=origin --push
```

Then:

1. Repo → **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (workflow `.github/workflows/deploy-pages.yml` deploys the folder)
3. Add the Pages URL to Supabase redirect URLs

If the site lives at `https://USER.github.io/just-push/`, set that as Site URL and ensure assets load with relative paths (they already do).

## Share with friends (phones)

After the site is on **HTTPS** (GitHub Pages):

1. Open **Friends → Share invite link** (uses the phone share sheet).
2. Friend opens the link → game loads → **you’re auto-added**.
3. Or create a **Group** and share that link so everyone shares one board.

Link shapes:

```text
https://policysnapadmin.github.io/just-push/?add=A7K2M9
https://policysnapadmin.github.io/just-push/?join=GROUP1
```

You can also paste a full invite link into the “Add friend” / “Join group” fields.

## How online friends / groups work

1. You sign in anonymously (automatic) or with GitHub.
2. You get a short **friend code** (e.g. `A7K2M9`).
3. Scores (`high_score`, `challenge_best`, etc.) sync to `jp_profiles`.
4. Adding a friend looks up their code and writes `jp_friendships`.
5. Groups use `jp_groups.invite_code` + `jp_group_members`.
6. Global 10s board = top `challenge_best` on `jp_profiles`.

If Supabase is unreachable, the app falls back to localStorage + long share codes (`JP1.…` / `JPG1.…`).

## Files

```
just-push/
  index.html
  styles.css
  app.js
  config.js
  supabase/migrations/20260718000000_just_push.sql
  .github/workflows/deploy-pages.yml
  deploy_backend.ps1
  README.md
```

## Security notes

- Anon key is public by design (like Firebase web config).
- RLS: users update only their own profile; friendships/groups scoped to auth.
- Anonymous auth can be abused for spam accounts — fine for a toy clicker; tighten later with rate limits / captcha if needed.
