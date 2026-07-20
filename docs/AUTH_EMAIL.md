# Push Thru — Email & account setup (Supabase)

## What players do

1. **Create account** — unique display name + password (required).  
   Behind the scenes the auth email is `{PLAYER_CODE}@login.pushthrugames.com`.
2. **Log in** (web or phone) — **player code + password**, or **linked email + password**.
3. **Optional: link a real email** in Settings → Account (password recovery & familiar login).
4. **One active session** per account — logging in on a new device signs out the old one.

## Supabase Dashboard checklist

Open: [Authentication](https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue/auth/providers)

### 1. Enable Email provider
- **Auth → Providers → Email** → **Enable**
- **“Confirm email”** — recommended **OFF** for Push Thru code+password accounts.  
  Player codes use synthetic addresses (`{CODE}@login.pushthrugames.com`) that **cannot** open a confirm link.  
  If Confirm email is ON, the DB trigger `jp_auto_confirm_login_email` still auto-confirms those synthetic emails only; **real** linked emails follow the dashboard setting.
- Turning Confirm email ON is fine later for real recovery emails, as long as that trigger stays applied.

### 2. URL configuration (Site URL + Redirects)

Open: **[Authentication → URL configuration](https://supabase.com/dashboard/project/jpnaotxkcpnwgqkzxdue/auth/url-configuration)**  
(Older UI: **Authentication → Settings → URL configuration**)

#### Site URL (primary app)
Paste **exactly** (with trailing slash):

```
https://www.pushthrugames.com/
```

This is where Supabase sends users by default after email confirm / password reset if no other redirect is specified.

#### Redirect URLs (allow-list — add each line)

Supabase only allows redirects that match this list. Add **all** of these (one per line in the dashboard). Wildcards use `**` for path suffixes.

**Production (required)**

```
https://www.pushthrugames.com/**
https://www.pushthrugames.com/
https://www.pushthrugames.com/?tab=style
https://www.pushthrugames.com/?tab=friends
https://www.pushthrugames.com/store.html
https://www.pushthrugames.com/privacy.html
https://www.pushthrugames.com/terms.html
```

**Apex domain (if you ever open bare domain without www)**

```
https://pushthrugames.com/**
https://pushthrugames.com/
```

**Legacy GitHub Pages host (optional, if anyone still uses the .github.io URL)**

```
https://policysnapadmin.github.io/**
https://policysnapadmin.github.io/just-push/**
https://policysnapadmin.github.io/just-push/
```

**Local development (optional)**

```
http://localhost:5500/**
http://localhost:5500/
http://127.0.0.1:5500/**
http://127.0.0.1:3000/**
http://localhost:3000/**
```

**Capacitor / iOS later (when you ship native)**

```
capacitor://localhost/**
ionic://localhost/**
com.calvinmoney.pushthru://**
```

#### What the app actually uses today
| Flow | Redirect target in code |
|------|-------------------------|
| Password reset (admin / user) | `https://www.pushthrugames.com/?tab=style` |
| GitHub OAuth (if re-enabled) | Current page origin + path (`redirectTo` in config) |
| Email confirm / change email | Usually Site URL, or the link’s `redirect_to` if set |

#### Checklist after saving
1. Click **Save** on the URL configuration page.  
2. Test **password reset** from Settings (or Admin tools) → open the email → link should land on the game, not an error page.  
3. If you see `redirect_uri_mismatch` / “redirect not allowed”, the exact URL in the email is missing from the list — copy it from the failed link and add it.

### 3. Email templates (notifications)
**Auth → Email templates**

| Template | When it sends | Turn on by |
|----------|----------------|------------|
| **Confirm signup** | User links/changes email with confirm enabled | Enable “Confirm email” |
| **Magic link** | Not used by default in this app | Leave off unless you add magic link UI |
| **Change email address** | User updates email | Automatic when confirm is on |
| **Reset password** | Settings / admin “Send password reset” | Works once Email provider is on |

Edit subjects/bodies to say **Push Thru** and point users to `https://www.pushthrugames.com/`.

### 4. SMTP (recommended for real delivery)
Default Supabase email is rate-limited and often lands in spam.

**Project Settings → Authentication → SMTP settings**  
Connect SendGrid, Resend, AWS SES, etc., and use a from-address you own (e.g. `noreply@pushthrugames.com`).

### 5. Anonymous sign-in
Still used only as a fallback if someone signs out without re-login.  
Primary path is **password account**. You may keep Anonymous **enabled** for recovery.

## Player messages (copy)

- **Create:** “Choose a name and password. Your player code is how you sign in until you add email.”
- **Link email:** “Add email for recovery and easier login. Check your inbox if confirmation is required.”
- **Other device:** “Only one device at a time — signing in here will sign out your other session.”

## Security notes

- Wallets, scores, and friends are keyed by **user id**, never display name.
- Skins are **cosmetic**; token packs for real money stay disabled until IAP is wired.
- Synthetic `*@login.pushthrugames.com` addresses are not real inboxes — always offer **link email** for recovery.
