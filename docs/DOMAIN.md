# Custom domain — pushthrugames.com

## Live URLs

| Page | URL |
|------|-----|
| Play | https://www.pushthrugames.com/ |
| Apex (after DNS fix) | https://pushthrugames.com/ |
| Store | https://www.pushthrugames.com/store.html |
| Privacy | https://www.pushthrugames.com/privacy.html |
| Terms | https://www.pushthrugames.com/terms.html |

Repo `CNAME` file → `www.pushthrugames.com`  
GitHub Pages custom domain should be **www.pushthrugames.com** (with HTTPS enforced).

---

## Why `pushthrugames.com` (no www) shows “launching soon”

**www** is correct: it CNAMEs to `policysnapadmin.github.io` (GitHub Pages).

**Bare domain** still has **A records** aimed at parking/hosting (often GoDaddy / “coming soon”), **not** GitHub:

| Host | Currently points at (broken) | Should point at (GitHub) |
|------|------------------------------|---------------------------|
| `@` / apex | `13.248.243.5`, `76.223.105.230` (parking) | GitHub Pages A records below |

This is fixed **at your domain registrar / DNS host**, not in the game code.

---

## Fix apex DNS (do this at your registrar)

Wherever DNS for `pushthrugames.com` is managed (GoDaddy, Namecheap, Cloudflare, Google Domains, etc.):

### 1. Remove parking / “coming soon” for the root

Delete or replace any of these on the **apex** (`@` / `pushthrugames.com`):

- A records to `13.248.x.x` / `76.223.x.x` (or other parking IPs)
- “Forwarding”, “Parked”, “Coming soon”, “Website builder” for the root
- ANAME/ALIAS to a parking host

### 2. Point apex `@` at GitHub Pages

Add **four A records** (name/host = `@` or blank, depending on registrar):

| Type | Name / Host | Value | TTL |
|------|-------------|--------|-----|
| **A** | `@` | `185.199.108.153` | 300 or Auto |
| **A** | `@` | `185.199.109.153` | 300 or Auto |
| **A** | `@` | `185.199.110.153` | 300 or Auto |
| **A** | `@` | `185.199.111.153` | 300 or Auto |

Optional IPv6 (AAAA), if your registrar supports them:

| Type | Name | Value |
|------|------|--------|
| **AAAA** | `@` | `2606:50c0:8000::153` |
| **AAAA** | `@` | `2606:50c0:8001::153` |
| **AAAA** | `@` | `2606:50c0:8002::153` |
| **AAAA** | `@` | `2606:50c0:8003::153` |

### 3. Keep www on GitHub (already working)

| Type | Name / Host | Value |
|------|-------------|--------|
| **CNAME** | `www` | `policysnapadmin.github.io` |

Do **not** point `www` at parking or at the apex in a loop.

### 4. GitHub Pages settings

1. Repo **PolicySnapAdmin/just-push** → **Settings → Pages**
2. Custom domain: `www.pushthrugames.com`
3. Wait for DNS check green
4. Enable **Enforce HTTPS**
5. Optional: check **“Redirect apex to www”** / dual domain support if GitHub shows it (some UIs list both once apex A records are correct)

### 5. Wait and test

DNS can take **5 minutes to a few hours** (sometimes up to 24–48h).

```text
nslookup pushthrugames.com
```

You want addresses in the `185.199.x.x` range (GitHub), **not** `13.248` / `76.223`.

Then open:

- https://pushthrugames.com/
- https://www.pushthrugames.com/

Both should show the game (apex may redirect to www, which is fine).

---

## Supabase (after apex works)

**Authentication → URL configuration** — keep www as Site URL, and keep apex in redirects:

- Site URL: `https://www.pushthrugames.com/`
- Redirects (already documented in `AUTH_EMAIL.md`), including:
  - `https://www.pushthrugames.com/**`
  - `https://pushthrugames.com/**`
  - `https://pushthrugames.com/`

---

## Simpler alternative (if A records are hard)

At the registrar, set **domain forwarding**:

- `pushthrugames.com` → **permanent (301)** redirect → `https://www.pushthrugames.com/`

That won’t host the site on the apex itself, but typing the bare domain still lands on the real game. For “show the website” at the bare URL without a parking page, **A records to GitHub** (above) are better.

---

## Checklist

- [ ] Delete parking A records on `@`
- [ ] Add four GitHub A records on `@`
- [ ] Confirm `www` CNAME → `policysnapadmin.github.io`
- [ ] GitHub Pages: custom domain + Enforce HTTPS
- [ ] `nslookup pushthrugames.com` shows `185.199.*`
- [ ] https://pushthrugames.com/ loads the game (or redirects to www)
