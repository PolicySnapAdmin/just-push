# Product separation map

## GitHub (code)

| Product | Repo | Role |
|---------|------|------|
| **Push Thru** | `PolicySnapAdmin/just-push` | This game only — no extension code |
| **PolicySnap** | `PolicySnapAdmin/PolicySnap` | Separate Chrome extension |
| **CalmClick** | Own extension listing | **Not** in `just-push`; no CalmClick tables on this Supabase project |
| **PumpQuest** | Abandoned / elsewhere | DB legacy **removed** from shared Supabase (2026-07-19) |

Org name **PolicySnapAdmin** is historical. Push Thru does not need PolicySnap source in its repo (and does not have it).

To rename hosting later: transfer `just-push` to a new org (e.g. `pushthrugames`) and update GoDaddy `www` CNAME to the new `*.github.io` host.

---

## Supabase project `jpnaotxkcpnwgqkzxdue`

### Push Thru only (`jp_*`)
All game tables and RPCs. App code only calls these.

### PolicySnap (kept — live extension)
| Object | Purpose |
|--------|---------|
| `policysnap_usage_client` | Usage metering |
| `policysnap_usage_ip` | Usage metering |
| `policysnap_get_usage` / `try_consume` / `refund` | RPCs |

### Removed (PumpQuest legacy)
| Dropped | Why |
|---------|-----|
| `profiles` (fuel/loadout/stations) | PumpQuest, not Push Thru |
| `station_visits` | PumpQuest |
| `friendships` (non-`jp_`) | PumpQuest social |

**Not deleted:** PolicySnap tables, any GitHub repos, auth users (shared Auth pool).

### Auth note
All products on this project still share **Auth** (`auth.users`). That’s the remaining soft coupling. Hard split = new Supabase project for Push Thru only (migrate `jp_*` + re-point `config.js` + Auth/SMTP).

---

## What “clean” means now

| Layer | State |
|-------|--------|
| **just-push repo** | Push Thru only |
| **Push Thru runtime** | Only `jp_*` |
| **This Supabase DB** | Push Thru `jp_*` + PolicySnap usage tables |
| **PumpQuest on this DB** | Gone |
| **PolicySnap / CalmClick extensions** | Unchanged store listings; PolicySnap DB intact |

---

## Optional next steps (you choose)

1. **Leave as-is** — fine for launch; PolicySnap + Push Thru share one project, different tables.  
2. **New Supabase for Push Thru** — full isolation (best long-term).  
3. **New GitHub org** — cosmetic/org branding only; update DNS CNAME after transfer.  
