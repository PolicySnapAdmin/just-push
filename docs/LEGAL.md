# Push Thru — legal / privacy operator checklist

**Not legal advice.** For shipping readiness under strict U.S. privacy expectations (CA CCPA/CPRA-style; strong consumer AG states including NY). Have counsel review before heavy monetization or ads.

## Live user-facing pages

| Page | Role |
|------|------|
| [privacy.html](../privacy.html) | Full Privacy Policy (categories, cookies, CA rights, children, retention) |
| [terms.html](../terms.html) | Terms of Use (age, accounts, liability limits, CA governing law) |
| [cookies.html](../cookies.html) | Cookie & storage notice |
| [privacy-choices.html](../privacy-choices.html) | Do Not Sell/Share preference + GPC |
| [store.html#contact](../store.html) | Privacy / deletion contact form |

## In-product controls

- Age gate (13+) + link to Privacy/Terms before play  
- Privacy & storage notice banner (`legal-consent.js`)  
- Settings → Legal: Privacy, Terms, Cookies, Privacy Choices, contact  
- Account deletion (Settings → Delete account)  
- GPC browser signal → treated as sale/share opt-out on device  

## Current data posture (web build)

| Item | Status |
|------|--------|
| Third-party ad SDKs / ad cookies | **None** |
| Sell personal info | **No** |
| Share for cross-context behavioral ads | **No** |
| Essential localStorage / auth | **Yes** (required for game) |
| Chat UGC | **Off** by default (`enableChat: false`) |
| Real payments | **Not live** (Token packs “Soon”) |

## When you must revisit counsel

1. Adding **ads**, analytics that fingerprint users, or data brokers  
2. Turning on **chat** / UGC at scale (moderation, reporting, age rating)  
3. **Real-money IAP** / web checkout (store refund rules, tax, kids)  
4. Collecting precise location, contacts, or other sensitive data  
5. Forming a formal legal entity / changing publisher identity (fill real legal name in policies)

## Recommended dashboard / ops

- [ ] Respond to privacy requests within **45 days**  
- [ ] Keep contact form working (FormSubmit activation)  
- [ ] Document internal process for identity verification on access/delete requests  
- [ ] If ads ever added: update Privacy, Cookies, Choices UI, and re-consent as needed  
- [ ] Fill **legal entity name** and mailing address in Privacy/Terms when you have them  

## California “Do Not Sell or Share” link

Footer / Settings / Privacy Choices page satisfy common CPRA “notice of right to opt out” expectations even when you do not sell/share. Keep the link visible.
