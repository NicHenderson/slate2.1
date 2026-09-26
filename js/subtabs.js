const NO_ADD_SUBTABS = new Set(["grid-shows-watching", "grid-shows-dropped"]);

// data-subtab is only used by the Shows Queue status strip today, so this can
// live here instead of a separate generic map — one h1 per grid, swapped
// on tab switch same as the sort label.
const SUBTAB_SECTION_TITLE = {
  "grid-shows-towatch": "Shows To Watch",
  "grid-shows-watching": "Shows You're Watching",
  "grid-shows-dropped": "Shows You've Dropped",
};

document.querySelectorAll(".subtabs [data-subtab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.closest(".section");
    if (!section) return;
    const gridId = btn.dataset.subtab;

    section
      .querySelectorAll("[data-subtab]")
      .forEach((b) => b.classList.toggle("active", b === btn));
    section
      .querySelectorAll(".card-grid")
      .forEach((grid) => grid.classList.toggle("subtab-hidden", grid.id !== gridId));
    // Anything else that belongs to one subtab only (its header stats, the
    // To Watch tab's Surprise Me and drag hint).
    section
      .querySelectorAll("[data-subtab-panel]")
      .forEach((el) => el.classList.toggle("subtab-hidden", el.dataset.subtabPanel !== gridId));

    const addBtn = section.querySelector(".add-btn");
    if (addBtn) addBtn.classList.toggle("subtab-hidden", NO_ADD_SUBTABS.has(gridId));

    // No-op for a subtab whose grid isn't in SORT_LABEL_TARGETS.
    if (typeof updateSortLabel === "function") updateSortLabel(gridId);

    const title = SUBTAB_SECTION_TITLE[gridId];
    if (title) section.querySelector("h1").textContent = title;
  });
});
