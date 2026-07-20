/**
 * Public Supabase config (safe in the browser — same idea as Firebase).
 * Never put the service role key here.
 *
 * Supabase project ref: jpnaotxkcpnwgqkzxdue
 * All Push Thru tables/RPCs use the jp_* prefix.
 *
 * Set enabled: false to force pure offline localStorage-only mode.
 *
 * App Store first ship (recommended):
 *   enableChat: false
 *   enableGithubAuth: false
 */
window.JUST_PUSH_CONFIG = {
  enabled: true,
  supabaseUrl: "https://jpnaotxkcpnwgqkzxdue.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwbmFvdHhrY3Bud2dxa3p4ZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Mjc2NzMsImV4cCI6MjA5NzQwMzY3M30.djlLWvInAccFYLsSWt-za_OSTvXnwNLYKT-2dq4p5kM",
  /**
   * Public site URL for invite links you send to friends.
   * Leave empty to use the current page URL (works on GitHub Pages).
   */
  publicBaseUrl: "https://www.pushthrugames.com/",
  /** Marketing / multi-platform storefront */
  storeUrl: "https://www.pushthrugames.com/store.html",
  /** GitHub OAuth redirect — must match Supabase Auth URL config */
  redirectTo: typeof location !== "undefined" ? location.origin + location.pathname : undefined,

  /**
   * Community board + friend DMs.
   * false = App Store v1 (no UGC review requirements). Web can re-enable later.
   */
  enableChat: false,

  /**
   * Token pack / IAP vault in Style Store (Spark / Charge / Nova cards).
   * false = hide until App Store / Play / web checkout is live.
   * UI is built; set true when purchases are wired.
   */
  enableTokenPacks: false,

  /**
   * Show “Sign in with GitHub”.
   * false = no GitHub (no SIWA required for email/password alone).
   */
  enableGithubAuth: false,

  /**
   * Email + password sign-up / sign-in in Settings.
   * Guests can “Save progress with email” to keep the same account id (scores/friends).
   * Requires Email provider ON in Supabase Auth.
   */
  enableEmailAuth: true,

  /** Minimum age confirmation shown once on first launch */
  minAge: 13,

  /** Legal pages (relative to the app root) */
  privacyUrl: "privacy.html",
  termsUrl: "terms.html",

  /**
   * Synthetic login emails for code+password accounts:
   *   {FRIEND_CODE}@login.pushthrugames.com
   * After linking a real email, sign in with that email + password instead.
   * Enable Email provider in Supabase (see docs/AUTH_EMAIL.md).
   */
  loginEmailDomain: "login.pushthrugames.com",
};
