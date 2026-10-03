/* ---------- Landing page interactions ----------

   The page reads fine without any of this (routing between it, the login
   card and the app lives in js/auth.js). */

const landingEl = document.getElementById("landing-screen");

function lpReduceMotion() {
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-reduce-motion") === "true"
  );
}

// The size at which the page turns into stories (responsive.css): a
// phone held upright, or a computer window made that narrow.
const phoneStories = matchMedia("(max-width: 640px)");

landingEl.classList.add("lp-js"); // opts the .reveal elements into their entrance
document.getElementById("lp-year").textContent = String(new Date().getFullYear());

/* ---------- in-page links ----------
   Scroll without touching the URL hash: #login / #request-access are auth.js's
   routes, and a section anchor in the address bar is just noise. */

landingEl.addEventListener("click", (e) => {
  const link = e.target.closest("[data-lp-scroll]");
  if (!link) return;
  const target = document.querySelector(link.getAttribute("href"));
  if (!target) return;
  e.preventDefault();
  // On a phone the target is a screen of its own (stories, below).
  if (phoneStories.matches && target.dataset.story) {
    showStory(Number(target.dataset.story));
    return;
  }
  target.scrollIntoView({ behavior: lpReduceMotion() ? "auto" : "smooth", block: "start" });
});

/* ---------- nav gets a backdrop once the page moves ---------- */

const lpNav = document.getElementById("lp-nav");
const lpStories = document.getElementById("lp-stories");

function syncNavBackdrop() {
  lpNav.classList.toggle("is-scrolled", window.scrollY > 8);
  lpStories.classList.toggle("is-scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", syncNavBackdrop, { passive: true });
syncNavBackdrop();

/* ---------- decimals ---------- */

// The hero board's own, as the language writes them ("8,1").
landingEl.querySelectorAll("[data-lp-decimal]").forEach((el) => {
  el.textContent = formatDecimal(parseFloat(el.textContent));
});

/* ---------- scroll reveal ---------- */

// Siblings in a grid come in one after another rather than all at once.
landingEl.querySelectorAll(".lp-problems, .lp-things").forEach((group) => {
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
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => revealer.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-in"));
}

/* ---------- on a phone: one screen at a time, like stories ----------
   Five screens, one idea each. responsive.css shows only the pieces of
   the current one ([data-story].is-current) while the window is phone
   sized; at computer sizes the page is the long one, as always. Stepped
   with the arrows under the bars, the bars themselves, the letter's
   pointer on the invite, or the keyboard's arrows. No swiping: in Safari
   a swipe from the edge means "back". */

const STORY_COUNT = 5;
const storyParts = landingEl.querySelectorAll("[data-story]");
const storyBars = document.getElementById("lp-story-bars");
const storyPrev = document.getElementById("lp-story-prev");
const storyNext = document.getElementById("lp-story-next");
let storyAt = 1;

storyBars.innerHTML = Array.from(
  { length: STORY_COUNT },
  (_, i) =>
    `<button class="lp-story-bar" type="button" data-story-go="${i + 1}" aria-label="${escapeHtml(
      t("Part {n} of {total}", { n: i + 1, total: STORY_COUNT })
    )}"></button>`
).join("");

function showStory(n, { animate = true } = {}) {
  const next = Math.min(Math.max(n, 1), STORY_COUNT);
  const direction = next < storyAt ? "prev" : "next";
  storyAt = next;
  landingEl.dataset.storyAt = String(next);
  storyParts.forEach((el) => {
    const current = el.dataset.story === String(next);
    el.classList.toggle("is-current", current);
    el.classList.remove("is-entering");
    if (current && animate && !lpReduceMotion()) {
      el.dataset.enter = direction;
      void el.offsetWidth; // restarts the slide-in on a screen shown again
      el.classList.add("is-entering");
    }
  });
  storyBars.querySelectorAll("[data-story-go]").forEach((bar) => {
    const k = Number(bar.dataset.storyGo);
    bar.classList.toggle("is-done", k <= next);
    if (k === next) bar.setAttribute("aria-current", "step");
    else bar.removeAttribute("aria-current");
  });
  storyPrev.disabled = next === 1;
  storyNext.disabled = next === STORY_COUNT;
  if (phoneStories.matches) window.scrollTo(0, 0);
}

storyPrev.addEventListener("click", () => showStory(storyAt - 1));
storyNext.addEventListener("click", () => showStory(storyAt + 1));
storyBars.addEventListener("click", (e) => {
  const bar = e.target.closest("[data-story-go]");
  if (bar) showStory(Number(bar.dataset.storyGo));
});
landingEl.querySelectorAll("[data-story-next]").forEach((btn) => btn.addEventListener("click", () => showStory(storyAt + 1)));

document.addEventListener("keydown", (e) => {
  if (!phoneStories.matches || landingEl.classList.contains("hidden")) return;
  if (document.documentElement.classList.contains("auth-open")) return; // the login card has the keys
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight") showStory(storyAt + 1);
  if (e.key === "ArrowLeft") showStory(storyAt - 1);
});

showStory(1, { animate: false });
