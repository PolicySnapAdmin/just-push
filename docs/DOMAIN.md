# Custom domain — www.pushthrugames.com

## Status in this repo

- `CNAME` file → `www.pushthrugames.com`
- `config.js` → `publicBaseUrl` / `storeUrl` use `https://www.pushthrugames.com/`
- Open Graph / canonical URLs updated

GitHub Pages custom domain is set to **www.pushthrugames.com**.

## DNS you must set (registrar)

Right now DNS for `pushthrugames.com` points at **parking/hosting IPs**, not GitHub. Update DNS as follows.

### Recommended for `www`

| Type | Name / Host | Value | TTL |
|------|-------------|--------|-----|
| **CNAME** | `www` | `policysnapadmin.github.io` | 300 or Auto |

Remove any old `www` CNAME that points at `pushthrugames.com` (apex loop).

### Optional: bare domain `pushthrugames.com` (no www)

GitHub project pages work best with **www** as primary. For apex:

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | `185.199.108.153` |
| **A** | `@` | `185.199.109.153` |
| **A** | `@` | `185.199.110.153` |
| **A** | `@` | `185.199.111.153` |

Or set apex as **URL redirect** to `https://www.pushthrugames.com` at the registrar (simplest).

## After DNS propagates

1. GitHub → repo → **Settings → Pages**  
   - Custom domain: `www.pushthrugames.com`  
   - Wait until DNS check is green  
   - Enable **Enforce HTTPS**

2. **Supabase** → Authentication → URL configuration  
   - **Site URL:** `https://www.pushthrugames.com/`  
   - **Redirect URLs** (add):  
     - `https://www.pushthrugames.com/**`  
     - keep `https://policysnapadmin.github.io/just-push/**` during transition  

3. Test:
   - https://www.pushthrugames.com/
   - https://www.pushthrugames.com/store.html
   - Email login / save account
   - Friend invite link from the app

## Public URLs (once live)

| Page | URL |
|------|-----|
| Play | https://www.pushthrugames.com/ |
| Store | https://www.pushthrugames.com/store.html |
| Privacy | https://www.pushthrugames.com/privacy.html |
| Terms | https://www.pushthrugames.com/terms.html |
| Login deep link | https://www.pushthrugames.com/?tab=style |

Old GitHub Pages URL usually still works as a backup during migration.
