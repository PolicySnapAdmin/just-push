# Separating Push Thru from PolicySnap / PumpQuest / other apps

## What’s already clean

### GitHub repo `just-push`
Tracked source is **only Push Thru** (game, docs, `jp_*` migrations, Capacitor iOS).  
No PolicySnap, PumpQuest, or Calm Click application code lives in this repo.

| Item | Notes |
|------|--------|
| Code | Push Thru only |
| Hosting | GitHub Pages via org **PolicySnapAdmin** (name is historical) |
| Pages host | `policysnapadmin.github.io` ← DNS `www` CNAME target |
| Support email | `calvin.money@gmail.com` (your contact, fine) |
| Bundle ID | `com.calvinmoney.pushthru` (fine) |

### What still ties names together (optional cleanup)

| Tie | How to fully separate later |
|-----|-----------------------------|
| GitHub org **PolicySnapAdmin** | Create org e.g. `pushthrugames` → transfer `just-push` repo → update DNS `www` CNAME to `newowner.github.io` → GitHub Pages custom domain |
| Supabase project with other tables | Create a **new** Supabase project for Push Thru only and migrate `jp_*` (recommended for hard isolation) |

---

## Supabase: current situation

Project: **`jpnaotxkcpnwgqkzxdue`**

Push Thru owns everything named **`jp_*`**.

Other **public** tables seen on this project (other products / legacy):

| Table | Likely product |
|-------|----------------|
| `profiles` | Other app (not `jp_profiles`) |
| `friendships` | Other app (not `jp_friendships`) |
| `policysnap_usage_client` | PolicySnap |
| `policysnap_usage_ip` | PolicySnap |
| `station_visits` | Legacy / other |

**Do not drop these** unless you are sure those products are dead and you accept irreversible data loss.

### Safe posture for Push Thru
- App only touches `jp_*` (already true).
- Never run broad `DROP SCHEMA public CASCADE`.
- Hygiene RPCs only touch `jp_*` / empty guests.

### Hard isolation options

**A. Soft (recommended short term)**  
- Leave shared project.  
- Document “only `jp_*`”.  
- Don’t add new non-`jp_*` tables here.

**B. Hard (best long term)**  
1. Create new Supabase project (e.g. “Push Thru”).  
2. Apply all `supabase/migrations/*.sql` there.  
3. Export/import `jp_*` data if needed.  
4. Point `config.js` at new URL + anon key.  
5. Re-do Auth URLs, SMTP, Email provider.  
6. Old project keeps PolicySnap/PumpQuest tables alone.

**C. Nuclear (only if other apps are abandoned)**  
Drop non-`jp_*` tables/functions on this project after backup.  
**Requires explicit yes from you** — irreversible for those apps.

---

## GitHub Pages + domain

Today:

```text
www CNAME → policysnapadmin.github.io
```

That hostname is the **GitHub user/org** that owns the Pages site. Renaming/transferring the org changes this CNAME.

If you transfer the repo to a new org `pushthrugames`:

1. Transfer repo in GitHub.  
2. Pages → custom domain `www.pushthrugames.com`.  
3. GoDaddy: CNAME `www` → `pushthrugames.github.io` (or the new org’s pages host).  
4. Keep apex A records → GitHub IPs.

---

## Checklist already done in repo docs

- [x] Removed “shared with PumpQuest/PolicySnap” wording from config/README/SUPABASE  
- [x] Migrations described as Push Thru only  
- [ ] Optional: new GitHub org + transfer  
- [ ] Optional: new Supabase project + migrate  

---

## If you want the agent to do more

| Ask | What happens |
|-----|----------------|
| “Only clean docs/comments” | Already done / continue |
| “Move to a new Supabase project” | Guide export + new project (you create project + paste keys) |
| “Drop PolicySnap tables on this DB” | **Only after you confirm** those apps are dead forever |
