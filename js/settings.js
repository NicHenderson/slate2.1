/* ---------- Account settings ----------

   Kept as its own small module rather than folded into STORE (data.js):
   settings are a single row per account, not a collection keyed by id, so
   they don't fit the Map-based STORE shape the rest of the app uses.
   loadSettings()/resetSettingsState() are called from data.js's
   loadData()/clearAppData() to stay on the same session lifecycle as
   everything else. */

const DEFAULT_SETTINGS = {
  theme: "midnight",
  reduceMotion: false,
  density: "comfortable",
  openTo: "dashboard",
  defaultSort: "recent",
  confirmDeletes: true,
};
const SETTINGS_CACHE_KEY = "slate_settings_cache";
const LAST_SECTION_KEY = "slate_last_section";

// Preview colors for the theme swatches — duplicated from css/base.css
// rather than read from the live CSS variables, since a swatch has to show
// a theme you're not on yet. Keep both in sync when adding a theme.
// Dark themes: paper = text, ink = bg (base.css derives them that way).
const THEME_META = {
  midnight: { label: "Midnight", mode: "Dark", bg: "#0d0c15", sidebar: "#120e1b", text: "#ece8f5", paper: "#ece8f5", ink: "#0d0c15", accent: "#a78bfa", strong: "#8b5cf6", deep: "#6d28d9", pop: "#2979ff" },
  ocean: { label: "Ocean", mode: "Dark", bg: "#07131c", sidebar: "#0a1822", text: "#e4f3f7", paper: "#e4f3f7", ink: "#07131c", accent: "#4fd1e0", strong: "#0b8a9c", deep: "#07606e", pop: "#e05a47" },
  forest: { label: "Forest", mode: "Dark", bg: "#0c1712", sidebar: "#0f1a14", text: "#e9f3ec", paper: "#e9f3ec", ink: "#0c1712", accent: "#6fcf9b", strong: "#2f9e68", deep: "#1f7a4e", pop: "#2f7fbf" },
  sunset: { label: "Sunset", mode: "Dark", bg: "#1c1015", sidebar: "#1f1218", text: "#f7e9e2", paper: "#f7e9e2", ink: "#1c1015", accent: "#f0916a", strong: "#d9623a", deep: "#b0441f", pop: "#7b4dd6" },
  arcade: { label: "Arcade", mode: "Dark", bg: "#110a24", sidebar: "#150c2b", text: "#f4ecff", paper: "#f4ecff", ink: "#110a24", accent: "#ff5fb0", strong: "#e0368e", deep: "#b01f6c", pop: "#2d6cff" },
  paper: { label: "Paper", mode: "Light", bg: "#f6f1e7", sidebar: "#efe6d4", text: "#2b2318", paper: "#fffdf8", ink: "#2b2318", accent: "#c2703d", strong: "#b35f2c", deep: "#8f4620", pop: "#3f7d6e" },
  blossom: { label: "Blossom", mode: "Light", bg: "#fbf0f2", sidebar: "#f5dfe4", text: "#3a1f29", paper: "#fffafb", ink: "#3a1f29", accent: "#d6457a", strong: "#c2356a", deep: "#93224d", pop: "#4f8a66" },
  glacier: { label: "Glacier", mode: "Light", bg: "#eef3f8", sidebar: "#e3ebf3", text: "#16233a", paper: "#ffffff", ink: "#16233a", accent: "#2f6fd6", strong: "#2459b8", deep: "#1a3f85", pop: "#c9542f" },
};

// The sections "Open to" can land on (and "last page viewed" can remember):
// the sidebar's own destinations, minus Settings itself.
const START_SECTIONS = ["dashboard", "movies-watched", "shows-watched", "movies-towatch", "shows-towatch", "collections"];

// Every setting with a fixed set of values. Anything else — a stale cache,
// a hand-edited row — falls back to the default; several of these end up
// inside DOM selectors, so they must never be arbitrary strings.
const SETTING_CHOICES = {
  theme: Object.keys(THEME_META),
  density: ["comfortable", "compact"],
  openTo: ["last", ...START_SECTIONS],
  defaultSort: ["recent", "oldest", "alpha-asc", "alpha-desc"],
};

// Keeps only settings that still exist, so a retired one saved in an older
// row is dropped from the account on its next save.
function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const s = {};
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    s[key] = key in src ? src[key] : DEFAULT_SETTINGS[key];
  });
  Object.entries(SETTING_CHOICES).forEach(([key, allowed]) => {
    if (!allowed.includes(s[key])) s[key] = DEFAULT_SETTINGS[key];
  });
  s.reduceMotion = s.reduceMotion === true;
  s.confirmDeletes = s.confirmDeletes !== false;
  return s;
}

function readCachedSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

// Starts from the cache so data.js (loaded right after this file) sorts its
// grids by the saved default on the very first render.
let currentSettings = normalizeSettings(readCachedSettings());

// Set by any real click or key press in the app. "Open to" only acts
// before that — settings arriving from Supabase a moment after login must
// never yank someone off a page they already went to themselves.
let userInteracted = false;

const appRootEl = document.getElementById("app");
const themeSwatchesEl = document.getElementById("theme-swatches");
const reduceMotionToggle = document.getElementById("reduce-motion-toggle");
const densityControl = document.getElementById("density-control");
const openToSelect = document.getElementById("setting-open-to");
const defaultSortSelect = document.getElementById("setting-default-sort");
const confirmDeletesToggle = document.getElementById("confirm-deletes-toggle");

/* ---------- applying settings ---------- */

function applyTheme(key) {
  document.documentElement.setAttribute("data-theme", key);
}

function applyReduceMotion(on) {
  if (on) document.documentElement.setAttribute("data-reduce-motion", "true");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

function applyDensity(density) {
  const root = document.documentElement;
  const was = root.getAttribute("data-density") ?? "comfortable";
  if (density === "compact") root.setAttribute("data-density", "compact");
  else root.removeAttribute("data-density");
  // Card size changes how many columns fit, which every paginated grid
  // measured once and kept (see gridPageState in data.js).
  if (was !== density && typeof remeasureAllGrids === "function") remeasureAllGrids();
}

// Grids whose sort was never picked by hand (no per-grid key saved by
// sortMenu.js) follow the default. A sort chosen in a list's own menu
// always wins over it.
function applyDefaultSort() {
  if (typeof GRID_SORTS === "undefined") return;
  Object.entries(GRID_SORTS).forEach(([gridId, cfg]) => {
    let pickedByHand = null;
    try {
      pickedByHand = localStorage.getItem(cfg.storageKey);
    } catch {}
    if (cfg.options[pickedByHand]) return;
    const key = cfg.options[currentSettings.defaultSort] ? currentSettings.defaultSort : "recent";
    if (activeSorts[gridId] === key) return;
    activeSorts[gridId] = key;
    if (gridPageState[gridId]) gridPageState[gridId].page = 1;
    const grid = document.getElementById(gridId);
    // Still showing "Loading…": loadData() renders it with the new sort.
    if (grid && !grid.querySelector(".loading")) {
      renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
    }
    // The three Shows subtabs share one "Sorted by" label — only the
    // visible one may write to it.
    if (grid && !grid.classList.contains("subtab-hidden")) updateSortLabel(gridId);
  });
}

function applyStartSection() {
  if (userInteracted) return;
  let target = currentSettings.openTo;
  if (target === "last") {
    let last = null;
    try {
      last = localStorage.getItem(LAST_SECTION_KEY);
    } catch {}
    target = START_SECTIONS.includes(last) ? last : "dashboard";
  }
  if (document.getElementById(target)?.classList.contains("active")) return;
  document.querySelector(`.nav-btn[data-section="${target}"]`)?.click();
}

function applySettings() {
  applyTheme(currentSettings.theme);
  applyReduceMotion(currentSettings.reduceMotion);
  applyDensity(currentSettings.density);
  applyDefaultSort();
  applyStartSection();
  renderSettingsPage();
}

function cacheSettings() {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(currentSettings));
  } catch {}
}

/* ---------- the Settings page ---------- */

