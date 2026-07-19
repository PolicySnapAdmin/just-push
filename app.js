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

/** Bump when local 10s best must re-sync from server (stops glitch scores like 106). */
const CHALLENGE_AUTH_VERSION = 3;

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
    challengeAuthVersion: CHALLENGE_AUTH_VERSION,
    /** Auto-open focus lock for 10s challenges */
    focusLockDefault: false,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("just-push-v1");
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const merged = {
      ...base,
      ...parsed,
      theme: { ...base.theme, ...parsed.theme },
      localId: parsed.localId || parsed.id || base.localId,
    };
    // One-shot: drop untrusted local 10s best so a glitch (e.g. 106) can't stick in UI/cache.
    // Server value is re-applied in ensureProfile within a second when online.
    const authV = Number(parsed.challengeAuthVersion) || 0;
    if (authV < CHALLENGE_AUTH_VERSION) {
      merged.challengeBest = 0;
      merged.challengeAuthVersion = CHALLENGE_AUTH_VERSION;
    }
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    state.challengeAuthVersion = CHALLENGE_AUTH_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

/** Authoritative 10s best: server profile when online, else local. */
function effectiveChallengeBest() {
  if (online && profile && typeof profile.challenge_best === "number") {
    return Math.max(0, profile.challenge_best || 0);
  }
  return Math.max(0, Number(state.challengeBest) || 0);
}

function applyChallengeBestFromServer(value, { save = true } = {}) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const prev = state.challengeBest;
  state.challengeBest = v;
  if (profile) profile.challenge_best = v;
  state.challengeAuthVersion = CHALLENGE_AUTH_VERSION;
  if (save) saveState();
  return prev !== v;
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
  challengeAgain: $("#challenge-again"),
  newRecord: $("#new-record"),
  challengeResult: $("#challenge-result"),
  timerRing: $("#timer-ring"),
  timerProgress: $("#timer-progress"),
  focusLockOpen: $("#focus-lock-open"),
  focusLockModal: $("#focus-lock-modal"),
  focusLockClose: $("#focus-lock-close"),
  focusLockTitle: $("#focus-lock-title"),
  focusLockSub: $("#focus-lock-sub"),
  focusLockStatsFree: $("#focus-lock-stats-free"),
  focusLockStatsChallenge: $("#focus-lock-stats-challenge"),
  focusSession: $("#focus-session"),
  focusHigh: $("#focus-high"),
  focusLife: $("#focus-life"),
  focusChallengeCount: $("#focus-challenge-count"),
  focusChallengeTimer: $("#focus-challenge-timer"),
  focusChallengeBest: $("#focus-challenge-best"),
  focusTimerRing: $("#focus-timer-ring"),
  focusTimerProgress: $("#focus-timer-progress"),
  focusPushBtn: $("#focus-push-btn"),
  focusPushLabel: $("#focus-push-label"),
  focusPushHint: $("#focus-push-hint"),
  focusFloaters: $("#focus-floaters"),
  focusLockResult: $("#focus-lock-result"),
  focusChallengeAgain: $("#focus-challenge-again"),
  focusResetSession: $("#focus-reset-session"),
  focusLockPref: $("#focus-lock-pref"),
  resetSessionSettings: $("#reset-session-settings"),
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
  adminActions: $("#admin-actions"),
  adminDebugBtn: $("#admin-debug-btn"),
  adminHygieneBtn: $("#admin-hygiene-btn"),
  adminDupesBtn: $("#admin-dupes-btn"),
  adminSecurityBtn: $("#admin-security-btn"),
  adminOpenPvpBtn: $("#admin-open-pvp-btn"),
  adminExpirePvpBtn: $("#admin-expire-pvp-btn"),
  adminResetForm: $("#admin-reset-form"),
  adminResetEmail: $("#admin-reset-email"),
  adminLookupForm: $("#admin-lookup-form"),
  adminLookupCode: $("#admin-lookup-code"),
  adminChallengeForm: $("#admin-challenge-form"),
  adminChallengeCode: $("#admin-challenge-code"),
  adminChallengeValue: $("#admin-challenge-value"),
  adminOutWrap: $("#admin-out-wrap"),
  adminOutLabel: $("#admin-out-label"),
  adminOut: $("#admin-out"),
  adminOutClear: $("#admin-out-clear"),
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
  // Territories
  territoryBanner: $("#territory-banner"),
  territoryBannerName: $("#territory-banner-name"),
  territoryBannerMeta: $("#territory-banner-meta"),
  territoryBannerExit: $("#territory-banner-exit"),
  territoryMap: $("#territory-map"),
  territoryRefresh: $("#territory-refresh"),
  territoryDetail: $("#territory-detail"),
  territoryDetailTitle: $("#territory-detail-title"),
  territoryDetailPill: $("#territory-detail-pill"),
  territoryDetailBlurb: $("#territory-detail-blurb"),
  territoryMyLife: $("#territory-my-life"),
  territoryMy10s: $("#territory-my-10s"),
  territoryPlayFree: $("#territory-play-free"),
  territoryPlay10s: $("#territory-play-10s"),
  territoryBoardLife: $("#territory-board-life"),
  territoryBoardLifeEmpty: $("#territory-board-life-empty"),
  territoryBoard10s: $("#territory-board-10s"),
  territoryBoard10sEmpty: $("#territory-board-10s-empty"),
  territoryPickHint: $("#territory-pick-hint"),
  // PVP
  pvpRefresh: $("#pvp-refresh"),
  pvpWins: $("#pvp-wins"),
  pvpLosses: $("#pvp-losses"),
  pvpDraws: $("#pvp-draws"),
  pvpKd: $("#pvp-kd"),
  pvpQuotaText: $("#pvp-quota-text"),
  pvpQuotaFill: $("#pvp-quota-fill"),
  pvpQuotaHint: $("#pvp-quota-hint"),
  pvpDurationSelect: $("#pvp-duration-select"),
  pvpChallengeBtn: $("#pvp-challenge-btn"),
  pvpMsg: $("#pvp-msg"),
  pvpMatchList: $("#pvp-match-list"),
  pvpMatchEmpty: $("#pvp-match-empty"),
  pvpRankings: $("#pvp-rankings"),
  pvpRankingsEmpty: $("#pvp-rankings-empty"),
  pvpModal: $("#pvp-modal"),
  pvpModalTitle: $("#pvp-modal-title"),
  pvpModalClose: $("#pvp-modal-close"),
  pvpModalVs: $("#pvp-modal-vs"),
  pvpModalStatus: $("#pvp-modal-status"),
  pvpArenaTimer: $("#pvp-arena-timer"),
  pvpArenaScore: $("#pvp-arena-score"),
  pvpPushBtn: $("#pvp-push-btn"),
  pvpPushHint: $("#pvp-push-hint"),
  pvpReadyBtn: $("#pvp-ready-btn"),
  pvpAcceptBtn: $("#pvp-accept-btn"),
  pvpDeclineBtn: $("#pvp-decline-btn"),
  pvpCancelBtn: $("#pvp-cancel-btn"),
  pvpModalMsg: $("#pvp-modal-msg"),
  socialFriendsView: $("#social-friends-view"),
  socialGroupsView: $("#social-groups-view"),
  socialPvpView: $("#social-pvp-view"),
  friendRequestsRefresh: $("#friend-requests-refresh"),
  friendRequestsIncoming: $("#friend-requests-incoming"),
  friendRequestsIncomingEmpty: $("#friend-requests-incoming-empty"),
  friendRequestsOutgoing: $("#friend-requests-outgoing"),
  friendRequestsOutgoingEmpty: $("#friend-requests-outgoing-empty"),
  pvpCodeForm: $("#pvp-code-form"),
  pvpCodeInput: $("#pvp-code-input"),
  pvpFriendsQuick: $("#pvp-friends-quick"),
  pvpFriendsQuickEmpty: $("#pvp-friends-quick-empty"),
};

// Deep-link invite waiting to process after online
let pendingDeepLink = null; // { type: 'friend'|'group', code: string }

// ——— Territories (make-believe map side game) ———
const TERRITORIES = [
  {
    id: "frostpeak",
    name: "Frost Peak",
    blurb: "Icy highlands. Overall clicks dig in; 10s storms the summit.",
  },
  {
    id: "ironwood",
    name: "Ironwood",
    blurb: "Dense forest stronghold. Slow pressure wins the trees.",
  },
  {
    id: "sunbay",
    name: "Sun Bay",
    blurb: "Bright coastal docks. Speed runs rule the pier.",
  },
  {
    id: "mistvale",
    name: "Mistvale",
    blurb: "Foggy lowlands. Stack overall to claim the valley.",
  },
  {
    id: "dustmarch",
    name: "Dust March",
    blurb: "Open badlands. Central crossroads — always contested.",
  },
  {
    id: "embercoast",
    name: "Ember Coast",
    blurb: "Volcanic shore. Fast fingers conquer the lava edge.",
  },
  {
    id: "crystalmere",
    name: "Crystal Mere",
    blurb: "Glassy lakes. Quiet grind builds lasting hold.",
  },
  {
    id: "shadowfen",
    name: "Shadow Fen",
    blurb: "Dark wetlands. Hardest to hold — top 10s shines.",
  },
];

const TERRITORY_BY_ID = Object.fromEntries(TERRITORIES.map((t) => [t.id, t]));

/** Selected on map (detail panel). */
let selectedTerritoryId = null;
/** Active campaign while pushing on Play tab. */
let activeTerritoryId = null;
/** { [territoryId]: { lifetime_count, challenge_best } } */
let myTerritoryScores = {};
/** Map overview kings: { [id]: { life_king, challenge_king } } */
let territoryOverview = {};
let territoryLifeBoard = [];
let territoryChalBoard = [];
let territoryPushTimer = null;
let pendingTerritoryPushes = 0;

// PVP duel state
let pvpStats = { wins: 0, losses: 0, draws: 0, matches_played: 0, kd: 0 };
let pvpQuota = {
  base_limit: 10,
  sent: 0,
  wins_bonus: 0,
  allowed: 10,
  remaining: 10,
};
let pvpInbox = [];
let pvpRankings = [];
let pvpActiveMatch = null; // match object currently in modal
let pvpLocalScore = 0;
let pvpPhase = "idle"; // idle | countdown | running | done | wait
let pvpRaf = 0;
let pvpPollTimer = null;
let pvpSubmitted = false;

/** Social hub sub-tab: friends | groups | pvp */
let socialMode = "friends";
let friendRequestsIncoming = [];
let friendRequestsOutgoing = [];

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
let adminBusy = false;

function setAdminMsg(text, kind = "") {
  if (!els.adminMsg) return;
  els.adminMsg.textContent = text || "";
  els.adminMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function setAdminBusy(busy) {
  adminBusy = !!busy;
  const btns = [
    els.adminDebugBtn,
    els.adminDupesBtn,
    els.adminHygieneBtn,
    els.adminResetForm?.querySelector("button[type='submit']"),
  ];
  for (const b of btns) {
    if (b) b.disabled = adminBusy;
  }
}

function setAdminOut(obj, label = "Result") {
  if (!els.adminOut) return;
  if (obj == null || obj === "") {
    if (els.adminOutWrap) els.adminOutWrap.hidden = true;
    els.adminOut.textContent = "";
    return;
  }
  if (els.adminOutLabel) els.adminOutLabel.textContent = label;
  if (els.adminOutWrap) els.adminOutWrap.hidden = false;
  els.adminOut.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function formatAdminError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return parts.join(" — ") || String(error);
}

function formatDupeList(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return "No duplicate display names found.\nBoard names are unique.";
  }
  const byName = new Map();
  for (const r of rows) {
    const name = r.display_name || "(blank)";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(r);
  }
  const lines = [`${byName.size} name group(s), ${rows.length} row(s):\n`];
  for (const [name, list] of byName) {
    lines.push(`• ${name}  (×${list.length})`);
    for (const r of list) {
      const kind = r.account_type || (r.email ? "email" : r.is_anonymous ? "anon" : "guest");
      const code = r.friend_code || "——";
      const life = r.lifetime_count ?? 0;
      const high = r.high_score ?? 0;
      const c10 = r.challenge_best ?? 0;
      const mail = r.email ? `  ${r.email}` : "";
      lines.push(
        `    [${kind}] ${code}  life=${life}  high=${high}  10s=${c10}${mail}`
      );
    }
    lines.push("");
  }
  lines.push("Tip: Clean up clones removes anon extras. Email accounts stay.");
  return lines.join("\n");
}

