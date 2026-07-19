# Push Thru — backups, redundancy & disaster recovery

Last updated: 2026-07-19  
Project: Supabase **`jpnaotxkcpnwgqkzxdue`** · App: https://www.pushthrugames.com/

This is the runbook for **breach** and **total data failure**. Keep a private copy of this doc if the repo is ever lost (it is also in git).

---

## What must survive

| Layer | What it is | Where it lives | Backup strategy |
|-------|------------|----------------|-----------------|
| **Game code** | HTML/JS/CSS, Capacitor, docs | GitHub `PolicySnapAdmin/just-push` | Git (already). Optional: second remote / zip of repo |
| **DB schema** | `jp_*` tables, RLS, RPCs | `supabase/migrations/*.sql` + live DB | Migrations in git = primary. Re-apply with `deploy_backend.ps1` |
| **DB data** | Profiles, scores, wallets, friends, PvP, etc. | Supabase Postgres | **Logical dumps** via `scripts/backup_pushthru.ps1` |
| **Auth users** | Emails, UUIDs, anonymous flags | Supabase Auth | Included in backup (metadata only — **no passwords**) |
| **Secrets** | `service_role`, DB password, SMTP, GH secrets | Dashboard / GH / password manager | **Password manager inventory** (never in git) |
| **Domain / DNS** | `pushthrugames.com` | GoDaddy (or current registrar) | Registrar account recovery + docs/DOMAIN.md |
| **Hosting** | GitHub Pages | GitHub | Re-enable Pages from `main` + CNAME |

PolicySnap metering tables (`policysnap_*`) share this Supabase project. Default backup is **Push Thru only** (`jp_*`). Use `-IncludePolicySnap` if you need those too.

---

## Quick start (do this now, then weekly)

```powershell
cd C:\Users\conor\just-push
.\scripts\backup_pushthru.ps1 -Zip
```

Creates:

```text
backups/yyyyMMdd-HHmmss/
  MANIFEST.json
  config.js                 # public client config snapshot
  migrations/               # full SQL schema history
  data/
    jp_profiles.json
    jp_wallets.json
    ...
    auth_users.json
backups/yyyyMMdd-HHmmss.zip   # if -Zip
```

Then **copy the zip off this PC** (encrypted USB, private OneDrive/Google Drive folder, or another machine).  
`backups/` is **gitignored** — never commit it (repo is public).

Suggested cadence:

| Cadence | Action |
|---------|--------|
| **Weekly** | `.\scripts\backup_pushthru.ps1 -Zip` → copy offsite |
| **Before risky deploys** | Same |
| **Monthly** | Open zip, skim MANIFEST row counts, confirm not empty |
| **After key rotation** | New backup; discard or re-encrypt old ones if keys leaked |

---

## Redundancy map (how many copies?)

Aim for **3-2-1**:

1. **Live** — Supabase production  
2. **Local** — latest zip on this machine (`backups/`)  
3. **Offsite** — different disk/cloud, not the same laptop  

Plus:

- **Code**: GitHub (and optional personal fork / second remote)  
- **Schema**: migrations in every clone of the repo  

### Supabase platform backups

Dashboard → **Project Settings → Database → Backups** (wording varies by plan):

| Plan (typical) | What you get |
|----------------|--------------|
| Free | Limited / daily snapshots may be short retention; **do not rely on this alone** |
| Pro | Daily backups + **PITR** (point-in-time recovery) window |

CLI (if available on your plan):

```powershell
supabase backups list
# restore only after reading Supabase docs — destructive
```

Logical dumps from `backup_pushthru.ps1` are your **portable** insurance if the project is deleted or the org is locked.

---

## Secrets inventory (store in a password manager)

Record **where** to re-create, not necessarily the live values in plain notes:

| Secret | Where to get / set | Used by |
|--------|-------------------|---------|
| Supabase **anon** key | Dashboard → Settings → API | `config.js` (public) |
| Supabase **service_role** | Dashboard → Settings → API | Hygiene Action, backups, admin scripts — **never client** |
| Supabase **DB password** | Dashboard → Database settings | CLI dump/link, PITR tools |
| Supabase **access token** | https://supabase.com/dashboard/account/tokens | `supabase login` |
| GitHub Actions `SUPABASE_URL` | Repo → Settings → Secrets | `hygiene-cleanup.yml` |
| GitHub Actions `SUPABASE_SERVICE_ROLE_KEY` | same | same |
| Resend / SMTP (if any) | Email provider + Supabase Auth SMTP | Password reset / mail |
| Domain registrar login | GoDaddy etc. | DNS, HTTPS, email domain |
| Apple / store accounts | Later | iOS ship |
| GitHub org/owner 2FA recovery codes | Password manager | Repo + Pages |

After a **breach**, rotate **service_role**, DB password, GitHub secrets, SMTP keys, and force password resets as needed.

Re-wire hygiene after rotating service_role:

```powershell
.\scripts\set_github_hygiene_secrets.ps1 -TriggerRun
```

---

## Scenario A — Total Supabase data failure (project wiped / corrupt)

### Goal
New or empty project → schema → data → point the app at it.

### Steps

1. **Create** a new Supabase project (or restore from Supabase dashboard backup / PITR if available — preferred when possible).

2. **Schema** from git (not from a half-restored DB):

   ```powershell
   cd C:\Users\conor\just-push
   supabase link --project-ref <NEW_REF>
   .\scripts\deploy_backend.ps1 -ProjectRef <NEW_REF>
   ```

