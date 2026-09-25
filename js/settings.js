/* ---------- Account settings (theme, reduce motion, …) ----------

   Kept as its own small module rather than folded into STORE (data.js):
   settings are a single row per account, not a collection keyed by id, so
   they don't fit the Map-based STORE shape the rest of the app uses.
   loadSettings()/resetSettingsState() are called from data.js's
   loadData()/clearAppData() to stay on the same session lifecycle as
   everything else. */

const DEFAULT_SETTINGS = { theme: "midnight", reduceMotion: false };
const SETTINGS_CACHE_KEY = "slate_settings_cache";

// Preview colors for the theme swatches — kept here rather than read from
// the live CSS variables so a swatch still shows its theme's look even
// before that theme is ever applied (you're picking one you're not on yet).
const THEME_META = {
  midnight: { label: "Midnight", bg: "#0d0c15", accent: "#a78bfa", paper: "#ece8f5" },
  paper: { label: "Paper", bg: "#f6f1e7", accent: "#c2703d", paper: "#fffdf8" },
  forest: { label: "Forest", bg: "#0c1712", accent: "#6fcf9b", paper: "#e9f3ec" },
  sunset: { label: "Sunset", bg: "#1c1015", accent: "#f0916a", paper: "#f7e9e2" },
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
      const meta = THEME_META[key];
      const active = key === currentSettings.theme;
      return `
        <button
          class="theme-swatch${active ? " is-active" : ""}"
          type="button"
          data-theme-key="${key}"
          aria-label="Use ${meta.label} theme"
          style="--swatch-accent:${meta.accent}"
        >
          <span class="theme-swatch-preview" style="--swatch-bg:${meta.bg};--swatch-paper:${meta.paper}">
            <span class="theme-swatch-dot"></span>
            <span class="theme-swatch-bar"></span>
            <span class="theme-swatch-check">✓</span>
          </span>
          <span class="theme-swatch-label">${meta.label}</span>
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
