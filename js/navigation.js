const navButtons = document.querySelectorAll(".nav-btn");
const sections = document.querySelectorAll(".section");

/* ---------- mobile off-canvas sidebar drawer ---------- */

const appEl = document.getElementById("app");
const menuToggle = document.getElementById("menu-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function openSidebar() {
  appEl.classList.add("sidebar-open");
  menuToggle?.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  appEl.classList.remove("sidebar-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

menuToggle?.addEventListener("click", () => {
  if (appEl.classList.contains("sidebar-open")) closeSidebar();
  else openSidebar();
});

sidebarBackdrop?.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

/* ---------- section navigation ---------- */

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.section;

    navButtons.forEach((b) => b.classList.toggle("active", b === btn));
    sections.forEach((s) => s.classList.toggle("active", s.id === target));

    // Selecting a destination closes the mobile drawer.
    closeSidebar();
  });
});