function formatDebugStats(data) {
  if (!data || typeof data !== "object") return String(data);
  const dupes = Array.isArray(data.duplicate_names) ? data.duplicate_names : [];
  const top = Array.isArray(data.top_players) ? data.top_players : [];
  const lines = [
    `Profiles: ${data.profiles ?? "?"}   Auth users: ${data.auth_users ?? "?"}`,
    `Email: ${data.email_users ?? "?"}   Anon/guest: ${data.anon_users ?? "?"}`,
    `Empty “Player” guests: ${data.empty_players ?? "?"}`,
    `Friendships: ${data.friendships ?? "?"}   Groups: ${data.groups ?? "?"}`,
    "",
  ];
  if (dupes.length) {
    lines.push("Duplicate names:");
    for (const d of dupes) lines.push(`  • ${d.name} ×${d.count}`);
  } else {
    lines.push("Duplicate names: none ✓");
  }
  lines.push("", "Top by lifetime:");
  for (const t of top) {
    lines.push(
      `  ${t.name} (${t.code})  life=${t.life}  high=${t.high}  10s=${t.best10s}`
    );
  }
  if (data.ran_at) lines.push("", `As of ${data.ran_at}`);
  return lines.join("\n");
}

function formatHygieneResult(data) {
  if (!data || typeof data !== "object") return String(data);
  const empty = data.empty_guests_deleted ?? 0;
  const clones = data.anon_clones_deleted ?? 0;
  const shadows = data.anon_shadows_deleted ?? 0;
  const groups = data.anon_group_extras_deleted ?? 0;
  const total = empty + clones + shadows + groups;
  return [
    `Cleanup finished${total ? "" : " — nothing to remove"}`,
    "",
    `Empty guests deleted:     ${empty}`,
    `Anon name clones:         ${clones}`,
    `Anon shadows of email:    ${shadows}`,
    `Extra pure-anon names:    ${groups}`,
    `Total removed:            ${total}`,
    data.ran_at ? `\nRan at ${data.ran_at}` : "",
  ].join("\n");
}

async function refreshAdminAccess() {
  isAdminUser = false;
  if (els.adminCard) els.adminCard.hidden = true;
  if (!sb || !session?.user || !online) return;

  // Fast path: known admin email (UI only — RPCs still enforce server-side)
  const email = String(session.user.email || "").toLowerCase();
  if (email === "conor.wolanski@gmail.com" || session.user.id === "fea2c8ba-8a2e-4a2b-bed3-c15c40f9d38a") {
    isAdminUser = true;
    if (els.adminCard) els.adminCard.hidden = false;
  }

  try {
    const { data, error } = await sb.rpc("jp_is_admin");
    if (error) {
      // Keep fast-path card visible; surface the check error so buttons aren't silent
      if (isAdminUser) {
        setAdminMsg(`Admin tools ready (server check: ${formatAdminError(error)})`, "");
      } else {
        setAdminMsg(`Admin check: ${formatAdminError(error)}`, "err");
      }
      console.warn("jp_is_admin", error);
      return;
    }
    isAdminUser = !!data;
    if (els.adminCard) els.adminCard.hidden = !isAdminUser;
    if (isAdminUser) setAdminMsg("Admin tools ready — scan first, then clean up if needed.", "ok");
  } catch (e) {
    console.warn("admin check", e);
    if (isAdminUser) {
      setAdminMsg("Admin tools ready (offline check failed — try a button).", "");
    } else {
      setAdminMsg(e.message || "Admin check failed", "err");
    }
  }
}

async function adminRunDebug() {
  if (!sb || !online) throw new Error("Go online first (Settings → Account must be connected)");
  if (!isAdminUser) throw new Error("Admin only — sign in as your admin account");
  setAdminMsg("Loading stats…");
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_debug_stats");
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(formatDebugStats(data), "Debug stats");
  setAdminMsg("Debug stats loaded.", "ok");
  toast("Debug stats loaded");
}

async function adminRunHygiene() {
  if (!sb || !online) throw new Error("Go online first (Settings → Account must be connected)");
  if (!isAdminUser) throw new Error("Admin only — sign in as your admin account");
  const ok = window.confirm(
    "Run cleanup?\n\n• Empty guest “Player” accounts (0 scores, 30m+)\n• Anonymous clones of the same display name\n• Anon shadows of email accounts (Billy, Cleetis, etc.)\n\nEmail accounts are NEVER deleted."
  );
  if (!ok) {
    setAdminMsg("Cleanup cancelled.", "");
    return;
  }
  setAdminMsg("Running cleanup…");
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_run_hygiene");
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(formatHygieneResult(data), "Cleanup result");
  const empty = data?.empty_guests_deleted ?? 0;
  const clones = data?.anon_clones_deleted ?? 0;
  const shadows = data?.anon_shadows_deleted ?? 0;
  const groups = data?.anon_group_extras_deleted ?? 0;
  const total = empty + clones + shadows + groups;
  setAdminMsg(
    total
      ? `Cleanup done — removed ${total} (empty ${empty}, clones ${clones}, shadows ${shadows}, groups ${groups}).`
      : "Cleanup done — no clones or empty guests to remove.",
    "ok"
  );
  toast(total ? `Cleanup: ${total} removed` : "Already clean");
  loadGlobalBoard().catch(() => {});
}

async function adminListDupes() {
  if (!sb || !online) throw new Error("Go online first (Settings → Account must be connected)");
  if (!isAdminUser) throw new Error("Admin only — sign in as your admin account");
  setAdminMsg("Scanning for duplicate names…");
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_list_name_dupes");
  if (error) throw new Error(formatAdminError(error));
  const rows = Array.isArray(data) ? data : [];
  setAdminOut(formatDupeList(rows), "Duplicate names");
  setAdminMsg(
    rows.length
      ? `Found ${rows.length} row(s) in duplicate-name groups. Use Clean up clones to remove anons.`
      : "No duplicate display names — board is clean.",
    "ok"
  );
  toast(rows.length ? `${rows.length} dupe row(s)` : "No dupes");
}

async function adminSendPasswordReset(email) {
  if (!sb || !online) throw new Error("Go online first");
  setAdminMsg("");
  const addr = String(email || "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) throw new Error("Enter a valid email");
  if (!isAdminUser) throw new Error("Admin only");
  const base = String(getConfig().publicBaseUrl || appBaseUrl()).replace(/\/?$/, "/");
  const { error } = await sb.auth.resetPasswordForEmail(addr, {
    redirectTo: `${base}?tab=style`,
  });
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(`Password reset requested for:\n${addr}\n\nThey should check inbox (and spam).`, "Password reset");
  setAdminMsg(`Password reset email requested for ${addr}.`, "ok");
  toast("Reset email requested");
}

function formatSecuritySnapshot(data) {
  if (!data || typeof data !== "object") return String(data);
  const g = data.guards || {};
  return [
    "=== Security snapshot ===",
    `Profiles: ${data.profiles ?? "?"}   Email: ${data.email_users ?? "?"}   Anon: ${data.anon_users ?? "?"}`,
    `Empty guests: ${data.empty_players ?? "?"}   Dupe name groups: ${data.duplicate_name_groups ?? "?"}`,
    `Friendships: ${data.friendships ?? "?"}   Groups: ${data.groups ?? "?"}`,
    `Pending friend requests: ${data.pending_friend_requests ?? "?"}`,
    `Open PvP: ${data.open_pvp_matches ?? "?"}   Stale (>30m): ${data.stale_pvp_30m ?? "?"}`,
    `Territory rows: ${data.territory_rows ?? "?"}`,
    `Max 10s on board: ${data.challenge_max ?? "?"}   Max lifetime: ${data.lifetime_max ?? "?"}`,
    "",
    `Score guard trigger: ${g.score_update_trigger ? "OK" : "MISSING"}`,
    `Territory guard trigger: ${g.territory_guard_trigger ? "OK" : "MISSING"}`,
    data.ran_at ? `\nAs of ${data.ran_at}` : "",
  ].join("\n");
}

function formatPlayerLookup(data) {
  if (!data?.found) return `No player with code ${data?.code || "—"}.`;
  const pvp = data.pvp_stats || {};
  return [
    `=== ${data.display_name} (${data.friend_code}) ===`,
    `id: ${data.id}`,
    `email: ${data.email || "(none)"}   anon: ${data.is_anonymous ? "yes" : "no"}`,
    `high: ${data.high_score}   10s: ${data.challenge_best}   life: ${data.lifetime_count}`,
    `sessions: ${data.sessions_played}   friends: ${data.friends}`,
    `friend req in/out: ${data.pending_in}/${data.pending_out}   open pvp: ${data.open_pvp}`,
    pvp.matches != null
      ? `pvp W-L-D: ${pvp.wins}-${pvp.losses}-${pvp.draws} (${pvp.matches} matches)`
      : "pvp: no matches yet",
    data.created_at ? `joined: ${data.created_at}` : "",
  ].join("\n");
}

async function adminSecuritySnapshot() {
  if (!sb || !online) throw new Error("Go online first");
  if (!isAdminUser) throw new Error("Admin only");
  setAdminMsg("Loading security snapshot…");
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_security_snapshot");
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(formatSecuritySnapshot(data), "Security snapshot");
  setAdminMsg("Security snapshot loaded.", "ok");
  toast("Security snapshot");
}

async function adminListOpenPvp() {
  if (!sb || !online) throw new Error("Go online first");
  if (!isAdminUser) throw new Error("Admin only");
  setAdminMsg("Loading open PvP…");
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_list_open_pvp");
  if (error) throw new Error(formatAdminError(error));
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    setAdminOut("No open PvP matches.", "Open PvP");
    setAdminMsg("No open duels.", "ok");
    return;
  }
  const lines = rows.map((m, i) => {
    return `${i + 1}. [${m.status}] ${m.duration_sec}s  ${m.challenger_name}(${m.challenger_code}) vs ${m.opponent_name}(${m.opponent_code})\n   ${m.id}\n   created ${m.created_at}`;
  });
  setAdminOut(lines.join("\n\n"), "Open PvP");
  setAdminMsg(`${rows.length} open match(es).`, "ok");
}

async function adminExpireStalePvp() {
  if (!sb || !online) throw new Error("Go online first");
  if (!isAdminUser) throw new Error("Admin only");
  const ok = window.confirm("Expire open PvP duels older than 30 minutes?");
  if (!ok) {
    setAdminMsg("Cancelled.", "");
    return;
  }
  setAdminMsg("Expiring stale PvP…");
  const { data, error } = await sb.rpc("jp_admin_expire_stale_pvp", { p_minutes: 30 });
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(JSON.stringify(data, null, 2), "Expire stale PvP");
  setAdminMsg(`Expired ${data?.expired ?? 0} match(es).`, "ok");
  toast(`Expired ${data?.expired ?? 0} PvP`);
}

