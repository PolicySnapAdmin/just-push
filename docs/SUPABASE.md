# Push Thru — Supabase checklist

Project ref: **`jpnaotxkcpnwgqkzxdue`**  
Dashboard: https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue

## Already applied (live)

If you’ve been shipping with this agent/session, these migrations should already be on the DB:

1. Core `jp_*` tables + RLS + friend RPCs  
2. Chat tables + DM RLS  
3. `jp_delete_my_account`  
4. DM body-guard + anon revoke  
5. Score column guards + play RPCs  

Verify in SQL Editor:

```sql
select tablename from pg_tables
where schemaname = 'public' and tablename like 'jp_%'
order by 1;

select proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname like 'jp_%'
order by 1;
```

## Dashboard settings (you may need to confirm)

### Auth → Providers

| Provider | Needed? | Status to set |
|----------|---------|----------------|
| **Anonymous** | Yes (guest play) | **ON** |
| **Email** | Yes (Settings save / sign-in) | **ON** |
| GitHub | Optional | OFF unless you set `enableGithubAuth: true` |

Email tips:

- **Confirm email**: OFF = instant link (what you saw — no confirmation mail). ON = requires mailbox + SMTP.  
- Password min length: 6 matches the app UI.

### Auth → URL configuration

| Field | Value |
|-------|--------|
| Site URL | `https://www.pushthrugames.com/` |
| Redirect URLs | `https://www.pushthrugames.com/**` |
| | `http://localhost:3000/**` |
| | `http://127.0.0.1:3000/**` |

### API keys

| Key | In app? |
|-----|---------|
| **anon** `public` | Yes — `config.js` (safe with RLS) |
| **service_role** | **Never** in client or this repo |

## Re-apply all migrations (Windows)

```powershell
cd C:\Users\conor\just-push
.\scripts\deploy_backend.ps1
```

Requires Supabase CLI logged in + linked (`supabase link`).

Or paste each file under `supabase/migrations/` into the SQL Editor **in filename order**.

## Project isolation

Push Thru only uses **`jp_*`** tables and functions.  
Other products must not share this schema. See [SEPARATION.md](./SEPARATION.md) if you still have legacy tables from older apps on the same Supabase project.

## Automated cleanup (hygiene)

You do **not** need to push for each cleanup once this is live.

| Mechanism | What it does |
|-----------|----------------|
| **`jp_run_hygiene()`** | DB function: deletes empty guest `Player`s (0 scores, &gt;30 min old) and anonymous **name+score clones** (Billy/Cleetis pattern) |
| **pg_cron** (if enabled on project) | Runs `jp_run_hygiene` hourly at :15 |
| **GitHub Action** `.github/workflows/hygiene-cleanup.yml` | Daily backup; needs repo secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| **Manual** | `select public.jp_run_hygiene();` in SQL Editor, or `.\scripts\cleanup_empty_guests.ps1` |

Safe rules: never deletes email users; never deletes anyone with real progress unless they are a clear anon clone of an older same-name same-score profile.

### Enable GitHub Action secrets (optional)

Repo → **Settings → Secrets and variables → Actions**:

- `SUPABASE_URL` = `https://jpnaotxkcpnwgqkzxdue.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key (Dashboard → Settings → API) — **never** put this in client code

## Optional later

- Auth rate limits / CAPTCHA for anonymous spam  
- Custom SMTP for branded confirmation emails  
- Restrict `jp_groups` SELECT so invite codes aren’t listable by all users  
