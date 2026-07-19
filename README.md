# Push Thru

Push a button. Count the pushes. Beat the clock. Beat your friends.

| | |
|--|--|
| **Play (game)** | https://www.pushthrugames.com/ |
| **Store / landing** | https://www.pushthrugames.com/store.html |
| **Privacy** | https://www.pushthrugames.com/privacy.html |
| **Terms** | https://www.pushthrugames.com/terms.html |
| **Support** | calvin.money@gmail.com |
| **Repo path** | `just-push` (GitHub Pages URL stable) |

## Features

| Feature | Details |
|--------|---------|
| **Unlimited** | Tap freely — session, high score, all-time XP |
| **10 second** | Timed challenge + personal / global boards |
| **Levels** | 1 push = 1 XP, scaling curve to level 99 |
| **Friends / groups** | Invite links + short codes |
| **Themes** | Button colors + backgrounds (Settings) |
| **Email account** | Save guest in place or sign in (Settings) |
| **Chat** | Built in backend; **UI off** for App Store v1 (`enableChat: false`) |

## Quick start (local)

```powershell
cd C:\Users\conor\just-push
npx --yes serve .
```

Or open `index.html` directly (some auth redirects prefer a local server).

## Project layout

```
just-push/
├── index.html          # App shell
├── app.js              # Game + Supabase client
├── styles.css
├── config.js           # Flags + public Supabase anon config
├── privacy.html / terms.html
├── package.json        # Capacitor tooling
├── capacitor.config.json
├── scripts/
│   ├── build-www.mjs                 # Web assets → www/ for iOS
│   ├── deploy_backend.ps1            # Apply all SQL migrations
│   ├── backup_pushthru.ps1           # Logical data backup → backups/ (gitignored)
│   └── set_github_hygiene_secrets.ps1  # Wire Actions secrets for daily cleanup
├── .github/workflows/
│   └── hygiene-cleanup.yml           # Daily jp_run_hygiene (needs secrets)
├── supabase/migrations/    # jp_* schema (ordered)
├── ios/                    # Capacitor Xcode project
└── docs/                   # Architecture, security, App Store
```

## Documentation

| Doc | What it’s for |
|-----|----------------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System map, data flow, file roles |
| [docs/SUPABASE.md](./docs/SUPABASE.md) | Migrations + dashboard checklist |
| [docs/BACKUP.md](./docs/BACKUP.md) | Backups, redundancy, breach / total-failure runbook |
| [docs/SECURITY.md](./docs/SECURITY.md) | RLS notes + residual risks |
| [docs/APP_STORE.md](./docs/APP_STORE.md) | Ship checklist (no-Mac → Mac) |
| [docs/STORE_LISTING.md](./docs/STORE_LISTING.md) | App Store description draft |
| [ios/README.md](./ios/README.md) | Xcode / TestFlight on Mac |

## Config flags (`config.js`)

```js
enableChat: false,        // hide Chat tab (App Store v1)
enableGithubAuth: false,  // hide GitHub OAuth
enableEmailAuth: true,    // Settings email save / sign-in
publicBaseUrl: "https://www.pushthrugames.com/",
```

## Backend

- **Supabase** project `jpnaotxkcpnwgqkzxdue`  
- Tables / RPCs namespaced **`jp_*`** (Push Thru only)  
- Scores only via RPCs (not free-form REST score edits)  

```powershell
.\scripts\deploy_backend.ps1
```

Details: [docs/SUPABASE.md](./docs/SUPABASE.md).

## Deploy (web)

Push to `main` → GitHub Pages serves the repo root (`main` / `/`).

```powershell
git add -A
git commit -m "Your message"
git push origin main
```

Hard-refresh if assets look cached (`index.html` uses `?v=` query on JS/CSS).

## iOS (later, on a Mac)

```bash
npm install
npm run cap:ios
```

Bundle ID: `com.calvinmoney.pushthru`  
See [docs/APP_STORE.md](./docs/APP_STORE.md).

## Share links

```text
https://www.pushthrugames.com/?add=FRIENDCODE
https://www.pushthrugames.com/?join=GROUPCODE
```

## Security (short)

- Anon key in `config.js` is **public by design**; RLS enforces access.  
- Never put the **service_role** key in the client.  
- Full notes: [docs/SECURITY.md](./docs/SECURITY.md).