async function adminLookupCode(codeRaw) {
  if (!sb || !online) throw new Error("Go online first");
  if (!isAdminUser) throw new Error("Admin only");
  const code = extractFriendCode(codeRaw);
  if (!code) throw new Error("Enter a friend code");
  setAdminMsg(`Looking up ${code}…`);
  setAdminOut(null);
  const { data, error } = await sb.rpc("jp_admin_lookup_code", { p_code: code });
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(formatPlayerLookup(data), "Player lookup");
  setAdminMsg(data?.found ? `Found ${data.display_name}.` : "Not found.", data?.found ? "ok" : "err");
}

async function adminSetChallengeBest(codeRaw, value) {
  if (!sb || !online) throw new Error("Go online first");
  if (!isAdminUser) throw new Error("Admin only");
  const code = extractFriendCode(codeRaw);
  const v = Math.floor(Number(value));
  if (!code) throw new Error("Enter a friend code");
  if (!Number.isFinite(v) || v < 0) throw new Error("Enter a valid 10s value");
  const ok = window.confirm(`Set ${code} challenge_best to ${v}?\n\nThis overrides their 10s best on the server.`);
  if (!ok) {
    setAdminMsg("Override cancelled.", "");
    return;
  }
  setAdminMsg("Updating 10s best…");
  const { data, error } = await sb.rpc("jp_admin_set_challenge_best", {
    p_code: code,
    p_value: v,
  });
  if (error) throw new Error(formatAdminError(error));
  setAdminOut(
    `${data.name} (${data.code})\n10s was ${data.challenge_best_was} → now ${data.challenge_best_now}`,
    "10s override"
  );
  setAdminMsg(`Set ${data.code} 10s to ${data.challenge_best_now}.`, "ok");
  toast(`10s set to ${data.challenge_best_now}`);
  loadGlobalBoard().catch(() => {});
}

async function runAdminAction(action) {
  if (adminBusy) return;
  setAdminBusy(true);
  try {
    if (action === "debug") await adminRunDebug();
    else if (action === "dupes") await adminListDupes();
    else if (action === "cleanup") await adminRunHygiene();
    else if (action === "security") await adminSecuritySnapshot();
    else if (action === "openpvp") await adminListOpenPvp();
    else if (action === "expirepvp") await adminExpireStalePvp();
    else throw new Error(`Unknown admin action: ${action}`);
  } catch (err) {
    const msg = formatAdminError(err);
    setAdminMsg(msg, "err");
    setAdminOut(msg, "Error");
    console.warn("admin action", action, err);
  } finally {
    setAdminBusy(false);
  }
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
  const cBest = effectiveChallengeBest();
  // Keep state aligned with what we show (prevents 106 lingering mid-session)
  if (online && profile && state.challengeBest !== cBest) {
    state.challengeBest = cBest;
    saveState();
  }
  els.sessionCount.textContent = formatNum(state.sessionCount);
  els.highScore.textContent = formatNum(state.highScore);
  els.lifetimeCount.textContent = formatNum(state.lifetimeCount);
  els.challengeCount.textContent = formatNum(challenge.count);
  els.challengeBest.textContent = formatNum(cBest);
  els.rankHigh.textContent = formatNum(state.highScore);
  els.rankChallenge.textContent = formatNum(cBest);
  els.rankLife.textContent = formatNum(state.lifetimeCount);
  els.rankSessions.textContent = formatNum(state.sessionsPlayed);
  // Focus lock mirrors
  if (els.focusSession) els.focusSession.textContent = formatNum(state.sessionCount);
  if (els.focusHigh) els.focusHigh.textContent = formatNum(state.highScore);
  if (els.focusLife) els.focusLife.textContent = formatNum(state.lifetimeCount);
  if (els.focusChallengeCount) els.focusChallengeCount.textContent = formatNum(challenge.count);
  if (els.focusChallengeBest) els.focusChallengeBest.textContent = formatNum(cBest);
  renderLevel();
  syncFocusLockChrome();
}

function spawnFloater() {
  const host = isFocusLockOpen() && els.focusFloaters ? els.focusFloaters : els.floaters;
  if (!host) return;
  const el = document.createElement("span");
  el.className = "floater";
  el.textContent = "+1";
  el.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
  host.appendChild(el);
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
  els.challengeAgain.hidden = mode !== "challenge" || challenge.status !== "done";
  els.challengeResult.hidden = true;
  if (els.focusChallengeAgain) {
    els.focusChallengeAgain.hidden = mode !== "challenge" || challenge.status !== "done";
  }
  if (els.focusResetSession) els.focusResetSession.hidden = mode !== "free";
  updatePushChrome();
  if (mode === "challenge") {
    challenge.status = "idle";
    challenge.count = 0;
    els.timerRing.hidden = false;
    if (els.focusTimerRing) els.focusTimerRing.hidden = false;
    setTimerVisual(1);
    els.challengeTimer.textContent = "10.0";
    if (els.focusChallengeTimer) els.focusChallengeTimer.textContent = "10.0";
    renderScores();
  } else {
    els.timerRing.hidden = true;
    if (els.focusTimerRing) els.focusTimerRing.hidden = true;
    cancelAnimationFrame(challenge.raf);
  }
  syncFocusLockChrome();
}

function updatePushChrome() {
  const apply = (labelEl, hintEl, btn) => {
    if (!btn) return;
    if (state.mode === "free") {
      if (labelEl) labelEl.textContent = "PUSH";
      if (hintEl) hintEl.textContent = "tap zone";
      btn.classList.remove("waiting", "locked");
      btn.disabled = false;
      return;
    }
    if (challenge.status === "idle") {
      if (labelEl) labelEl.textContent = "START";
      if (hintEl) hintEl.textContent = "10 second run";
      btn.classList.add("waiting");
      btn.classList.remove("locked");
      btn.disabled = false;
    } else if (challenge.status === "running") {
      if (labelEl) labelEl.textContent = "PUSH";
      if (hintEl) hintEl.textContent = "go go go";
      btn.classList.remove("waiting", "locked");
      btn.disabled = false;
    } else {
      if (labelEl) labelEl.textContent = "DONE";
      if (hintEl) hintEl.textContent = `${challenge.count} pushes`;
      btn.classList.add("locked");
      btn.classList.remove("waiting");
      btn.disabled = true;
    }
  };
  apply(els.pushLabel, els.pushHint, els.pushBtn);
  apply(els.focusPushLabel, els.focusPushHint, els.focusPushBtn);
  if (state.mode === "free" && els.pushHint) els.pushHint.textContent = "or spacebar";
}

function setTimerVisual(fraction) {
  // fraction 1 = full time, 0 = empty
  const f = Math.max(0, Math.min(1, fraction));
  const offset = String(CIRCUMFERENCE * (1 - f));
  const dash = String(CIRCUMFERENCE);
  if (els.timerProgress) {
    els.timerProgress.style.strokeDasharray = dash;
    els.timerProgress.style.strokeDashoffset = offset;
  }
  if (els.focusTimerProgress) {
    els.focusTimerProgress.style.strokeDasharray = dash;
    els.focusTimerProgress.style.strokeDashoffset = offset;
  }
}

function startChallenge() {
  challenge.status = "running";
  challenge.count = 0;
  challenge.startedAt = performance.now();
  challenge.endsAt = challenge.startedAt + CHALLENGE_MS;
  els.challengeResult.hidden = true;
  els.challengeAgain.hidden = true;
  if (els.focusChallengeAgain) els.focusChallengeAgain.hidden = true;
  if (els.focusLockResult) {
    els.focusLockResult.hidden = true;
    els.focusLockResult.textContent = "";
  }
  els.newRecord.hidden = true;
  updatePushChrome();
  renderScores();
  // PvP-style fixed arena for max taps when preference is on
  if (state.focusLockDefault && !isFocusLockOpen()) {
    openFocusLock();
  }
  tickChallenge();
}

function tickChallenge() {
  const now = performance.now();
  const left = Math.max(0, challenge.endsAt - now);
  const secs = (left / 1000).toFixed(1);
  els.challengeTimer.textContent = secs;
  if (els.focusChallengeTimer) els.focusChallengeTimer.textContent = secs;
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

  // Compare against server-backed best when online (never use stale local 106 as the bar)
  const priorBest = effectiveChallengeBest();
  let isRecord = false;
  if (challenge.count > priorBest) {
    state.challengeBest = challenge.count;
    isRecord = true;
  } else {
    state.challengeBest = priorBest;
  }
  state.sessionsPlayed += 1;
  saveState();
  renderScores();
  // Server: challenge best + session bump (scores cannot be set via plain REST)
  reportChallengeToServer(challenge.count)
    .then(() => {
      // Re-clamp from server response (greatest on server; local never re-inflates)
      renderScores();
    })
    .catch((e) => console.warn("challenge sync", e));

  if (activeTerritoryId) {
    const cur = myTerritoryScore(activeTerritoryId);
    if (challenge.count > cur.challenge_best) {
      myTerritoryScores[activeTerritoryId] = {
        lifetime_count: cur.lifetime_count,
        challenge_best: challenge.count,
      };
    }
    updateTerritoryBanner();
    reportTerritoryChallenge(activeTerritoryId, challenge.count).catch((e) =>
      console.warn("territory challenge", e)
    );
  }

  els.challengeResult.hidden = false;
  const terrName = activeTerritoryId ? territoryName(activeTerritoryId) : "";
  const resultText = isRecord
    ? `${challenge.count} pushes — new personal best!${terrName ? ` (${terrName})` : ""}`
    : `${challenge.count} pushes${terrName ? ` · ${terrName}` : ""}`;
  els.challengeResult.textContent = resultText;
  els.challengeAgain.hidden = false;
  if (els.focusLockResult) {
    els.focusLockResult.hidden = false;
    els.focusLockResult.textContent = resultText;
  }
  if (els.focusChallengeAgain) els.focusChallengeAgain.hidden = false;
  if (els.focusChallengeTimer) els.focusChallengeTimer.textContent = "0.0";
  if (isRecord) showNewRecord(terrName ? `New 10s · ${terrName}!` : "New 10s best!");
  else confettiBurst();
}

function resetChallengeIdle() {
  challenge.status = "idle";
  challenge.count = 0;
  els.challengeResult.hidden = true;
  els.challengeAgain.hidden = true;
  if (els.focusChallengeAgain) els.focusChallengeAgain.hidden = true;
  if (els.focusLockResult) {
    els.focusLockResult.hidden = true;
    els.focusLockResult.textContent = "";
  }
  els.challengeTimer.textContent = "10.0";
  if (els.focusChallengeTimer) els.focusChallengeTimer.textContent = "10.0";
  setTimerVisual(1);
  updatePushChrome();
  renderScores();
}

// ——— Focus lock (fixed-screen push, PvP-style) ———

let focusLockScrollY = 0;

function isFocusLockOpen() {
  return !!(els.focusLockModal?.open);
}

function openFocusLock() {
  if (!els.focusLockModal) return;
  if (els.focusLockModal.open) {
    syncFocusLockChrome();
    return;
  }
  focusLockScrollY = window.scrollY || 0;
  document.body.classList.add("focus-lock-open");
  document.body.style.top = `-${focusLockScrollY}px`;
  els.focusLockModal.showModal();
  syncFocusLockChrome();
  renderScores();
}

function closeFocusLock() {
  if (!els.focusLockModal?.open) return;
  els.focusLockModal.close();
  document.body.classList.remove("focus-lock-open");
  document.body.style.top = "";
  window.scrollTo(0, focusLockScrollY || 0);
}

