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
  background: "dots",
  openTo: "last",
  defaultSort: "recent",
  confirmDeletes: true,
  watchRegion: "", // "" = the browser's country (js/whereToWatch.js)
};
const SETTINGS_CACHE_KEY = "slate_settings_cache";
const LAST_SECTION_KEY = "slate_last_section";

// Preview colors for the theme swatches — duplicated from css/base.css
// rather than read from the live CSS variables, since a swatch has to show
// a theme you're not on yet. Keep both in sync when adding a theme.
// Dark themes: paper = text, ink = bg (base.css derives them that way).
const THEME_META = {
  midnight: { label: t("Midnight"), mode: t("Dark"), bg: "#0d0c15", sidebar: "#120e1b", text: "#ece8f5", paper: "#ece8f5", ink: "#0d0c15", accent: "#a78bfa", strong: "#8b5cf6", deep: "#6d28d9", pop: "#2979ff" },
  ocean: { label: t("Ocean"), mode: t("Dark"), bg: "#07131c", sidebar: "#0a1822", text: "#e4f3f7", paper: "#e4f3f7", ink: "#07131c", accent: "#4fd1e0", strong: "#0b8a9c", deep: "#07606e", pop: "#e05a47" },
  forest: { label: t("Forest"), mode: t("Dark"), bg: "#0c1712", sidebar: "#0f1a14", text: "#e9f3ec", paper: "#e9f3ec", ink: "#0c1712", accent: "#6fcf9b", strong: "#2f9e68", deep: "#1f7a4e", pop: "#2f7fbf" },
  sunset: { label: t("Sunset"), mode: t("Dark"), bg: "#1c1015", sidebar: "#1f1218", text: "#f7e9e2", paper: "#f7e9e2", ink: "#1c1015", accent: "#f0916a", strong: "#d9623a", deep: "#b0441f", pop: "#7b4dd6" },
  arcade: { label: t("Arcade"), mode: t("Dark"), bg: "#110a24", sidebar: "#150c2b", text: "#f4ecff", paper: "#f4ecff", ink: "#110a24", accent: "#ff5fb0", strong: "#e0368e", deep: "#b01f6c", pop: "#2d6cff" },
  graphite: { label: t("Graphite"), mode: t("Dark"), bg: "#111214", sidebar: "#141517", text: "#eceef1", paper: "#eceef1", ink: "#111214", accent: "#c8ccd4", strong: "#555b66", deep: "#3a3f48", pop: "#b86e12" },
  gala: { label: t("Gala"), mode: t("Dark"), bg: "#0e0c08", sidebar: "#120f0a", text: "#f5efe0", paper: "#f5efe0", ink: "#0e0c08", accent: "#e3bf5c", strong: "#8c6a14", deep: "#6b500c", pop: "#c2413b" },
  wine: { label: t("Wine"), mode: t("Dark"), bg: "#150a0d", sidebar: "#190c10", text: "#f6e8ec", paper: "#f6e8ec", ink: "#150a0d", accent: "#e8738f", strong: "#a3294a", deep: "#751a33", pop: "#9c6f1c" },
  paper: { label: t("Paper"), mode: t("Light"), bg: "#f6f1e7", sidebar: "#efe6d4", text: "#2b2318", paper: "#fffdf8", ink: "#2b2318", accent: "#c2703d", strong: "#b35f2c", deep: "#8f4620", pop: "#3f7d6e" },
  blossom: { label: t("Blossom"), mode: t("Light"), bg: "#fbf0f2", sidebar: "#f5dfe4", text: "#3a1f29", paper: "#fffafb", ink: "#3a1f29", accent: "#d6457a", strong: "#c2356a", deep: "#93224d", pop: "#4f8a66" },
  glacier: { label: t("Glacier"), mode: t("Light"), bg: "#eef3f8", sidebar: "#e3ebf3", text: "#16233a", paper: "#ffffff", ink: "#16233a", accent: "#2f6fd6", strong: "#2459b8", deep: "#1a3f85", pop: "#c9542f" },
  lavender: { label: t("Lavender"), mode: t("Light"), bg: "#f3f0fa", sidebar: "#e8e1f5", text: "#221a3a", paper: "#ffffff", ink: "#221a3a", accent: "#7c5ce0", strong: "#6a45d6", deep: "#4b2aa8", pop: "#c2406f" },
  peach: { label: t("Peach"), mode: t("Light"), bg: "#fdf1ea", sidebar: "#f7dfd2", text: "#3a1e14", paper: "#fffbf8", ink: "#3a1e14", accent: "#d85a38", strong: "#bf4424", deep: "#8e2f16", pop: "#2f6f94" },
  chalk: { label: t("Chalk"), mode: t("Light"), bg: "#f2f2f0", sidebar: "#e6e6e3", text: "#1c1c1f", paper: "#ffffff", ink: "#1c1c1f", accent: "#6a6a70", strong: "#2f2f33", deep: "#1c1c1f", pop: "#c73b3b" },
  sun: { label: t("Sun"), mode: t("Light"), bg: "#fbf6e2", sidebar: "#f3eac5", text: "#2e2508", paper: "#fffdf5", ink: "#2e2508", accent: "#a87800", strong: "#8a6300", deep: "#614500", pop: "#2f63c4" },
};

