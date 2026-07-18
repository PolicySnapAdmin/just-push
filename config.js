/**
 * Public Supabase config (safe in the browser — same idea as Firebase).
 * Never put the service role key here.
 *
 * Shared project: PumpQuest / PolicySnap / Just Push (jpnaotxkcpnwgqkzxdue)
 * Tables are namespaced jp_* so nothing clashes.
 *
 * Set enabled: false to force offline localStorage-only mode.
 */
window.JUST_PUSH_CONFIG = {
  enabled: true,
  supabaseUrl: "https://jpnaotxkcpnwgqkzxdue.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwbmFvdHhrY3Bud2dxa3p4ZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Mjc2NzMsImV4cCI6MjA5NzQwMzY3M30.djlLWvInAccFYLsSWt-za_OSTvXnwNLYKT-2dq4p5kM",
  /**
   * Public site URL for invite links you send to friends.
   * Leave empty to use the current page URL (works on GitHub Pages).
   * Set after deploy if you test locally but want phone-ready links, e.g.:
   * "https://YOURUSER.github.io/just-push/"
   */
  publicBaseUrl: "",
  /** GitHub OAuth redirect — must match Supabase Auth URL config */
  redirectTo: typeof location !== "undefined" ? location.origin + location.pathname : undefined,
};