function syncFocusLockChrome() {
  if (!els.focusLockModal) return;
  const free = state.mode !== "challenge";
  if (els.focusLockStatsFree) els.focusLockStatsFree.hidden = !free;
  if (els.focusLockStatsChallenge) els.focusLockStatsChallenge.hidden = free;
  if (els.focusTimerRing) els.focusTimerRing.hidden = free;
  if (els.focusResetSession) els.focusResetSession.hidden = !free;
  if (els.focusChallengeAgain) {
    els.focusChallengeAgain.hidden = free || challenge.status !== "done";
  }
  if (els.focusLockTitle) {
    els.focusLockTitle.textContent = free ? "Focus lock · Unlimited" : "Focus lock · 10s";
  }
  if (els.focusLockSub) {
    els.focusLockSub.textContent = free
      ? "Screen locked — mash freely"
      : challenge.status === "running"
        ? "Go! Page scroll is locked"
        : challenge.status === "done"
          ? "Run finished"
          : "Tap START — page won’t scroll";
  }
  updatePushChrome();
}

function syncFocusLockPrefUi() {
  if (els.focusLockPref) els.focusLockPref.checked = !!state.focusLockDefault;
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
    // 10s challenge only awards territory on run end (not per-tap)
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
  if (activeTerritoryId) {
    bumpLocalTerritoryLife(activeTerritoryId, 1);
  }
  saveState();
  schedulePushRpc(state.sessionCount);
  if (activeTerritoryId) scheduleTerritoryPushRpc(activeTerritoryId, 1);
  scheduleMetaSync();
  renderScores();
  updateTerritoryBanner();
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
    await refreshTerritoriesUi().catch(() => {});
    await refreshPvpUi().catch(() => {});
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
        await refreshTerritoriesUi().catch(() => {});
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

  // Free-run / lifetime: keep max(local, server) so offline grind isn't lost.
  // 10s best: server is ALWAYS authoritative (never Math.max with local).
  const localAhead =
    state.lifetimeCount > (data.lifetime_count || 0) ||
    state.highScore > (data.high_score || 0);
  const localChallengeWas = state.challengeBest;

  state.highScore = Math.max(state.highScore, data.high_score || 0);
  state.lifetimeCount = Math.max(state.lifetimeCount, data.lifetime_count || 0);
  state.sessionsPlayed = Math.max(state.sessionsPlayed, data.sessions_played || 0);
  applyChallengeBestFromServer(data.challenge_best || 0, { save: false });

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

  if (localChallengeWas > state.challengeBest && localChallengeWas > 0) {
    console.info(
      `10s best synced from server: local ${localChallengeWas} → server ${state.challengeBest}`
    );
  }

  // Name/theme only via table update; scores only via RPCs
  await pushProfileMeta();
  if (localAhead) {
    await reconcileLocalScoresToServer();
  }
  const refreshed = await sb.from("jp_profiles").select("*").eq("id", uid).single();
  if (refreshed.data) {
    profile = refreshed.data;
    state.highScore = Math.max(state.highScore, profile.high_score || 0);
    state.lifetimeCount = Math.max(state.lifetimeCount, profile.lifetime_count || 0);
    state.sessionsPlayed = Math.max(state.sessionsPlayed, profile.sessions_played || 0);
    applyChallengeBestFromServer(profile.challenge_best || 0);
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
  // Never lower local mid-play if server is briefly behind a pending free-push batch
  state.highScore = Math.max(state.highScore, row.high_score || 0);
  state.lifetimeCount = Math.max(state.lifetimeCount, row.lifetime_count || 0);
  state.sessionsPlayed = Math.max(state.sessionsPlayed, row.sessions_played || 0);
  // 10s best follows server only (never Math.max with inflated localStorage)
  if (typeof row.challenge_best === "number") {
    applyChallengeBestFromServer(row.challenge_best, { save: false });
  }
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
  // Do NOT re-upload challenge_best from localStorage — only endChallenge() reports 10s runs.
  // That prevents glitch/local inflated bests from overwriting admin or legitimate server values.
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
  if (tab === "groups") {
    // Groups live under Social now
    return { type: "tab", tab: "friends", social: "groups" };
  }
  if (tab === "pvp") {
    return { type: "tab", tab: "friends", social: "pvp" };
  }
  if (tab === "scores" || tab === "friends" || tab === "play" || tab === "chat" || tab === "territories") {
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
    showPendingBanner(`Sending friend request ${code.toUpperCase()}…`);
    setSocialMode("friends");
    setTab("friends");
    if (!online) {
      showPendingBanner("Connecting… then we’ll send the friend request.");
      return;
    }
    try {
      const data = await addFriendOnline(code);
      pendingDeepLink = null;
      clearDeepLinkFromUrl();
      showPendingBanner("");
      const name = data?.display_name || "Player";
      els.friendMsg.className = "form-msg ok";
      if (data?.status === "accepted") {
        els.friendMsg.textContent = `You're now friends with ${name}!`;
        toast(`Friends with ${name}`);
      } else {
        els.friendMsg.textContent = `Request sent to ${name} — they must accept.`;
        toast("Friend request sent");
      }
      renderFriends();
      renderFriendRequests();
    } catch (err) {
      showPendingBanner("");
      els.friendMsg.className = "form-msg err";
      els.friendMsg.textContent = err.message || "Could not send request";
      toast(err.message || "Could not send request");
      if (!/online|network|fetch/i.test(err.message || "")) {
        pendingDeepLink = null;
        clearDeepLinkFromUrl();
      }
    }
    return;
  }

  if (type === "group") {
    showPendingBanner(`Joining group ${code.toUpperCase()}…`);
    setSocialMode("groups");
    setTab("friends");
    if (!online) {
      showPendingBanner("Connecting… then we’ll join the group.");
      return;
    }
    try {
      const name = await joinGroupOnline(code);
      pendingDeepLink = null;
      clearDeepLinkFromUrl();
      showPendingBanner("");
      if (els.groupMsg) {
        els.groupMsg.className = "form-msg ok";
        els.groupMsg.textContent = `Joined ${name}!`;
      }
      renderGroups();
      toast(`Joined ${name}`);
      setTab("scores");
    } catch (err) {
      showPendingBanner("");
      if (els.groupMsg) {
        els.groupMsg.className = "form-msg err";
        els.groupMsg.textContent = err.message || "Could not join group";
      }
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
    renderFriendRequests();
    renderGroups();
    return;
  }
  await Promise.all([loadFriends(), loadFriendRequests(), loadGroups()]);
  renderFriends();
  renderFriendRequests();
  renderGroups();
  renderFriendsBoard();
  renderGroupBoards();
  renderPvpFriendsQuick();
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

async function loadFriendRequests() {
  if (!sb || !session?.user || !online) {
    friendRequestsIncoming = [];
    friendRequestsOutgoing = [];
    return;
  }
  const { data, error } = await sb.rpc("jp_friend_requests_inbox");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_friend_requests_inbox", error);
    }
    friendRequestsIncoming = [];
    friendRequestsOutgoing = [];
    return;
  }
  friendRequestsIncoming = Array.isArray(data?.incoming) ? data.incoming : [];
  friendRequestsOutgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
}

function renderFriendRequests() {
  const inc = friendRequestsIncoming;
  const out = friendRequestsOutgoing;
  if (els.friendRequestsIncoming) {
    if (!inc.length) {
      els.friendRequestsIncoming.innerHTML = "";
      if (els.friendRequestsIncomingEmpty) els.friendRequestsIncomingEmpty.hidden = false;
    } else {
      if (els.friendRequestsIncomingEmpty) els.friendRequestsIncomingEmpty.hidden = true;
      els.friendRequestsIncoming.innerHTML = inc
        .map(
          (r) => `
        <li data-request-id="${r.id}">
          <div class="avatar" style="width:36px;height:36px;font-size:0.8rem">${initials(r.display_name || "?")}</div>
          <div class="person-info">
            <div class="name">${escapeHtml(r.display_name || "Player")}</div>
            <div class="meta">Code ${escapeHtml(r.friend_code || "—")} · wants to be friends</div>
          </div>
          <div class="friend-req-actions">
            <button type="button" class="solid-btn" data-friend-accept="${r.id}">Accept</button>
            <button type="button" class="ghost-btn" data-friend-decline="${r.id}">Decline</button>
          </div>
        </li>`
        )
        .join("");
    }
  }
  if (els.friendRequestsOutgoing) {
    if (!out.length) {
      els.friendRequestsOutgoing.innerHTML = "";
      if (els.friendRequestsOutgoingEmpty) els.friendRequestsOutgoingEmpty.hidden = false;
    } else {
      if (els.friendRequestsOutgoingEmpty) els.friendRequestsOutgoingEmpty.hidden = true;
      els.friendRequestsOutgoing.innerHTML = out
        .map(
          (r) => `
        <li data-request-id="${r.id}">
          <div class="avatar" style="width:36px;height:36px;font-size:0.8rem">${initials(r.display_name || "?")}</div>
          <div class="person-info">
            <div class="name">${escapeHtml(r.display_name || "Player")}</div>
            <div class="meta">Code ${escapeHtml(r.friend_code || "—")} · waiting for accept</div>
          </div>
          <div class="friend-req-actions">
            <button type="button" class="ghost-btn" data-friend-cancel="${r.id}">Cancel</button>
          </div>
        </li>`
        )
        .join("");
    }
  }
}

/** Online: send request (or auto-accept if they already requested you). Returns status message. */
async function addFriendOnline(codeRaw) {
  const code = extractFriendCode(codeRaw);
  if (!code) throw new Error("Enter a friend code");
  if (code.startsWith("JP1.")) {
    throw new Error("Use their short online code (6 characters), not the offline blob");
  }
  if (code.length < 4) throw new Error("Enter a friend code");

  const { data, error } = await sb.rpc("jp_add_friend_by_code", { p_code: code });
  if (error) {
    const msg = error.message || "Could not send request";
    if (/own code/i.test(msg)) throw new Error("That's your own code");
    if (/No player/i.test(msg)) throw new Error("No player with that code");
    if (/Already friends/i.test(msg)) throw new Error(msg);
    if (/already sent/i.test(msg)) throw new Error(msg);
    throw new Error(msg);
  }
  await Promise.all([loadFriends(), loadFriendRequests()]);
  renderFriends();
  renderFriendRequests();
  return data || { status: "pending", display_name: "Player", message: "Request sent" };
}

function extractFriendCode(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // Invite links: ?add=CODE or ?friend=CODE
  try {
    if (/^https?:\/\//i.test(s) || s.includes("?")) {
      const u = new URL(s, location.origin);
      const c = u.searchParams.get("add") || u.searchParams.get("friend") || u.searchParams.get("f");
      if (c) return c.trim().toUpperCase();
    }
  } catch {
    /* not a url */
  }
  const m = s.match(/[A-Za-z0-9]{4,12}/);
  return (m ? m[0] : s).toUpperCase();
}

async function respondFriendRequest(requestId, accept) {
  const { data, error } = await sb.rpc("jp_friend_request_respond", {
    p_request_id: requestId,
    p_accept: !!accept,
  });
  if (error) throw new Error(error.message || "Could not respond");
  await Promise.all([loadFriends(), loadFriendRequests()]);
  renderFriends();
  renderFriendRequests();
  renderFriendsBoard();
  renderPvpFriendsQuick();
  return data;
}

async function cancelFriendRequest(requestId) {
  const { error } = await sb.rpc("jp_friend_request_cancel", { p_request_id: requestId });
  if (error) throw new Error(error.message || "Could not cancel");
  await loadFriendRequests();
  renderFriendRequests();
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
          <button type="button" class="solid-btn" data-pvp-friend="${f.id}" data-name="${escapeHtml(f.name)}" style="padding:6px 10px;font-size:0.72rem" title="Duel">Duel</button>
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
  renderPvpFriendsQuick();
}

// ——— PVP duels ———

function setPvpMsg(text, kind = "") {
  if (!els.pvpMsg) return;
  els.pvpMsg.textContent = text || "";
  els.pvpMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function setPvpModalMsg(text, kind = "") {
  if (!els.pvpModalMsg) return;
  els.pvpModalMsg.textContent = text || "";
  els.pvpModalMsg.className = kind ? `form-msg ${kind}` : "form-msg";
}

function renderPvpFriendsQuick() {
  if (!els.pvpFriendsQuick) return;
  const list = listFriendsForUi();
  if (!list.length) {
    els.pvpFriendsQuick.innerHTML = "";
    if (els.pvpFriendsQuickEmpty) els.pvpFriendsQuickEmpty.hidden = false;
    return;
  }
  if (els.pvpFriendsQuickEmpty) els.pvpFriendsQuickEmpty.hidden = true;
  els.pvpFriendsQuick.innerHTML = [...list]
    .sort((a, b) => (b.highScore || 0) - (a.highScore || 0))
    .map(
      (f) => `
    <li data-id="${f.id}">
      <div class="avatar" style="width:36px;height:36px;font-size:0.8rem">${initials(f.name)}</div>
      <div class="person-info">
        <div class="name">${escapeHtml(f.name)}</div>
        <div class="meta">Friend · life ${formatNum(f.lifetimeCount || 0)}</div>
      </div>
      <div class="friend-actions">
        <button type="button" class="solid-btn" data-pvp-friend="${f.id}" data-name="${escapeHtml(f.name)}" style="padding:6px 10px;font-size:0.72rem">Duel</button>
      </div>
    </li>`
    )
    .join("");
}

function renderPvpStats() {
  if (els.pvpWins) els.pvpWins.textContent = formatNum(pvpStats.wins || 0);
  if (els.pvpLosses) els.pvpLosses.textContent = formatNum(pvpStats.losses || 0);
  if (els.pvpDraws) els.pvpDraws.textContent = formatNum(pvpStats.draws || 0);
  if (els.pvpKd) els.pvpKd.textContent = String(pvpStats.kd ?? 0);
}

function renderPvpQuota() {
  const base = Math.max(1, Number(pvpQuota.base_limit) || 10);
  const allowed = Math.max(0, Number(pvpQuota.allowed) || base);
  const sent = Math.max(0, Number(pvpQuota.sent) || 0);
  const remaining = Math.max(0, Number(pvpQuota.remaining) || 0);
  const winsBonus = Math.max(0, Number(pvpQuota.wins_bonus) || 0);
  if (els.pvpQuotaText) {
    els.pvpQuotaText.textContent = `${sent} / ${allowed} used · ${remaining} left`;
  }
  if (els.pvpQuotaFill) {
    const pct = Math.min(100, Math.round((sent / Math.max(allowed, 1)) * 100));
    els.pvpQuotaFill.style.width = `${pct}%`;
    els.pvpQuotaFill.classList.toggle("is-full", remaining <= 0);
    els.pvpQuotaFill.classList.toggle("is-low", remaining > 0 && remaining <= 2);
  }
  if (els.pvpQuotaHint) {
    if (remaining <= 0) {
      els.pvpQuotaHint.textContent =
        winsBonus > 0
          ? "Limit reached for today. Win more (as opponent) or wait for UTC reset."
          : "Limit reached (10). Win a duel today to unlock +1, or wait for UTC reset.";
    } else if (winsBonus > 0) {
      els.pvpQuotaHint.textContent = `Base 10 + ${winsBonus} win bonus. Each win unlocks another request today.`;
    } else {
      els.pvpQuotaHint.textContent = "Win a duel to unlock another request today.";
    }
  }
  // Dim challenge UI when empty
  if (els.pvpChallengeBtn) els.pvpChallengeBtn.disabled = remaining <= 0 && online;
}

function pvpOpponentName(m) {
  const uid = myId();
  if (!m) return "—";
  if (m.challenger_id === uid) return m.opponent_name || "Friend";
  return m.challenger_name || "Friend";
}

function pvpIsChallenger(m) {
  return m && m.challenger_id === myId();
}

function pvpMyReady(m) {
  if (!m) return false;
  return pvpIsChallenger(m) ? !!m.challenger_ready : !!m.opponent_ready;
}

function pvpTheirReady(m) {
  if (!m) return false;
  return pvpIsChallenger(m) ? !!m.opponent_ready : !!m.challenger_ready;
}

function pvpMyScore(m) {
  if (!m) return null;
  return pvpIsChallenger(m) ? m.challenger_score : m.opponent_score;
}

function pvpTheirScore(m) {
  if (!m) return null;
  return pvpIsChallenger(m) ? m.opponent_score : m.challenger_score;
}

function renderPvpInbox() {
  if (!els.pvpMatchList) return;
  if (!pvpInbox.length) {
    els.pvpMatchList.innerHTML = "";
    if (els.pvpMatchEmpty) els.pvpMatchEmpty.hidden = false;
    return;
  }
  if (els.pvpMatchEmpty) els.pvpMatchEmpty.hidden = true;
  const uid = myId();
  els.pvpMatchList.innerHTML = pvpInbox
    .map((m) => {
      const vs = pvpOpponentName(m);
      const badge = escapeHtml(m.status || "");
      const dur = m.duration_sec || 10;
      let resultLine = `${dur}s duel`;
      if (m.status === "complete") {
        const mine = pvpMyScore(m);
        const theirs = pvpTheirScore(m);
        let outcome = "Draw";
        if (m.winner_id === uid) outcome = "Win";
        else if (m.winner_id) outcome = "Loss";
        resultLine = `${outcome} · you ${mine ?? "—"} vs ${theirs ?? "—"}`;
      } else if (m.status === "running") {
        resultLine = `${dur}s · live`;
      } else if (m.status === "accepted") {
        resultLine = `${dur}s · ready up`;
      } else if (m.status === "pending") {
        resultLine =
          m.opponent_id === uid
            ? `${dur}s · incoming challenge`
            : `${dur}s · waiting for accept`;
      }
      const openable = ["pending", "accepted", "running", "complete"].includes(m.status);
      return `
        <li class="pvp-match-item" data-match-id="${m.id}">
          <div class="pvp-match-top">
            <div>
              <div class="pvp-match-title">vs ${escapeHtml(vs)}</div>
              <div class="pvp-match-meta">${escapeHtml(resultLine)}</div>
            </div>
            <span class="pvp-match-badge ${escapeHtml(m.status)}">${badge}</span>
          </div>
          <div class="pvp-match-actions">
            ${
              openable
                ? `<button type="button" class="solid-btn" data-pvp-open="${m.id}">Open</button>`
                : ""
            }
          </div>
        </li>`;
    })
    .join("");
}

function renderPvpRankings() {
  if (!els.pvpRankings) return;
  if (!pvpRankings.length) {
    els.pvpRankings.innerHTML = "";
    if (els.pvpRankingsEmpty) els.pvpRankingsEmpty.hidden = false;
    return;
  }
  if (els.pvpRankingsEmpty) els.pvpRankingsEmpty.hidden = true;
  els.pvpRankings.innerHTML = pvpRankings
    .map((r, i) => {
      const you = r.id === myId();
      const rec = `${r.wins || 0}-${r.losses || 0}-${r.draws || 0}`;
      return `
      <li class="board-row ${rankPlaceClass(i)}">
        ${rankEmblemHtml(i)}
        <div class="person-info">
          <div class="name">${escapeHtml(r.display_name || "Player")}${you ? '<span class="you-tag">You</span>' : ""}</div>
          <div class="meta">${rec} · K/D ${r.kd ?? 0}</div>
        </div>
        ${scoreEmblemHtml(r.wins || 0, 0)}
      </li>`;
    })
    .join("");
}

async function loadPvpStats() {
  if (!sb || !online) return;
  const { data, error } = await sb.rpc("jp_pvp_my_stats");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_pvp_my_stats", error);
    }
    return;
  }
  pvpStats = data && typeof data === "object" ? data : pvpStats;
  renderPvpStats();
}