// The sections "Open to" can land on (and "last page viewed" can remember):
// the sidebar's own destinations, minus Settings itself.
const START_SECTIONS = ["movies-watched", "shows-watched", "movies-towatch", "shows-towatch", "collections"];

// Every setting with a fixed set of values. Anything else — a stale cache,
// a hand-edited row — falls back to the default; several of these end up
// inside DOM selectors, so they must never be arbitrary strings.
const SETTING_CHOICES = {
  theme: Object.keys(THEME_META),
  density: ["comfortable", "compact"],
  background: BACKGROUNDS,
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
  // A country code, as TMDB keys them ("CL"), or "" for automatic.
  if (typeof s.watchRegion !== "string" || !/^([A-Z]{2})?$/.test(s.watchRegion)) s.watchRegion = "";
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
const backgroundSwatchesEl = document.getElementById("background-swatches");
const openToSelect = document.getElementById("setting-open-to");
const defaultSortSelect = document.getElementById("setting-default-sort");
const confirmDeletesToggle = document.getElementById("confirm-deletes-toggle");

/* ---------- applying settings ---------- */

function applyTheme(key) {
  document.documentElement.setAttribute("data-theme", key);
  syncStatusBar();
}

function applyReduceMotion(on) {
  if (on) document.documentElement.setAttribute("data-reduce-motion", "true");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

function applyDensity(density) {
  if (density === "compact") document.documentElement.setAttribute("data-density", "compact");
  else document.documentElement.removeAttribute("data-density");
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
    const grid = document.getElementById(gridId);
    // Still showing "Loading…": loadData() renders it with the new sort.
    if (grid && !grid.querySelector(".loading")) {
      renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
    }
    // The three Shows Queue subtabs share one "Sorted by" label — only the
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
    target = START_SECTIONS.includes(last) ? last : "movies-watched";
  }
  if (document.getElementById(target)?.classList.contains("active")) return;
  document.querySelector(`.nav-btn[data-section="${target}"]`)?.click();
}

function applySettings() {
  applyTheme(currentSettings.theme);
  applyReduceMotion(currentSettings.reduceMotion);
  applyDensity(currentSettings.density);
  applyBackground(currentSettings.background, currentSettings.theme);
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

// Each swatch shows its texture on the current theme's page color. The
// noise ones are drawn only once Appearance is open: drawing all three
// costs a moment nobody should wait for at startup.
function renderBackgroundSwatches() {
  backgroundSwatchesEl.innerHTML = BACKGROUNDS.map((key) => {
    const active = key === currentSettings.background;
    return `
      <button
        class="background-swatch${active ? " is-active" : ""}"
        type="button"
        data-background-key="${key}"
        aria-pressed="${active}"
      >
        <span class="background-swatch-preview" data-texture="${key}" aria-hidden="true">
          <span class="theme-swatch-check">✓</span>
        </span>
        <span class="background-swatch-label">${BACKGROUND_LABELS[key]}</span>
      </button>`;
  }).join("");
  if (backgroundSwatchesEl.closest(".settings-page")?.hidden) return;
  backgroundSwatchesEl.querySelectorAll("[data-texture]").forEach((el) => {
    paintNoiseTexture(el, el.dataset.texture, currentSettings.theme);
  });
}

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
          aria-label="${t("Use {theme} theme", { theme: m.label })}"
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

  renderBackgroundSwatches();

  densityControl.querySelectorAll("[data-density-value]").forEach((btn) => {
    const on = btn.dataset.densityValue === currentSettings.density;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });

  openToSelect.value = currentSettings.openTo;
  defaultSortSelect.value = currentSettings.defaultSort;
  confirmDeletesToggle.classList.toggle("is-on", currentSettings.confirmDeletes);
  confirmDeletesToggle.setAttribute("aria-pressed", String(currentSettings.confirmDeletes));
  if (typeof renderWatchRegionOptions === "function") renderWatchRegionOptions();
}

themeSwatchesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme-key]");
  if (btn) saveSetting("theme", btn.dataset.themeKey);
});

