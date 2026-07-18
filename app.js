/**
 * Just Push — free push + 10s challenge, localStorage + Supabase backend.
 */

const STORAGE_KEY = "just-push-v2";
const CHALLENGE_MS = 10_000;
const CIRCUMFERENCE = 2 * Math.PI * 46;

// ——— OSRS XP curve (levels 1–99) ———
// XP to reach level L = floor( (1/4) * sum_{n=1}^{L-1} floor(n + 300 * 2^(n/7)) )
// 1 push = 1 XP. Level 99 = 13,034,431 XP (same as Old School RuneScape).
const OSRS_MAX_LEVEL = 99;
const OSRS_XP_TABLE = (() => {
  const table = [0, 0]; // index = level; XP required to *be* that level
  let points = 0;
  for (let n = 1; n < OSRS_MAX_LEVEL; n++) {
    points += Math.floor(n + 300 * Math.pow(2, n / 7));
    table[n + 1] = Math.floor(points / 4);
  }
  return table;
})();

/** Metal/gear-style tiers for the level badge icon (inspired by OSRS progression). */
const LEVEL_TIERS = [
  { min: 1, id: "bronze", label: "Bronze", color: "#cd7f32" },
  { min: 10, id: "iron", label: "Iron", color: "#9ca3af" },
  { min: 20, id: "steel", label: "Steel", color: "#cbd5e1" },
  { min: 30, id: "black", label: "Black", color: "#71717a" },
  { min: 40, id: "mithril", label: "Mithril", color: "#a78bfa" },
  { min: 50, id: "adamant", label: "Adamant", color: "#22c55e" },
  { min: 60, id: "rune", label: "Rune", color: "#38bdf8" },
  { min: 70, id: "dragon", label: "Dragon", color: "#ef4444" },
  { min: 80, id: "barrows", label: "Barrows", color: "#c084fc" },
  { min: 90, id: "crystal", label: "Crystal", color: "#67e8f9" },
  { min: 99, id: "max", label: "Max", color: "#fbbf24" },
];

function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let l = OSRS_MAX_LEVEL; l >= 1; l--) {
    if (x >= OSRS_XP_TABLE[l]) {
      level = l;
      break;
    }
  }
  return level;
}

