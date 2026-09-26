/* ---------- Landing page interactions ----------

   The page reads fine without any of this (routing between it, the login
   card and the app lives in js/auth.js). Loaded after settings.js
   (THEME_META) and collections.js (rollSurprise), which it borrows from. */

const landingEl = document.getElementById("landing-screen");

function lpReduceMotion() {
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-reduce-motion") === "true"
  );
}

landingEl.classList.add("lp-js"); // opts the .reveal elements into their entrance
document.getElementById("lp-year").textContent = String(new Date().getFullYear());

/* ---------- in-page links ----------
   Scroll without touching the URL hash: #login / #signup are auth.js's
   routes, and a section anchor in the address bar is just noise. */

landingEl.addEventListener("click", (e) => {
  const link = e.target.closest("[data-lp-scroll]");
  if (!link) return;
  const target = document.querySelector(link.getAttribute("href"));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: lpReduceMotion() ? "auto" : "smooth", block: "start" });
});

/* ---------- nav gets a backdrop once the page moves ---------- */

const lpNav = document.getElementById("lp-nav");

function syncNavBackdrop() {
  lpNav.classList.toggle("is-scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", syncNavBackdrop, { passive: true });
syncNavBackdrop();

/* ---------- count-up numbers (the stats mockup) ---------- */

function countUp(root) {
  if (lpReduceMotion()) return; // the markup already holds the final values
  root.querySelectorAll("[data-lp-count]").forEach((el) => {
    const end = parseFloat(el.dataset.lpCount);
    const decimals = Number(el.dataset.lpDecimals || 0);
    const start = performance.now();
    const duration = 1300;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = (end * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------- scroll reveal ---------- */

// Siblings in a grid come in one after another rather than all at once.
landingEl.querySelectorAll(".lp-steps, .lp-things, .lp-faq").forEach((group) => {
  [...group.children].forEach((child, i) => {
    child.style.transitionDelay = `${i * 70}ms`;
  });
});

const revealEls = landingEl.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealer.unobserve(entry.target);
        countUp(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => revealer.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-in"));
}

/* ---------- Surprise Me, for real ---------- */

const lpSurpriseBtn = document.getElementById("lp-surprise");
const lpSurpriseGrid = document.getElementById("lp-surprise-grid");

lpSurpriseBtn.addEventListener("click", () => {
  if (typeof rollSurprise !== "function") return;
  const cards = [...lpSurpriseGrid.querySelectorAll(".card")];
  const current = lpSurpriseGrid.querySelector(".card.is-picked");
  // Never the same one twice in a row — this is a demo, it should visibly move.
  const pool = cards.filter((card) => card !== current);
  rollSurprise(lpSurpriseBtn, pool, (card) => {
    lpSurpriseGrid.querySelectorAll(".lp-pick-tag").forEach((tag) => tag.remove());
    cards.forEach((c) => c.classList.remove("is-picked", "is-lifted"));
    card.classList.add("is-picked");
    card.insertAdjacentHTML("afterbegin", `<span class="lp-pick-tag">Tonight's pick!</span>`);
  });
});

/* ---------- Shows Queue tabs ---------- */

const lpTabs = [...landingEl.querySelectorAll("[data-lp-tab]")];

function selectLpTab(tab) {
  lpTabs.forEach((t) => {
    const on = t === tab;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  landingEl.querySelectorAll("[data-lp-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.lpPanel !== tab.dataset.lpTab;
  });
}

lpTabs.forEach((tab, i) => {
  tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
  tab.addEventListener("click", () => selectLpTab(tab));
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = lpTabs[(i + (e.key === "ArrowRight" ? 1 : -1) + lpTabs.length) % lpTabs.length];
    next.focus();
    selectLpTab(next);
  });
});

/* ---------- live theme picker ----------
   Paints the miniature Slate from THEME_META (the same colors Settings
   uses), cycling through the themes on its own while it's on screen until
   someone picks one. */

const lpDemo = document.getElementById("lp-theme-demo");
const lpChips = document.getElementById("lp-theme-chips");
const LP_THEME_KEYS = typeof THEME_META === "object" ? Object.keys(THEME_META) : [];
let lpThemeIndex = 0;
let lpThemeTimer = null;
let lpThemeTouched = false;

function applyDemoTheme(key) {
  const m = THEME_META[key];
  const tokens = {
    bg: m.bg,
    sidebar: m.sidebar,
    text: m.text,
    paper: m.paper,
    ink: m.ink,
    accent: m.accent,
    strong: m.strong,
    deep: m.deep,
    pop: m.pop,
  };
  Object.entries(tokens).forEach(([name, value]) => lpDemo.style.setProperty(`--t-${name}`, value));
  lpThemeIndex = LP_THEME_KEYS.indexOf(key);
  lpChips.querySelectorAll("[data-lp-theme]").forEach((chip) => {
    const on = chip.dataset.lpTheme === key;
    chip.setAttribute("aria-checked", String(on));
    chip.tabIndex = on ? 0 : -1;
  });
}

function stopThemeCycle() {
  clearInterval(lpThemeTimer);
  lpThemeTimer = null;
}

function startThemeCycle() {
  if (lpThemeTimer || lpThemeTouched || lpReduceMotion()) return;
  lpThemeTimer = setInterval(() => {
    applyDemoTheme(LP_THEME_KEYS[(lpThemeIndex + 1) % LP_THEME_KEYS.length]);
  }, 2600);
}

if (LP_THEME_KEYS.length) {
  lpChips.innerHTML = LP_THEME_KEYS.map((key, i) => {
    const m = THEME_META[key];
    return `
      <button class="lp-chip" type="button" role="radio" aria-checked="false" data-lp-theme="${key}"
        style="--c-bg:${m.bg};--c-accent:${m.accent};--chip-tilt:${i % 2 ? 1 : -1}deg">
        <span class="lp-chip-dot" aria-hidden="true"></span>${m.label}
      </button>`;
  }).join("");
  applyDemoTheme(LP_THEME_KEYS[0]);

  const pick = (key) => {
    lpThemeTouched = true;
    stopThemeCycle();
    applyDemoTheme(key);
  };

  lpChips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-lp-theme]");
    if (chip) pick(chip.dataset.lpTheme);
  });

  // Arrow keys move through the radio group, as a native one would.
  lpChips.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const key = LP_THEME_KEYS[(lpThemeIndex + step + LP_THEME_KEYS.length) % LP_THEME_KEYS.length];
    pick(key);
    lpChips.querySelector(`[data-lp-theme="${key}"]`).focus();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? startThemeCycle() : stopThemeCycle()),
      { threshold: 0.4 }
    ).observe(lpDemo);
  }
}
