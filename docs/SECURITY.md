# Push Thru — security notes

Last live probe: 2026-07-18 (updated after score-guard + email auth).  
Not a formal audit; practical review of Supabase RLS + client surface.

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [SUPABASE.md](./SUPABASE.md)

## Short answers

| Question | Answer |
|----------|--------|
| Is the **service role** key public? | **No** — not in repo or client. Only the **anon** key is in `config.js` (expected for Supabase web apps). |
| Can strangers hit the API with **no login** and read data? | **No** — unauthenticated queries return empty / are denied. |
| Are **private DMs** visible to other players? | **No** — only sender & recipient (verified). Non-friends cannot send. |
| Are **friendships** public? | **No** — only rows involving you. |
| Are **scores / names / friend codes** public? | **Yes, to any signed-in player** (including guests) — intentional for leaderboards & add-by-code. |
| Is **chat UI** public right now? | **Off** in v1 (`enableChat: false`); tables still exist with RLS if re-enabled. |

---

## Threat model (what “public” means)

Anyone who opens the app becomes a **guest authenticated user** (anonymous auth). That is different from the internet-at-large with zero token.

- **Internet without login:** blocked for `jp_*` data  
- **Any guest / signed-in player:** can read game-public data (profiles for boards)  
- **You + friend only:** DMs, friendship edges  

---

## Live probe results (summary)

### Unauthenticated (anon key only, no user JWT)
| Action | Result |
|--------|--------|
| SELECT profiles / friendships / groups / posts / DMs | Empty `[]` (no rows) |
| INSERT DM | 401 |
| RPC delete account / add friend | “Not authenticated” |

### Authenticated guest
| Action | Result |
|--------|--------|
| Update **own** profile | OK |
| Update **someone else’s** profile | Blocked (0 rows / no change) |
| Insert friendship as another user | **403** |
| Forge board post as another user | **403** |
| Read **others’ DMs** | Empty |
| Send DM without friendship | **403** |
| Send DM to friend | OK |
| Friend reads that DM | OK |
| Recipient rewrite DM `body` | Was **possible** → **fixed** with trigger (see below) |

### Client secrets
| Item | Status |
|------|--------|
| Service role key in repo | Not found |
| Anon key in `config.js` | Public by design (RLS must protect data) |

---

## What is intentionally visible to all players

These are **not** hidden — the game needs them:

- Display name  
- Friend code  
- High score, 10s best, lifetime pushes / XP, sessions  
- Theme fields on profile  
- Global leaderboard rows  
- Group names + **invite codes** (any logged-in user can list groups if any exist)  
- Community board posts (when chat is enabled)

**Implication:** friend codes are “shareable secrets,” not strong secrets. Anyone online can scrape codes from `jp_profiles` and add people. Acceptable for a casual game; not for high-security identity.

---

## What stays private

| Data | Who can see |
|------|-------------|
| Private DMs (`jp_friend_messages`) | Only the two participants |
| Friendship graph | Only participants of each edge |
| Auth emails / providers | Supabase Auth (not in `jp_*` tables) |
| Service role / DB password | Dashboard / server only |

---

## Fix applied: DM tamper

**Issue:** Recipient UPDATE policy allowed changing `body` (and other columns), not only `read_at`.

**Fix:** migration `20260718150000_just_push_security_harden.sql`  
- Trigger `jp_friend_messages_guard_update` allows only `read_at` to change  
- Explicit `REVOKE` table access from `anon` role  

---

## Residual risks (accept or improve later)

| Risk | Severity | Notes |
|------|----------|--------|
| Unlimited anonymous signups | Medium | Spam accounts / leaderboard noise. Mitigate with rate limits / captcha later. |
| Friend-code scraping | Low–Med | All codes readable by guests. OK for casual; could add rate limits. |
| Group invite codes listable | Low–Med | `jp_groups` SELECT is open to authenticated. Random 6-char codes; brute force still possible. |
| Shared Supabase project | Low | `jp_*` namespacing + RLS; other apps on same project must not weaken shared policies. |
| Security definer RPCs | Low | `jp_delete_my_account`, `jp_add_friend_by_code` use `auth.uid()` — only act as caller. |
| No server rate limits on posts/DMs | Low | Client cooldowns only; re-enable chat carefully. |
| Client sets scores via REST | **Mitigated** | Score columns locked by trigger; play uses RPCs only (increment/capped). |
| Public GitHub repo | Info | Anon key + source visible — expected for this architecture. |
| Email without confirm | Low | Instant account link; attackers need password. Enable confirm later if needed. |
| Delete account UX | Mitigated | Multi-step modal + type-to-confirm + delay. |

---

## Hardening ideas (optional later)

1. Restrict profile SELECT columns via a `jp_public_profiles` view (hide nothing critical today).  
2. Friend add only via RPC (already primary path); remove direct friendship insert if unused.  
3. Group join only via RPC that checks invite code without listing all groups.  
4. ~~Score updates via RPC~~ — done (`jp_record_pushes` / guards).  
5. Supabase Auth rate limits / captcha for anonymous spam.  
6. If chat ships: report/block + moderation.  
7. Join groups only via invite RPC (avoid listing all invite codes).

---

## How to re-run a quick check

```powershell
# Unauthenticated should return []
$anon = "<anon key from config.js>"
$h = @{ apikey = $anon; Authorization = "Bearer $anon" }
Invoke-RestMethod -Uri "https://jpnaotxkcpnwgqkzxdue.supabase.co/rest/v1/jp_profiles?select=id&limit=1" -Headers $h
```

Expect: `[]` or empty, not other people’s rows without a user session.
