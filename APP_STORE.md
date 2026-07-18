# Push Thru — App Store readiness (no Mac yet)

Work through this on Windows first. You only need a Mac later for Xcode archive + TestFlight.

**Live web app:** https://policysnapadmin.github.io/just-push/  
**Privacy:** https://policysnapadmin.github.io/just-push/privacy.html  
**Terms:** https://policysnapadmin.github.io/just-push/terms.html  

---

## Already done in this repo

| Item | Status |
|------|--------|
| Privacy Policy page | `privacy.html` |
| Terms of Use page | `terms.html` |
| In-app links to legal pages | Settings → Legal |
| Age gate (13+) | First launch |
| Account deletion (server + UI) | Settings → Account → Delete account |
| Chat feature flag | `config.js` → `enableChat` (set `false` to ship without chat) |
| Privacy nutrition label draft | Section below |
| Capacitor notes | Section below |

**Deferred (chat / UGC):** report, block, moderation tooling — only needed if you ship Chat.

---

## Before you pay for Apple Developer ($99/year)

1. ~~Edit contact email~~ → **calvin.money@gmail.com** (in Privacy + Terms)
2. ~~Ship mode~~ → **v1:** `enableChat: false`, `enableGithubAuth: false` (guest only; friends/groups/scores stay)
3. Create [Apple Developer](https://developer.apple.com) account when ready (use a stable Apple ID; support contact can be calvin.money@gmail.com).
4. Pick bundle ID, e.g. `com.calvinmoney.pushthru` or `com.policysnap.pushthru`.

---

## App Privacy “nutrition label” draft (App Store Connect)

Answer based on **current online build**. Adjust if you disable chat or add analytics.

### Data linked to you

| Type | Examples | Used for |
|------|----------|----------|
| Contact Info | None by default | — |
| Identifiers | User ID (Supabase auth / guest), friend code | App functionality |
| User Content | Display name; posts/messages **if chat on** | App functionality |
| Gameplay | High scores, 10s best, lifetime pushes, sessions, theme | App functionality |
| Other | Friends / group memberships | App functionality |

### Data not collected (current web build)

- Precise location, health, financial info, contacts, photos, browsing history  
- Tracking for third-party ads (no ad SDK)  
- Product interaction analytics SDK (none bundled)

### Tracking

- **No** App Tracking Transparency / IDFA use planned for v1 unless you add ads/analytics later.

### Privacy Policy URL (required)

```text
https://policysnapadmin.github.io/just-push/privacy.html
```

### Support / marketing URL (optional but useful)

```text
https://policysnapadmin.github.io/just-push/
```

---

## Age rating (rough)

Without chat: typically **4+** or **9+** depending on questionnaire (social features: friends/leaderboards).  
With open community chat: often higher; expect social networking / unrestricted web-like messaging questions.

Ship **without chat** for the simplest first review.

---

## Account deletion (Apple guideline)

Implemented:

- RPC: `jp_delete_my_account()` (migration `20260718140000_just_push_delete_account.sql`)
- UI: Settings → Account → **Delete account**
- Clears server profile + related rows, deletes `auth.users`, wipes local storage, reloads

Test on web before App Review.

---

## Sign in with Apple

- **Guest-only:** usually OK for v1 (no SIWA required).
- **If you keep “Sign in with GitHub”** (or any third-party login): Apple often requires **Sign in with Apple** as an equivalent option.
- Practical v1: hide GitHub login in the iOS build (`enableGithubAuth: false`) and stay guest + delete account.

---

## Listing copy

See **[STORE_LISTING.md](./STORE_LISTING.md)** for subtitle, description, keywords, and App Review notes.

## Packaging options (when you have a Mac)

### A) Capacitor (scaffolded in this repo)

**On Windows (already set up):**
```powershell
cd C:\Users\conor\just-push
npm install
npm run build          # copies site → www/
npx cap add ios        # once — creates ios/ (can run on Windows)
npx cap sync ios
```

**On Mac (ship day):**
```bash
cd just-push
npm install
npm run cap:ios        # build www + sync + open Xcode
```

Bundle ID: `com.calvinmoney.pushthru`  
Then in Xcode: Team signing → icons → Archive → TestFlight.

| Script | What it does |
|--------|----------------|
| `npm run build` | Copy HTML/JS/CSS/legal into `www/` |
| `npm run cap:sync` | Build + `cap sync` |
| `npm run cap:ios` | Build + sync iOS + open Xcode (Mac) |

### B) Native rewrite later

SwiftUI client talking to same Supabase project — more work, best long-term UX.

### Avoid

Bare full-screen WKWebView of GitHub Pages only — higher chance of “thin client” rejection. Prefer bundled local assets via Capacitor.

---

## App icons / assets (can do on Windows)

Prepare before Mac day:

| Asset | Size |
|-------|------|
| App icon | 1024×1024 PNG, no alpha (App Store) |
| Optional | 180, 120, etc. (Xcode can generate from 1024) |

No chat-specific screenshots needed if chat is off.

---

## Checklist — do on Windows now

- [x] Privacy + Terms live on HTTPS  
- [x] Age gate  
- [x] Delete account  
- [x] `enableChat` flag  
- [x] Replace placeholder contact email in legal pages (`calvin.money@gmail.com`)  
- [x] Decide: ship with `enableChat: false` + `enableGithubAuth: false`  
- [ ] Apple Developer enrollment  
- [ ] Write 1-paragraph App Store description  
- [ ] 1024 icon  

## Checklist — do on Mac later

- [ ] Capacitor iOS project + signing  
- [ ] TestFlight internal test  
- [ ] App Privacy form in App Store Connect  
- [ ] Screenshots (iPhone 6.7", 6.5", etc.)  
- [ ] Submit for review  

## Checklist — only if shipping Chat

- [ ] Report content / user  
- [ ] Block user  
- [ ] Filtering or moderation plan  
- [ ] Higher age rating questionnaire  
- [ ] Update Privacy Policy UGC section with contact SLA  

---

## Suggested v1 product cut (simplest review)

```js
// config.js
enableChat: false,
enableGithubAuth: false,  // guest only → simpler SIWA story
```

Keep: Push, levels, scores, friends, groups, themes, account delete, legal links, age gate.

---

## Not legal advice

Privacy/Terms templates are starting points. For a commercial launch or large audience, have a lawyer review, especially if you re-enable chat or expand to the EU (GDPR) / California (CCPA) in a bigger way.