function xpForLevel(level) {
  const l = Math.max(1, Math.min(OSRS_MAX_LEVEL, Math.floor(level)));
  return OSRS_XP_TABLE[l] || 0;
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
  if (level >= OSRS_MAX_LEVEL) {
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
let globalBoard = [];

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
  toast: $("#toast"),
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
  refreshGlobal: $("#refresh-global"),
  buttonSwatches: $("#button-swatches"),
  bgSwatches: $("#bg-swatches"),
  githubBtn: $("#github-btn"),
  githubBtnStyle: $("#github-btn-style"),
  signOutBtn: $("#sign-out-btn"),
  accountStatus: $("#account-status"),
  shareFriendLink: $("#share-friend-link"),
  copyFriendLink: $("#copy-friend-link"),
  pendingInvite: $("#pending-invite"),
};

// Deep-link invite waiting to process after online
let pendingDeepLink = null; // { type: 'friend'|'group', code: string }

let toastTimer = null;
let recordTimer = null;

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

function setOnlineUi() {
  els.app.dataset.online = online ? "1" : "0";
  if (!window.JUST_PUSH_CONFIG?.enabled) {
    els.syncPill.textContent = "local";
    els.syncPill.className = "sync-pill local";
    els.accountStatus.textContent = "Offline mode (Supabase disabled in config.js).";
    els.githubBtn.hidden = true;
    els.githubBtnStyle.hidden = true;
    els.signOutBtn.hidden = true;
    return;
  }
  if (online) {
    const provider = session?.user?.app_metadata?.provider || session?.user?.identities?.[0]?.provider;
    const isGithub = provider === "github";
    els.syncPill.textContent = isGithub ? "github" : "online";
    els.syncPill.className = "sync-pill online";
    els.accountStatus.textContent = isGithub
      ? `Signed in with GitHub · code ${profile?.friend_code || "…"}`
      : `Online (guest) · code ${profile?.friend_code || "…"} · link GitHub to keep this account`;
    els.githubBtn.hidden = isGithub;
    els.githubBtnStyle.hidden = isGithub;
    els.githubBtnStyle.textContent = "Sign in with GitHub";
    els.signOutBtn.hidden = false;
    els.friendCodeHint.textContent = "Short code works worldwide. Scores sync to Supabase.";
  } else {
    els.syncPill.textContent = "offline";
    els.syncPill.className = "sync-pill offline";
    els.accountStatus.textContent = "Could not reach Supabase — playing offline. Local share codes still work.";
    els.githubBtn.hidden = true;
    els.githubBtnStyle.hidden = false;
    els.githubBtnStyle.textContent = "Retry / Sign in with GitHub";
    els.signOutBtn.hidden = true;
    els.friendCodeHint.textContent = "Offline: long share blob. Go online for short codes + live boards.";
  }
}

function ensureName() {
  if (!state.name) {
    els.nameInput.value = "";
    els.nameModal.showModal();
    setTimeout(() => els.nameInput.focus(), 50);
  }
}

// ——— Scores render ———

function applyLevelUi(badgeEl, numEl, titleEl, xpLabelEl, fillEl, trackEl, prog) {
  if (numEl) numEl.textContent = String(prog.level);
  if (badgeEl) {
    badgeEl.dataset.tier = prog.tier.id;
    badgeEl.style.setProperty("--tier", prog.tier.color);
    badgeEl.title = `${prog.tier.label} · Level ${prog.level}`;
  }
  if (titleEl) {
    titleEl.textContent = prog.maxed ? `Level ${prog.level} · Max` : `Level ${prog.level} · ${prog.tier.label}`;
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
    const jumped = prog.level - lastRenderedLevel;
    lastRenderedLevel = prog.level;
    showNewRecord(jumped > 1 ? `Levels up! Now ${prog.level}` : `Level up! Level ${prog.level}`);
    toast(`${prog.tier.label} · Level ${prog.level}`);
  } else if (prog.level < lastRenderedLevel) {
    // e.g. profile merge / reload
    lastRenderedLevel = prog.level;
  }
}

function levelBadgeHtml(lifetime, compact = false) {
  const prog = levelProgress(lifetime || 0);
  const cls = compact ? "level-chip compact" : "level-chip";
  return `<span class="${cls}" data-tier="${prog.tier.id}" style="--tier:${prog.tier.color}" title="${prog.tier.label} level ${prog.level}"><span class="level-chip-icon" aria-hidden="true"></span><span class="level-chip-num">${prog.level}</span></span>`;
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
  scheduleSync();
  renderScores();

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
  scheduleSync();
  renderScores();
  spawnFloater();
  pulseRings();
  if (isRecord && state.sessionCount > 1) showNewRecord();
}

function resetSession() {
  if (state.sessionCount > 0) state.sessionsPlayed += 1;
  state.sessionCount = 0;
  els.newRecord.hidden = true;
  saveState();
  scheduleSync();
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
    await processPendingDeepLink();
  } catch (err) {
    console.warn("Just Push online init failed:", err);
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
    // trigger may race; insert ourselves
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const insert = {
      id: uid,
      display_name: state.name || "Player",
      friend_code: code,
      high_score: state.highScore,
      challenge_best: state.challengeBest,
      lifetime_count: state.lifetimeCount,
      sessions_played: state.sessionsPlayed,
      theme_button: state.theme.button,
      theme_bg: state.theme.background,
    };
    const res = await sb.from("jp_profiles").upsert(insert).select("*").single();
    if (res.error) throw res.error;
    data = res.data;
  }

  // Merge: take the max of local vs server so we never lose a better score
  const merged = {
    name: state.name || data.display_name || "Player",
    highScore: Math.max(state.highScore, data.high_score || 0),
    challengeBest: Math.max(state.challengeBest, data.challenge_best || 0),
    lifetimeCount: Math.max(state.lifetimeCount, data.lifetime_count || 0),
    sessionsPlayed: Math.max(state.sessionsPlayed, data.sessions_played || 0),
  };
  state.name = merged.name === "Player" && data.display_name !== "Player" ? data.display_name : merged.name;
  if (data.theme_button) state.theme.button = data.theme_button;
  if (data.theme_bg) state.theme.background = data.theme_bg;
  state.highScore = merged.highScore;
  state.challengeBest = merged.challengeBest;
  state.lifetimeCount = merged.lifetimeCount;
  state.sessionsPlayed = merged.sessionsPlayed;
  saveState();
  applyTheme();
  renderProfile();
  renderScores();

  profile = data;
  // push merge up if local was ahead
  await pushProfile();
  const refreshed = await sb.from("jp_profiles").select("*").eq("id", uid).single();
  if (refreshed.data) profile = refreshed.data;
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushProfile().catch((e) => console.warn("sync", e));
  }, 400);
}

async function pushProfile() {
  if (!sb || !session?.user) return;

  const payload = {
    display_name: (state.name || "Player").slice(0, 16),
    high_score: state.highScore,
    challenge_best: state.challengeBest,
    lifetime_count: state.lifetimeCount,
    sessions_played: state.sessionsPlayed,
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
    console.warn("profile sync", error);
    return;
  }
  profile = data;
  online = true;
  setOnlineUi();
}