async function loadPvpQuota() {
  if (!sb || !online) {
    pvpQuota = { base_limit: 10, sent: 0, wins_bonus: 0, allowed: 10, remaining: 10 };
    renderPvpQuota();
    return;
  }
  const { data, error } = await sb.rpc("jp_pvp_quota");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_pvp_quota", error);
    }
    return;
  }
  if (data && typeof data === "object") {
    pvpQuota = {
      base_limit: Number(data.base_limit) || 10,
      sent: Number(data.sent) || 0,
      wins_bonus: Number(data.wins_bonus) || 0,
      allowed: Number(data.allowed) || 10,
      remaining: Number(data.remaining) || 0,
      day_start: data.day_start,
      resets_at: data.resets_at,
    };
  }
  renderPvpQuota();
}

async function loadPvpInbox() {
  if (!sb || !online) {
    pvpInbox = [];
    renderPvpInbox();
    return;
  }
  const { data, error } = await sb.rpc("jp_pvp_inbox");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_pvp_inbox", error);
    }
    return;
  }
  pvpInbox = Array.isArray(data) ? data : [];
  renderPvpInbox();
}

async function loadPvpRankings() {
  if (!sb || !online) {
    pvpRankings = [];
    renderPvpRankings();
    return;
  }
  const { data, error } = await sb.rpc("jp_pvp_rankings", { p_limit: 15 });
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_pvp_rankings", error);
    }
    return;
  }
  pvpRankings = Array.isArray(data) ? data : [];
  renderPvpRankings();
}

async function refreshPvpUi() {
  renderPvpFriendsQuick();
  await Promise.all([loadPvpStats(), loadPvpQuota(), loadPvpInbox(), loadPvpRankings()]);
}

function formatPvpQuotaError(msg) {
  if (/Daily PvP limit|limit reached/i.test(msg || "")) {
    return "Daily PvP limit reached. Win a duel for +1, or wait for UTC reset.";
  }
  return msg || "Challenge failed";
}

async function pvpChallenge(opponentId, duration) {
  if (!sb || !online) throw new Error("Go online to duel");
  if (!opponentId) throw new Error("Pick someone to duel");
  if (online && (pvpQuota.remaining ?? 0) <= 0) {
    await loadPvpQuota();
    if ((pvpQuota.remaining ?? 0) <= 0) {
      throw new Error("Daily PvP limit reached. Win a duel for +1, or wait for UTC reset.");
    }
  }
  const dur = Number(duration) === 25 ? 25 : 10;
  const { data, error } = await sb.rpc("jp_pvp_challenge", {
    p_opponent_id: opponentId,
    p_duration: dur,
  });
  if (error) throw new Error(formatPvpQuotaError(error.message));
  await Promise.all([loadPvpInbox(), loadPvpQuota()]);
  const matchId = data?.id || data;
  if (matchId) await openPvpMatch(matchId);
  toast(`${dur}s duel sent · ${pvpQuota.remaining ?? "?"} left today`);
  return data;
}

async function pvpChallengeByCode(codeRaw, duration) {
  if (!sb || !online) throw new Error("Go online to duel");
  const code = extractFriendCode(codeRaw);
  if (!code || code.length < 4) throw new Error("Enter their player code");
  if (online && (pvpQuota.remaining ?? 0) <= 0) {
    await loadPvpQuota();
    if ((pvpQuota.remaining ?? 0) <= 0) {
      throw new Error("Daily PvP limit reached. Win a duel for +1, or wait for UTC reset.");
    }
  }
  const dur = Number(duration) === 25 ? 25 : 10;
  const { data, error } = await sb.rpc("jp_pvp_challenge_by_code", {
    p_code: code,
    p_duration: dur,
  });
  if (error) {
    const msg = formatPvpQuotaError(error.message);
    if (/own code/i.test(error.message || "")) throw new Error("That's your own code");
    if (/No player/i.test(error.message || "")) throw new Error("No player with that code");
    throw new Error(msg);
  }
  await Promise.all([loadPvpInbox(), loadPvpQuota()]);
  const matchId = data?.id || data;
  if (matchId) await openPvpMatch(matchId);
  toast(`${dur}s duel sent to ${code} · ${pvpQuota.remaining ?? "?"} left`);
  return data;
}

