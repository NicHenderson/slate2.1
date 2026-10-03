/* ---------- The phone's status bar ----------

   Installed on a phone's home screen (manifest.webmanifest), Slate runs
   full screen, and the status bar (the clock, the battery) sits over the
   top of the page. This keeps that bar in step with the screen shown:

   - theme-color is the screen's own background: Android paints the bar
     with it, and browsers that tint their toolbar use it too;
   - on an iPhone, a dark background lets the page run under the bar
     ("black-translucent", white text). iOS can't put dark text over the
     page, so a light theme gets iOS's own bar ("default", dark text).
     iOS may only read this when the app opens: a theme picked meanwhile
     can need the app closed and opened again.

   Loaded in <head>, after the stylesheets, so the first paint already has
   it; after that, on every change of screen (swapView, js/viewTransitions.js)
   and of theme (applyTheme, js/settings.js). */

function currentScreenBackground() {
  const app = document.getElementById("app");
  // The landing page and the login card wear the brand's colors
  // (.brand-theme); the app, the account's theme. Before the body is
  // parsed there's only the theme cached from the last visit.
  const screen = app && app.classList.contains("hidden") ? document.getElementById("landing-screen") : null;
  return getComputedStyle(screen || document.documentElement).getPropertyValue("--bg").trim();
}

// Any CSS color → "#rrggbb", through a canvas (it normalizes what it's given).
function hexColor(color) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : null;
}

function isLightColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

function syncStatusBar() {
  const bg = hexColor(currentScreenBackground());
  if (!bg) return;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", isLightColor(bg) ? "default" : "black-translucent");
}

syncStatusBar();
