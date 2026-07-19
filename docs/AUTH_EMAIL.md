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
- For launch smoke tests you can leave **“Confirm email” OFF** so link-email works immediately.  
- For production, turn **Confirm email ON** so linked addresses are verified.

### 2. URL configuration
**Auth → URL configuration**
- **Site URL:** `https://www.pushthrugames.com/`
- **Redirect URLs** (add all you use):
  - `https://www.pushthrugames.com/**`
  - `https://www.pushthrugames.com/?tab=style`
  - `http://localhost:5500/**` (local dev if needed)
  - Capacitor / custom scheme later if you ship native

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
