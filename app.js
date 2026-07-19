/**
 * Push Thru — unlimited + 10s challenge, localStorage + Supabase backend.
 */

const STORAGE_KEY = "just-push-v2";
const CHALLENGE_MS = 10_000;
const CIRCUMFERENCE = 2 * Math.PI * 46;

// ——— Level XP curve (levels 1–99) ———
// Exponential grind: early levels come quick, higher levels take much more XP.
// 1 push = 1 XP.
const MAX_LEVEL = 99;
const XP_TABLE = (() => {
  const table = [0, 0]; // index = level; XP required to *be* that level
  let points = 0;
  for (let n = 1; n < MAX_LEVEL; n++) {
    points += Math.floor(n + 300 * Math.pow(2, n / 7));
    table[n + 1] = Math.floor(points / 4);
  }
  return table;
})();

/** Metal-style tiers for the level badge (one look per metal band). */
const LEVEL_TIERS = [
  { min: 1, id: "bronze", label: "Bronze", color: "#cd7f32", variant: "base" },
  { min: 10, id: "iron", label: "Iron", color: "#9ca3af", variant: "base" },
  { min: 20, id: "steel", label: "Steel", color: "#cbd5e1", variant: "base" },
  { min: 30, id: "black", label: "Black", color: "#71717a", variant: "base" },
  { min: 40, id: "mithril", label: "Mithril", color: "#a78bfa", variant: "base" },
  { min: 50, id: "adamant", label: "Adamant", color: "#22c55e", variant: "base" },
  { min: 60, id: "rune", label: "Rune", color: "#38bdf8", variant: "base" },
  { min: 70, id: "dragon", label: "Dragon", color: "#ef4444", variant: "base" },
  { min: 80, id: "barrows", label: "Barrows", color: "#c084fc", variant: "base" },
  { min: 90, id: "crystal", label: "Crystal", color: "#67e8f9", variant: "base" },
  { min: 99, id: "max", label: "Max", color: "#fbbf24", variant: "max" },
];

function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let l = MAX_LEVEL; l >= 1; l--) {
    if (x >= XP_TABLE[l]) {
      level = l;
      break;
    }
  }
  return level;
}

function xpForLevel(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return XP_TABLE[l] || 0;
}

function tierForLevel(level) {
  let tier = LEVEL_TIERS[0];
  for (const t of LEVEL_TIERS) {
    if (level >= t.min) tier = t;
  }
  return tier;
}

function levelProgress(xp) {
  const totalXp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelFromXp(totalXp);
  const at = xpForLevel(level);
  if (level >= MAX_LEVEL) {
    return {
      level,
      totalXp,
      xpIntoLevel: totalXp - at,
      xpForNext: 0,
      xpToNext: 0,
      fraction: 1,
      maxed: true,
      tier: tierForLevel(level),
    };
  }
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - at);
  const into = totalXp - at;
  return {
    level,
    totalXp,
    xpIntoLevel: into,
    xpForNext: next - at,
    xpToNext: next - totalXp,
    fraction: Math.min(1, into / span),
    maxed: false,
    tier: tierForLevel(level),
  };
}

function formatXp(n) {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return (x / 1_000_000).toFixed(x >= 10_000_000 ? 1 : 2).replace(/\.0+$/, "") + "m";
  if (x >= 10_000) return Math.floor(x / 1000) + "k";
  return String(x);
}

const BUTTON_COLORS = [
  { id: "rose", label: "Rose", value: "#ff4d6d" },
  { id: "coral", label: "Coral", value: "#ff7a59" },
  { id: "amber", label: "Amber", value: "#f5a524" },
  { id: "lime", label: "Lime", value: "#84cc16" },
  { id: "mint", label: "Mint", value: "#2dd4a8" },
  { id: "sky", label: "Sky", value: "#38bdf8" },
  { id: "blue", label: "Blue", value: "#4f7cff" },
  { id: "violet", label: "Violet", value: "#a78bfa" },
  { id: "pink", label: "Pink", value: "#f472b6" },
  { id: "white", label: "White", value: "#e8e8f0" },
];

const BACKGROUNDS = [
  { id: "midnight", label: "Midnight", value: "#0f0f14" },
  { id: "ink", label: "Ink", value: "#0a0e17" },
  { id: "forest", label: "Forest", value: "#0c1410" },
  { id: "wine", label: "Wine", value: "#160a12" },
  { id: "ocean", label: "Ocean", value: "#0a121c" },
  { id: "plum", label: "Plum", value: "#120f1a" },
  { id: "slate", label: "Slate", value: "#141820" },
  { id: "ember", label: "Ember", value: "#1a100c" },
  { id: "graphite", label: "Graphite", value: "#1c1c1e" },
  { id: "deep", label: "Deep", value: "#050508" },
];

// ——— State ———

function defaultState() {
  return {
    localId: crypto.randomUUID(),
    name: "",
    sessionCount: 0,
    highScore: 0,
    challengeBest: 0,
    lifetimeCount: 0,
    sessionsPlayed: 0,
    friends: [],
    groups: [],
    theme: { button: "rose", background: "midnight" },
    mode: "free",
    boardMetric: "high",
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("just-push-v1");
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      theme: { ...base.theme, ...parsed.theme },
      localId: parsed.localId || parsed.id || base.localId,
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let lastRenderedLevel = levelFromXp(state.lifetimeCount || 0);

// Challenge runtime (not persisted mid-run)
let challenge = {
  status: "idle", // idle | running | done
  count: 0,
  startedAt: 0,
  endsAt: 0,
  raf: 0,
};

// Online / Supabase
let sb = null;
let session = null;
let profile = null; // server profile row
let online = false;
let syncTimer = null;
let friendsCache = [];
let groupsCache = [];
let globalBoard = []; // global 10s
let globalLifetimeBoard = []; // global all-time pushes

// Chat
let boardPosts = [];
let dmMessages = [];
let chatMode = "board"; // board | dm
let activeDmFriend = null; // { id, name, ... }
let lastBoardPostAt = 0;
let lastDmSendAt = 0;

// Offline share-code helpers (fallback when offline)
function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function offlineFriendCode() {
  return (
    "JP1." +
    toBase64Url(
      JSON.stringify({
        t: "f",
        id: state.localId,
        n: state.name || "Player",
        h: state.highScore,
        c: state.challengeBest,
        l: state.lifetimeCount,
      })
    )
  );
}

function decodeOfflineFriendCode(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith("JP1.")) throw new Error("Not a valid friend code");
  const data = JSON.parse(fromBase64Url(trimmed.slice(4)));
  if (data.t !== "f" || !data.id || !data.n) throw new Error("Not a valid friend code");
  return {
    id: data.id,
    name: String(data.n).slice(0, 16),
    highScore: Math.max(0, Number(data.h) || 0),
    challengeBest: Math.max(0, Number(data.c) || 0),
    lifetimeCount: Math.max(0, Number(data.l) || 0),
  };
}

function offlineGroupCode(group) {
  return (
    "JPG1." +
    toBase64Url(
      JSON.stringify({
        t: "g",
        id: group.id,
        n: group.name,
        m: group.members.map((m) => ({
          id: m.id,
          n: m.name,
          h: m.highScore,
          c: m.challengeBest || 0,
        })),
      })
    )
  );
}

function decodeOfflineGroupCode(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith("JPG1.")) throw new Error("Not a valid group code");
  const data = JSON.parse(fromBase64Url(trimmed.slice(5)));
  if (data.t !== "g" || !data.id || !data.n) throw new Error("Not a valid group code");
  return {
    id: data.id,
    name: String(data.n).slice(0, 24),
    members: Array.isArray(data.m)
      ? data.m.map((m) => ({
          id: m.id,
          name: String(m.n || "Player").slice(0, 16),
          highScore: Math.max(0, Number(m.h) || 0),
          challengeBest: Math.max(0, Number(m.c) || 0),
        }))
      : [],
  };
}

// ——— DOM ———

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const els = {
  app: $("#app"),
  syncPill: $("#sync-pill"),
  sessionCount: $("#session-count"),
  highScore: $("#high-score"),
  lifetimeCount: $("#lifetime-count"),
  challengeCount: $("#challenge-count"),
  challengeTimer: $("#challenge-timer"),
  challengeBest: $("#challenge-best"),
  scoreboardFree: $("#scoreboard-free"),
  scoreboardChallenge: $("#scoreboard-challenge"),
  pushBtn: $("#push-btn"),
  pushLabel: $("#push-label"),
  pushHint: $("#push-hint"),
  floaters: $("#floaters"),
  resetSession: $("#reset-session"),
  challengeAgain: $("#challenge-again"),
  newRecord: $("#new-record"),
  challengeResult: $("#challenge-result"),
  timerRing: $("#timer-ring"),
  timerProgress: $("#timer-progress"),
  profileBtn: $("#profile-btn"),
  displayName: $("#display-name"),
  avatar: $("#avatar"),
  nameModal: $("#name-modal"),
  nameForm: $("#name-form"),
  nameInput: $("#name-input"),
  namePanel: $("#name-panel"),
  nameLoginPanel: $("#name-login-panel"),
  nameShowLogin: $("#name-show-login"),
  nameShowRegister: $("#name-show-register"),
  nameLoginForm: $("#name-login-form"),
  nameLoginEmail: $("#name-login-email"),
  nameLoginPassword: $("#name-login-password"),
  nameLoginBack: $("#name-login-back"),
  nameLoginMsg: $("#name-login-msg"),
  toast: $("#toast"),
  levelUpPopup: $("#level-up-popup"),
  levelUpCard: $("#level-up-card"),
  levelUpTitle: $("#level-up-title"),
  levelUpBadge: $("#level-up-badge"),
  levelUpNum: $("#level-up-num"),
  levelUpTier: $("#level-up-tier"),
  levelUpSub: $("#level-up-sub"),
  levelUpDismiss: $("#level-up-dismiss"),
  myFriendCode: $("#my-friend-code"),
  friendCodeHint: $("#friend-code-hint"),
  copyFriendCode: $("#copy-friend-code"),
  addFriendForm: $("#add-friend-form"),
  friendCodeInput: $("#friend-code-input"),
  friendMsg: $("#friend-msg"),
  friendsList: $("#friends-list"),
  friendsEmpty: $("#friends-empty"),
  friendCount: $("#friend-count"),
  createGroupForm: $("#create-group-form"),
  groupNameInput: $("#group-name-input"),
  joinGroupForm: $("#join-group-form"),
  groupCodeInput: $("#group-code-input"),
  groupMsg: $("#group-msg"),
  groupsList: $("#groups-list"),
  groupsEmpty: $("#groups-empty"),
  groupCount: $("#group-count"),
  rankHigh: $("#rank-high"),
  rankChallenge: $("#rank-challenge"),
  rankLife: $("#rank-life"),
  rankSessions: $("#rank-sessions"),
  levelBadge: $("#level-badge"),
  levelNum: $("#level-num"),
  levelTitle: $("#level-title"),
  levelXpLabel: $("#level-xp-label"),
  levelProgressFill: $("#level-progress-fill"),
  levelProgressTrack: $("#level-progress-track"),
  rankLevelBadge: $("#rank-level-badge"),
  rankLevel: $("#rank-level"),
  rankLevelTitle: $("#rank-level-title"),
  rankLevelXp: $("#rank-level-xp"),
  rankLevelFill: $("#rank-level-fill"),
  friendsBoard: $("#friends-board"),
  friendsBoardEmpty: $("#friends-board-empty"),
  groupBoards: $("#group-boards"),
  groupBoardsEmpty: $("#group-boards-empty"),
  globalBoard: $("#global-board"),
  globalBoardEmpty: $("#global-board-empty"),
  globalLifetimeBoard: $("#global-lifetime-board"),
  globalLifetimeEmpty: $("#global-lifetime-empty"),
  refreshGlobal: $("#refresh-global"),
  buttonSwatches: $("#button-swatches"),
  bgSwatches: $("#bg-swatches"),
  githubBtn: $("#github-btn"),
  githubBtnStyle: $("#github-btn-style"),
  signOutBtn: $("#sign-out-btn"),
  deleteAccountBtn: $("#delete-account-btn"),
  deleteAccountHint: $("#delete-account-hint"),
  accountStatus: $("#account-status"),
  emailAuthBlock: $("#email-auth-block"),
  emailAuthBlurb: $("#email-auth-blurb"),
  emailAuthForm: $("#email-auth-form"),
  emailInput: $("#email-input"),
  passwordInput: $("#password-input"),
  emailLinkBtn: $("#email-link-btn"),
  emailSigninBtn: $("#email-signin-btn"),
  emailAuthMsg: $("#email-auth-msg"),
  changePasswordBlock: $("#change-password-block"),
  changePasswordToggle: $("#change-password-toggle"),
  changePasswordForm: $("#change-password-form"),
  changePasswordCancel: $("#change-password-cancel"),
  newPasswordInput: $("#new-password-input"),
  confirmPasswordInput: $("#confirm-password-input"),
  changePasswordMsg: $("#change-password-msg"),
  deleteModal: $("#delete-modal"),
  deleteConfirmInput: $("#delete-confirm-input"),
  deleteUnderstand: $("#delete-understand"),
  deleteTypeHint: $("#delete-type-hint"),
  deleteModalMsg: $("#delete-modal-msg"),
  deleteCancelBtn: $("#delete-cancel-btn"),
  deleteFinalBtn: $("#delete-final-btn"),
  deleteCountdown: $("#delete-countdown"),
  adminCard: $("#admin-card"),
  adminDebugBtn: $("#admin-debug-btn"),
  adminHygieneBtn: $("#admin-hygiene-btn"),
  adminDupesBtn: $("#admin-dupes-btn"),
  adminResetForm: $("#admin-reset-form"),
  adminResetEmail: $("#admin-reset-email"),
  adminOut: $("#admin-out"),
  adminMsg: $("#admin-msg"),
  privacyLink: $("#privacy-link"),
  termsLink: $("#terms-link"),
  ageModal: $("#age-modal"),
  ageForm: $("#age-form"),
  ageConfirm: $("#age-confirm"),
  ageContinue: $("#age-continue"),
  ageMinLabel: $("#age-min-label"),
  ageMinLabel2: $("#age-min-label-2"),
  chatTab: $("#chat-tab"),
  shareFriendLink: $("#share-friend-link"),
  copyFriendLink: $("#copy-friend-link"),
  pendingInvite: $("#pending-invite"),
  // Chat
  chatBoardView: $("#chat-board-view"),
  chatDmView: $("#chat-dm-view"),
  boardPostForm: $("#board-post-form"),
  boardPostInput: $("#board-post-input"),
  boardCharCount: $("#board-char-count"),
  boardMsg: $("#board-msg"),
  boardFeed: $("#board-feed"),
  boardEmpty: $("#board-empty"),
  refreshBoard: $("#refresh-board"),
  dmFriendPicker: $("#dm-friend-picker"),
  dmFriendList: $("#dm-friend-list"),
  dmFriendsEmpty: $("#dm-friends-empty"),
  dmThreadView: $("#dm-thread-view"),
  dmThreadTitle: $("#dm-thread-title"),
  dmFeed: $("#dm-feed"),
  dmEmpty: $("#dm-empty"),
  dmForm: $("#dm-form"),
  dmInput: $("#dm-input"),
  dmCharCount: $("#dm-char-count"),
  dmMsg: $("#dm-msg"),
  dmBack: $("#dm-back"),
  refreshDm: $("#refresh-dm"),
  chatOfflineHint: $("#chat-offline-hint"),
};

