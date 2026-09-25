/* ---------- Account settings (theme, reduce motion, …) ----------

   Kept as its own small module rather than folded into STORE (data.js):
   settings are a single row per account, not a collection keyed by id, so
   they don't fit the Map-based STORE shape the rest of the app uses.
   loadSettings()/resetSettingsState() are called from data.js's
   loadData()/clearAppData() to stay on the same session lifecycle as
   everything else. */

const DEFAULT_SETTINGS = { theme: "midnight", reduceMotion: false };
const SETTINGS_CACHE_KEY = "slate_settings_cache";

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

let currentSettings = { ...DEFAULT_SETTINGS };

const themeSwatchesEl = document.getElementById("theme-swatches");
const reduceMotionToggle = document.getElementById("reduce-motion-toggle");

function applyTheme(key) {
  document.documentElement.setAttribute("data-theme", THEME_META[key] ? key : "midnight");
}

function applyReduceMotion(on) {
  if (on) document.documentElement.setAttribute("data-reduce-motion", "true");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

function cacheSettings() {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(currentSettings));
  } catch {}
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
}

themeSwatchesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme-key]");
  if (btn) saveSetting("theme", btn.dataset.themeKey);
});

reduceMotionToggle.addEventListener("click", () => {
  saveSetting("reduceMotion", !currentSettings.reduceMotion);
});

// Optimistic: applies and renders immediately, persists after. A failed
// write is quiet (still applied locally, still cached) rather than
// snapping the toggle back — losing "reduce motion" for one save error
// isn't worth interrupting the user over.
async function saveSetting(key, value) {
  currentSettings = { ...currentSettings, [key]: value };
  if (key === "theme") applyTheme(value);
  if (key === "reduceMotion") applyReduceMotion(value);
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

async function loadSettings() {
  const { data, error } = await db.from("user_settings").select("settings").maybeSingle();
  if (error) {
    console.error("Settings load error:", error.message);
    currentSettings = { ...DEFAULT_SETTINGS };
  } else {
    currentSettings = { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) };
  }
  applyTheme(currentSettings.theme);
  applyReduceMotion(currentSettings.reduceMotion);
  cacheSettings();
  renderSettingsPage();
}

// Called from data.js's clearAppData() on logout. Deliberately doesn't
// revert the applied theme/motion — the cached (still on-screen) look stays
// until the next loadSettings() replaces it, so the auth screen and a
// same-account re-login don't flash back to the "midnight" default first.
function resetSettingsState() {
  currentSettings = { ...DEFAULT_SETTINGS };
}

renderSettingsPage();
