# Push Thru — architecture

High-level map of how the product is put together.

## Product name

**Push Thru** (UI, legal, App Store).  
Repo / GitHub Pages path remains `just-push` for stable URLs.

## Runtime (web)

| File | Role |
|------|------|
| `index.html` | Game app (invite links `?add=` / `?join=` land here) |
| `store.html` + `store.css` | Marketing storefront (platforms, previews, waitlist) |
| `styles.css` | In-game theme / layout |
| `app.js` | Game logic, auth UI, Supabase client |
| `config.js` | Public flags + Supabase anon config |
| `assets/og-image.png` | Open Graph / link-preview image |
| `site.webmanifest` | Add-to-home-screen / install metadata |
| `privacy.html` / `terms.html` | Legal pages (HTTPS on Pages) |

**Deploy:** GitHub Pages from `main` branch root  
https://www.pushthrugames.com/

**Feature flags** (`config.js`):

| Flag | Current intent |
|------|----------------|
| `enabled` | Master online backend switch |
| `enableChat` | `false` for App Store v1 |
| `enableGithubAuth` | `false` (email preferred; SIWA simpler) |
| `enableEmailAuth` | `true` |
| `publicBaseUrl` | Invite link base URL |
| `minAge` | Age gate (13) |

## Backend (Supabase)

Project: `jpnaotxkcpnwgqkzxdue` (shared with other apps).  
**All Push Thru objects are namespaced `jp_*`.**

### Tables

| Table | Purpose |
|-------|---------|
| `jp_profiles` | Display name, friend code, scores, themes |
| `jp_friendships` | Mutual friend edges |
| `jp_groups` / `jp_group_members` | Groups + membership |
| `jp_board_posts` | Community board (UI off when `enableChat: false`) |
| `jp_friend_messages` | DMs between friends only |

### Auth

- **Anonymous** — default guest play  
- **Email + password** — save guest in place (`updateUser`) or sign in  
- **GitHub OAuth** — optional / currently off in config  

Profile row created by trigger `jp_handle_new_user` on `auth.users` insert.

### Score writes (anti easy-cheat)

Clients **cannot** set score columns via REST. Updates go through:

| RPC | Use |
|-----|-----|
| `jp_record_push` / `jp_record_pushes` | Lifetime + free high (capped) |
| `jp_report_challenge` | 10s best (capped 300) |
| `jp_bump_session` | Sessions played |

Guards: triggers `jp_profiles_guard_scores*`, session flag `jp.allow_scores`.

### Migrations (apply in order)

```
supabase/migrations/
  20260718000000_just_push.sql              # core tables + RLS + friends RPC
  20260718120000_just_push_chat.sql         # board + DMs
  20260718140000_just_push_delete_account.sql
  20260718150000_just_push_security_harden.sql
  20260718160000_just_push_score_guard.sql
```

Apply: `.\scripts\deploy_backend.ps1` or SQL Editor (see `docs/SUPABASE.md`).

## iOS (Capacitor)

| Path | Role |
|------|------|
| `capacitor.config.json` | App id `com.calvinmoney.pushthru` |
| `scripts/build-www.mjs` | Copy web assets → `www/` |
| `ios/` | Xcode project (build on Mac) |

```bash
npm install
npm run build
npx cap sync ios
# Mac: npm run cap:ios
```

## Docs index

| Doc | Contents |
|-----|----------|
| [SUPABASE.md](./SUPABASE.md) | Dashboard checklist, migrations |
| [SECURITY.md](./SECURITY.md) | RLS probe notes, residual risks |
| [APP_STORE.md](./APP_STORE.md) | Ship checklist, privacy labels |
| [STORE_LISTING.md](./STORE_LISTING.md) | App Store copy draft |
| [ios/README.md](../ios/README.md) | Mac / Xcode steps |

## Data flow (play online)

```
User tap → local state (instant UI)
        → debounced jp_record_pushes (server lifetime/high)
Name/theme → jp_profiles UPDATE (scores stripped by trigger)
Leaderboards → SELECT jp_profiles (authenticated)
Friends → jp_add_friend_by_code RPC
```

## Offline

- Progress in `localStorage` (`just-push-v2`)  
- Long share blobs `JP1.` / `JPG1.`  
- On reconnect, reconcile local-ahead scores via capped RPCs  