async function signInWithGithub() {
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

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  toast("Signed out");
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
  if (add) return { type: "friend", code: add.trim() };
  if (join) return { type: "group", code: join.trim() };
  return null;
}

function clearDeepLinkFromUrl() {
  if (!location.search) return;
  const url = new URL(location.href);
  ["add", "friend", "f", "join", "group", "g"].forEach((k) => url.searchParams.delete(k));
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
    "Just Push",
    `Add ${name} on Just Push and compete — free push + 10 second mode:\n${url}`
  );
  if (result === "shared") toast("Invite sent");
  else if (result === "copied") toast("Invite link copied — paste in texts");
  else if (result === "failed") toast("Could not share — copy your code instead");
}

async function shareGroupInvite(code, groupName) {
  const url = groupInviteUrl(code);
  const result = await shareOrCopy(
    url,
    "Just Push group",
    `Join ${groupName || "our group"} on Just Push:\n${url}`
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
        <div class="person-score">${formatNum(f.highScore)}</div>
        <button type="button" class="icon-btn" data-remove-friend="${f.id}" title="Remove">✕</button>
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
      const rankClass = i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : "";
      const score = metric === "challengeBest" ? e.challengeBest : e.highScore;
      return `
      <li>
        <span class="rank-num${rankClass}">${i + 1}</span>
        <div class="person-info">
          <div class="name">${levelBadgeHtml(e.lifetimeCount, true)} ${escapeHtml(e.name)}${e.you ? '<span class="you-tag">You</span>' : ""}</div>
        </div>
        <div class="person-score">${formatNum(score)}</div>
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
          const rankClass = i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : "";
          const score = metric === "challengeBest" ? m.challengeBest : m.highScore;
          return `
          <li>
            <span class="rank-num${rankClass}">${i + 1}</span>
            <div class="person-info">
              <div class="name">${levelBadgeHtml(m.lifetimeCount, true)} ${escapeHtml(m.name)}${m.id === myId() ? '<span class="you-tag">You</span>' : ""}</div>
            </div>
            <div class="person-score">${formatNum(score)}</div>
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

async function loadGlobalBoard() {
  if (!sb || !online) {
    globalBoard = [];
    renderGlobalBoard();
    return;
  }
  const { data, error } = await sb
    .from("jp_profiles")
    .select("id, display_name, challenge_best, high_score, lifetime_count")
    .gt("challenge_best", 0)
    .order("challenge_best", { ascending: false })
    .limit(25);
  if (error) {
    console.warn(error);
    return;
  }
  globalBoard = data || [];
  renderGlobalBoard();
}

function renderGlobalBoard() {
  if (!globalBoard.length) {
    els.globalBoard.innerHTML = "";
    els.globalBoardEmpty.hidden = false;
    els.globalBoardEmpty.textContent = online ? "No 10s scores yet — be the first!" : "Go online to see the world board.";
    return;
  }
  els.globalBoardEmpty.hidden = true;
  els.globalBoard.innerHTML = globalBoard
    .map((e, i) => {
      const rankClass = i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : "";
      const you = e.id === myId();
      return `
      <li>
        <span class="rank-num${rankClass}">${i + 1}</span>
        <div class="person-info">
          <div class="name">${levelBadgeHtml(e.lifetime_count, true)} ${escapeHtml(e.display_name)}${you ? '<span class="you-tag">You</span>' : ""}</div>
        </div>
        <div class="person-score">${formatNum(e.challenge_best)}</div>
      </li>`;
    })
    .join("");
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
    scheduleSync();
    els.nameModal.close();
    toast(`Hey, ${name}!`);
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
    const btn = e.target.closest("[data-remove-friend]");
    if (!btn) return;
    removeFriend(btn.dataset.removeFriend);
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
}

// ——— Boot ———

async function init() {
  pendingDeepLink = parseDeepLink();
  applyTheme();
  renderProfile();
  renderScores();
  renderFriends();
  renderGroups();
  renderSwatches();
  renderGlobalBoard();
  setMode(state.mode === "challenge" ? "challenge" : "free");
  bindEvents();
  setTab(pendingDeepLink?.type === "group" ? "groups" : pendingDeepLink?.type === "friend" ? "friends" : "play");
  setOnlineUi();
  if (pendingDeepLink?.type === "friend") {
    showPendingBanner(`Invite detected — adding ${pendingDeepLink.code.toUpperCase()} when online…`);
  } else if (pendingDeepLink?.type === "group") {
    showPendingBanner(`Group invite detected — joining ${pendingDeepLink.code.toUpperCase()} when online…`);
  }
  ensureName();
  // timer ring geometry
  els.timerProgress.style.strokeDasharray = String(CIRCUMFERENCE);
  els.timerProgress.style.strokeDashoffset = "0";
  await initBackend();
  if (pendingDeepLink && online) await processPendingDeepLink();
}

init();
