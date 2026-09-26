/* ---------- Searching your library ----------

   Movies, Shows, Movies To Watch and the Shows Queue each have a search box
   over their grid. It only changes which cards show: every title is in
   memory already (STORE), so nothing is fetched and nothing is saved — a
   reload starts from the whole list again.

   data.js asks libraryMatches() while it builds a grid (and the list the
   detail window's arrows and Surprise Me pick from), so a search holds
   through sorting and realtime changes. While a section is searched, its
   Custom order can't be dragged: moving a card among the few showing would
   leave no telling where it belongs among the rest. */

// The section each grid belongs to: the Shows Queue's three tabs share one box.
const LIBRARY_SECTION_OF_GRID = {
  "grid-movies-watched": "movies-watched",
  "grid-shows-watched": "shows-watched",
  "grid-movies-towatch": "movies-towatch",
  "grid-shows-towatch": "shows-towatch",
  "grid-shows-watching": "shows-towatch",
  "grid-shows-dropped": "shows-towatch",
};

// Section id -> the words typed, folded (see foldText).
const librarySearch = {};

// Case and accents don't count: "amelie" finds "Amélie".
const foldText = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const searchTermsFor = (gridId) => librarySearch[LIBRARY_SECTION_OF_GRID[gridId]] ?? [];

function isLibraryFiltered(gridId) {
  return searchTermsFor(gridId).length > 0;
}

// Every word typed has to be somewhere in the title, in any order.
function libraryMatches(gridId, row) {
  const terms = searchTermsFor(gridId);
  if (!terms.length) return true;
  const title = foldText(row.title);
  return terms.every((term) => title.includes(term));
}

// What a searched grid says when nothing in it matches.
function libraryEmptyHtml(gridId) {
  const typed = document.querySelector(`[data-lib-section="${LIBRARY_SECTION_OF_GRID[gridId]}"] .lib-search-input`)?.value.trim() ?? "";
  return `<p class="grid-empty lib-empty">Nothing here matches “${escapeHtml(typed)}”.<button class="lib-empty-clear" type="button" data-lib-clear>Clear search</button></p>`;
}

const libraryTools = (sectionId) => document.querySelector(`[data-lib-section="${sectionId}"]`);

// "Showing 3 of 120", for the grid on screen in that section (the Shows
// Queue shows one tab at a time).
function updateLibraryCount(sectionId) {
  const tools = libraryTools(sectionId);
  if (!tools || typeof STORE === "undefined") return;
  const count = tools.querySelector(".lib-count");
  const section = document.getElementById(sectionId);
  const grid = section.querySelector(".card-grid:not(.subtab-hidden)");
  if (!grid || !isLibraryFiltered(grid.id)) {
    count.hidden = true;
    return;
  }
  const cfg = GRID_CONFIG[grid.id];
  const all = [...STORE[cfg.table].values()].filter(cfg.match);
  const shown = all.filter((row) => libraryMatches(grid.id, row)).length;
  const reorder = isCustomSorted(grid.id) ? " · clear the search to reorder" : "";
  count.textContent = `Showing ${shown} of ${all.length}${reorder}`;
  count.hidden = false;
}

function rerenderLibrarySection(sectionId) {
  Object.entries(LIBRARY_SECTION_OF_GRID)
    .filter(([, section]) => section === sectionId)
    .forEach(([gridId]) => renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]));
  updateLibraryCount(sectionId);
}

function setLibrarySearch(sectionId, text) {
  const terms = foldText(text).split(/\s+/).filter(Boolean);
  const before = (librarySearch[sectionId] ?? []).join(" ");
  librarySearch[sectionId] = terms;
  libraryTools(sectionId).querySelector(".lib-search-clear").hidden = !text;
  if (terms.join(" ") !== before) rerenderLibrarySection(sectionId);
}

function clearLibrarySearch(sectionId, { focus = false } = {}) {
  const input = libraryTools(sectionId).querySelector(".lib-search-input");
  input.value = "";
  setLibrarySearch(sectionId, "");
  if (focus) input.focus();
}

// Signed out (data.js's clearAppData): the next account starts unsearched.
function resetLibrarySearch() {
  Object.keys(librarySearch).forEach((sectionId) => {
    librarySearch[sectionId] = [];
    const tools = libraryTools(sectionId);
    tools.querySelector(".lib-search-input").value = "";
    tools.querySelector(".lib-search-clear").hidden = true;
    tools.querySelector(".lib-count").hidden = true;
  });
}

// Typing re-draws the grid; a short pause first, so a library of thousands
// isn't rebuilt on every keystroke.
let librarySearchTimer = null;

document.querySelectorAll(".lib-tools").forEach((tools) => {
  const sectionId = tools.dataset.libSection;
  const input = tools.querySelector(".lib-search-input");
  input.addEventListener("input", () => {
    tools.querySelector(".lib-search-clear").hidden = !input.value;
    clearTimeout(librarySearchTimer);
    librarySearchTimer = setTimeout(() => setLibrarySearch(sectionId, input.value), 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(librarySearchTimer);
      setLibrarySearch(sectionId, input.value);
      // On a phone, put the keyboard away to show the results.
      if (matchMedia("(pointer: coarse)").matches) input.blur();
    }
    if (e.key === "Escape" && input.value) {
      e.stopPropagation();
      clearTimeout(librarySearchTimer);
      clearLibrarySearch(sectionId);
    }
  });
  tools.querySelector(".lib-search-clear").addEventListener("click", () => {
    clearTimeout(librarySearchTimer);
    clearLibrarySearch(sectionId, { focus: true });
  });
});

// "Clear search" in a grid that came up empty.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lib-clear]");
  if (!btn) return;
  const sectionId = btn.closest(".section")?.id;
  if (sectionId && libraryTools(sectionId)) clearLibrarySearch(sectionId, { focus: true });
});

// Another tab of the Shows Queue: its own count.
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-subtab]");
  const sectionId = tab?.closest(".section")?.id;
  if (sectionId && libraryTools(sectionId)) updateLibraryCount(sectionId);
});