reduceMotionToggle.addEventListener("click", () => {
  saveSetting("reduceMotion", !currentSettings.reduceMotion);
});

backgroundSwatchesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-background-key]");
  if (btn) saveSetting("background", btn.dataset.backgroundKey);
});

/* ---------- "Can't quite see it?": a loupe over the swatches ----------

   A small window with one texture at twice its size, on the theme's own
   color, with a paper card on it for scale. It opens on the one in use;
   its chips flip between textures without saving, and "Use this one"
   saves. It grows out of its button and zooms into the texture as it
   opens (none of it with Reduce animations). */

const loupeEl = document.getElementById("bg-loupe");
const loupeOpenBtn = document.getElementById("bg-loupe-open");
const loupeTextureEl = document.getElementById("bg-loupe-texture");
const loupeChipsEl = document.getElementById("bg-loupe-chips");
const loupeUseBtn = document.getElementById("bg-loupe-use");
let loupeKey = null;

// A spring that overshoots a touch and settles, where the browser can
// ease that way; a plain overshooting curve where it can't.
const LOUPE_SPRING = CSS.supports("transition-timing-function", "linear(0, 1)")
  ? "linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)"
  : "cubic-bezier(0.2, 1.3, 0.4, 1)";

const loupeCalm = () =>
  document.documentElement.dataset.reduceMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loupeAnimate(el, frames, options) {
  if (loupeCalm() || typeof el.animate !== "function") return null;
  return el.animate(frames, { fill: "backwards", ...options });
}