async function pvpRespond(matchId, accept) {
  const { data, error } = await sb.rpc("jp_pvp_respond", {
    p_match_id: matchId,
    p_accept: !!accept,
  });
  if (error) throw new Error(error.message || "Respond failed");
  await loadPvpInbox();
  if (data) syncPvpModalFromMatch(data);
  return data;
}

async function pvpReady(matchId) {
  const { data, error } = await sb.rpc("jp_pvp_ready", { p_match_id: matchId });
  if (error) throw new Error(error.message || "Ready failed");
  if (data) syncPvpModalFromMatch(data);
  await loadPvpInbox();
  return data;
}

async function pvpSubmit(matchId, score) {
  const { data, error } = await sb.rpc("jp_pvp_submit", {
    p_match_id: matchId,
    p_score: Math.floor(Number(score) || 0),
  });
  if (error) throw new Error(error.message || "Submit failed");
  if (data) syncPvpModalFromMatch(data);
  // Wins unlock +1 daily challenge — refresh quota after results settle
  await Promise.all([loadPvpInbox(), loadPvpStats(), loadPvpQuota(), loadPvpRankings()]);
  return data;
}

async function pvpCancel(matchId) {
  const { data, error } = await sb.rpc("jp_pvp_cancel", { p_match_id: matchId });
  if (error) throw new Error(error.message || "Cancel failed");
  await loadPvpInbox();
  closePvpModal();
  return data;
}

async function fetchPvpMatch(matchId) {
  const { data, error } = await sb.rpc("jp_pvp_get_match", { p_match_id: matchId });
  if (error) throw new Error(error.message || "Could not load match");
  return data;
}

function stopPvpLoop() {
  cancelAnimationFrame(pvpRaf);
  pvpRaf = 0;
  clearInterval(pvpPollTimer);
  pvpPollTimer = null;
}

function closePvpModal() {
  stopPvpLoop();
  pvpActiveMatch = null;
  pvpPhase = "idle";
  pvpLocalScore = 0;
  pvpSubmitted = false;
  if (els.pvpModal?.open) els.pvpModal.close();
}

function startPvpPolling() {
  clearInterval(pvpPollTimer);
  pvpPollTimer = setInterval(async () => {
    if (!pvpActiveMatch?.id || !online) return;
    try {
      const m = await fetchPvpMatch(pvpActiveMatch.id);
      if (m) syncPvpModalFromMatch(m);
    } catch (e) {
      console.warn("pvp poll", e);
    }
  }, 1500);
}

function syncPvpModalFromMatch(m) {
  if (!m) return;
  const prev = pvpActiveMatch || {};
  const wasComplete = prev.status === "complete";
  // RPCs may return raw row without display names — keep previous labels
  pvpActiveMatch = {
    ...prev,
    ...m,
    challenger_name: m.challenger_name || prev.challenger_name,
    opponent_name: m.opponent_name || prev.opponent_name,
  };
  renderPvpModal();
  maybeStartPvpCountdown();
  // Win bonus unlocks +1 daily request
  if (m.status === "complete" && !wasComplete) {
    Promise.all([loadPvpQuota(), loadPvpStats()]).catch(() => {});
  }
}

async function openPvpMatch(matchIdOrObj) {
  const id =
    typeof matchIdOrObj === "string"
      ? matchIdOrObj
      : matchIdOrObj?.id || matchIdOrObj;
  if (!id) throw new Error("Match not found");
  const m = await fetchPvpMatch(id);
  if (!m?.id) throw new Error("Match not found");
  pvpActiveMatch = m;
  pvpLocalScore = 0;
  pvpSubmitted = false;
  pvpPhase = "idle";
  setPvpModalMsg("");
  if (els.pvpModal && !els.pvpModal.open) els.pvpModal.showModal();
  renderPvpModal();
  startPvpPolling();
  maybeStartPvpCountdown();
}

function renderPvpModal() {
  const m = pvpActiveMatch;
  if (!m || !els.pvpModal) return;
  const vs = pvpOpponentName(m);
  const dur = m.duration_sec || 10;
  if (els.pvpModalTitle) els.pvpModalTitle.textContent = `${dur}s duel`;
  if (els.pvpModalVs) els.pvpModalVs.textContent = `You vs ${vs}`;

  const isOpp = m.opponent_id === myId();
  const isCh = pvpIsChallenger(m);

  if (els.pvpAcceptBtn) els.pvpAcceptBtn.hidden = !(m.status === "pending" && isOpp);
  if (els.pvpDeclineBtn) els.pvpDeclineBtn.hidden = !(m.status === "pending" && isOpp);
  if (els.pvpCancelBtn) {
    els.pvpCancelBtn.hidden = !(
      (m.status === "pending" && isCh) ||
      m.status === "accepted"
    );
  }
  if (els.pvpReadyBtn) {
    els.pvpReadyBtn.hidden = !(m.status === "accepted" && !pvpMyReady(m));
    els.pvpReadyBtn.disabled = false;
    els.pvpReadyBtn.textContent = "I'm ready";
  }

  let status = "";
  if (m.status === "pending") {
    status = isOpp ? "Challenge received — accept to duel" : "Waiting for them to accept…";
  } else if (m.status === "accepted") {
    if (pvpMyReady(m) && pvpTheirReady(m)) status = "Both ready — starting…";
    else if (pvpMyReady(m)) status = "Ready — waiting for opponent…";
    else status = "Accepted — tap I'm ready when you're set";
  } else if (m.status === "running") {
    if (pvpPhase === "countdown") status = "Get ready…";
    else if (pvpPhase === "running") status = "GO! Mash the button!";
    else if (pvpPhase === "done" || pvpSubmitted) status = "Submitted — waiting for opponent…";
    else status = "Match live";
  } else if (m.status === "complete") {
    const mine = pvpMyScore(m);
    const theirs = pvpTheirScore(m);
    if (m.winner_id === myId()) status = `You win! ${mine} – ${theirs}`;
    else if (m.winner_id) status = `You lose. ${mine} – ${theirs}`;
    else status = `Draw ${mine} – ${theirs}`;
  } else {
    status = m.status || "—";
  }
  if (els.pvpModalStatus) els.pvpModalStatus.textContent = status;

  if (els.pvpArenaScore) {
    if (m.status === "complete") els.pvpArenaScore.textContent = formatNum(pvpMyScore(m) ?? pvpLocalScore);
    else els.pvpArenaScore.textContent = formatNum(pvpLocalScore);
  }

  const canPush = pvpPhase === "running" && !pvpSubmitted;
  if (els.pvpPushBtn) els.pvpPushBtn.disabled = !canPush;
  if (els.pvpPushHint) {
    els.pvpPushHint.textContent = canPush
      ? "TAP!"
      : pvpSubmitted
        ? "Submitted"
        : m.status === "complete"
          ? "Finished"
          : "Wait for go";
  }
}

function maybeStartPvpCountdown() {
  const m = pvpActiveMatch;
  if (!m || m.status !== "running" || !m.starts_at) return;
  if (pvpPhase === "running" || pvpPhase === "done" || pvpSubmitted) return;

  const startMs = new Date(m.starts_at).getTime();
  const endMs = m.ends_at
    ? new Date(m.ends_at).getTime()
    : startMs + (m.duration_sec || 10) * 1000;
  const now = Date.now();

  if (now >= endMs) {
    // Missed window — still try submit if we have a score and not submitted
    if (!pvpSubmitted && pvpLocalScore > 0) {
      finishPvpRun();
    } else if (!pvpSubmitted) {
      pvpPhase = "done";
      if (els.pvpArenaTimer) els.pvpArenaTimer.textContent = "0.0";
      renderPvpModal();
    }
    return;
  }

  if (now < startMs) {
    pvpPhase = "countdown";
    cancelAnimationFrame(pvpRaf);
    const tick = () => {
      if (!pvpActiveMatch || pvpActiveMatch.id !== m.id) return;
      const left = Math.max(0, startMs - Date.now());
      if (els.pvpArenaTimer) {
        els.pvpArenaTimer.textContent = left > 0 ? `Start in ${(left / 1000).toFixed(1)}` : "GO!";
      }
      if (left <= 0) {
        beginPvpRun(startMs, endMs);
        return;
      }
      pvpRaf = requestAnimationFrame(tick);
      renderPvpModal();
    };
    tick();
    return;
  }

  // Already in run window
  beginPvpRun(startMs, endMs);
}

function beginPvpRun(startMs, endMs) {
  if (pvpPhase === "running" || pvpSubmitted) return;
  pvpPhase = "running";
  pvpLocalScore = 0;
  if (els.pvpArenaScore) els.pvpArenaScore.textContent = "0";
  cancelAnimationFrame(pvpRaf);
  const tick = () => {
    if (pvpPhase !== "running") return;
    const left = Math.max(0, endMs - Date.now());
    if (els.pvpArenaTimer) els.pvpArenaTimer.textContent = (left / 1000).toFixed(1);
    if (left <= 0) {
      finishPvpRun();
      return;
    }
    pvpRaf = requestAnimationFrame(tick);
  };
  tick();
  renderPvpModal();
}

async function finishPvpRun() {
  if (pvpSubmitted || !pvpActiveMatch) return;
  pvpPhase = "done";
  pvpSubmitted = true;
  cancelAnimationFrame(pvpRaf);
  if (els.pvpArenaTimer) els.pvpArenaTimer.textContent = "0.0";
  if (els.pvpPushBtn) els.pvpPushBtn.disabled = true;
  renderPvpModal();
  try {
    await pvpSubmit(pvpActiveMatch.id, pvpLocalScore);
    setPvpModalMsg(`Score submitted: ${pvpLocalScore}`, "ok");
    toast(`Duel score: ${pvpLocalScore}`);
  } catch (e) {
    pvpSubmitted = false;
    setPvpModalMsg(e.message || "Submit failed", "err");
  }
  renderPvpModal();
}

function pvpPush() {
  if (pvpPhase !== "running" || pvpSubmitted) return;
  pvpLocalScore += 1;
  if (els.pvpArenaScore) els.pvpArenaScore.textContent = formatNum(pvpLocalScore);
}

