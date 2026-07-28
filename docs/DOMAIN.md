# Domains — game vs studio

Two products, two domains. Do **not** host both on the same GitHub Pages repo.

| Domain | Role | Hosts |
|--------|------|--------|
| **pushthrugame.com** (singular) | **The game** | This repo (`just-push`) — play, store, privacy, terms, cookies |
| **pushthrugames.com** (plural) | **Studio hub** | Separate repo `pushthrugames-hub` — catalog + links to games |

Canonical play URL: **https://www.pushthrugame.com/**

Synthetic auth emails stay `@login.pushthrugames.com` (identity only — not a public site). Do not change without migrating auth users.

---

## Live game URLs (this repo)

| Page | URL |
|------|-----|
| Play | https://www.pushthrugame.com/ |
| Apex | https://pushthrugame.com/ (should redirect or serve same as www) |
| Store | https://www.pushthrugame.com/store.html |
| Privacy | https://www.pushthrugame.com/privacy.html |
| Terms | https://www.pushthrugame.com/terms.html |

Repo `CNAME` → `www.pushthrugame.com`  
GitHub Pages custom domain → **www.pushthrugame.com** · Enforce HTTPS.

---

## DNS — pushthrugame.com (game)

At the registrar (GoDaddy, etc.):

### www → GitHub Pages

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `www` | `policysnapadmin.github.io` |

### Apex `@` → GitHub Pages (recommended)

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | `185.199.108.153` |
| **A** | `@` | `185.199.109.153` |
| **A** | `@` | `185.199.110.153` |
| **A** | `@` | `185.199.111.153` |

Remove parking / “coming soon” A records and website-builder forwards on this domain.

**Simpler alternative:** permanent forward `pushthrugame.com` → `https://www.pushthrugame.com/`.

### GitHub Pages (just-push)

1. Repo **PolicySnapAdmin/just-push** → Settings → Pages  
2. Custom domain: `www.pushthrugame.com`  
3. Wait for DNS check green · Enforce HTTPS  

---

## DNS — pushthrugames.com (studio hub)

Hosted by **pushthrugames-hub** (not this repo).

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `www` | `policysnapadmin.github.io` |
| **A** | `@` | same four `185.199.*` GitHub IPs (or 301 → www) |

Pages custom domain on hub repo: `www.pushthrugames.com`.

Until the hub is live, optional temporary forward:

- `pushthrugames.com` / `www` → `https://www.pushthrugame.com/`

Remove that forward when the hub Pages site is ready so plural is no longer the game.

---

## Supabase Auth URL config

**Authentication → URL configuration**

- **Site URL:** `https://www.pushthrugame.com/`
- **Redirect URLs** (keep old plural during transition, then drop later):

```
https://www.pushthrugame.com/**
https://www.pushthrugame.com/
https://www.pushthrugame.com/?tab=style
https://www.pushthrugame.com/?tab=friends
https://www.pushthrugame.com/store.html
https://www.pushthrugame.com/privacy.html
https://www.pushthrugame.com/terms.html
https://pushthrugame.com/**
https://pushthrugame.com/
https://www.pushthrugames.com/**
https://pushthrugames.com/**
```

Same Supabase project is fine for the game. Hub does not need Supabase unless you add studio accounts later. New games → new table prefixes or new projects.

---

## Cutover checklist

- [ ] DNS for **pushthrugame.com**: www CNAME + apex A (or forward to www)
- [ ] `just-push` Pages custom domain = `www.pushthrugame.com` · HTTPS
- [ ] Supabase Site URL + redirects include singular game domain
- [ ] Smoke: play, store, privacy, invite link, email sign-in
- [ ] Deploy **pushthrugames-hub** with Pages domain `www.pushthrugames.com`
- [ ] Remove plural→game permanent forward once hub works
- [ ] TikTok / bio → `https://www.pushthrugame.com/`
- [ ] Later: drop old plural redirect URLs from Supabase if unused

---

## What stays on which domain

| Lives on pushthrugame.com | Lives on pushthrugames.com |
|---------------------------|----------------------------|
| Game UI (`index.html`, `app.js`) | Hub catalog |
| store, privacy, terms, cookies | Future game cards / studio about |
| Invite / deep links | Links **out** to each game |
| Supabase client for Push Thru | No game logic |