function showLoupeTexture(key, animate) {
  loupeKey = key;
  loupeTextureEl.dataset.texture = key;
  paintNoiseTexture(loupeTextureEl, key, currentSettings.theme);
  loupeChipsEl.innerHTML = BACKGROUNDS.map(
    (k) => `<button type="button" class="bg-loupe-chip" data-loupe-key="${k}" aria-pressed="${k === key}">${BACKGROUND_LABELS[k]}</button>`
  ).join("");
  const inUse = key === currentSettings.background;
  loupeUseBtn.disabled = inUse;
  loupeUseBtn.textContent = inUse ? t("In use") : t("Use this one");
  if (animate) {
    loupeAnimate(loupeTextureEl, [{ opacity: 0.2, transform: "scale(2.3)" }, { opacity: 1, transform: "scale(2)" }], { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
}

function openLoupe() {
  // Hangs just under its button, which sits wherever the hint wrapped to.
  loupeEl.style.top = `${loupeOpenBtn.offsetTop + loupeOpenBtn.offsetHeight + 10}px`;
  loupeEl.hidden = false;
  loupeOpenBtn.setAttribute("aria-expanded", "true");
  showLoupeTexture(currentSettings.background, false);
  loupeAnimate(loupeEl, [{ transform: "translateY(-10px) scale(0.82)" }, { transform: "none" }], { duration: 620, easing: LOUPE_SPRING });
  loupeAnimate(loupeEl, [{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 220, easing: "ease-out" });
  loupeAnimate(loupeTextureEl, [{ transform: "scale(1)" }, { transform: "scale(2)" }], { duration: 760, delay: 90, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  loupeAnimate(loupeEl.querySelector(".bg-loupe-card"), [{ opacity: 0, transform: "translateY(-18px) rotate(-14deg)" }, { opacity: 1, transform: "rotate(-4deg)" }], { duration: 640, delay: 220, easing: LOUPE_SPRING });
  loupeChipsEl.querySelectorAll(".bg-loupe-chip").forEach((chip, i) => {
    loupeAnimate(chip, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 140 + i * 28, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  });
  loupeEl.querySelector(".bg-loupe-close").focus({ preventScroll: true });
  // It hangs over whatever is below, maybe past the bottom of the screen.
  loupeEl.scrollIntoView({ block: "nearest", behavior: loupeCalm() ? "auto" : "smooth" });
}

function closeLoupe({ animate = true, refocus = false } = {}) {
  if (loupeEl.hidden) return;
  loupeOpenBtn.setAttribute("aria-expanded", "false");
  const done = () => {
    // Opened again while closing: that one wins.
    if (loupeOpenBtn.getAttribute("aria-expanded") === "true") return;
    loupeEl.hidden = true;
  };
  const out = animate
    ? loupeAnimate(loupeEl, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px) scale(0.92)", filter: "blur(4px)" }], { duration: 170, easing: "ease-in", fill: "forwards" })
    : null;
  if (out) {
    out.onfinish = () => {
      done();
      out.cancel();
    };
  } else done();
  if (refocus) loupeOpenBtn.focus({ preventScroll: true });
}

loupeOpenBtn.addEventListener("click", () => {
  if (loupeEl.hidden || loupeOpenBtn.getAttribute("aria-expanded") === "false") openLoupe();
  else closeLoupe();
});
document.getElementById("bg-loupe-close").addEventListener("click", () => closeLoupe({ refocus: true }));
loupeChipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-loupe-key]");
  if (chip && chip.dataset.loupeKey !== loupeKey) showLoupeTexture(chip.dataset.loupeKey, true);
});
loupeUseBtn.addEventListener("click", () => {
  saveSetting("background", loupeKey);
  showLoupeTexture(loupeKey, false);
});
// On the document: "Use this one" goes disabled once used, and a disabled
// button drops the focus out of the loupe.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !loupeEl.hidden && loupeOpenBtn.getAttribute("aria-expanded") === "true") {
    closeLoupe({ refocus: true });
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!loupeEl.hidden && !loupeEl.contains(e.target) && !loupeOpenBtn.contains(e.target)) closeLoupe();
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
  // Noise textures are drawn in the theme's colors, so a new theme redraws them.
  if (key === "theme" || key === "background") applyBackground(currentSettings.background, currentSettings.theme);
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
    showToast(t("Could not save settings — try again."), true);
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

/* ---------- The menu and its pages ----------

   One page at a time beside the menu. Where there's no room for both
   (css/settings.css: .at-menu), the menu comes first, a page takes its
   place, and "← Settings" goes back. Coming to Settings from the sidebar
   starts at the menu there; beside it, the page last opened stays. */

const settingsLayout = document.getElementById("settings-c");

function showSettingsPage(name) {
  settingsLayout.querySelectorAll(".settings-page").forEach((page) => {
    page.hidden = page.dataset.page !== name;
  });
  settingsLayout.querySelectorAll("[data-settings-page]").forEach((item) => {
    if (item.dataset.settingsPage === name) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  settingsLayout.classList.remove("at-menu");
  closeLoupe({ animate: false });
  if (name === "look") renderBackgroundSwatches();
}

settingsLayout.querySelector(".settings-menu").addEventListener("click", (e) => {
  const item = e.target.closest("[data-settings-page]");
  if (!item) return;
  showSettingsPage(item.dataset.settingsPage);
  // One at a time: the page opens from its top, as a new screen would.
  if (getComputedStyle(document.getElementById("settings-back")).display !== "none") {
    document.querySelector(".content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }
});

document.getElementById("settings-back").addEventListener("click", () => {
  const current = settingsLayout.querySelector('[data-settings-page][aria-current="page"]');
  settingsLayout.classList.add("at-menu");
  current?.focus();
});

document.querySelector('.nav-btn[data-section="settings"]').addEventListener("click", () => {
  settingsLayout.classList.add("at-menu");
});

// Log out, from Account too: on a phone, with no sidebar at hand, it's here.
document.getElementById("settings-logout-btn").addEventListener("click", () => {
  document.getElementById("logout-btn").click();
});