function renderFriendsBoard() {
  const metric = state.boardMetric === "challenge" ? "challengeBest" : "highScore";
  const entries = [
    {
      id: myId(),
      name: state.name || "You",
      highScore: state.highScore,
      challengeBest: effectiveChallengeBest(),
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

  // If our row is on the board, treat it as authoritative for local 10s best
  const uid = session?.user?.id;
  if (uid) {
    const mine =
      (globalBoard || []).find((r) => r.id === uid) ||
      (globalLifetimeBoard || []).find((r) => r.id === uid);
    if (mine && typeof mine.challenge_best === "number") {
      applyChallengeBestFromServer(mine.challenge_best);
      renderScores();
    }
  }

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

// ——— Territories ———

function territoryName(id) {
  return TERRITORY_BY_ID[id]?.name || id || "Region";
}

function territoryBlurb(id) {
  return TERRITORY_BY_ID[id]?.blurb || "";
}

function myTerritoryScore(id) {
  const row = myTerritoryScores[id] || {};
  return {
    lifetime_count: Math.max(0, Number(row.lifetime_count) || 0),
    challenge_best: Math.max(0, Number(row.challenge_best) || 0),
  };
}

function bumpLocalTerritoryLife(id, n = 1) {
  if (!id) return;
  const cur = myTerritoryScore(id);
  myTerritoryScores[id] = {
    lifetime_count: cur.lifetime_count + Math.max(0, n),
    challenge_best: cur.challenge_best,
  };
}

function applyTerritoryRow(row) {
  if (!row?.territory_id) return;
  myTerritoryScores[row.territory_id] = {
    lifetime_count: Math.max(0, Number(row.lifetime_count) || 0),
    challenge_best: Math.max(0, Number(row.challenge_best) || 0),
  };
}

function scheduleTerritoryPushRpc(territoryId, count = 1) {
  if (!territoryId || !online) return;
  pendingTerritoryPushes += Math.max(0, count);
  clearTimeout(territoryPushTimer);
  territoryPushTimer = setTimeout(() => {
    const n = pendingTerritoryPushes;
    pendingTerritoryPushes = 0;
    const tid = activeTerritoryId || territoryId;
    if (!tid || !n) return;
    recordTerritoryPushesOnServer(tid, n).catch((e) => console.warn("territory push", e));
  }, 350);
}

async function recordTerritoryPushesOnServer(territoryId, count) {
  if (!sb || !session?.user || !online || !territoryId) return;
  let left = Math.max(0, Math.floor(Number(count) || 0));
  let last = null;
  while (left > 0) {
    const chunk = Math.min(200, left);
    const { data, error } = await sb.rpc("jp_territory_record_pushes", {
      p_territory_id: territoryId,
      p_count: chunk,
    });
    if (error) {
      console.warn("jp_territory_record_pushes", error);
      return;
    }
    last = data;
    left -= chunk;
  }
  if (last) {
    applyTerritoryRow(last);
    updateTerritoryBanner();
    if (selectedTerritoryId === territoryId) renderTerritoryDetail();
  }
}

async function reportTerritoryChallenge(territoryId, count) {
  if (!sb || !session?.user || !online || !territoryId) return;
  const { data, error } = await sb.rpc("jp_territory_report_challenge", {
    p_territory_id: territoryId,
    p_count: Math.floor(Number(count) || 0),
  });
  if (error) {
    console.warn("jp_territory_report_challenge", error);
    return;
  }
  if (data) {
    applyTerritoryRow(data);
    updateTerritoryBanner();
    if (selectedTerritoryId === territoryId) {
      await loadTerritoryBoards(territoryId);
      renderTerritoryDetail();
    }
  }
}

async function loadMyTerritoryScores() {
  if (!sb || !session?.user || !online) return;
  const { data, error } = await sb.rpc("jp_territory_my_scores");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_territory_my_scores", error);
    }
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  const next = {};
  for (const r of rows) {
    if (!r?.territory_id) continue;
    next[r.territory_id] = {
      lifetime_count: Math.max(0, Number(r.lifetime_count) || 0),
      challenge_best: Math.max(0, Number(r.challenge_best) || 0),
    };
  }
  myTerritoryScores = next;
}

async function loadTerritoryOverview() {
  if (!sb || !online) {
    territoryOverview = {};
    paintTerritoryMap();
    return;
  }
  const { data, error } = await sb.rpc("jp_territory_map_overview");
  if (error) {
    if (!/could not find|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("jp_territory_map_overview", error);
    }
    territoryOverview = {};
    paintTerritoryMap();
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  const next = {};
  for (const r of rows) {
    if (!r?.territory_id) continue;
    next[r.territory_id] = {
      life_king: r.life_king || null,
      challenge_king: r.challenge_king || null,
    };
  }
  territoryOverview = next;
  paintTerritoryMap();
}

async function loadTerritoryBoards(territoryId) {
  territoryLifeBoard = [];
  territoryChalBoard = [];
  if (!sb || !online || !territoryId) {
    renderTerritoryBoards();
    return;
  }
  const [lifeRes, chalRes] = await Promise.all([
    sb.rpc("jp_territory_leaderboard", {
      p_territory_id: territoryId,
      p_metric: "lifetime",
      p_limit: 5,
    }),
    sb.rpc("jp_territory_leaderboard", {
      p_territory_id: territoryId,
      p_metric: "challenge",
      p_limit: 5,
    }),
  ]);
  if (lifeRes.error) console.warn(lifeRes.error);
  else territoryLifeBoard = Array.isArray(lifeRes.data) ? lifeRes.data : [];
  if (chalRes.error) console.warn(chalRes.error);
  else territoryChalBoard = Array.isArray(chalRes.data) ? chalRes.data : [];
  renderTerritoryBoards();
}

function paintTerritoryMap() {
  if (!els.territoryMap) return;
  const uid = session?.user?.id;
  els.territoryMap.querySelectorAll(".territory-region").forEach((path) => {
    const id = path.dataset.territory;
    path.classList.toggle("is-selected", id === selectedTerritoryId);
    const ov = territoryOverview[id];
    const iLead = !!(uid && ov?.life_king?.id === uid);
    path.classList.toggle("is-held", iLead);
  });
}

function renderTerritoryBoardList(el, emptyEl, rows, metric) {
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  el.innerHTML = rows
    .map((r, i) => {
      const score = metric === "challenge" ? r.challenge_best : r.lifetime_count;
      const life = r.global_life ?? r.lifetime_count ?? 0;
      const you = r.id === myId();
      const name = r.display_name || "Player";
      return `
      <li class="board-row ${rankPlaceClass(i)}">
        ${rankEmblemHtml(i)}
        <div class="person-info">
          <div class="name">${levelBadgeHtml(life, true)} ${escapeHtml(name)}${you ? '<span class="you-tag">You</span>' : ""}</div>
        </div>
        ${scoreEmblemHtml(score, life)}
      </li>`;
    })
    .join("");
}

function renderTerritoryBoards() {
  renderTerritoryBoardList(
    els.territoryBoardLife,
    els.territoryBoardLifeEmpty,
    territoryLifeBoard,
    "lifetime"
  );
  renderTerritoryBoardList(
    els.territoryBoard10s,
    els.territoryBoard10sEmpty,
    territoryChalBoard,
    "challenge"
  );
}

function renderTerritoryDetail() {
  if (!selectedTerritoryId) {
    if (els.territoryDetail) els.territoryDetail.hidden = true;
    if (els.territoryPickHint) els.territoryPickHint.hidden = false;
    return;
  }
  const t = TERRITORY_BY_ID[selectedTerritoryId];
  if (!t) return;
  if (els.territoryDetail) els.territoryDetail.hidden = false;
  if (els.territoryPickHint) els.territoryPickHint.hidden = true;
  if (els.territoryDetailTitle) els.territoryDetailTitle.textContent = t.name;
  if (els.territoryDetailBlurb) els.territoryDetailBlurb.textContent = t.blurb;
  const mine = myTerritoryScore(selectedTerritoryId);
  if (els.territoryMyLife) els.territoryMyLife.textContent = formatNum(mine.lifetime_count);
  if (els.territoryMy10s) els.territoryMy10s.textContent = formatNum(mine.challenge_best);

  const ov = territoryOverview[selectedTerritoryId];
  const lifeKing = ov?.life_king?.name;
  const chalKing = ov?.challenge_king?.name;
  let pill = "Open";
  if (lifeKing && chalKing && lifeKing === chalKing) pill = `Held by ${lifeKing}`;
  else if (lifeKing || chalKing) pill = "Contested";
  if (els.territoryDetailPill) els.territoryDetailPill.textContent = pill;

  renderTerritoryBoards();
  paintTerritoryMap();
}

async function selectTerritory(id) {
  if (!TERRITORY_BY_ID[id]) return;
  selectedTerritoryId = id;
  paintTerritoryMap();
  renderTerritoryDetail();
  await loadTerritoryBoards(id);
  renderTerritoryDetail();
}

function setActiveTerritory(id, mode = "free") {
  activeTerritoryId = id || null;
  updateTerritoryBanner();
  if (id) {
    setMode(mode === "challenge" ? "challenge" : "free");
    setTab("play");
    toast(
      mode === "challenge"
        ? `Conquer ${territoryName(id)} — 10s run`
        : `Leveling up ${territoryName(id)}`
    );
  }
}

function clearActiveTerritory() {
  activeTerritoryId = null;
  updateTerritoryBanner();
  toast("Left territory campaign");
}

function updateTerritoryBanner() {
  if (!els.territoryBanner) return;
  if (!activeTerritoryId) {
    els.territoryBanner.hidden = true;
    return;
  }
  els.territoryBanner.hidden = false;
  if (els.territoryBannerName) els.territoryBannerName.textContent = territoryName(activeTerritoryId);
  const mine = myTerritoryScore(activeTerritoryId);
  if (els.territoryBannerMeta) {
    els.territoryBannerMeta.textContent = `Overall ${formatNum(mine.lifetime_count)} · 10s ${formatNum(mine.challenge_best)}`;
  }
}

async function refreshTerritoriesUi() {
  await Promise.all([loadMyTerritoryScores(), loadTerritoryOverview()]);
  if (selectedTerritoryId) await loadTerritoryBoards(selectedTerritoryId);
  renderTerritoryDetail();
  updateTerritoryBanner();
  paintTerritoryMap();
}

// ——— Social hub (Friends / Groups / PvP) ———

function setSocialMode(mode) {
  const m = mode === "groups" || mode === "pvp" ? mode : "friends";
  socialMode = m;
  $$("[data-social-mode]").forEach((btn) => {
    const on = btn.dataset.socialMode === m;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (els.socialFriendsView) els.socialFriendsView.hidden = m !== "friends";
  if (els.socialGroupsView) els.socialGroupsView.hidden = m !== "groups";
  if (els.socialPvpView) els.socialPvpView.hidden = m !== "pvp";
  if (m === "friends") renderFriends();
  if (m === "groups") renderGroups();
  if (m === "pvp") {
    renderPvpFriendsQuick();
    renderPvpStats();
    renderPvpInbox();
    renderPvpRankings();
    if (online) refreshPvpUi().catch((e) => console.warn(e));
  }
  if (m === "friends") {
    renderFriendRequests();
  }
}

// ——— Tabs ———

function setTab(tab) {
  // Legacy: old Groups tab → Social · Groups
  if (tab === "groups") {
    socialMode = "groups";
    tab = "friends";
  }
  if (tab === "pvp") {
    socialMode = "pvp";
    tab = "friends";
  }
  els.app.dataset.tab = tab;
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("active", on);
    t.setAttribute("aria-current", on ? "page" : "false");
  });
  $$(".panel").forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
  if (tab === "friends") {
    setSocialMode(socialMode);
    renderFriends();
    renderGroups();
    renderPvpStats();
    renderPvpInbox();
    renderPvpRankings();
    if (online) {
      refreshSocial().catch((e) => console.warn(e));
      refreshPvpUi().catch((e) => console.warn(e));
    }
  }
  if (tab === "scores") {
    renderScores();
    renderFriendsBoard();
    renderGroupBoards();
    renderGlobalBoard();
    if (online) loadGlobalBoard().then(() => refreshSocial());
  }
  if (tab === "territories") {
    paintTerritoryMap();
    renderTerritoryDetail();
    if (online) refreshTerritoriesUi().catch((e) => console.warn(e));
  }
  if (tab === "chat") {
    if (!featureChatEnabled()) {
      setTab("play");
      return;
    }
    updateChatOnlineHint();
    setChatMode(chatMode);
  }
  if (tab === "style") {
    renderSwatches();
    syncFocusLockPrefUi();
  }
}

// ——— Events ———

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

  $$(".mode-btn").forEach((btn) => {
    // Play free/challenge only — social + chat use their own handlers
    if (btn.dataset.mode) {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    }
  });

  $$("[data-social-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setSocialMode(btn.dataset.socialMode));
  });

  // Territory map: click regions
  els.territoryMap?.addEventListener("click", (e) => {
    const path = e.target?.closest?.(".territory-region");
    if (!path?.dataset?.territory) return;
    selectTerritory(path.dataset.territory).catch((err) => console.warn(err));
  });
  els.territoryRefresh?.addEventListener("click", () => {
    refreshTerritoriesUi()
      .then(() => toast("Map refreshed"))
      .catch((err) => toast(err.message || "Refresh failed"));
  });
  els.territoryPlayFree?.addEventListener("click", () => {
    if (!selectedTerritoryId) return toast("Pick a region first");
    if (!online) return toast("Go online to claim territories");
    setActiveTerritory(selectedTerritoryId, "free");
  });
  els.territoryPlay10s?.addEventListener("click", () => {
    if (!selectedTerritoryId) return toast("Pick a region first");
    if (!online) return toast("Go online to conquer territories");
    setActiveTerritory(selectedTerritoryId, "challenge");
  });
  els.territoryBannerExit?.addEventListener("click", () => clearActiveTerritory());

  // PVP
  els.pvpRefresh?.addEventListener("click", () => {
    refreshPvpUi()
      .then(() => toast("PvP refreshed"))
      .catch((e) => setPvpMsg(e.message || "Refresh failed", "err"));
  });
  els.pvpCodeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPvpMsg("");
    try {
      await pvpChallengeByCode(els.pvpCodeInput?.value, els.pvpDurationSelect?.value);
      setPvpMsg("Duel request sent.", "ok");
      if (els.pvpCodeInput) els.pvpCodeInput.value = "";
    } catch (err) {
      setPvpMsg(err.message || "Challenge failed", "err");
      toast(err.message || "Challenge failed");
    }
  });
  els.pvpFriendsQuick?.addEventListener("click", async (e) => {
    const duelBtn = e.target?.closest?.("[data-pvp-friend]");
    if (!duelBtn) return;
    setPvpMsg("");
    try {
      await pvpChallenge(duelBtn.getAttribute("data-pvp-friend"), els.pvpDurationSelect?.value);
      setPvpMsg("Duel request sent.", "ok");
    } catch (err) {
      setPvpMsg(err.message || "Challenge failed", "err");
      toast(err.message || "Challenge failed");
    }
  });
  els.friendRequestsRefresh?.addEventListener("click", () => {
    loadFriendRequests()
      .then(() => {
        renderFriendRequests();
        toast("Requests refreshed");
      })
      .catch((err) => toast(err.message || "Refresh failed"));
  });
  els.friendRequestsIncoming?.addEventListener("click", async (e) => {
    const acc = e.target?.closest?.("[data-friend-accept]");
    const dec = e.target?.closest?.("[data-friend-decline]");
    try {
      if (acc) {
        const data = await respondFriendRequest(acc.getAttribute("data-friend-accept"), true);
        toast(`Friends with ${data?.display_name || "player"}`);
      } else if (dec) {
        await respondFriendRequest(dec.getAttribute("data-friend-decline"), false);
        toast("Request declined");
      }
    } catch (err) {
      toast(err.message || "Failed");
    }
  });
  els.friendRequestsOutgoing?.addEventListener("click", async (e) => {
    const cancel = e.target?.closest?.("[data-friend-cancel]");
    if (!cancel) return;
    try {
      await cancelFriendRequest(cancel.getAttribute("data-friend-cancel"));
      toast("Request cancelled");
    } catch (err) {
      toast(err.message || "Cancel failed");
    }
  });
  els.pvpMatchList?.addEventListener("click", async (e) => {
    const openBtn = e.target?.closest?.("[data-pvp-open]");
    if (!openBtn) return;
    try {
      await openPvpMatch(openBtn.getAttribute("data-pvp-open"));
    } catch (err) {
      toast(err.message || "Could not open duel");
    }
  });
  els.pvpModalClose?.addEventListener("click", () => closePvpModal());
  els.pvpModal?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closePvpModal();
  });
  els.pvpAcceptBtn?.addEventListener("click", async () => {
    if (!pvpActiveMatch) return;
    try {
      await pvpRespond(pvpActiveMatch.id, true);
      setPvpModalMsg("Accepted — ready up!", "ok");
    } catch (e) {
      setPvpModalMsg(e.message || "Accept failed", "err");
    }
  });
  els.pvpDeclineBtn?.addEventListener("click", async () => {
    if (!pvpActiveMatch) return;
    try {
      await pvpRespond(pvpActiveMatch.id, false);
      closePvpModal();
      toast("Declined");
    } catch (e) {
      setPvpModalMsg(e.message || "Decline failed", "err");
    }
  });
  els.pvpCancelBtn?.addEventListener("click", async () => {
    if (!pvpActiveMatch) return;
    try {
      await pvpCancel(pvpActiveMatch.id);
      toast("Duel cancelled");
    } catch (e) {
      setPvpModalMsg(e.message || "Cancel failed", "err");
    }
  });
  els.pvpReadyBtn?.addEventListener("click", async () => {
    if (!pvpActiveMatch) return;
    try {
      els.pvpReadyBtn.disabled = true;
      await pvpReady(pvpActiveMatch.id);
      setPvpModalMsg("You're ready.", "ok");
    } catch (e) {
      els.pvpReadyBtn.disabled = false;
      setPvpModalMsg(e.message || "Ready failed", "err");
    }
  });
  els.pvpPushBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pvpPush();
  });
  els.pvpPushBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    pvpPush();
  });

  const pressMain = () => els.pushBtn?.classList.add("pressed");
  const releaseMain = () => els.pushBtn?.classList.remove("pressed");
  const pressFocus = () => els.focusPushBtn?.classList.add("pressed");
  const releaseFocus = () => els.focusPushBtn?.classList.remove("pressed");

  // Main button — pointerdown only (same as PvP) for max taps/sec
  els.pushBtn.addEventListener("pointerdown", (e) => {
    if (els.pushBtn.disabled) return;
    e.preventDefault();
    pressMain();
    push();
  });
  els.pushBtn.addEventListener("pointerup", releaseMain);
  els.pushBtn.addEventListener("pointerleave", releaseMain);
  els.pushBtn.addEventListener("pointercancel", releaseMain);
  els.pushBtn.addEventListener("click", (e) => e.preventDefault());

  // Focus lock button — identical handling, fixed screen
  els.focusPushBtn?.addEventListener("pointerdown", (e) => {
    if (els.focusPushBtn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    pressFocus();
    push();
  });
  els.focusPushBtn?.addEventListener("pointerup", releaseFocus);
  els.focusPushBtn?.addEventListener("pointerleave", releaseFocus);
  els.focusPushBtn?.addEventListener("pointercancel", releaseFocus);
  els.focusPushBtn?.addEventListener("click", (e) => e.preventDefault());

  // Block touchmove on focus overlay so the browser never scrolls/zooms
  els.focusLockModal?.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || els.nameModal?.open) return;
      if (els.pvpModal?.open) return;
      e.preventDefault();
      const btn = isFocusLockOpen() ? els.focusPushBtn : els.pushBtn;
      if (!e.repeat && btn && !btn.disabled) {
        if (isFocusLockOpen()) pressFocus();
        else pressMain();
        push();
      }
    }
    if (e.key === "Escape" && isFocusLockOpen()) {
      e.preventDefault();
      closeFocusLock();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.key === " ") {
      releaseMain();
      releaseFocus();
    }
  });

  els.focusLockOpen?.addEventListener("click", () => openFocusLock());
  els.focusLockClose?.addEventListener("click", () => closeFocusLock());
  els.focusLockModal?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeFocusLock();
  });
  els.focusChallengeAgain?.addEventListener("click", () => resetChallengeIdle());
  els.focusResetSession?.addEventListener("click", () => resetSession());
  els.resetSessionSettings?.addEventListener("click", () => resetSession());
  els.focusLockPref?.addEventListener("change", () => {
    state.focusLockDefault = !!els.focusLockPref.checked;
    saveState();
    toast(state.focusLockDefault ? "Focus lock on for 10s runs" : "Focus lock default off");
  });

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
    const raw = extractCodeFromInput
      ? extractCodeFromInput(els.friendCodeInput.value, "friend")
      : extractFriendCode(els.friendCodeInput.value);
    try {
      if (!online) {
        if (String(raw).startsWith("JP1.")) {
          const result = addFriendOffline(raw);
          els.friendCodeInput.value = "";
          els.friendMsg.textContent =
            result === "updated" ? "Friend updated (offline)" : "Friend saved offline (no accept step)";
          els.friendMsg.classList.add("ok");
          renderFriends();
          return;
        }
        throw new Error("Go online to send a friend request");
      }
      if (String(raw).startsWith("JP1.")) {
        throw new Error("Use their short online code (6 characters), not the offline blob");
      }
      const data = await addFriendOnline(raw);
      els.friendCodeInput.value = "";
      const name = data?.display_name || "Player";
      if (data?.status === "accepted") {
        els.friendMsg.textContent = `You're now friends with ${name}!`;
        toast(`Friends with ${name}`);
      } else {
        els.friendMsg.textContent = `Request sent to ${name} — waiting for accept.`;
        toast("Friend request sent");
      }
      els.friendMsg.classList.add("ok");
      renderFriends();
      renderFriendRequests();
    } catch (err) {
      els.friendMsg.textContent = err.message || "Invalid code";
      els.friendMsg.classList.add("err");
    }
  });

  els.friendsList.addEventListener("click", async (e) => {
    const duelBtn = e.target.closest("[data-pvp-friend]");
    if (duelBtn) {
      const fid = duelBtn.getAttribute("data-pvp-friend");
      setPvpMsg("");
      try {
        await pvpChallenge(fid, els.pvpDurationSelect?.value || 10);
        setSocialMode("pvp");
        setPvpMsg("Duel request sent.", "ok");
        toast("Duel request sent");
      } catch (err) {
        setPvpMsg(err.message || "Challenge failed", "err");
        toast(err.message || "Challenge failed");
      }
      return;
    }
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

  // Admin tools — single delegated handler (works even if nested spans are the click target)
  els.adminCard?.addEventListener("click", (e) => {
    const clearBtn = e.target?.closest?.("#admin-out-clear");
    if (clearBtn) {
      e.preventDefault();
      setAdminOut(null);
      setAdminMsg(isAdminUser ? "Admin tools ready." : "", isAdminUser ? "ok" : "");
      return;
    }
    const btn = e.target?.closest?.("[data-admin-action]");
    if (!btn || !els.adminCard.contains(btn)) return;
    e.preventDefault();
    runAdminAction(btn.getAttribute("data-admin-action"));
  });
  els.adminResetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await adminSendPasswordReset(els.adminResetEmail?.value);
    } catch (err) {
      const msg = formatAdminError(err);
      setAdminMsg(msg, "err");
      setAdminOut(msg, "Error");
    } finally {
      setAdminBusy(false);
    }
  });
  els.adminLookupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await adminLookupCode(els.adminLookupCode?.value);
    } catch (err) {
      const msg = formatAdminError(err);
      setAdminMsg(msg, "err");
      setAdminOut(msg, "Error");
    } finally {
      setAdminBusy(false);
    }
  });
  els.adminChallengeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await adminSetChallengeBest(els.adminChallengeCode?.value, els.adminChallengeValue?.value);
    } catch (err) {
      const msg = formatAdminError(err);
      setAdminMsg(msg, "err");
      setAdminOut(msg, "Error");
    } finally {
      setAdminBusy(false);
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
  syncFocusLockPrefUi();
  bindEvents();
  if (pendingDeepLink?.type === "tab" && pendingDeepLink.social) {
    socialMode = pendingDeepLink.social;
  }
  if (pendingDeepLink?.type === "group") {
    socialMode = "groups";
  }
  const bootTab =
    pendingDeepLink?.type === "group"
      ? "friends"
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