3. **Auth users**  
   - Dashboard backups / PITR usually restore Auth + DB together.  
   - From logical backup alone: you have `auth_users.json` (ids + emails) but **not password hashes**.  
   - Practical recovery: recreate users or use Admin API invites; players **reset passwords**.  
   - Keep the same UUIDs if you re-insert into `auth.users` via support/SQL only if you know what you’re doing (easy to break Auth). Prefer platform restore for Auth.

4. **Game data** (`data/jp_*.json`)  
   - Load with **service_role** into empty tables (order matters for FKs):

   Suggested order:

   1. `jp_profiles` (PK = auth user id — users must exist first)  
   2. `jp_admins`  
   3. `jp_wallets` → `jp_wallet_ledger`  
   4. `jp_friendships` / `jp_friend_requests`  
   5. `jp_groups` → `jp_group_members`  
   6. `jp_board_posts` / `jp_friend_messages`  
   7. `jp_pvp_*` / `jp_territory_scores` / `jp_name_history`  

   Use Supabase SQL Editor or a one-off script with service_role `POST` bulk insert.  
   Temporarily relax or understand score-guard triggers if bulk load fails (see migrations).

5. **Point the app**

   - Update `config.js` → `supabaseUrl` + `supabaseAnonKey` for the new project  
   - Auth URL config: Site URL + redirects for `https://www.pushthrugames.com/**`  
   - Providers: Anonymous + Email as in [SUPABASE.md](./SUPABASE.md)  
   - Re-set GitHub hygiene secrets for the new project  
   - Commit + push Pages

6. **Verify**

   - Sign in as admin, Dev tools stats  
   - Spot-check leaderboard, one wallet, one friendship  
   - Run `.\scripts\backup_pushthru.ps1 -Zip` as the new baseline

---

## Scenario B — Breach (keys leaked / malicious access)

### Immediate (first hour)

1. **Rotate Supabase service_role** and **DB password** (Dashboard).  
2. **Revoke** old GitHub Actions secret → run `set_github_hygiene_secrets.ps1`.  
3. **Review** Auth users: ban unknown, check admin list (`jp_admins`).  
4. **Disable** anonymous signups temporarily if spam/abuse (Auth settings) if needed.  
5. **Check** recent scores / wallet ledger for impossible jumps; fix via admin tools / SQL.  
6. **Assume** any unencrypted backup that used the old key path is sensitive; re-export after rotation.

### Then

7. Force password reset for high-value accounts (admin + email users).  
8. Full logical backup → offsite.  
9. Read [SECURITY.md](./SECURITY.md) residual risks; tighten if the breach vector is known.  
10. If client anon key was “leaked”: **expected** for web apps — RLS is the control. Still rotate if you want a clean slate (requires `config.js` update + deploy).

---

## Scenario C — GitHub / Pages gone

1. Clone from any machine that has the repo, or restore from a repo zip/mirror.  
2. Create new GitHub repo → push `main`.  
3. Settings → Pages: branch `main` / root, custom domain `www.pushthrugames.com`, Enforce HTTPS.  
4. DNS still points at GitHub — update CNAME target if org/user renamed.  
5. `config.js` unchanged if Supabase still alive.

---

## Scenario D — Domain registrar lockout

1. Recover GoDaddy (or current) account via registrar support.  
2. Rebuild DNS from [DOMAIN.md](./DOMAIN.md):  
   - `www` CNAME → `policysnapadmin.github.io` (or new Pages host)  
   - Apex A records → GitHub Pages IPs (or forward apex → https://www…)  
3. GitHub Pages → custom domain → wait for cert → Enforce HTTPS.

---

## What this system does **not** cover

| Gap | Mitigation |
|-----|------------|
| Password hashes | Supabase platform backup / PITR, or password-reset all users |
| Real-time RPO (seconds) | Pro PITR; free tier = accept hours/days of loss |
| Encrypted automated cloud upload | Optional next step (age/gpg + private store) |
| iOS App Store binary | Xcode archives / App Store Connect |
| Email content in Resend | Provider dashboard |

---

## Automated backup later (optional)

Because this GitHub repo is **public**, do **not** upload raw JSON dumps as Actions artifacts (anyone can download them).

Safer automation options:

1. **Manual weekly** zip + private cloud (simplest, fine at current scale).  
2. **Private** backup repo or S3 bucket + encrypted blob (key only in GH secrets).  
3. Upgrade Supabase to **Pro** for platform PITR + keep logical dumps weekly.

---

## Checklist — “are we tidy?”

- [ ] Ran `.\scripts\backup_pushthru.ps1 -Zip` at least once  
- [ ] Zip copied **off this PC**  
- [ ] Password manager has secrets inventory (table above)  
- [ ] GitHub hygiene secrets set (daily cleanup)  
- [ ] Migrations still only path for schema changes  
- [ ] Know how to open Supabase Dashboard Backups page for your plan  
- [ ] Domain registrar 2FA + recovery codes stored  

---

## Related docs

- [SUPABASE.md](./SUPABASE.md) — dashboard + migrations  
- [SECURITY.md](./SECURITY.md) — RLS / threat model  
- [DOMAIN.md](./DOMAIN.md) — DNS / HTTPS  
- [SEPARATION.md](./SEPARATION.md) — PolicySnap co-tenancy  
