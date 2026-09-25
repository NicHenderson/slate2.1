function renderSortMenuFor(menuEl, gridId) {
  let lastGroup = null;
  menuEl.innerHTML = Object.entries(GRID_SORTS[gridId].options)
    .map(([key, opt]) => {
      const heading =
        opt.group !== lastGroup ? `<p class="sort-group-label">${opt.group}</p>` : "";
      lastGroup = opt.group;
      const active = key === activeSorts[gridId] ? " active" : "";
      return `${heading}<button class="sort-option${active}" type="button" data-sort="${key}"><span class="sort-stub">${opt.stub}</span><span class="sort-option-label">${opt.label}</span></button>`;
    })
    .join("");
}

// Maps a grid to the header label that shows its current sort — only
// grids with a visible sort control need an entry here. Shows' three
// subtabs (watched/watching/dropped) are separate grids with independent
// sort state, but share one label in the header, so all three point at it;
// whichever one is the currently-visible subtab is the one that last wrote
// to it (see the subtabs.js click handler, and the two explicit init calls
// below — looping every key here at load would leave the label showing
// whichever grid happened to run last, not the one actually on screen).
const SORT_LABEL_TARGETS = {
  "grid-movies-watched": "movies-current-sort-label",
  "grid-shows-watched": "shows-current-sort-label",
  "grid-shows-watching": "shows-current-sort-label",
  "grid-shows-dropped": "shows-current-sort-label",
  "grid-movies-towatch": "movies-towatch-current-sort-label",
  "grid-shows-towatch": "shows-towatch-current-sort-label",
};

function updateSortLabel(gridId) {
  const elId = SORT_LABEL_TARGETS[gridId];
  const el = elId && document.getElementById(elId);
  if (!el) return;
  el.textContent = GRID_SORTS[gridId].options[activeSorts[gridId]]?.label ?? "";
}

function setGridSort(gridId, key) {
  if (key === "custom") seedCustomOrder(gridId); // needs the outgoing sort still active
  activeSorts[gridId] = key;
  localStorage.setItem(GRID_SORTS[gridId].storageKey, key);
  const table = GRID_CONFIG[gridId].table;
  renderGrid(gridId, [...STORE[table].values()]);
  updateSortLabel(gridId);
}

// Only the subtab active by default in each section, not every mapped
// grid — see the comment on SORT_LABEL_TARGETS above.
updateSortLabel("grid-movies-watched");
updateSortLabel("grid-shows-watched");
updateSortLabel("grid-movies-towatch");
updateSortLabel("grid-shows-towatch");

function initSortMenu(btnId, menuId, resolveGridId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    renderSortMenuFor(menu, resolveGridId());
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", (e) => {
    const option = e.target.closest(".sort-option");
    if (!option) return;
    setGridSort(resolveGridId(), option.dataset.sort);
    menu.classList.add("hidden");
  });
}

initSortMenu("movies-sort-btn", "movies-sort-menu", () => "grid-movies-watched");
initSortMenu("shows-sort-btn", "shows-sort-menu", () => {
  const active = ["grid-shows-watched", "grid-shows-watching", "grid-shows-dropped"].find(
    (id) => !document.getElementById(id).classList.contains("subtab-hidden")
  );
  return active ?? "grid-shows-watched";
});
initSortMenu("movies-towatch-sort-btn", "movies-towatch-sort-menu", () => "grid-movies-towatch");
initSortMenu("shows-towatch-sort-btn", "shows-towatch-sort-menu", () => "grid-shows-towatch");

document.addEventListener("click", (e) => {
  if (e.target.closest(".sort-wrap")) return;
  document
    .querySelectorAll(".sort-menu")
    .forEach((menu) => menu.classList.add("hidden"));
});
