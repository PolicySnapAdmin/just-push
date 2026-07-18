# Web storefront & link previews

## URLs

| Page | URL | Purpose |
|------|-----|---------|
| **Store / landing** | https://policysnapadmin.github.io/just-push/store.html | Share this for marketing, platforms, “download” |
| **Play** | https://policysnapadmin.github.io/just-push/ | Actual game + friend/group invite deep links |
| **Web login** | https://policysnapadmin.github.io/just-push/?tab=style | Opens Settings (email sign-in) |

Friend invites should keep using the **play** URL (`publicBaseUrl`), not the store.

## Link previews (iMessage / Discord / Slack / etc.)

Open Graph tags on `store.html` and `index.html` point at:

```text
https://policysnapadmin.github.io/just-push/assets/og-image.png
```

(1200×630 PNG.)

**Note:** Apps cache previews hard. After changing the image, use a debugger or wait; some clients only refresh after days.

## Custom domain (optional)

1. Buy a domain (e.g. `pushthru.app`).
2. GitHub repo → Settings → Pages → Custom domain.
3. Add DNS records GitHub shows.
4. Update:
   - `config.js` → `publicBaseUrl`, `storeUrl`
   - `og:url` / `og:image` absolute URLs in HTML
   - Supabase Auth Site URL + redirects
5. Optionally: apex/`www` → store, `/` play, or reverse.

## Platform buttons on the store

| Button | Status |
|--------|--------|
| Play free on web | Live → `index.html` |
| Web login | Live → `?tab=style` |
| App Store | Placeholder until TestFlight/public |
| Google Play | Placeholder until Android package |
| Install / Download | Add-to-Home-Screen instructions (PWA-style) |

When you have real store URLs, replace the disabled buttons in `store.html`.
