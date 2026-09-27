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
  target.scrollIntoView({ behavior: lpReduceMotion() ? "auto" : "smooth", block: "start" });
});

/* ---------- nav gets a backdrop once the page moves ---------- */

const lpNav = document.getElementById("lp-nav");

function syncNavBackdrop() {
  lpNav.classList.toggle("is-scrolled", window.scrollY > 8);
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