// Deep-link invite waiting to process after online
let pendingDeepLink = null; // { type: 'friend'|'group', code: string }

let toastTimer = null;
let recordTimer = null;
let levelUpTimer = null;
let levelUpQueue = [];
let levelUpShowing = false;

function toast(msg) {
  els.toast.hidden = false;
  els.toast.textContent = msg;
  requestAnimationFrame(() => els.toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => {
      els.toast.hidden = true;
    }, 200);
  }, 2200);
}

function hideLevelUpPopup() {
  clearTimeout(levelUpTimer);
  levelUpTimer = null;
  if (els.levelUpPopup) els.levelUpPopup.hidden = true;
  levelUpShowing = false;
  // Show next queued level-up (multi-level jumps)
  if (levelUpQueue.length) {
    const next = levelUpQueue.shift();
    requestAnimationFrame(() => showLevelUpPopup(next.level, next.tier, { fromQueue: true }));
  }
}

/**
 * OSRS-style level-up card. Does not block input on the play area
 * (overlay has pointer-events: none; only the card can be dismissed).
 */
function showLevelUpPopup(level, tier, opts = {}) {
  if (!els.levelUpPopup || !els.levelUpCard) {
    toast(`Level ${level}!`);
    return;
  }
  if (levelUpShowing && !opts.fromQueue) {
    levelUpQueue.push({ level, tier });
    // Cap queue so spam jumps don't stack forever
    if (levelUpQueue.length > 5) levelUpQueue.shift();
    return;
  }

  const t = tier || tierForLevel(level);
  levelUpShowing = true;

  if (els.levelUpTitle) {
    els.levelUpTitle.textContent =
      level >= MAX_LEVEL
        ? `You reached level ${level} — Max!`
        : `You reached level ${level}`;
  }
  if (els.levelUpNum) els.levelUpNum.textContent = String(level);
  if (els.levelUpTier) els.levelUpTier.textContent = t.label;
  if (els.levelUpSub) {
    els.levelUpSub.textContent =
      level >= MAX_LEVEL
        ? `Your Push Thru level is now ${level}. Absolute unit.`
        : `Your Push Thru level is now ${level}.`;
  }
  if (els.levelUpBadge) {
    els.levelUpBadge.dataset.tier = t.id;
    els.levelUpBadge.dataset.variant = t.variant || "base";
    els.levelUpBadge.style.setProperty("--tier", t.color);
  }
  if (els.levelUpCard) {
    els.levelUpCard.style.setProperty("--tier", t.color);
  }

  els.levelUpPopup.hidden = false;
  // Soft confetti — screenshot-friendly, not a full-screen takeover
  confettiBurst();

  // Stays until the player taps × (no auto-timeout — keep for screenshots)
  clearTimeout(levelUpTimer);
  levelUpTimer = null;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function formatNum(n) {
  return Number(n || 0).toLocaleString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  const n = (name || "P").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function myId() {
  return profile?.id || state.localId;
}

// ——— Theme ———

function applyTheme() {
  const btn = BUTTON_COLORS.find((c) => c.id === state.theme.button) || BUTTON_COLORS[0];
  const bg = BACKGROUNDS.find((c) => c.id === state.theme.background) || BACKGROUNDS[0];
  document.documentElement.style.setProperty("--btn", btn.value);
  document.documentElement.style.setProperty("--bg", bg.value);
  document.documentElement.style.setProperty(
    "--btn-text",
    btn.id === "white" || btn.id === "amber" || btn.id === "lime" ? "#111118" : "#ffffff"
  );
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = bg.value;
}

function renderSwatches() {
  els.buttonSwatches.innerHTML = BUTTON_COLORS.map(
    (c) =>
      `<button type="button" class="swatch${c.id === state.theme.button ? " selected" : ""}" data-btn="${c.id}" style="background:${c.value}" title="${c.label}" role="option" aria-selected="${c.id === state.theme.button}"></button>`
  ).join("");
  els.bgSwatches.innerHTML = BACKGROUNDS.map(
    (c) =>
      `<button type="button" class="swatch${c.id === state.theme.background ? " selected" : ""}" data-bg="${c.id}" style="background:${c.value}" title="${c.label}" role="option" aria-selected="${c.id === state.theme.background}"></button>`
  ).join("");
}

// ——— Profile UI ———

function renderProfile() {
  const name = state.name || "Player";
  els.displayName.textContent = name;
  els.avatar.textContent = initials(name);
}

function featureChatEnabled() {
  return getConfig().enableChat !== false;
}

function featureGithubEnabled() {
  return getConfig().enableGithubAuth !== false;
}

function featureEmailEnabled() {
  return getConfig().enableEmailAuth !== false;
}

let isAdminUser = false;

function setAdminMsg(text, kind = "") {
  if (!els.adminMsg) return;
  els.adminMsg.textContent = text || "";
  els.adminMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function setAdminOut(obj) {
  if (!els.adminOut) return;
  if (obj == null) {
    els.adminOut.hidden = true;
    els.adminOut.textContent = "";
    return;
  }
  els.adminOut.hidden = false;
  els.adminOut.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function refreshAdminAccess() {
  isAdminUser = false;
  if (els.adminCard) els.adminCard.hidden = true;
  if (!sb || !session?.user || !online) return;
  try {
    const { data, error } = await sb.rpc("jp_is_admin");
    if (error) {
      // Function missing or not deployed yet
      console.warn("jp_is_admin", error.message);
      return;
    }
    isAdminUser = !!data;
    if (els.adminCard) els.adminCard.hidden = !isAdminUser;
  } catch (e) {
    console.warn("admin check", e);
  }
}

async function adminRunDebug() {
  setAdminMsg("");
  const { data, error } = await sb.rpc("jp_admin_debug_stats");
  if (error) throw error;
  setAdminOut(data);
  setAdminMsg("Debug stats loaded.", "ok");
}

async function adminRunHygiene() {
  setAdminMsg("");
  const { data, error } = await sb.rpc("jp_admin_run_hygiene");
  if (error) throw error;
  setAdminOut(data);
  setAdminMsg(
    `Cleanup done — empty: ${data?.empty_guests_deleted ?? "?"} · clones: ${data?.anon_clones_deleted ?? "?"}`,
    "ok"
  );
  toast("Admin cleanup finished");
}

async function adminListDupes() {
  setAdminMsg("");
  const { data, error } = await sb.rpc("jp_admin_list_name_dupes");
  if (error) throw error;
  setAdminOut(data);
  const n = Array.isArray(data) ? data.length : 0;
  setAdminMsg(n ? `Found ${n} rows in duplicate-name groups.` : "No duplicate display names.", "ok");
}

async function adminSendPasswordReset(email) {
  setAdminMsg("");
  const addr = String(email || "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) throw new Error("Enter a valid email");
  if (!isAdminUser) throw new Error("Admin only");
  // Public recovery API — only shown in admin UI (no service role in client)
  const base = String(getConfig().publicBaseUrl || appBaseUrl()).replace(/\/?$/, "/");
  const { error } = await sb.auth.resetPasswordForEmail(addr, {
    redirectTo: `${base}?tab=style`,
  });
  if (error) throw error;
  setAdminMsg(`Password reset email requested for ${addr}.`, "ok");
  toast("Reset email requested");
}

function isAnonymousUser(user = session?.user) {
  if (!user) return false;
  if (user.is_anonymous === true) return true;
  const providers = (user.identities || []).map((i) => i.provider);
  if (providers.includes("email") || providers.includes("github")) return false;
  if (user.email) return false;
  return providers.includes("anonymous") || providers.length === 0;
}

function isEmailUser(user = session?.user) {
  if (!user) return false;
  if (user.email) return true;
  return (user.identities || []).some((i) => i.provider === "email");
}

function applyFeatureFlags() {
  const cfg = getConfig();
  const chatOn = featureChatEnabled();
  const ghOn = featureGithubEnabled();
  const emailOn = featureEmailEnabled();
  els.app.dataset.chat = chatOn ? "1" : "0";
  els.app.dataset.github = ghOn ? "1" : "0";
  els.app.dataset.email = emailOn ? "1" : "0";
  // Hide Chat tab + panel when disabled (both attribute + style for stubborn caches)
  const chatTab = els.chatTab || document.getElementById("chat-tab");
  const chatPanel = document.querySelector('.panel[data-panel="chat"]');
  if (chatTab) {
    chatTab.hidden = !chatOn;
    chatTab.style.display = chatOn ? "" : "none";
    chatTab.setAttribute("aria-hidden", chatOn ? "false" : "true");
  }
  if (chatPanel && !chatOn) {
    chatPanel.hidden = true;
  }
  if (els.privacyLink && cfg.privacyUrl) els.privacyLink.href = cfg.privacyUrl;
  if (els.termsLink && cfg.termsUrl) els.termsLink.href = cfg.termsUrl;
  const minAge = Number(cfg.minAge) || 13;
  if (els.ageMinLabel) els.ageMinLabel.textContent = String(minAge);
  if (els.ageMinLabel2) els.ageMinLabel2.textContent = String(minAge);
}

function setEmailAuthMsg(text, kind = "") {
  if (!els.emailAuthMsg) return;
  els.emailAuthMsg.textContent = text || "";
  els.emailAuthMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function setChangePasswordMsg(text, kind = "") {
  if (!els.changePasswordMsg) return;
  els.changePasswordMsg.textContent = text || "";
  els.changePasswordMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function resetChangePasswordForm() {
  if (els.changePasswordForm) {
    els.changePasswordForm.hidden = true;
    els.changePasswordForm.classList.add("is-collapsed");
  }
  if (els.changePasswordToggle) els.changePasswordToggle.hidden = false;
  if (els.newPasswordInput) els.newPasswordInput.value = "";
  if (els.confirmPasswordInput) els.confirmPasswordInput.value = "";
  setChangePasswordMsg("");
}

function openChangePasswordForm() {
  setChangePasswordMsg("");
  if (els.changePasswordForm) {
    els.changePasswordForm.hidden = false;
    els.changePasswordForm.classList.remove("is-collapsed");
  }
  if (els.changePasswordToggle) els.changePasswordToggle.hidden = true;
  els.newPasswordInput?.focus();
}

function setOnlineUi() {
  els.app.dataset.online = online ? "1" : "0";
  const ghOn = featureGithubEnabled();
  const emailOn = featureEmailEnabled();
  const user = session?.user;
  const anon = isAnonymousUser(user);
  const hasEmail = isEmailUser(user);
  const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider;
  const isGithub = provider === "github";

  if (!window.JUST_PUSH_CONFIG?.enabled) {
    els.syncPill.textContent = "local";
    els.syncPill.className = "sync-pill local";
    els.accountStatus.textContent = "Offline mode (Supabase disabled in config.js).";
    els.githubBtn.hidden = true;
    els.githubBtnStyle.hidden = true;
    els.signOutBtn.hidden = true;
    if (els.deleteAccountBtn) els.deleteAccountBtn.hidden = true;
    if (els.deleteAccountHint) els.deleteAccountHint.hidden = true;
    if (els.emailAuthBlock) els.emailAuthBlock.hidden = true;
    if (els.changePasswordBlock) els.changePasswordBlock.hidden = true;
    return;
  }
  if (online) {
    const code = profile?.friend_code || "…";
    if (hasEmail) {
      els.syncPill.textContent = "email";
      els.syncPill.className = "sync-pill online";
      els.accountStatus.textContent = `Signed in · ${user.email} · code ${code}`;
    } else if (isGithub) {
      els.syncPill.textContent = "github";
      els.syncPill.className = "sync-pill online";
      els.accountStatus.textContent = `Signed in with GitHub · code ${code}`;
    } else {
      els.syncPill.textContent = "guest";
      els.syncPill.className = "sync-pill online";
      els.accountStatus.textContent = emailOn
        ? `Guest online · code ${code} · save with email below to keep this account`
        : `Guest online · code ${code}`;
    }

    els.githubBtn.hidden = !ghOn || isGithub || hasEmail;
    els.githubBtnStyle.hidden = !ghOn || isGithub || hasEmail;
    els.githubBtnStyle.textContent = "Sign in with GitHub";
    els.signOutBtn.hidden = false;
    if (els.deleteAccountBtn) els.deleteAccountBtn.hidden = false;
    if (els.deleteAccountHint) els.deleteAccountHint.hidden = false;
    els.friendCodeHint.textContent = "Short code works worldwide. Scores sync to Supabase.";

    // Email form: show for guests (link) and also when we want sign-in (always if email on & not already email user)
    if (els.emailAuthBlock) {
      const showEmailUi = emailOn && !hasEmail;
      els.emailAuthBlock.hidden = !showEmailUi;
      if (showEmailUi && els.emailAuthBlurb) {
        els.emailAuthBlurb.textContent = anon
          ? "Save this guest with email so you can sign in on other devices. Scores, friends, and groups stay on this same account."
          : "Add an email and password to this account, or sign in with an existing email.";
      }
      if (els.emailLinkBtn) {
        els.emailLinkBtn.textContent = anon ? "Save progress with email" : "Add email to this account";
        els.emailLinkBtn.hidden = false;
      }
    }
    if (els.changePasswordBlock) {
      const showPw = emailOn && hasEmail;
      const wasHidden = els.changePasswordBlock.hidden;
      els.changePasswordBlock.hidden = !showPw;
      // Collapse when block first appears or when leaving email session — not mid-edit
      if (!showPw || wasHidden) resetChangePasswordForm();
    }
  } else {
    els.syncPill.textContent = "offline";
    els.syncPill.className = "sync-pill offline";
    els.accountStatus.textContent = "Could not reach Supabase — playing offline. Local share codes still work.";
    els.githubBtn.hidden = true;
    els.githubBtnStyle.hidden = !ghOn;
    els.githubBtnStyle.textContent = ghOn ? "Retry / Sign in with GitHub" : "Retry connection";
    els.signOutBtn.hidden = true;
    if (els.deleteAccountBtn) els.deleteAccountBtn.hidden = true;
    if (els.deleteAccountHint) els.deleteAccountHint.hidden = true;
    if (els.emailAuthBlock) {
      // Offline: still allow sign-in attempt if email enabled
      els.emailAuthBlock.hidden = !emailOn;
      if (els.emailAuthBlurb) {
        els.emailAuthBlurb.textContent = "Sign in with email when you’re back online, or retry connection.";
      }
      if (els.emailLinkBtn) els.emailLinkBtn.hidden = true;
    }
    if (els.changePasswordBlock) els.changePasswordBlock.hidden = true;
    els.friendCodeHint.textContent = "Offline: long share blob. Go online for short codes + live boards.";
  }
  updateChatOnlineHint();
  refreshAdminAccess();
}

const AGE_KEY = "push-thru-age-ok";

function hasAcceptedAge() {
  try {
    return localStorage.getItem(AGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureAgeThenName() {
  if (!hasAcceptedAge() && els.ageModal) {
    if (els.ageConfirm) els.ageConfirm.checked = false;
    if (els.ageContinue) els.ageContinue.disabled = true;
    els.ageModal.showModal();
    return;
  }
  ensureName();
}

function setNameLoginMsg(text, kind = "") {
  if (!els.nameLoginMsg) return;
  els.nameLoginMsg.textContent = text || "";
  els.nameLoginMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

/** New player: pick a display name */
function showNamePanel() {
  if (els.nameLoginPanel) els.nameLoginPanel.hidden = true;
  if (els.namePanel) els.namePanel.hidden = false;
  setNameLoginMsg("");
  setTimeout(() => els.nameInput?.focus(), 50);
}

/** Default first screen: log in */
function showNameLoginPanel() {
  if (els.namePanel) els.namePanel.hidden = true;
  if (els.nameLoginPanel) els.nameLoginPanel.hidden = false;
  setNameLoginMsg("");
  setTimeout(() => els.nameLoginEmail?.focus(), 50);
}

function ensureName() {
  // Already have a name (local or restored after login)
  if (state.name) {
    if (els.nameModal?.open) els.nameModal.close();
    return;
  }
  // Prefer login first; new players use “Continue as guest”
  if (featureEmailEnabled()) showNameLoginPanel();
  else showNamePanel();
  if (els.nameInput) els.nameInput.value = "";
  if (!els.nameModal?.open) els.nameModal?.showModal();
}

/**
 * Log in from the first-run name modal (does not require picking a guest name first).
 */
async function loginFromNameModal() {
  if (!featureEmailEnabled()) throw new Error("Email sign-in is disabled");
  if (!sb) {
    await initBackend();
    if (!sb) throw new Error("Still connecting — try again in a moment");
  }
  const email = String(els.nameLoginEmail?.value || "")
    .trim()
    .toLowerCase();
  const password = String(els.nameLoginPassword?.value || "");
  if (!email || !email.includes("@")) throw new Error("Enter a valid email");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  session = data.session;
  online = true;
  await ensureProfile();
  setOnlineUi();
  await refreshSocial().catch(() => {});
  await loadGlobalBoard().catch(() => {});

  if (els.nameLoginPassword) els.nameLoginPassword.value = "";
  if (els.nameModal?.open) els.nameModal.close();
  // If profile has no display name, ask once after login
  if (!state.name) {
    showNamePanel();
    els.nameModal?.showModal();
    toast("Signed in — pick a display name");
    return;
  }
  toast("Welcome back");
}

/** Phrase user must type to enable permanent delete. */
function deleteConfirmPhrase() {
  if (isEmailUser() && session?.user?.email) {
    return String(session.user.email).trim().toLowerCase();
  }
  // Guests: must type this exact token (not a soft "yes")
  return "DELETE MY ACCOUNT";
}

let deleteCountdownTimer = null;
let deleteUnlockAt = 0;

function setDeleteModalMsg(text, kind = "") {
  if (!els.deleteModalMsg) return;
  els.deleteModalMsg.textContent = text || "";
  els.deleteModalMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function closeDeleteModal() {
  clearInterval(deleteCountdownTimer);
  deleteCountdownTimer = null;
  deleteUnlockAt = 0;
  if (els.deleteModal?.open) els.deleteModal.close();
  if (els.deleteConfirmInput) els.deleteConfirmInput.value = "";
  if (els.deleteUnderstand) els.deleteUnderstand.checked = false;
  if (els.deleteFinalBtn) {
    els.deleteFinalBtn.disabled = true;
    els.deleteFinalBtn.textContent = "Delete forever";
  }
  if (els.deleteCountdown) {
    els.deleteCountdown.hidden = true;
    els.deleteCountdown.textContent = "";
  }
  setDeleteModalMsg("");
}

function updateDeleteFinalEnabled() {
  if (!els.deleteFinalBtn) return;
  const phrase = deleteConfirmPhrase();
  const typed = String(els.deleteConfirmInput?.value || "").trim();
  const typedOk = isEmailUser()
    ? typed.toLowerCase() === phrase
    : typed === phrase;
  const checked = !!els.deleteUnderstand?.checked;
  const delayDone = Date.now() >= deleteUnlockAt;
  els.deleteFinalBtn.disabled = !(typedOk && checked && delayDone && online && session?.user);
}

function openDeleteModal() {
  if (!sb || !online || !session?.user) {
    toast("Go online to delete your account");
    return;
  }
  const phrase = deleteConfirmPhrase();
  if (els.deleteTypeHint) {
    els.deleteTypeHint.innerHTML = isEmailUser()
      ? `Type your email exactly to confirm: <strong>${escapeHtml(phrase)}</strong>`
      : `Type this exactly to confirm: <strong>${escapeHtml(phrase)}</strong>`;
  }
  if (els.deleteConfirmInput) {
    els.deleteConfirmInput.value = "";
    els.deleteConfirmInput.placeholder = phrase;
  }
  if (els.deleteUnderstand) els.deleteUnderstand.checked = false;
  setDeleteModalMsg("");

  // 5s cool-down before the final button can ever enable
  deleteUnlockAt = Date.now() + 5000;
  if (els.deleteFinalBtn) {
    els.deleteFinalBtn.disabled = true;
    els.deleteFinalBtn.textContent = "Delete forever";
  }
  if (els.deleteCountdown) {
    els.deleteCountdown.hidden = false;
  }
  clearInterval(deleteCountdownTimer);
  const tick = () => {
    const left = Math.ceil((deleteUnlockAt - Date.now()) / 1000);
    if (els.deleteCountdown) {
      if (left > 0) {
        els.deleteCountdown.hidden = false;
        els.deleteCountdown.textContent = `Final delete unlocks in ${left}s…`;
      } else {
        els.deleteCountdown.hidden = true;
        els.deleteCountdown.textContent = "";
      }
    }
    updateDeleteFinalEnabled();
    if (left <= 0) clearInterval(deleteCountdownTimer);
  };
  tick();
  deleteCountdownTimer = setInterval(tick, 250);

  els.deleteModal?.showModal();
  setTimeout(() => els.deleteConfirmInput?.focus(), 50);
}

async function executeDeleteAccount() {
  if (!sb || !online || !session?.user) {
    setDeleteModalMsg("Go online to delete your account", "err");
    return;
  }
  const phrase = deleteConfirmPhrase();
  const typed = String(els.deleteConfirmInput?.value || "").trim();
  const typedOk = isEmailUser() ? typed.toLowerCase() === phrase : typed === phrase;
  if (!typedOk) {
    setDeleteModalMsg("Confirmation text does not match.", "err");
    return;
  }
  if (!els.deleteUnderstand?.checked) {
    setDeleteModalMsg("Check the box to confirm you understand.", "err");
    return;
  }
  if (Date.now() < deleteUnlockAt) {
    setDeleteModalMsg("Wait for the timer to finish.", "err");
    return;
  }

  if (els.deleteFinalBtn) {
    els.deleteFinalBtn.disabled = true;
    els.deleteFinalBtn.textContent = "Deleting…";
  }

  try {
    const { error } = await sb.rpc("jp_delete_my_account");
    if (error) throw error;
  } catch (err) {
    console.warn(err);
    setDeleteModalMsg(err.message || "Could not delete account", "err");
    if (els.deleteFinalBtn) els.deleteFinalBtn.textContent = "Delete forever";
    updateDeleteFinalEnabled();
    return;
  }

  try {
    await sb.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("just-push-v1");
  } catch {
    /* ignore */
  }

  closeDeleteModal();
  toast("Account deleted");
  setTimeout(() => {
    location.reload();
  }, 600);
}

/** Opens multi-step delete flow (not immediate delete). */
function deleteMyAccount() {
  openDeleteModal();
}

// ——— Scores render ———

function applyLevelUi(badgeEl, numEl, titleEl, xpLabelEl, fillEl, trackEl, prog) {
  if (numEl) numEl.textContent = String(prog.level);
  if (badgeEl) {
    badgeEl.dataset.tier = prog.tier.id;
    badgeEl.dataset.variant = prog.tier.variant || "base";
    badgeEl.style.setProperty("--tier", prog.tier.color);
    badgeEl.title = `${prog.tier.label} · Level ${prog.level}`;
  }
  if (titleEl) {
    titleEl.textContent = prog.maxed
      ? `Level ${prog.level} · Max`
      : `Level ${prog.level} · ${prog.tier.label}`;
  }
  if (xpLabelEl) {
    if (prog.maxed) {
      xpLabelEl.textContent = `${formatNum(prog.totalXp)} XP (maxed)`;
    } else {
      xpLabelEl.textContent = `${formatNum(prog.xpIntoLevel)} / ${formatNum(prog.xpForNext)} XP`;
    }
  }
  if (fillEl) fillEl.style.width = `${Math.round(prog.fraction * 1000) / 10}%`;
  if (trackEl) {
    trackEl.setAttribute("aria-valuenow", String(Math.round(prog.fraction * 100)));
    trackEl.setAttribute("aria-label", prog.maxed ? `Level ${prog.level} maxed` : `Level ${prog.level}, ${Math.round(prog.fraction * 100)}% to next`);
  }
}

function renderLevel() {
  const prog = levelProgress(state.lifetimeCount);
  applyLevelUi(
    els.levelBadge,
    els.levelNum,
    els.levelTitle,
    els.levelXpLabel,
    els.levelProgressFill,
    els.levelProgressTrack,
    prog
  );
  applyLevelUi(
    els.rankLevelBadge,
    els.rankLevel,
    els.rankLevelTitle,
    els.rankLevelXp,
    els.rankLevelFill,
    null,
    prog
  );

  if (prog.level > lastRenderedLevel) {
    const from = lastRenderedLevel;
    const to = prog.level;
    lastRenderedLevel = to;
    // Don't interrupt 10s challenge with the congrats card
    const inChallenge =
      state.mode === "challenge" &&
      (challenge.status === "running" || challenge.status === "done");
    if (!inChallenge) {
      // Queue intermediate levels on big jumps (e.g. offline reconcile)
      if (to - from > 1) {
        for (let l = from + 1; l < to; l++) {
          levelUpQueue.push({ level: l, tier: tierForLevel(l) });
        }
        if (levelUpQueue.length > 4) {
          levelUpQueue = levelUpQueue.slice(-3);
        }
      }
      showLevelUpPopup(to, prog.tier);
    } else {
      // Drop any pending queue so it doesn't pop mid-challenge later
      levelUpQueue = [];
    }
  } else if (prog.level < lastRenderedLevel) {
    // e.g. profile merge / reload — no popup
    lastRenderedLevel = prog.level;
  }
}

function levelBadgeHtml(lifetime, compact = false) {
  const prog = levelProgress(lifetime || 0);
  const cls = compact ? "level-chip compact" : "level-chip";
  const variant = prog.tier.variant || "base";
  return `<span class="${cls}" data-tier="${prog.tier.id}" data-variant="${variant}" style="--tier:${prog.tier.color}" title="${prog.tier.label} · level ${prog.level}"><span class="level-chip-icon" aria-hidden="true"></span><span class="level-chip-num">${prog.level}</span></span>`;
}

/** Rank place class — cooler emblems as you approach #1 */
function rankPlaceClass(index) {
  const place = index + 1;
  if (place === 1) return "place-1";
  if (place === 2) return "place-2";
  if (place === 3) return "place-3";
  if (place <= 5) return "place-top5";
  if (place <= 10) return "place-top10";
  return "place-rest";
}

/** Emblem around leaderboard rank number */
function rankEmblemHtml(index) {
  const place = index + 1;
  const cls = rankPlaceClass(index);
  return `<span class="rank-emblem ${cls}" title="Rank #${place}" aria-label="Rank ${place}">
    <span class="rank-emblem-aura" aria-hidden="true"></span>
    <span class="rank-emblem-ring" aria-hidden="true"></span>
    <span class="rank-emblem-num">${place}</span>
  </span>`;
}

/** Score pill framed by the player's metal tier (from lifetime XP) */
function scoreEmblemHtml(score, lifetime) {
  const prog = levelProgress(lifetime || 0);
  const t = prog.tier;
  return `<div class="score-emblem" data-variant="${t.variant || "base"}" style="--tier:${t.color}" title="${t.label}">
    <span class="score-emblem-ring" aria-hidden="true"></span>
    <span class="score-emblem-val">${formatNum(score)}</span>
  </div>`;
}

function renderScores() {
  els.sessionCount.textContent = formatNum(state.sessionCount);
  els.highScore.textContent = formatNum(state.highScore);
  els.lifetimeCount.textContent = formatNum(state.lifetimeCount);
  els.challengeCount.textContent = formatNum(challenge.count);
  els.challengeBest.textContent = formatNum(state.challengeBest);
  els.rankHigh.textContent = formatNum(state.highScore);
  els.rankChallenge.textContent = formatNum(state.challengeBest);
  els.rankLife.textContent = formatNum(state.lifetimeCount);
  els.rankSessions.textContent = formatNum(state.sessionsPlayed);
  renderLevel();
}

function spawnFloater() {
  const el = document.createElement("span");
  el.className = "floater";
  el.textContent = "+1";
  el.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
  els.floaters.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function confettiBurst() {
  const btnColor = BUTTON_COLORS.find((b) => b.id === state.theme.button)?.value || "#ff4d6d";
  const palette = [btnColor, "#ffffff", "#ffd700", "#7c9cff", "#3dd68c"];
  const rect = els.pushBtn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 24; i++) {
    const p = document.createElement("span");
    p.className = "confetti-piece";
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    p.style.background = palette[i % palette.length];
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 100;
    p.style.setProperty("--cx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--cy", `${Math.sin(angle) * dist - 40}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

function showNewRecord(msg = "New high score!") {
  els.newRecord.textContent = msg;
  els.newRecord.hidden = false;
  clearTimeout(recordTimer);
  recordTimer = setTimeout(() => {
    els.newRecord.hidden = true;
  }, 2200);
  confettiBurst();
}

function pulseRings() {
  $$(".ring").forEach((r, i) => {
    r.style.transform = `scale(${1.06 + i * 0.02})`;
    setTimeout(() => {
      r.style.transform = "";
    }, 120);
  });
}

// ——— Mode: free vs challenge ———

function setMode(mode) {
  if (challenge.status === "running") return;
  state.mode = mode;
  saveState();
  els.app.dataset.mode = mode;
  $$(".mode-btn").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  els.scoreboardFree.hidden = mode !== "free";
  els.scoreboardChallenge.hidden = mode !== "challenge";
  els.resetSession.hidden = mode !== "free";
  els.challengeAgain.hidden = mode !== "challenge" || challenge.status !== "done";
  els.challengeResult.hidden = true;
  updatePushChrome();
  if (mode === "challenge") {
    challenge.status = "idle";
    challenge.count = 0;
    els.timerRing.hidden = false;
    setTimerVisual(1);
    els.challengeTimer.textContent = "10.0";
    renderScores();
  } else {
    els.timerRing.hidden = true;
    cancelAnimationFrame(challenge.raf);
  }
}

function updatePushChrome() {
  if (state.mode === "free") {
    els.pushLabel.textContent = "PUSH";
    els.pushHint.textContent = "or spacebar";
    els.pushBtn.classList.remove("waiting", "locked");
    els.pushBtn.disabled = false;
    return;
  }
  if (challenge.status === "idle") {
    els.pushLabel.textContent = "START";
    els.pushHint.textContent = "10 second run";
    els.pushBtn.classList.add("waiting");
    els.pushBtn.classList.remove("locked");
    els.pushBtn.disabled = false;
  } else if (challenge.status === "running") {
    els.pushLabel.textContent = "PUSH";
    els.pushHint.textContent = "go go go";
    els.pushBtn.classList.remove("waiting", "locked");
    els.pushBtn.disabled = false;
  } else {
    els.pushLabel.textContent = "DONE";
    els.pushHint.textContent = `${challenge.count} pushes`;
    els.pushBtn.classList.add("locked");
    els.pushBtn.classList.remove("waiting");
    els.pushBtn.disabled = true;
  }
}

function setTimerVisual(fraction) {
  // fraction 1 = full time, 0 = empty
  const f = Math.max(0, Math.min(1, fraction));
  els.timerProgress.style.strokeDasharray = String(CIRCUMFERENCE);
  els.timerProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - f));
}

function startChallenge() {
  challenge.status = "running";
  challenge.count = 0;
  challenge.startedAt = performance.now();
  challenge.endsAt = challenge.startedAt + CHALLENGE_MS;
  els.challengeResult.hidden = true;
  els.challengeAgain.hidden = true;
  els.newRecord.hidden = true;
  updatePushChrome();
  renderScores();
  tickChallenge();
}

function tickChallenge() {
  const now = performance.now();
  const left = Math.max(0, challenge.endsAt - now);
  const secs = (left / 1000).toFixed(1);
  els.challengeTimer.textContent = secs;
  setTimerVisual(left / CHALLENGE_MS);
  if (left <= 0) {
    endChallenge();
    return;
  }
  challenge.raf = requestAnimationFrame(tickChallenge);
}

function endChallenge() {
  cancelAnimationFrame(challenge.raf);
  challenge.status = "done";
  els.challengeTimer.textContent = "0.0";
  setTimerVisual(0);
  updatePushChrome();

  let isRecord = false;
  if (challenge.count > state.challengeBest) {
    state.challengeBest = challenge.count;
    isRecord = true;
  }
  state.sessionsPlayed += 1;
  saveState();
  renderScores();
  // Server: challenge best + session bump (scores cannot be set via plain REST)
  reportChallengeToServer(challenge.count).catch((e) => console.warn("challenge sync", e));

  els.challengeResult.hidden = false;
  els.challengeResult.textContent = isRecord
    ? `${challenge.count} pushes — new personal best!`
    : `${challenge.count} pushes`;
  els.challengeAgain.hidden = false;
  if (isRecord) showNewRecord("New 10s best!");
  else confettiBurst();
}

function resetChallengeIdle() {
  challenge.status = "idle";
  challenge.count = 0;
  els.challengeResult.hidden = true;
  els.challengeAgain.hidden = true;
  els.challengeTimer.textContent = "10.0";
  setTimerVisual(1);
  updatePushChrome();
  renderScores();
}

// ——— Push ———

function push() {
  if (state.mode === "challenge") {
    if (challenge.status === "idle") {
      startChallenge();
      return;
    }
    if (challenge.status === "done") return;
    // running
    challenge.count += 1;
    state.lifetimeCount += 1;
    saveState();
    renderScores();
    spawnFloater();
    pulseRings();
    schedulePushRpc(0);
    return;
  }

  // free mode
  state.sessionCount += 1;
  state.lifetimeCount += 1;
  let isRecord = false;
  if (state.sessionCount > state.highScore) {
    state.highScore = state.sessionCount;
    isRecord = true;
  }
  saveState();
  schedulePushRpc(state.sessionCount);
  scheduleMetaSync();
  renderScores();
  spawnFloater();
  pulseRings();
  if (isRecord && state.sessionCount > 1) showNewRecord();
}

function resetSession() {
  if (state.sessionCount > 0) {
    state.sessionsPlayed += 1;
    bumpSessionOnServer().catch((e) => console.warn("session bump", e));
  }
  state.sessionCount = 0;
  els.newRecord.hidden = true;
  saveState();
  scheduleMetaSync();
  renderScores();
  toast("Session reset");
}

// ——— Supabase ———

function getConfig() {
  return window.JUST_PUSH_CONFIG || { enabled: false };
}

async function initBackend() {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    online = false;
    setOnlineUi();
    return;
  }
  if (!window.supabase?.createClient) {
    online = false;
    setOnlineUi();
    toast("Supabase SDK failed to load");
    return;
  }

  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  try {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) {
      const { data: anon, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      session = anon.session;
    }
    await ensureProfile();
    online = true;
    setOnlineUi();
    await refreshSocial();
    await loadGlobalBoard();
    await loadBoardPosts();
    await processPendingDeepLink();
  } catch (err) {
    console.warn("Push Thru online init failed:", err);
    online = false;
    setOnlineUi();
  }

  sb.auth.onAuthStateChange(async (event, s) => {
    session = s;
    if (event === "SIGNED_OUT") {
      profile = null;
      online = false;
      friendsCache = [];
      groupsCache = [];
      setOnlineUi();
      // re-anon
      try {
        const { data: anon, error } = await sb.auth.signInAnonymously();
        if (!error) {
          session = anon.session;
          await ensureProfile();
          online = true;
          setOnlineUi();
          await refreshSocial();
        }
      } catch {
        /* stay offline */
      }
      return;
    }
    if (s) {
      try {
        await ensureProfile();
        online = true;
        setOnlineUi();
        await refreshSocial();
        await loadGlobalBoard();
        await processPendingDeepLink();
      } catch (e) {
        console.warn(e);
      }
    }
  });
}

async function ensureProfile() {
  if (!sb || !session?.user) return;
  const uid = session.user.id;

  let { data, error } = await sb.from("jp_profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;

  if (!data) {
    // Scores always start at 0 server-side (insert guard). Name/theme only.
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const insert = {
      id: uid,
      display_name: state.name || "Player",
      friend_code: code,
      theme_button: state.theme.button,
      theme_bg: state.theme.background,
    };
    const res = await sb.from("jp_profiles").upsert(insert).select("*").single();
    if (res.error) throw res.error;
    data = res.data;
  }

  profile = data;

  // Prefer higher of local vs server for display, then push any local-ahead via RPCs
  const localAhead =
    state.lifetimeCount > (data.lifetime_count || 0) ||
    state.highScore > (data.high_score || 0) ||
    state.challengeBest > (data.challenge_best || 0);

  if (!localAhead) {
    state.highScore = Math.max(state.highScore, data.high_score || 0);
    state.challengeBest = Math.max(state.challengeBest, data.challenge_best || 0);
    state.lifetimeCount = Math.max(state.lifetimeCount, data.lifetime_count || 0);
    state.sessionsPlayed = Math.max(state.sessionsPlayed, data.sessions_played || 0);
  }

  if (data.display_name && data.display_name !== "Player") {
    if (!state.name || state.name === "Player") state.name = data.display_name;
  } else if (state.name) {
    /* keep local name */
  }
  if (data.theme_button) state.theme.button = data.theme_button;
  if (data.theme_bg) state.theme.background = data.theme_bg;

  saveState();
  applyTheme();
  renderProfile();
  renderScores();

  // Name/theme only via table update; scores only via RPCs
  await pushProfileMeta();
  if (localAhead) {
    await reconcileLocalScoresToServer();
  }
  const refreshed = await sb.from("jp_profiles").select("*").eq("id", uid).single();
  if (refreshed.data) {
    profile = refreshed.data;
    // After reconcile, adopt server truth for scores
    state.highScore = Math.max(state.highScore, profile.high_score || 0);
    state.challengeBest = Math.max(state.challengeBest, profile.challenge_best || 0);
    state.lifetimeCount = Math.max(state.lifetimeCount, profile.lifetime_count || 0);
    state.sessionsPlayed = Math.max(state.sessionsPlayed, profile.sessions_played || 0);
    saveState();
    renderScores();
  }
}

/** Debounced name/theme sync (scores never go through this path). */
function scheduleMetaSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushProfileMeta().catch((e) => console.warn("meta sync", e));
  }, 400);
}

/** @deprecated name kept for any leftover callers */
function scheduleSync() {
  scheduleMetaSync();
}

let pushRpcTimer = null;
let pendingPushSession = 0;
let pendingPushCount = 0;

/** Batch push RPCs so rapid taps don't flood the network. */
function schedulePushRpc(sessionCount) {
  pendingPushCount += 1;
  pendingPushSession = Math.max(pendingPushSession, sessionCount || 0);
  clearTimeout(pushRpcTimer);
  pushRpcTimer = setTimeout(() => {
    const n = pendingPushCount;
    const sess = pendingPushSession;
    pendingPushCount = 0;
    pendingPushSession = 0;
    recordPushesOnServer(n, sess).catch((e) => console.warn("push rpc", e));
  }, 350);
}

function applyServerProfile(row) {
  if (!row) return;
  profile = row;
  // Never lower local mid-play if server is briefly behind a pending batch
  state.highScore = Math.max(state.highScore, row.high_score || 0);
  state.challengeBest = Math.max(state.challengeBest, row.challenge_best || 0);
  state.lifetimeCount = Math.max(state.lifetimeCount, row.lifetime_count || 0);
  state.sessionsPlayed = Math.max(state.sessionsPlayed, row.sessions_played || 0);
  saveState();
  renderScores();
  online = true;
  setOnlineUi();
}

async function recordPushesOnServer(count, sessionCount) {
  if (!sb || !session?.user || !online) return;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return;
  // Chunk at 200 (server max per RPC)
  let left = n;
  let last = null;
  while (left > 0) {
    const chunk = Math.min(200, left);
    const { data, error } = await sb.rpc("jp_record_pushes", {
      p_count: chunk,
      p_session_count: Math.floor(Number(sessionCount) || 0),
    });
    if (error) {
      console.warn("jp_record_pushes", error);
      return;
    }
    last = data;
    left -= chunk;
  }
  if (last) applyServerProfile(last);
}

async function reportChallengeToServer(count, bumpSession = true) {
  if (!sb || !session?.user || !online) return;
  const { data, error } = await sb.rpc("jp_report_challenge", {
    p_count: Math.floor(Number(count) || 0),
    p_bump_session: !!bumpSession,
  });
  if (error) {
    console.warn("jp_report_challenge", error);
    return;
  }
  applyServerProfile(data);
}

async function bumpSessionOnServer() {
  if (!sb || !session?.user || !online) return;
  const { data, error } = await sb.rpc("jp_bump_session");
  if (error) {
    console.warn("jp_bump_session", error);
    return;
  }
  applyServerProfile(data);
}

/** If local offline progress is ahead of server, claim it via capped RPCs (not raw UPDATE). */
async function reconcileLocalScoresToServer() {
  if (!sb || !session?.user || !profile) return;
  let serverLife = profile.lifetime_count || 0;
  let guard = 0;
  while (state.lifetimeCount > serverLife && guard < 50) {
    const delta = Math.min(200, state.lifetimeCount - serverLife);
    const { data, error } = await sb.rpc("jp_record_pushes", {
      p_count: delta,
      p_session_count: state.highScore,
    });
    if (error) {
      console.warn("reconcile pushes", error);
      break;
    }
    profile = data;
    serverLife = data.lifetime_count || serverLife;
    guard += 1;
  }
  if (state.challengeBest > (profile.challenge_best || 0)) {
    const { data, error } = await sb.rpc("jp_report_challenge", {
      p_count: state.challengeBest,
      p_bump_session: false,
    });
    if (!error && data) profile = data;
  }
}

/** Name + theme only — score columns are ignored by DB trigger if sent. */
async function pushProfileMeta() {
  if (!sb || !session?.user) return;

  const payload = {
    display_name: (state.name || "Player").slice(0, 16),
    theme_button: state.theme.button,
    theme_bg: state.theme.background,
  };

  const { data, error } = await sb
    .from("jp_profiles")
    .update(payload)
    .eq("id", session.user.id)
    .select("*")
    .single();

  if (error) {
    console.warn("profile meta sync", error);
    return;
  }
  // Keep server scores; don't overwrite local mid-tap with stale zeros
  if (data) {
    profile = data;
    online = true;
    setOnlineUi();
  }
}

async function pushProfile() {
  await pushProfileMeta();
}

async function signInWithGithub() {
  if (!featureGithubEnabled()) {
    toast("GitHub sign-in is disabled in this build");
    return;
  }
  if (!sb) {
    await initBackend();
    if (!sb) {
      toast("Supabase not configured");
      return;
    }
  }
  const cfg = getConfig();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: cfg.redirectTo || window.location.href.split("#")[0],
    },
  });
  if (error) toast(error.message || "GitHub sign-in failed");
}

function readEmailPassword() {
  const email = String(els.emailInput?.value || "")
    .trim()
    .toLowerCase();
  const password = String(els.passwordInput?.value || "");
  if (!email || !email.includes("@")) throw new Error("Enter a valid email");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  return { email, password };
}

/**
 * Link email+password to the CURRENT session (guest → permanent).
 * Same user id → scores / friends / groups stay.
 */
async function linkEmailToCurrentAccount() {
  if (!featureEmailEnabled()) throw new Error("Email sign-in is disabled");
  if (!sb) {
    await initBackend();
    if (!sb) throw new Error("Not connected");
  }
  if (!session?.user) throw new Error("No session — go online first");
  if (isEmailUser()) throw new Error("This account already has an email");

  const { email, password } = readEmailPassword();
  // Flush name/theme before converting
  await pushProfileMeta().catch(() => {});

  const { data, error } = await sb.auth.updateUser({ email, password });
  if (error) throw error;

  const { data: sessData } = await sb.auth.getSession();
  session = sessData.session || session;
  await ensureProfile();
  online = true;
  setOnlineUi();

  const confirmed = !!(data?.user?.email && !data.user.email_confirmed_at === false);
  // If project requires email confirm, identities may still be pending
  const needsConfirm =
    data?.user &&
    data.user.email &&
    data.user.email_confirmed_at == null &&
    data.user.confirmation_sent_at;

  if (needsConfirm) {
    setEmailAuthMsg(
      `Check ${email} to confirm. After that, sign in with this email on any device — same scores & friends.`,
      "ok"
    );
    toast("Confirmation email sent");
  } else {
    setEmailAuthMsg(`Saved! Signed in as ${email}. Use this on other devices.`, "ok");
    toast("Account saved with email");
  }
  if (els.passwordInput) els.passwordInput.value = "";
}

/**
 * Sign in with an existing email account (replaces current guest session).
 */
async function signInWithEmailPassword() {
  if (!featureEmailEnabled()) throw new Error("Email sign-in is disabled");
  if (!sb) {
    await initBackend();
    if (!sb) throw new Error("Not connected");
  }
  const { email, password } = readEmailPassword();

  if (isAnonymousUser() && online) {
    const ok = window.confirm(
      "Sign in with email will switch accounts.\n\nYour current guest progress will NOT move to the email account (use “Save progress with email” for that).\n\nContinue signing in?"
    );
    if (!ok) return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  session = data.session;
  await ensureProfile();
  online = true;
  setOnlineUi();
  setEmailAuthMsg(`Signed in as ${email}`, "ok");
  toast("Signed in");
  if (els.passwordInput) els.passwordInput.value = "";
  await refreshSocial();
  await loadGlobalBoard();
}

async function changePassword() {
  if (!featureEmailEnabled()) throw new Error("Email accounts are disabled");
  if (!sb || !session?.user) throw new Error("Not signed in");
  if (!isEmailUser()) throw new Error("Change password is only for email accounts");

  const next = String(els.newPasswordInput?.value || "");
  const confirm = String(els.confirmPasswordInput?.value || "");
  if (next.length < 6) throw new Error("Password must be at least 6 characters");
  if (next !== confirm) throw new Error("Passwords do not match");

  const { error } = await sb.auth.updateUser({ password: next });
  if (error) throw error;

  resetChangePasswordForm();
  setChangePasswordMsg("Password updated.", "ok");
  toast("Password updated");
}

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  // New guest so play keeps working online
  try {
    const { data: anon, error } = await sb.auth.signInAnonymously();
    if (!error) {
      session = anon.session;
      await ensureProfile();
      online = true;
      setOnlineUi();
      toast("Signed out — back to guest");
      return;
    }
  } catch {
    /* fall through */
  }
  toast("Signed out");
  setOnlineUi();
}

// ——— Share links (phone-friendly) ———

function appBaseUrl() {
  const cfg = getConfig();
  if (cfg.publicBaseUrl) {
    return String(cfg.publicBaseUrl).replace(/\/?$/, "/");
  }
  // Keep folder path so GitHub project pages work (/just-push/)
  let path = location.pathname || "/";
  if (/index\.html$/i.test(path)) {
    path = path.replace(/index\.html$/i, "");
  } else if (!path.endsWith("/")) {
    // /just-push → /just-push/  (directory-style routes)
    const last = path.split("/").pop() || "";
    if (!last.includes(".")) path += "/";
    else path = path.replace(/\/[^/]*$/, "/");
  }
  if (!path.endsWith("/")) path += "/";
  return `${location.origin}${path}`;
}

function friendInviteUrl(code) {
  const c = (code || friendCodeDisplay() || "").trim();
  if (!c || c.startsWith("JP1.")) {
    // Offline blob links are huge; still work but ugly — prefer online short code
    return `${appBaseUrl()}?add=${encodeURIComponent(c)}`;
  }
  return `${appBaseUrl()}?add=${encodeURIComponent(c.toUpperCase())}`;
}

function groupInviteUrl(code) {
  return `${appBaseUrl()}?join=${encodeURIComponent(String(code || "").trim().toUpperCase())}`;
}

function extractCodeFromInput(raw, kind) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Full invite URL
  try {
    if (/^https?:\/\//i.test(s) || s.includes("?add=") || s.includes("?join=") || s.includes("&add=") || s.includes("&join=")) {
      const url = new URL(s, appBaseUrl());
      const add = url.searchParams.get("add") || url.searchParams.get("friend") || url.searchParams.get("f");
      const join = url.searchParams.get("join") || url.searchParams.get("group") || url.searchParams.get("g");
      if (kind === "friend" && add) return add.trim();
      if (kind === "group" && join) return join.trim();
      if (add) return add.trim();
      if (join) return join.trim();
    }
  } catch {
    /* plain code */
  }
  return s;
}

function parseDeepLink() {
  const params = new URLSearchParams(location.search);
  const add = params.get("add") || params.get("friend") || params.get("f");
  const join = params.get("join") || params.get("group") || params.get("g");
  const tab = params.get("tab") || params.get("settings");
  if (add) return { type: "friend", code: add.trim() };
  if (join) return { type: "group", code: join.trim() };
  if (tab === "style" || tab === "settings" || params.has("settings")) {
    return { type: "tab", tab: "style" };
  }
  if (tab === "scores" || tab === "friends" || tab === "groups" || tab === "play" || tab === "chat") {
    return { type: "tab", tab };
  }
  return null;
}

function clearDeepLinkFromUrl() {
  if (!location.search) return;
  const url = new URL(location.href);
  ["add", "friend", "f", "join", "group", "g", "tab", "settings"].forEach((k) => url.searchParams.delete(k));
  const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  history.replaceState({}, "", clean);
}

function showPendingBanner(msg) {
  if (!els.pendingInvite) return;
  els.pendingInvite.hidden = !msg;
  els.pendingInvite.textContent = msg || "";
}

async function shareOrCopy(url, title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // fall through to copy
    }
  }
  const ok = await copyText(url);
  return ok ? "copied" : "failed";
}

async function shareFriendInvite() {
  if (!online || !profile?.friend_code) {
    toast("Go online first so friends get a short link");
    setTab("friends");
    return;
  }
  const url = friendInviteUrl(profile.friend_code);
  const name = state.name || "me";
  const result = await shareOrCopy(
    url,
    "Push Thru",
    `Add ${name} on Push Thru and compete — Unlimited + 10 second mode:\n${url}`
  );
  if (result === "shared") toast("Invite sent");
  else if (result === "copied") toast("Invite link copied — paste in texts");
  else if (result === "failed") toast("Could not share — copy your code instead");
}

async function shareGroupInvite(code, groupName) {
  const url = groupInviteUrl(code);
  const result = await shareOrCopy(
    url,
    "Push Thru group",
    `Join ${groupName || "our group"} on Push Thru:\n${url}`
  );
  if (result === "shared") toast("Group link sent");
  else if (result === "copied") toast("Group link copied");
  else toast("Could not share");
}

async function processPendingDeepLink() {
  if (!pendingDeepLink) return;
  const { type, code } = pendingDeepLink;

  if (type === "friend") {
    showPendingBanner(`Adding friend ${code.toUpperCase()}…`);
    setTab("friends");
    if (!online) {
      showPendingBanner("Connecting… then we’ll add your friend.");
      return;
    }
    try {
      const name = await addFriendOnline(code);
      pendingDeepLink = null;
      clearDeepLinkFromUrl();
      showPendingBanner("");
      els.friendMsg.className = "form-msg ok";
      els.friendMsg.textContent = `Added ${name}! You’re connected.`;
      renderFriends();
      toast(`Added ${name} — go beat them`);
      setTab("scores");
    } catch (err) {
      showPendingBanner("");
      els.friendMsg.className = "form-msg err";
      els.friendMsg.textContent = err.message || "Could not add friend";
      toast(err.message || "Could not add friend");
      // keep pending if offline-ish; clear if permanent fail
      if (!/online|network|fetch/i.test(err.message || "")) {
        pendingDeepLink = null;
        clearDeepLinkFromUrl();
      }
    }
    return;
  }

  if (type === "group") {
    showPendingBanner(`Joining group ${code.toUpperCase()}…`);
    setTab("groups");
    if (!online) {
      showPendingBanner("Connecting… then we’ll join the group.");
      return;
    }
    try {
      const name = await joinGroupOnline(code);
      pendingDeepLink = null;
      clearDeepLinkFromUrl();
      showPendingBanner("");
      els.groupMsg.className = "form-msg ok";
      els.groupMsg.textContent = `Joined ${name}!`;
      renderGroups();
      toast(`Joined ${name}`);
      setTab("scores");
    } catch (err) {
      showPendingBanner("");
      els.groupMsg.className = "form-msg err";
      els.groupMsg.textContent = err.message || "Could not join group";
      toast(err.message || "Could not join group");
      if (!/online|network|fetch/i.test(err.message || "")) {
        pendingDeepLink = null;
        clearDeepLinkFromUrl();
      }
    }
  }
}

// ——— Friends (online + offline) ———

function friendCodeDisplay() {
  if (online && profile?.friend_code) return profile.friend_code;
  return offlineFriendCode();
}

function listFriendsForUi() {
  if (online && friendsCache.length) {
    return friendsCache.map((f) => ({
      id: f.id,
      name: f.display_name,
      highScore: f.high_score,
      challengeBest: f.challenge_best,
      lifetimeCount: f.lifetime_count,
    }));
  }
  return state.friends;
}

async function refreshSocial() {
  if (!sb || !session?.user || !online) {
    renderFriends();
    renderGroups();
    return;
  }
  await Promise.all([loadFriends(), loadGroups()]);
  renderFriends();
  renderGroups();
  renderFriendsBoard();
  renderGroupBoards();
}

async function loadFriends() {
  const uid = session.user.id;
  const { data: links, error } = await sb.from("jp_friendships").select("friend_id").eq("user_id", uid);
  if (error) throw error;
  const ids = (links || []).map((l) => l.friend_id);
  if (!ids.length) {
    friendsCache = [];
    return;
  }
  const { data: people, error: e2 } = await sb
    .from("jp_profiles")
    .select("id, display_name, high_score, challenge_best, lifetime_count, friend_code")
    .in("id", ids);
  if (e2) throw e2;
  friendsCache = people || [];
}

async function addFriendOnline(codeRaw) {
  const code = codeRaw.trim().toUpperCase();
  if (code.startsWith("JP1.")) {
    throw new Error("Use their short online code (6 characters), not the offline blob");
  }
  if (code.length < 4) throw new Error("Enter a friend code");

  const { data: other, error } = await sb.rpc("jp_add_friend_by_code", { p_code: code });
  if (error) {
    const msg = error.message || "Could not add friend";
    if (/own code/i.test(msg)) throw new Error("That's your own code");
    if (/No player/i.test(msg)) throw new Error("No player with that code");
    throw new Error(msg);
  }
  await loadFriends();
  return other?.display_name || "Friend";
}

function addFriendOffline(code) {
  const friend = decodeOfflineFriendCode(code);
  if (friend.id === state.localId) throw new Error("That's your own code");
  const existing = state.friends.findIndex((f) => f.id === friend.id);
  if (existing >= 0) {
    state.friends[existing] = { ...state.friends[existing], ...friend };
    saveState();
    return "updated";
  }
  state.friends.push({ ...friend, addedAt: Date.now() });
  saveState();
  return "added";
}

async function removeFriend(id) {
  if (online && sb && session?.user) {
    const { error } = await sb.rpc("jp_remove_friend", { p_friend_id: id });
    if (error) console.warn(error);
    await loadFriends();
  } else {
    state.friends = state.friends.filter((f) => f.id !== id);
    saveState();
  }
  renderFriends();
  renderFriendsBoard();
  toast("Friend removed");
}

function renderFriends() {
  els.myFriendCode.textContent = friendCodeDisplay();
  const list = listFriendsForUi();
  els.friendCount.textContent = String(list.length);

  if (!list.length) {
    els.friendsList.innerHTML = "";
    els.friendsEmpty.hidden = false;
  } else {
    els.friendsEmpty.hidden = true;
    const sorted = [...list].sort((a, b) => b.highScore - a.highScore);
    els.friendsList.innerHTML = sorted
      .map(
        (f) => `
      <li data-id="${f.id}">
        <div class="avatar" style="width:36px;height:36px;font-size:0.8rem">${initials(f.name)}</div>
        <div class="person-info">
          <div class="name">${levelBadgeHtml(f.lifetimeCount, true)} ${escapeHtml(f.name)}</div>
          <div class="meta">10s best ${formatNum(f.challengeBest || 0)} · life ${formatNum(f.lifetimeCount || 0)} XP</div>
        </div>
        <div class="friend-actions">
          ${
            featureChatEnabled()
              ? `<button type="button" class="solid-btn" data-msg-friend="${f.id}" data-name="${escapeHtml(f.name)}" style="padding:6px 10px;font-size:0.72rem" title="Message">Msg</button>`
              : ""
          }
          <button type="button" class="icon-btn" data-remove-friend="${f.id}" title="Remove">✕</button>
        </div>
      </li>`
      )
      .join("");
  }
  renderFriendsBoard();
}

function renderFriendsBoard() {
  const metric = state.boardMetric === "challenge" ? "challengeBest" : "highScore";
  const entries = [
    {
      id: myId(),
      name: state.name || "You",
      highScore: state.highScore,
      challengeBest: state.challengeBest,
      lifetimeCount: state.lifetimeCount,
      you: true,
    },
    ...listFriendsForUi().map((f) => ({ ...f, you: false })),
  ].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));

  if (entries.length <= 1 && !listFriendsForUi().length) {
    els.friendsBoard.innerHTML = "";
    els.friendsBoardEmpty.hidden = false;
    return;
  }
  els.friendsBoardEmpty.hidden = true;
  els.friendsBoard.innerHTML = entries
    .map((e, i) => {
      const score = metric === "challengeBest" ? e.challengeBest : e.highScore;
      const life = e.lifetimeCount || 0;
      return `
      <li class="board-row ${rankPlaceClass(i)}">
        ${rankEmblemHtml(i)}
        <div class="person-info">
          <div class="name">${levelBadgeHtml(life, true)} ${escapeHtml(e.name)}${e.you ? '<span class="you-tag">You</span>' : ""}</div>
        </div>
        ${scoreEmblemHtml(score, life)}
      </li>`;
    })
    .join("");
}

// ——— Groups ———

function listGroupsForUi() {
  if (online && groupsCache.length) return groupsCache;
  return state.groups.map((g) => ({
    id: g.id,
    name: g.name,
    invite_code: g.code || g.invite_code,
    members: g.members || [],
  }));
}

async function loadGroups() {
  const uid = session.user.id;
  const { data: memberships, error } = await sb.from("jp_group_members").select("group_id").eq("user_id", uid);
  if (error) throw error;
  const gids = (memberships || []).map((m) => m.group_id);
  if (!gids.length) {
    groupsCache = [];
    return;
  }
  const { data: groups, error: e2 } = await sb.from("jp_groups").select("id, name, invite_code, created_by").in("id", gids);
  if (e2) throw e2;

  const { data: members, error: e3 } = await sb
    .from("jp_group_members")
    .select("group_id, user_id")
    .in("group_id", gids);
  if (e3) throw e3;

  const userIds = [...new Set((members || []).map((m) => m.user_id))];
  const { data: profiles, error: e4 } = await sb
    .from("jp_profiles")
    .select("id, display_name, high_score, challenge_best, lifetime_count")
    .in("id", userIds);
  if (e4) throw e4;
  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  groupsCache = (groups || []).map((g) => ({
    id: g.id,
    name: g.name,
    invite_code: g.invite_code,
    members: (members || [])
      .filter((m) => m.group_id === g.id)
      .map((m) => {
        const p = byId[m.user_id];
        return {
          id: m.user_id,
          name: p?.display_name || "Player",
          highScore: p?.high_score || 0,
          challengeBest: p?.challenge_best || 0,
          lifetimeCount: p?.lifetime_count || 0,
        };
      }),
  }));
}

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createGroupOnline(name) {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) throw new Error("Enter a group name");
  const invite = randomInviteCode();
  const { data: group, error } = await sb
    .from("jp_groups")
    .insert({ name: trimmed, invite_code: invite, created_by: session.user.id })
    .select("*")
    .single();
  if (error) throw error;
  const { error: e2 } = await sb.from("jp_group_members").insert({ group_id: group.id, user_id: session.user.id });
  if (e2) throw e2;
  await loadGroups();
  return group;
}

async function joinGroupOnline(codeRaw) {
  const code = codeRaw.trim().toUpperCase();
  if (code.startsWith("JPG1.")) throw new Error("Use the short online invite code, not an offline blob");
  const { data: group, error } = await sb.from("jp_groups").select("*").eq("invite_code", code).maybeSingle();
  if (error) throw error;
  if (!group) throw new Error("No group with that code");
  const { error: e2 } = await sb
    .from("jp_group_members")
    .upsert({ group_id: group.id, user_id: session.user.id }, { onConflict: "group_id,user_id" });
  if (e2) throw e2;
  await loadGroups();
  return group.name;
}

function createGroupOffline(name) {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) throw new Error("Enter a group name");
  const group = {
    id: crypto.randomUUID(),
    name: trimmed,
    members: [
      {
        id: state.localId,
        name: state.name || "Player",
        highScore: state.highScore,
        challengeBest: state.challengeBest,
      },
    ],
    createdAt: Date.now(),
  };
  group.code = offlineGroupCode(group);
  state.groups.push(group);
  saveState();
  return group;
}

function joinGroupOffline(code) {
  const decoded = decodeOfflineGroupCode(code);
  const me = {
    id: state.localId,
    name: state.name || "Player",
    highScore: state.highScore,
    challengeBest: state.challengeBest,
  };
  const idx = state.groups.findIndex((g) => g.id === decoded.id);
  if (idx >= 0) {
    const byId = new Map();
    for (const m of [...state.groups[idx].members, ...decoded.members, me]) {
      const prev = byId.get(m.id);
      if (!prev || m.highScore >= prev.highScore) byId.set(m.id, m);
    }
    byId.set(state.localId, me);
    state.groups[idx] = {
      ...state.groups[idx],
      name: decoded.name,
      members: [...byId.values()],
    };
    state.groups[idx].code = offlineGroupCode(state.groups[idx]);
    saveState();
    return "updated";
  }
  const members = decoded.members.filter((m) => m.id !== state.localId);
  members.unshift(me);
  const group = { id: decoded.id, name: decoded.name, members, createdAt: Date.now() };
  group.code = offlineGroupCode(group);
  state.groups.push(group);
  saveState();
  return "joined";
}

async function leaveGroup(id) {
  if (online && sb && session?.user) {
    await sb.from("jp_group_members").delete().eq("group_id", id).eq("user_id", session.user.id);
    await loadGroups();
  } else {
    state.groups = state.groups.filter((g) => g.id !== id);
    saveState();
  }
  renderGroups();
  renderGroupBoards();
  toast("Left group");
}

function renderGroups() {
  const list = listGroupsForUi();
  els.groupCount.textContent = String(list.length);
  if (!list.length) {
    els.groupsList.innerHTML = "";
    els.groupsEmpty.hidden = false;
  } else {
    els.groupsEmpty.hidden = true;
    els.groupsList.innerHTML = list
      .map((g) => {
        const members = [...(g.members || [])].sort((a, b) => b.highScore - a.highScore);
        const board = members
          .slice(0, 5)
          .map(
            (m) =>
              `<li><span>${levelBadgeHtml(m.lifetimeCount, true)} ${escapeHtml(m.name)}${m.id === myId() ? " (you)" : ""}</span><strong>${formatNum(m.highScore)}</strong></li>`
          )
          .join("");
        const code = g.invite_code || g.code || "";
        return `
        <li>
          <div class="group-block">
            <div class="group-header">
              <div class="person-info">
                <div class="name">${escapeHtml(g.name)}</div>
                <div class="meta">${members.length} member${members.length === 1 ? "" : "s"} · ${escapeHtml(code)}</div>
              </div>
              <div class="group-actions">
                <button type="button" class="solid-btn" data-share-group="${g.id}" data-code="${escapeHtml(code)}" data-name="${escapeHtml(g.name)}" style="padding:8px 12px;font-size:0.8rem">Share</button>
                <button type="button" class="ghost-btn tiny" data-copy-group="${g.id}" data-code="${escapeHtml(code)}">Code</button>
                <button type="button" class="icon-btn" data-leave-group="${g.id}" title="Leave">✕</button>
              </div>
            </div>
            <ul class="mini-leaderboard">${board}</ul>
          </div>
        </li>`;
      })
      .join("");
  }
  renderGroupBoards();
}

function renderGroupBoards() {
  const list = listGroupsForUi();
  if (!list.length) {
    els.groupBoards.innerHTML = "";
    els.groupBoardsEmpty.hidden = false;
    return;
  }
  els.groupBoardsEmpty.hidden = true;
  const metric = state.boardMetric === "challenge" ? "challengeBest" : "highScore";
  els.groupBoards.innerHTML = list
    .map((g) => {
      const members = [...(g.members || [])].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
      const rows = members
        .map((m, i) => {
          const score = metric === "challengeBest" ? m.challengeBest : m.highScore;
          const life = m.lifetimeCount || 0;
          return `
          <li class="board-row ${rankPlaceClass(i)}">
            ${rankEmblemHtml(i)}
            <div class="person-info">
              <div class="name">${levelBadgeHtml(life, true)} ${escapeHtml(m.name)}${m.id === myId() ? '<span class="you-tag">You</span>' : ""}</div>
            </div>
            ${scoreEmblemHtml(score, life)}
          </li>`;
        })
        .join("");
      return `
        <div style="margin-bottom:16px">
          <h3 style="margin:0 0 10px;font-size:0.9rem;color:var(--muted)">${escapeHtml(g.name)}</h3>
          <ol class="leaderboard">${rows}</ol>
        </div>`;
    })
    .join("");
}

function globalBoardRow(e, score, i) {
  const you = e.id === myId();
  const name = e.display_name || e.name || "Player";
  const life = e.lifetime_count ?? e.lifetimeCount ?? 0;
  return `
      <li class="board-row ${rankPlaceClass(i)}">
        ${rankEmblemHtml(i)}
        <div class="person-info">
          <div class="name">${levelBadgeHtml(life, true)} ${escapeHtml(name)}${you ? '<span class="you-tag">You</span>' : ""}</div>
        </div>
        ${scoreEmblemHtml(score, life)}
      </li>`;
}

async function loadGlobalBoard() {
  if (!sb || !online) {
    globalBoard = [];
    globalLifetimeBoard = [];
    renderGlobalBoard();
    return;
  }

  const [challengeRes, lifetimeRes] = await Promise.all([
    sb
      .from("jp_profiles")
      .select("id, display_name, challenge_best, high_score, lifetime_count")
      .gt("challenge_best", 0)
      .order("challenge_best", { ascending: false })
      .limit(25),
    sb
      .from("jp_profiles")
      .select("id, display_name, challenge_best, high_score, lifetime_count")
      .gt("lifetime_count", 0)
      .order("lifetime_count", { ascending: false })
      .limit(25),
  ]);

  if (challengeRes.error) console.warn(challengeRes.error);
  else globalBoard = challengeRes.data || [];

  if (lifetimeRes.error) console.warn(lifetimeRes.error);
  else globalLifetimeBoard = lifetimeRes.data || [];

  renderGlobalBoard();
}

function renderGlobalBoard() {
  // All-time pushes
  if (!els.globalLifetimeBoard) {
    /* older cached HTML */
  } else if (!globalLifetimeBoard.length) {
    els.globalLifetimeBoard.innerHTML = "";
    if (els.globalLifetimeEmpty) {
      els.globalLifetimeEmpty.hidden = false;
      els.globalLifetimeEmpty.textContent = online
        ? "No all-time scores yet — start pushing!"
        : "Go online to see the world board.";
    }
  } else {
    if (els.globalLifetimeEmpty) els.globalLifetimeEmpty.hidden = true;
    els.globalLifetimeBoard.innerHTML = globalLifetimeBoard
      .map((e, i) => globalBoardRow(e, e.lifetime_count, i))
      .join("");
  }

  // Best 10s
  if (!globalBoard.length) {
    els.globalBoard.innerHTML = "";
    els.globalBoardEmpty.hidden = false;
    els.globalBoardEmpty.textContent = online
      ? "No 10s scores yet — be the first!"
      : "Go online to see the world board.";
  } else {
    els.globalBoardEmpty.hidden = true;
    els.globalBoard.innerHTML = globalBoard
      .map((e, i) => globalBoardRow(e, e.challenge_best, i))
      .join("");
  }
}

// ——— Chat (community board + friend DMs) ———

function formatChatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function setChatMode(mode) {
  chatMode = mode === "dm" ? "dm" : "board";
  $$("[data-chat-mode]").forEach((b) => {
    const on = b.dataset.chatMode === chatMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (els.chatBoardView) els.chatBoardView.hidden = chatMode !== "board";
  if (els.chatDmView) els.chatDmView.hidden = chatMode !== "dm";
  if (chatMode === "board") {
    renderBoardFeed();
    if (online) loadBoardPosts();
  } else {
    if (activeDmFriend) showDmThread(activeDmFriend);
    else {
      if (els.dmThreadView) els.dmThreadView.hidden = true;
      if (els.dmFriendPicker) els.dmFriendPicker.hidden = false;
      renderDmFriendList();
    }
  }
  updateChatOnlineHint();
}

function updateChatOnlineHint() {
  if (els.chatOfflineHint) els.chatOfflineHint.hidden = online;
}

async function loadBoardPosts() {
  if (!sb || !online) {
    boardPosts = [];
    renderBoardFeed();
    return;
  }
  const { data, error } = await sb
    .from("jp_board_posts")
    .select("id, body, created_at, user_id, jp_profiles(display_name, lifetime_count)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("board load", error);
    if (els.boardMsg) {
      els.boardMsg.className = "form-msg err";
      els.boardMsg.textContent =
        /relation|does not exist|schema cache/i.test(error.message || "")
          ? "Board not set up yet — run the chat migration in Supabase."
          : error.message || "Could not load board";
    }
    return;
  }
  if (els.boardMsg) {
    els.boardMsg.textContent = "";
    els.boardMsg.className = "form-msg";
  }
  boardPosts = data || [];
  renderBoardFeed();
}

function renderBoardFeed() {
  if (!els.boardFeed) return;
  if (!boardPosts.length) {
    els.boardFeed.innerHTML = "";
    if (els.boardEmpty) {
      els.boardEmpty.hidden = false;
      els.boardEmpty.textContent = online ? "No posts yet — be first." : "Go online to use the community board.";
    }
    return;
  }
  if (els.boardEmpty) els.boardEmpty.hidden = true;
  els.boardFeed.innerHTML = boardPosts
    .map((p) => {
      const prof = p.jp_profiles || {};
      const name = prof.display_name || "Player";
      const life = prof.lifetime_count || 0;
      const mine = p.user_id === myId();
      return `
      <li class="${mine ? "mine" : ""}" data-post-id="${p.id}">
        <div class="chat-meta">
          ${levelBadgeHtml(life, true)}
          <span class="chat-author">${escapeHtml(name)}${mine ? " (you)" : ""}</span>
          <span>${formatChatTime(p.created_at)}</span>
        </div>
        <p class="chat-body">${escapeHtml(p.body)}</p>
        ${
          mine
            ? `<div class="chat-actions"><button type="button" class="ghost-btn tiny" data-delete-board="${p.id}">Delete</button></div>`
            : ""
        }
      </li>`;
    })
    .join("");
}

async function postToBoard(raw) {
  if (!sb || !online || !session?.user) throw new Error("Go online to post");
  const body = String(raw || "").trim().slice(0, 280);
  if (!body) throw new Error("Write something first");
  if (Date.now() - lastBoardPostAt < 3000) throw new Error("Slow down — wait a few seconds");
  const { error } = await sb.from("jp_board_posts").insert({
    user_id: session.user.id,
    body,
  });
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message || "")) {
      throw new Error("Board not set up yet — run the chat migration in Supabase.");
    }
    throw new Error(error.message || "Post failed");
  }
  lastBoardPostAt = Date.now();
  await loadBoardPosts();
}

async function deleteBoardPost(id) {
  if (!sb || !online) return;
  const { error } = await sb.from("jp_board_posts").delete().eq("id", id);
  if (error) {
    toast(error.message || "Could not delete");
    return;
  }
  boardPosts = boardPosts.filter((p) => p.id !== id);
  renderBoardFeed();
  toast("Post deleted");
}

function renderDmFriendList() {
  if (!els.dmFriendList) return;
  const list = listFriendsForUi();
  if (!list.length) {
    els.dmFriendList.innerHTML = "";
    if (els.dmFriendsEmpty) els.dmFriendsEmpty.hidden = false;
    return;
  }
  if (els.dmFriendsEmpty) els.dmFriendsEmpty.hidden = true;
  els.dmFriendList.innerHTML = list
    .map(
      (f) => `
    <li data-id="${f.id}">
      <div class="avatar" style="width:36px;height:36px;font-size:0.8rem">${initials(f.name)}</div>
      <div class="person-info">
        <div class="name">${levelBadgeHtml(f.lifetimeCount, true)} ${escapeHtml(f.name)}</div>
        <div class="meta">Tap to message</div>
      </div>
      <button type="button" class="solid-btn" data-open-dm="${f.id}" data-name="${escapeHtml(f.name)}" style="padding:8px 12px;font-size:0.78rem">Message</button>
    </li>`
    )
    .join("");
}

function openDmWithFriend(friend) {
  if (!friend?.id) return;
  activeDmFriend = {
    id: friend.id,
    name: friend.name || friend.display_name || "Friend",
    lifetimeCount: friend.lifetimeCount || friend.lifetime_count || 0,
  };
  setChatMode("dm");
  showDmThread(activeDmFriend);
  setTab("chat");
}

function showDmThread(friend) {
  activeDmFriend = friend;
  if (els.dmFriendPicker) els.dmFriendPicker.hidden = true;
  if (els.dmThreadView) els.dmThreadView.hidden = false;
  if (els.dmThreadTitle) els.dmThreadTitle.textContent = friend.name || "Friend";
  renderDmFeed();
  if (online) loadDmThread(friend.id);
}

function closeDmThread() {
  activeDmFriend = null;
  dmMessages = [];
  if (els.dmThreadView) els.dmThreadView.hidden = true;
  if (els.dmFriendPicker) els.dmFriendPicker.hidden = false;
  renderDmFriendList();
}

async function loadDmThread(friendId) {
  if (!sb || !online || !session?.user || !friendId) {
    dmMessages = [];
    renderDmFeed();
    return;
  }
  const me = session.user.id;
  const { data, error } = await sb
    .from("jp_friend_messages")
    .select("id, body, created_at, sender_id, recipient_id")
    .or(
      `and(sender_id.eq.${me},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${me})`
    )
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.warn("dm load", error);
    if (els.dmMsg) {
      els.dmMsg.className = "form-msg err";
      els.dmMsg.textContent =
        /relation|does not exist|schema cache/i.test(error.message || "")
          ? "DMs not set up yet — run the chat migration in Supabase."
          : error.message || "Could not load messages";
    }
    return;
  }
  if (els.dmMsg) {
    els.dmMsg.textContent = "";
    els.dmMsg.className = "form-msg";
  }
  dmMessages = data || [];
  renderDmFeed();
  // mark received as read
  const unread = dmMessages.filter((m) => m.recipient_id === me && !m.read_at).map((m) => m.id);
  if (unread.length) {
    await sb
      .from("jp_friend_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread)
      .eq("recipient_id", me);
  }
}

function renderDmFeed() {
  if (!els.dmFeed) return;
  if (!dmMessages.length) {
    els.dmFeed.innerHTML = "";
    if (els.dmEmpty) {
      els.dmEmpty.hidden = false;
      els.dmEmpty.textContent = online ? "No messages yet — say hi." : "Go online to message friends.";
    }
    return;
  }
  if (els.dmEmpty) els.dmEmpty.hidden = true;
  const me = myId();
  els.dmFeed.innerHTML = dmMessages
    .map((m) => {
      const mine = m.sender_id === me;
      return `
      <li class="${mine ? "mine" : "them"}">
        <div class="chat-meta">
          <span class="chat-author">${mine ? "You" : escapeHtml(activeDmFriend?.name || "Friend")}</span>
          <span>${formatChatTime(m.created_at)}</span>
        </div>
        <p class="chat-body">${escapeHtml(m.body)}</p>
      </li>`;
    })
    .join("");
  // scroll to latest
  requestAnimationFrame(() => {
    els.dmFeed.scrollTop = els.dmFeed.scrollHeight;
  });
}

async function sendDm(raw) {
  if (!sb || !online || !session?.user) throw new Error("Go online to send messages");
  if (!activeDmFriend?.id) throw new Error("Pick a friend first");
  const body = String(raw || "").trim().slice(0, 500);
  if (!body) throw new Error("Write something first");
  if (Date.now() - lastDmSendAt < 1500) throw new Error("Slow down — wait a moment");
  const { error } = await sb.from("jp_friend_messages").insert({
    sender_id: session.user.id,
    recipient_id: activeDmFriend.id,
    body,
  });
  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message || "")) {
      throw new Error("DMs not set up yet — run the chat migration in Supabase.");
    }
    if (/check|policy|friends/i.test(error.message || "")) {
      throw new Error("You can only message friends. Add them first.");
    }
    throw new Error(error.message || "Send failed");
  }
  lastDmSendAt = Date.now();
  await loadDmThread(activeDmFriend.id);
}

// ——— Tabs ———

function setTab(tab) {
  els.app.dataset.tab = tab;
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("active", on);
    t.setAttribute("aria-current", on ? "page" : "false");
  });
  $$(".panel").forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
  if (tab === "friends") renderFriends();
  if (tab === "groups") renderGroups();
  if (tab === "scores") {
    renderScores();
    renderFriendsBoard();
    renderGroupBoards();
    renderGlobalBoard();
    if (online) loadGlobalBoard().then(() => refreshSocial());
  }
  if (tab === "chat") {
    if (!featureChatEnabled()) {
      setTab("play");
      return;
    }
    updateChatOnlineHint();
    setChatMode(chatMode);
  }
  if (tab === "style") renderSwatches();
}

// ——— Events ———

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

  $$(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  const press = () => els.pushBtn.classList.add("pressed");
  const release = () => els.pushBtn.classList.remove("pressed");

  els.pushBtn.addEventListener("pointerdown", (e) => {
    if (els.pushBtn.disabled) return;
    e.preventDefault();
    press();
    push();
  });
  els.pushBtn.addEventListener("pointerup", release);
  els.pushBtn.addEventListener("pointerleave", release);
  els.pushBtn.addEventListener("pointercancel", release);
  els.pushBtn.addEventListener("click", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || els.nameModal.open) return;
      e.preventDefault();
      if (!e.repeat && !els.pushBtn.disabled) {
        press();
        push();
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.key === " ") release();
  });

  els.resetSession.addEventListener("click", resetSession);
  els.challengeAgain.addEventListener("click", resetChallengeIdle);

  els.profileBtn.addEventListener("click", () => {
    // Editing display name — go straight to name panel
    showNamePanel();
    els.nameInput.value = state.name || "";
    els.nameModal.showModal();
    setTimeout(() => {
      els.nameInput.focus();
      els.nameInput.select();
    }, 50);
  });

  els.nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.nameInput.value.trim().slice(0, 16);
    if (!name) return;
    state.name = name;
    saveState();
    renderProfile();
    scheduleMetaSync();
    els.nameModal.close();
    toast(`Hey, ${name}!`);
  });

  els.nameShowRegister?.addEventListener("click", () => showNamePanel());
  els.nameLoginBack?.addEventListener("click", () => showNameLoginPanel());
  els.nameLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setNameLoginMsg("");
    try {
      await loginFromNameModal();
    } catch (err) {
      setNameLoginMsg(err.message || "Could not log in", "err");
      toast(err.message || "Login failed");
    }
  });

  els.copyFriendCode.addEventListener("click", async () => {
    const code = friendCodeDisplay();
    els.myFriendCode.textContent = code;
    const ok = await copyText(code);
    toast(ok ? "Friend code copied" : "Could not copy");
  });

  els.shareFriendLink?.addEventListener("click", () => shareFriendInvite());
  els.copyFriendLink?.addEventListener("click", async () => {
    if (!online || !profile?.friend_code) {
      toast("Go online first for a phone-ready link");
      return;
    }
    const url = friendInviteUrl(profile.friend_code);
    const ok = await copyText(url);
    toast(ok ? "Invite link copied" : "Could not copy");
  });

  els.addFriendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.friendMsg.className = "form-msg";
    const raw = extractCodeFromInput(els.friendCodeInput.value, "friend");
    try {
      if (online && !raw.startsWith("JP1.")) {
        const name = await addFriendOnline(raw);
        els.friendCodeInput.value = "";
        els.friendMsg.textContent = `Added ${name}!`;
        els.friendMsg.classList.add("ok");
        renderFriends();
        toast("Friend added");
      } else if (raw.startsWith("JP1.")) {
        const result = addFriendOffline(raw);
        els.friendCodeInput.value = "";
        els.friendMsg.textContent = result === "updated" ? "Friend score updated!" : "Friend added (offline)!";
        els.friendMsg.classList.add("ok");
        renderFriends();
        toast(result === "updated" ? "Friend updated" : "Friend added");
      } else if (!online) {
        throw new Error("Need to be online to add friends by code/link");
      } else {
        const name = await addFriendOnline(raw);
        els.friendCodeInput.value = "";
        els.friendMsg.textContent = `Added ${name}!`;
        els.friendMsg.classList.add("ok");
        renderFriends();
        toast("Friend added");
      }
    } catch (err) {
      els.friendMsg.textContent = err.message || "Invalid code";
      els.friendMsg.classList.add("err");
    }
  });

  els.friendsList.addEventListener("click", (e) => {
    const msgBtn = e.target.closest("[data-msg-friend]");
    if (msgBtn) {
      const f = listFriendsForUi().find((x) => x.id === msgBtn.dataset.msgFriend);
      openDmWithFriend(
        f || {
          id: msgBtn.dataset.msgFriend,
          name: msgBtn.dataset.name || "Friend",
        }
      );
      return;
    }
    const btn = e.target.closest("[data-remove-friend]");
    if (!btn) return;
    removeFriend(btn.dataset.removeFriend);
  });

  // Chat mode toggle
  $$("[data-chat-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setChatMode(btn.dataset.chatMode));
  });

  els.boardPostInput?.addEventListener("input", () => {
    if (els.boardCharCount) {
      els.boardCharCount.textContent = `${els.boardPostInput.value.length}/280`;
    }
  });
  els.dmInput?.addEventListener("input", () => {
    if (els.dmCharCount) {
      els.dmCharCount.textContent = `${els.dmInput.value.length}/500`;
    }
  });

  els.boardPostForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!els.boardMsg) return;
    els.boardMsg.className = "form-msg";
    try {
      await postToBoard(els.boardPostInput.value);
      els.boardPostInput.value = "";
      if (els.boardCharCount) els.boardCharCount.textContent = "0/280";
      els.boardMsg.textContent = "Posted!";
      els.boardMsg.classList.add("ok");
      toast("Posted to community board");
    } catch (err) {
      els.boardMsg.textContent = err.message || "Could not post";
      els.boardMsg.classList.add("err");
    }
  });

  els.boardFeed?.addEventListener("click", (e) => {
    const del = e.target.closest("[data-delete-board]");
    if (del) deleteBoardPost(del.dataset.deleteBoard);
  });

  els.refreshBoard?.addEventListener("click", async () => {
    await loadBoardPosts();
    toast("Board refreshed");
  });

  els.dmFriendList?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-dm]");
    if (!btn) return;
    const f = listFriendsForUi().find((x) => x.id === btn.dataset.openDm);
    openDmWithFriend(
      f || {
        id: btn.dataset.openDm,
        name: btn.dataset.name || "Friend",
      }
    );
  });

  els.dmBack?.addEventListener("click", () => closeDmThread());

  els.refreshDm?.addEventListener("click", async () => {
    if (activeDmFriend) {
      await loadDmThread(activeDmFriend.id);
      toast("Messages refreshed");
    }
  });

  els.dmForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!els.dmMsg) return;
    els.dmMsg.className = "form-msg";
    try {
      await sendDm(els.dmInput.value);
      els.dmInput.value = "";
      if (els.dmCharCount) els.dmCharCount.textContent = "0/500";
      els.dmMsg.textContent = "";
    } catch (err) {
      els.dmMsg.textContent = err.message || "Could not send";
      els.dmMsg.classList.add("err");
    }
  });

  els.createGroupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.groupMsg.className = "form-msg";
    try {
      if (online) {
        const group = await createGroupOnline(els.groupNameInput.value);
        els.groupNameInput.value = "";
        els.groupMsg.textContent = `Created “${group.name}”. Share the link with your crew.`;
        els.groupMsg.classList.add("ok");
        renderGroups();
        await shareGroupInvite(group.invite_code, group.name);
      } else {
        const group = createGroupOffline(els.groupNameInput.value);
        els.groupNameInput.value = "";
        els.groupMsg.textContent = `Created “${group.name}” (offline).`;
        els.groupMsg.classList.add("ok");
        await copyText(group.code);
        renderGroups();
        toast("Group created — offline code copied");
      }
    } catch (err) {
      els.groupMsg.className = "form-msg err";
      els.groupMsg.textContent = err.message || "Could not create group";
    }
  });

  els.joinGroupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.groupMsg.className = "form-msg";
    const raw = extractCodeFromInput(els.groupCodeInput.value, "group");
    try {
      if (online && !raw.startsWith("JPG1.")) {
        const name = await joinGroupOnline(raw);
        els.groupCodeInput.value = "";
        els.groupMsg.textContent = `Joined ${name}!`;
        els.groupMsg.classList.add("ok");
        renderGroups();
        toast("Joined group");
      } else if (raw.startsWith("JPG1.")) {
        const result = joinGroupOffline(raw);
        els.groupCodeInput.value = "";
        els.groupMsg.textContent = result === "updated" ? "Group refreshed." : "Joined group (offline)!";
        els.groupMsg.classList.add("ok");
        renderGroups();
        toast(result === "updated" ? "Group updated" : "Joined group");
      } else {
        throw new Error("Invalid group code");
      }
    } catch (err) {
      els.groupMsg.textContent = err.message || "Invalid group code";
      els.groupMsg.classList.add("err");
    }
  });

  els.groupsList.addEventListener("click", async (e) => {
    const shareBtn = e.target.closest("[data-share-group]");
    if (shareBtn) {
      await shareGroupInvite(shareBtn.dataset.code, shareBtn.dataset.name);
      return;
    }
    const copyBtn = e.target.closest("[data-copy-group]");
    if (copyBtn) {
      const code = copyBtn.dataset.code;
      const link = groupInviteUrl(code);
      const ok = await copyText(link);
      toast(ok ? "Group link copied" : "Could not copy");
      return;
    }
    const leaveBtn = e.target.closest("[data-leave-group]");
    if (leaveBtn) leaveGroup(leaveBtn.dataset.leaveGroup);
  });

  els.buttonSwatches.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-btn]");
    if (!sw) return;
    state.theme.button = sw.dataset.btn;
    saveState();
    applyTheme();
    renderSwatches();
    scheduleSync();
  });

  els.bgSwatches.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-bg]");
    if (!sw) return;
    state.theme.background = sw.dataset.bg;
    saveState();
    applyTheme();
    renderSwatches();
    scheduleSync();
  });

  $$("[data-board-metric]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.boardMetric = btn.dataset.boardMetric;
      saveState();
      $$("[data-board-metric]").forEach((b) => b.classList.toggle("active", b === btn));
      renderFriendsBoard();
      renderGroupBoards();
    });
  });

  els.refreshGlobal.addEventListener("click", async () => {
    await loadGlobalBoard();
    await refreshSocial();
    toast("Boards refreshed");
  });

  els.githubBtn.addEventListener("click", signInWithGithub);
  els.githubBtnStyle.addEventListener("click", signInWithGithub);
  els.signOutBtn.addEventListener("click", signOut);
  els.levelUpDismiss?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideLevelUpPopup();
  });
  // Clicking the dim backdrop area is non-interactive (pointer-events: none on popup).
  // Card itself doesn't close on accidental mis-tap of content — only × or timeout.
  els.deleteAccountBtn?.addEventListener("click", () => openDeleteModal());

  els.adminDebugBtn?.addEventListener("click", async () => {
    try {
      await adminRunDebug();
    } catch (err) {
      setAdminMsg(err.message || "Debug failed", "err");
    }
  });
  els.adminHygieneBtn?.addEventListener("click", async () => {
    try {
      await adminRunHygiene();
    } catch (err) {
      setAdminMsg(err.message || "Cleanup failed", "err");
    }
  });
  els.adminDupesBtn?.addEventListener("click", async () => {
    try {
      await adminListDupes();
    } catch (err) {
      setAdminMsg(err.message || "Dupe list failed", "err");
    }
  });
  els.adminResetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await adminSendPasswordReset(els.adminResetEmail?.value);
    } catch (err) {
      setAdminMsg(err.message || "Reset failed", "err");
    }
  });
  els.deleteCancelBtn?.addEventListener("click", () => closeDeleteModal());
  els.deleteFinalBtn?.addEventListener("click", () => executeDeleteAccount());
  els.deleteConfirmInput?.addEventListener("input", () => updateDeleteFinalEnabled());
  els.deleteUnderstand?.addEventListener("change", () => updateDeleteFinalEnabled());
  els.deleteModal?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDeleteModal();
  });

  els.emailAuthForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setEmailAuthMsg("");
    try {
      await linkEmailToCurrentAccount();
    } catch (err) {
      setEmailAuthMsg(err.message || "Could not save email account", "err");
      toast(err.message || "Email save failed");
    }
  });
  els.emailSigninBtn?.addEventListener("click", async () => {
    setEmailAuthMsg("");
    try {
      await signInWithEmailPassword();
    } catch (err) {
      setEmailAuthMsg(err.message || "Could not sign in", "err");
      toast(err.message || "Sign-in failed");
    }
  });

  els.changePasswordToggle?.addEventListener("click", () => {
    openChangePasswordForm();
  });
  els.changePasswordCancel?.addEventListener("click", () => {
    resetChangePasswordForm();
  });
  els.changePasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setChangePasswordMsg("");
    try {
      await changePassword();
    } catch (err) {
      setChangePasswordMsg(err.message || "Could not update password", "err");
      toast(err.message || "Password update failed");
    }
  });

  els.ageConfirm?.addEventListener("change", () => {
    if (els.ageContinue) els.ageContinue.disabled = !els.ageConfirm.checked;
  });
  els.ageForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!els.ageConfirm?.checked) return;
    try {
      localStorage.setItem(AGE_KEY, "1");
    } catch {
      /* ignore */
    }
    els.ageModal?.close();
    ensureName();
  });
}

// ——— Boot ———

async function init() {
  pendingDeepLink = parseDeepLink();
  applyFeatureFlags();
  applyTheme();
  renderProfile();
  renderScores();
  renderFriends();
  renderGroups();
  renderSwatches();
  renderGlobalBoard();
  setMode(state.mode === "challenge" ? "challenge" : "free");
  bindEvents();
  const bootTab =
    pendingDeepLink?.type === "group"
      ? "groups"
      : pendingDeepLink?.type === "friend"
        ? "friends"
        : pendingDeepLink?.type === "tab"
          ? pendingDeepLink.tab
          : "play";
  setTab(bootTab);
  setOnlineUi();
  if (pendingDeepLink?.type === "friend") {
    showPendingBanner(`Invite detected — adding ${pendingDeepLink.code.toUpperCase()} when online…`);
  } else if (pendingDeepLink?.type === "group") {
    showPendingBanner(`Group invite detected — joining ${pendingDeepLink.code.toUpperCase()} when online…`);
  } else if (pendingDeepLink?.type === "tab") {
    // one-shot navigation from store / marketing links
    clearDeepLinkFromUrl();
    pendingDeepLink = null;
  }
  ensureAgeThenName();
  // timer ring geometry
  els.timerProgress.style.strokeDasharray = String(CIRCUMFERENCE);
  els.timerProgress.style.strokeDashoffset = "0";
  await initBackend();
  if (pendingDeepLink && online) await processPendingDeepLink();
}

init();