function renderSettingsPage() {
  themeSwatchesEl.innerHTML = Object.keys(THEME_META)
    .map((key) => {
      const m = THEME_META[key];
      const active = key === currentSettings.theme;
      // A miniature Slate screen (sidebar tickets, section tag, a paper
      // card with its primary button) drawn in that theme's own colors.
      return `
        <button
          class="theme-swatch${active ? " is-active" : ""}"
          type="button"
          data-theme-key="${key}"
          aria-label="Use ${m.label} theme"
          aria-pressed="${active}"
          style="--sw-bg:${m.bg};--sw-sidebar:${m.sidebar};--sw-text:${m.text};--sw-paper:${m.paper};--sw-ink:${m.ink};--sw-accent:${m.accent};--sw-strong:${m.strong};--sw-deep:${m.deep};--sw-pop:${m.pop}"
        >
          <span class="theme-swatch-preview" aria-hidden="true">
            <span class="tsp-sidebar">
              <span class="tsp-tag"></span>
              <span class="tsp-nav"></span>
              <span class="tsp-nav is-active"></span>
              <span class="tsp-nav"></span>
            </span>
            <span class="tsp-main">
              <span class="tsp-sub"></span>
              <span class="tsp-title"></span>
              <span class="tsp-card">
                <span class="tsp-line"></span>
                <span class="tsp-line is-short"></span>
                <span class="tsp-btn"></span>
              </span>
            </span>
            <span class="theme-swatch-check">✓</span>
          </span>
          <span class="theme-swatch-meta">
            <span class="theme-swatch-label">${m.label}</span>
            <span class="theme-swatch-mode">${m.mode}</span>
          </span>
        </button>`;
    })
    .join("");

  reduceMotionToggle.classList.toggle("is-on", currentSettings.reduceMotion);
  reduceMotionToggle.setAttribute("aria-pressed", String(currentSettings.reduceMotion));

  densityControl.querySelectorAll("[data-density-value]").forEach((btn) => {
    const on = btn.dataset.densityValue === currentSettings.density;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });

  openToSelect.value = currentSettings.openTo;
  defaultSortSelect.value = currentSettings.defaultSort;
  confirmDeletesToggle.classList.toggle("is-on", currentSettings.confirmDeletes);
  confirmDeletesToggle.setAttribute("aria-pressed", String(currentSettings.confirmDeletes));
}

themeSwatchesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme-key]");
  if (btn) saveSetting("theme", btn.dataset.themeKey);
});

reduceMotionToggle.addEventListener("click", () => {
  saveSetting("reduceMotion", !currentSettings.reduceMotion);
});

densityControl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-density-value]");
  if (btn) saveSetting("density", btn.dataset.densityValue);
});

openToSelect.addEventListener("change", () => saveSetting("openTo", openToSelect.value));
defaultSortSelect.addEventListener("change", () => saveSetting("defaultSort", defaultSortSelect.value));
confirmDeletesToggle.addEventListener("click", () => {
  saveSetting("confirmDeletes", !currentSettings.confirmDeletes);
});

/* ---------- session wiring ---------- */

["pointerdown", "keydown"].forEach((type) =>
  appRootEl.addEventListener(
    type,
    (e) => {
      if (e.isTrusted) userInteracted = true;
    },
    true
  )
);

// Remembered per device, for "Open to: Last page you viewed". Only real
// clicks count — applyStartSection's own programmatic click isn't a visit.
document.querySelectorAll(".nav-btn").forEach((btn) =>
  btn.addEventListener("click", (e) => {
    if (!e.isTrusted || !START_SECTIONS.includes(btn.dataset.section)) return;
    try {
      localStorage.setItem(LAST_SECTION_KEY, btn.dataset.section);
    } catch {}
  })
);

// Optimistic: applies and renders immediately, persists after. A failed
// write is quiet (still applied locally, still cached) rather than
// snapping the control back — the toast says it didn't reach the account.
async function saveSetting(key, value) {
  currentSettings = normalizeSettings({ ...currentSettings, [key]: value });
  if (key === "theme") applyTheme(currentSettings.theme);
  if (key === "reduceMotion") applyReduceMotion(currentSettings.reduceMotion);
  if (key === "density") applyDensity(currentSettings.density);
  if (key === "defaultSort") applyDefaultSort();
  cacheSettings();
  renderSettingsPage();

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError) {
    console.error("Settings save error:", userError.message);
    return;
  }
  const { error } = await db.from("user_settings").upsert({
    user_id: userData.user.id,
    settings: currentSettings,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Settings save error:", error.message);
    showToast("Could not save settings — try again.", true);
  }
}

// Two passes: the cached settings right away (so "Open to" and the rest
// apply without waiting on the network), then the account's real ones.
async function loadSettings() {
  currentSettings = normalizeSettings(readCachedSettings());
  applySettings();

  const { data, error } = await db.from("user_settings").select("settings").maybeSingle();
  if (error) {
    console.error("Settings load error:", error.message);
    return; // keep the cached settings rather than resetting to defaults
  }
  currentSettings = normalizeSettings(data?.settings);
  cacheSettings();
  applySettings();
}

// Called from data.js's clearAppData() on logout. Deliberately doesn't
// revert the applied theme/motion/density — the cached (still on-screen)
// look stays until the next loadSettings() replaces it, so the auth screen
// and a same-account re-login don't flash back to the defaults first.
function resetSettingsState() {
  currentSettings = { ...DEFAULT_SETTINGS };
  userInteracted = false;
}

renderSettingsPage();
