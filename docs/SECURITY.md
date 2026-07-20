# Push Thru — security notes (reverse-engineering lens)

Last live harden: **2026-07-20** (`jp_profiles` lock + grants + group join RPC).  
Not a formal audit — practical threat model for a **public static web app + Supabase**.

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [SUPABASE.md](./SUPABASE.md) · [LEGAL.md](./LEGAL.md)

---

## Architecture reality (what attackers always see)

| Layer | Exposed? | Implication |
|-------|----------|-------------|
| HTML/JS/CSS | **Fully public** | All client logic, skin prices, RPC names are readable |
| `config.js` anon key | **Public by design** | Security = **RLS + RPC checks**, not key secrecy |
| Service role | **Not in client** | Only GitHub Actions secrets / local CLI |
| PostgREST schema | Discoverable when authenticated | Table/RPC names are not secret |

**You cannot hide game rules in the client.** Authority must live in Postgres (triggers + security-definer RPCs).

---

## Threat model

| Actor | Can do |
|-------|--------|
| Internet, no JWT | Almost nothing on `jp_*` (no grants / no rows) |
| Any signed-in player | Read leaderboard-style profile fields; call player RPCs as self |
| RE script kiddie | Call REST/RPC with stolen/own JWT; try forge scores/skins |
| Admin JWT | Admin RPCs only if `jp_admins` row |

---

## Hardened (2026-07-20)

| Risk | Status |
|------|--------|
| REST **forge scores** | Blocked — score columns only change with `jp.allow_scores` |
| REST **forge owned_skins / free legendaries** | **Fixed** — locked unless `jp.allow_skins` (store RPC) |
| REST **steal friend_code / account_ready / session_epoch** | **Fixed** — locked unless `jp.allow_identity` |
| REST **rename bypassing rate limits** | Blocked — `jp.allow_name_change` |
| Wallet balance REST write | Blocked — SELECT-only grants + RLS |
| Direct hygiene / admin without admin row | Blocked — `Admin only` |
| Open **group invite-code directory** | **Fixed** — groups visible only to members; join via `jp_join_group_by_code` |
| Over-broad table GRANTs (DELETE/TRUNCATE on wallets etc.) | **Tightened** to least privilege |

### Profile columns clients may still update via REST

Only non-privileged prefs (e.g. `theme_button`, `theme_bg`). Everything economic/identity goes through RPCs.

---

## Residual risks (accept or improve later)

| Risk | Severity | Notes |
|------|----------|--------|
| **Friend-code scrape** | Med | Any logged-in user can `SELECT` profiles (leaderboards need names/scores). Codes are shareable secrets, not passwords. Mitigate later: public view without `friend_code` + lookup RPC only. |
| **Anonymous signup spam** | Med | Still possible if Anonymous provider ON. Captcha / disable anon when code-accounts are enough. |
| **Automated push RPCs** | Med | Client can spam `jp_record_pushes` within server rules. Add rate limits / velocity checks if abuse appears. |
| **Loot / daily farming multi-account** | Low–Med | Economy is cosmetic; multi-account always possible. |
| **Admin RPC enumeration** | Low | Callable by all authenticated but returns Admin only; still reveals RPC exists. |
| **Chat tables exist** | Low | UI off; RLS still applies if re-enabled. |
| **Static host (GitHub Pages)** | Info | No server WAF; rely on Supabase + Cloudflare at Supabase edge. |
| **Synthetic login emails** | Info | Auto-confirmed for `@login.pushthrugames.com` only. |

---

## Reverse-engineering playbook (defender view)

What a motivated user will try:

1. Open DevTools → Network → copy Supabase REST calls  
2. Replay with modified JSON (`high_score`, `owned_skins`, wallet)  
3. Enumerate `/rest/v1/rpc/*` from app.js  
4. Script friend-code scraping and spam friend requests  
5. Multi-account farm Tokens  

**Your defenses that must keep working:**

- Triggers that **ignore** client values for locked columns  
- Security-definer RPCs that set `jp.allow_*` only inside trusted functions  
- **No** service_role in the browser  
- Least-privilege GRANTs so RLS is not the only line  

---

## Ops checklist after schema changes

1. Any new profile column that must not be client-forged → add to `jp_profiles_guard_locked_cols`  
2. Any new write path for that column → `set_config('jp.allow_…', 'on', true)` in the definer RPC  
3. Prefer **RPC-only writes** for money/identity  
4. Re-run probes (below) after deploys  
5. Never put service_role in client or public Actions logs  

---

## Quick probes (PowerShell-ish)

```powershell
# Unauth should fail / empty
# Auth guest PATCH owned_skins should leave array unchanged (still ["rose"] or prior real ownership)
# Auth guest PATCH high_score should stay 0 unless via play RPCs
```

Manual: browser console while signed in — if REST can grant `runic` for free, guards regressed.

---

## Short answers

| Question | Answer |
|----------|--------|
| Is service_role public? | **No** |
| Can no-login users read profiles? | **No** |
| Can logged-in users forge skins via REST? | **No** (after 2026-07-20 harden) |
| Are scores / names public to players? | **Yes** (game design) |
| Friend codes secret? | **No** — treat as public-ish share codes |
| Chat public? | UI **off** |

---

## Optional next hardenings (not done)

1. `jp_public_profiles` view **without** `friend_code`; leaderboards use the view  
2. Supabase Auth captcha / disable Anonymous  
3. Rate-limit RPCs (Edge Function or pg_net + counters)  
4. CSP headers via Cloudflare or custom host (GitHub Pages is limited)  
5. Separate Supabase project for Push Thru only (isolation from PolicySnap)  
