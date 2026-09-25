const NO_ADD_SUBTABS = new Set(["grid-shows-watching", "grid-shows-dropped"]);

// data-subtab is only used by the Shows status strip today, so this can
// live here instead of a separate generic map — one h1 per grid, swapped
// on tab switch same as the sort label.
const SUBTAB_SECTION_TITLE = {
  "grid-shows-watched": "Shows Watched",
  "grid-shows-watching": "Shows You're Watching",
  "grid-shows-dropped": "Shows You've Dropped",
};

document.querySelectorAll(".subtabs [data-subtab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const section = btn.closest(".section");
    if (!section) return;
    section
      .querySelectorAll("[data-subtab]")
      .forEach((b) => b.classList.toggle("active", b === btn));
    section
      .querySelectorAll(".card-grid")
      .forEach((grid) =>
        grid.classList.toggle("subtab-hidden", grid.id !== btn.dataset.subtab)
      );

    const gridId = btn.dataset.subtab;
    // Each subtab is its own filtered list with its own page count, so
    // switching category always lands on that grid's page 1 — otherwise
    // paging to, say, page 2 of Watched and then clicking Watching (which
    // may only have one page) leaves it stuck on a page that doesn't exist.
    const state = (gridPageState[gridId] ??= { page: 1, itemsPerPage: null });
    state.page = 1;
    if (state.itemsPerPage == null) {
      if (typeof ensureGridMeasured === "function") ensureGridMeasured(gridId);
    } else {
      renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
    }

    const addBtn = section.querySelector(".add-btn");
    if (addBtn) {
      addBtn.classList.toggle("subtab-hidden", NO_ADD_SUBTABS.has(btn.dataset.subtab));
    }

    // No-op for a subtab whose grid isn't in SORT_LABEL_TARGETS.
    if (typeof updateSortLabel === "function") updateSortLabel(gridId);

    const title = SUBTAB_SECTION_TITLE[gridId];
    if (title) section.querySelector("h1").textContent = title;
  });
});
