/**
 * Public Supabase config (safe in the browser — same idea as Firebase).
 * Never put the service role key here.
 *
 * Shared project: PumpQuest / PolicySnap / Push Thru (jpnaotxkcpnwgqkzxdue)
 * Tables are namespaced jp_* so nothing clashes.
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
  publicBaseUrl: "https://policysnapadmin.github.io/just-push/",
  /** GitHub OAuth redirect — must match Supabase Auth URL config */
  redirectTo: typeof location !== "undefined" ? location.origin + location.pathname : undefined,

  /**
   * Community board + friend DMs.
   * Set false before App Store v1 if you want to skip UGC review requirements.
   */
  enableChat: true,

  /**
   * Show “Sign in with GitHub”.
   * If true on iOS, plan for Sign in with Apple as well.
   * Guest-only (false) is simpler for first App Store review.
   */
  enableGithubAuth: true,

  /** Minimum age confirmation shown once on first launch */
  minAge: 13,

  /** Legal pages (relative to the app root) */
  privacyUrl: "privacy.html",
  termsUrl: "terms.html",
};
