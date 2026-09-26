/* ---------- Searching and filtering your library ----------

   Movies, Shows, Movies To Watch and the Shows Queue each have a search box
   and a Filters panel over their grid. They only change which cards show:
   every title is in memory already (STORE), so nothing is fetched and
   nothing is saved — a reload starts from the whole list again.

   data.js asks libraryMatches() while it builds a grid (and the list the
   detail window's arrows and Surprise Me pick from), so a search or filter
   holds through sorting and realtime changes. Each filter narrows the
   results, as each word of the search does.

   While anything narrows a section, its Custom order is paused: no card
   can be dragged (moving one among the few showing would leave no telling
   where it belongs among the rest), the list shows in the account's
   default sort instead, and the Sort menu shows Custom as locked. Clearing
   everything brings it back (data.js's effectiveSort). */

// The section each grid belongs to: the Shows Queue's three tabs share one
// search box and one set of filters.
const LIBRARY_SECTION_OF_GRID = {
  "grid-movies-watched": "movies-watched",
  "grid-shows-watched": "shows-watched",
  "grid-movies-towatch": "movies-towatch",
  "grid-shows-towatch": "shows-towatch",
  "grid-shows-watching": "shows-towatch",
  "grid-shows-dropped": "shows-towatch",
};

const gridsOfSection = (sectionId) =>
  Object.keys(LIBRARY_SECTION_OF_GRID).filter((gridId) => LIBRARY_SECTION_OF_GRID[gridId] === sectionId);

// Case and accents don't count: "amelie" finds "Amélie".
const foldText = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/* ---------- the filters ----------

   Each filter says which options a title has (`optionsOf`); the panel
   lists the options titles in the section actually have, with how many.
   Picking several options of one filter keeps titles with any of them —
   except genres, where a title needs all of them (Horror + Comedy: horror
   comedies). The rating is one number compared one way — at least, at
   most or exactly — or Unrated (see RATING_MODES). */

const yearOf = (date) => (date ? Number(String(date).slice(0, 4)) : null);

const LIBRARY_FILTERS = {
  genres: {
    label: "Genre",
    matchAll: true,
    optionsOf: (row) =>
      String(row.genres ?? "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
    order: (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  },
  decades: {
    label: "Decade",
    optionsOf: (row) => (row.release_year ? [String(Math.floor(row.release_year / 10) * 10)] : []),
    name: (value) => `${value}s`,
    order: (a, b) => Number(a.value) - Number(b.value),
  },
  runtime: {
    label: "Length",
    optionsOf: (row) => {
      if (!row.duration) return [];
      if (row.duration < 90) return ["short"];
      return [row.duration <= 120 ? "medium" : "long"];
    },
    name: (value) => ({ short: "Under 90 min", medium: "90 min – 2 h", long: "Over 2 h" })[value],
    order: (a, b) => ["short", "medium", "long"].indexOf(a.value) - ["short", "medium", "long"].indexOf(b.value),
  },
  seasons: {
    label: "Length",
    optionsOf: (row) => {
      if (!row.total_seasons) return [];
      if (row.total_seasons === 1) return ["mini"];
      return [row.total_seasons <= 4 ? "some" : "many"];
    },
    name: (value) => ({ mini: "Miniseries · 1 season", some: "2–4 seasons", many: "5+ seasons" })[value],
    order: (a, b) => ["mini", "some", "many"].indexOf(a.value) - ["mini", "some", "many"].indexOf(b.value),
  },
  rating: {
    label: "Rating",
    single: true,
    // Which of the numbers 1–10 a title counts under depends on the mode
    // picked: an 8 is "at least" 1–8, "at most" 8–10, "exactly" 8.
    optionsOf: (row, sectionId) => {
      if (row.rating == null) return ["unrated"];
      const rated = Math.round(row.rating); // as the stars show it (an imported 7.5 reads as 8)
      const test = RATING_MODES[ratingModeOf(sectionId)].test;
      return RATING_VALUES.filter((n) => test(rated, Number(n)));
    },
    name: (value) => (value === "unrated" ? "Unrated" : value),
    tag: (value, sectionId) => (value === "unrated" ? "Unrated" : RATING_MODES[ratingModeOf(sectionId)].tag(Number(value))),
    order: (a, b) => (a.value === "unrated") - (b.value === "unrated") || Number(a.value) - Number(b.value),
  },
  watchedIn: {
    label: "Watched in",
    optionsOf: (row) => {
      const year = yearOf(row.watched_date ?? row.finished_watching_date);
      return year ? [String(year)] : [];
    },
    tag: (value) => `Watched in ${value}`,
    order: (a, b) => Number(b.value) - Number(a.value),
  },
};

const RATING_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const RATING_MODES = {
  atLeast: { label: "At least", test: (rated, n) => rated >= n, tag: (n) => (n === 10 ? "Rated 10" : `Rated ${n}+`) },
  atMost: { label: "At most", test: (rated, n) => rated <= n, tag: (n) => (n === 1 ? "Rated 1" : `Rated ${n} or less`) },
  exactly: { label: "Exactly", test: (rated, n) => rated === n, tag: (n) => `Rated exactly ${n}` },
};

// Which filters each section offers.
const SECTION_FILTERS = {
  "movies-watched": ["genres", "decades", "runtime", "rating", "watchedIn"],
  "shows-watched": ["genres", "decades", "seasons", "rating", "watchedIn"],
  "movies-towatch": ["genres", "decades", "runtime"],
  "shows-towatch": ["genres", "decades", "seasons"],
};

const optionName = (key, value) => LIBRARY_FILTERS[key].name?.(value) ?? value;
const optionTag = (key, value, sectionId) => LIBRARY_FILTERS[key].tag?.(value, sectionId) ?? optionName(key, value);

/* ---------- state ---------- */

// Section id -> { terms: the words typed, folded; picks: filter -> Set;
// ratingMode: how the rating picked compares }.
const libraryState = {};

function stateOf(sectionId) {
  if (!libraryState[sectionId]) libraryState[sectionId] = { terms: [], picks: {}, ratingMode: "atLeast" };
  return libraryState[sectionId];
}

const ratingModeOf = (sectionId) => stateOf(sectionId).ratingMode;

const picksOf = (sectionId, key) => stateOf(sectionId).picks[key] ?? new Set();

function pickCount(sectionId) {
  return Object.values(stateOf(sectionId).picks).reduce((n, set) => n + set.size, 0);
}

function sectionNarrowed(sectionId) {
  return stateOf(sectionId).terms.length > 0 || pickCount(sectionId) > 0;
}

function isLibraryFiltered(gridId) {
  const sectionId = LIBRARY_SECTION_OF_GRID[gridId];
  return Boolean(sectionId) && sectionNarrowed(sectionId);
}

function libraryMatches(gridId, row) {
  const sectionId = LIBRARY_SECTION_OF_GRID[gridId];
  if (!sectionId) return true;
  const { terms, picks } = stateOf(sectionId);
  if (terms.length) {
    const title = foldText(row.title);
    if (!terms.every((term) => title.includes(term))) return false;
  }
  return Object.entries(picks).every(([key, picked]) => {
    if (!picked.size) return true;
    const has = LIBRARY_FILTERS[key].optionsOf(row, sectionId);
    return LIBRARY_FILTERS[key].matchAll
      ? [...picked].every((value) => has.includes(value))
      : [...picked].some((value) => has.includes(value));
  });
}

// Every title in the section, whatever tab it's on.
function sectionRows(sectionId) {
  if (typeof STORE === "undefined") return [];
  return gridsOfSection(sectionId).flatMap((gridId) => {
    const cfg = GRID_CONFIG[gridId];
    return [...STORE[cfg.table].values()].filter(cfg.match);
  });
}

// The options a filter can offer in a section, most useful first, each
// with how many titles have it.
function filterOptions(sectionId, key) {
  const counts = new Map();
  sectionRows(sectionId).forEach((row) => {
    LIBRARY_FILTERS[key].optionsOf(row, sectionId).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  });
  // The rating's numbers are always all there, so the row doesn't reshuffle
  // as the mode changes; a number no title counts under shows 0.
  if (key === "rating") RATING_VALUES.forEach((value) => counts.set(value, counts.get(value) ?? 0));
  return [...counts].map(([value, count]) => ({ value, count })).sort(LIBRARY_FILTERS[key].order);
}

/* ---------- what's on screen ---------- */

const libraryTools = (sectionId) => document.querySelector(`[data-lib-section="${sectionId}"]`);

const visibleGridOf = (sectionId) =>
  document.getElementById(sectionId)?.querySelector(".card-grid:not(.subtab-hidden)") ?? null;

// What a narrowed grid says when nothing in it matches.
function libraryEmptyHtml(gridId) {
  const sectionId = LIBRARY_SECTION_OF_GRID[gridId];
  const typed = libraryTools(sectionId)?.querySelector(".lib-search-input").value.trim() ?? "";
  const filtered = pickCount(sectionId) > 0;
  const text = !filtered
    ? `Nothing here matches “${escapeHtml(typed)}”.`
    : typed
      ? "Nothing here matches your search and filters."
      : "Nothing here matches these filters.";
  return `<p class="grid-empty lib-empty">${text}<button class="lib-empty-clear" type="button" data-lib-clear>${filtered ? "Clear all" : "Clear search"}</button></p>`;
}

// "Showing 3 of 120", for the grid on screen in that section (the Shows
// Queue shows one tab at a time).
function updateLibraryCount(sectionId) {
  const tools = libraryTools(sectionId);
  if (!tools || typeof STORE === "undefined") return;
  const count = tools.querySelector(".lib-count");
  const grid = visibleGridOf(sectionId);
  if (!grid || !sectionNarrowed(sectionId)) {
    count.hidden = true;
    return;
  }
  const cfg = GRID_CONFIG[grid.id];
  const all = [...STORE[cfg.table].values()].filter(cfg.match);
  const shown = all.filter((row) => libraryMatches(grid.id, row)).length;
  count.textContent = `Showing ${shown} of ${all.length}`;
  count.hidden = false;
}

// The button's badge and the removable tags under the bar.
function renderActiveFilters(sectionId) {
  const tools = libraryTools(sectionId);
  const badge = tools.querySelector(".lib-filter-badge");
  const n = pickCount(sectionId);
  badge.textContent = n ? ` · ${n}` : "";
  badge.hidden = !n;
  const tags = (SECTION_FILTERS[sectionId] ?? []).flatMap((key) =>
    [...picksOf(sectionId, key)].map((value) => {
      const tag = optionTag(key, value, sectionId);
      return `<button class="lib-tag" type="button" data-remove-filter="${key}" data-value="${escapeHtml(value)}" aria-label="Remove filter: ${escapeHtml(tag)}">${escapeHtml(tag)}<span aria-hidden="true">✕</span></button>`;
    })
  );
  const active = tools.querySelector(".lib-active");
  active.innerHTML = tags.length ? `${tags.join("")}<button class="lib-tags-clear" type="button" data-clear-filters>Clear filters</button>` : "";
  active.hidden = !tags.length;
}

function renderFilterPanel(sectionId) {
  const panel = libraryTools(sectionId).querySelector(".lib-filter-panel");
  const groups = (SECTION_FILTERS[sectionId] ?? [])
    .map((key) => {
      const options = filterOptions(sectionId, key);
      if (!options.length) return "";
      const picked = picksOf(sectionId, key);
      const filter = LIBRARY_FILTERS[key];
      const modes =
        key === "rating"
          ? `<div class="lf-modes" role="group" aria-label="Compare the rating">${Object.entries(RATING_MODES)
              .map(
                ([mode, { label }]) =>
                  `<button class="lf-mode" type="button" data-rating-mode="${mode}" aria-pressed="${mode === ratingModeOf(sectionId)}">${label}</button>`
              )
              .join("")}</div>`
          : "";
      const chips = options
        .map(
          ({ value, count }) =>
            `<button class="lf-chip" type="button" data-filter="${key}" data-value="${escapeHtml(value)}" aria-pressed="${picked.has(value)}">${escapeHtml(optionName(key, value))}<span class="lf-n">${count}</span></button>`
        )
        .join("");
      const hint = filter.matchAll ? `<span class="lf-hint">titles with all you pick</span>` : "";
      return `<fieldset class="lf-group"><legend class="lf-label">${filter.label}${hint}</legend>${modes}<div class="lf-chips">${chips}</div></fieldset>`;
    })
    .join("");
  panel.innerHTML = `
    <div class="lf-body">${groups || `<p class="lf-empty">Nothing to filter yet.</p>`}</div>
    <div class="lf-foot">
      <button class="lf-clear" type="button" data-clear-filters ${pickCount(sectionId) ? "" : "disabled"}>Clear filters</button>
      <button class="lf-done" type="button" data-close-filters>Done</button>
    </div>`;
}

/* ---------- changing it ---------- */

// Custom order is paused while a section is narrowed: say so the moment
// that happens to a list that was on it.
function pausesCustomOrder(sectionId) {
  return gridsOfSection(sectionId).some((gridId) => isCustomSorted(gridId));
}

function refreshSection(sectionId) {
  gridsOfSection(sectionId).forEach((gridId) => renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]));
  const grid = visibleGridOf(sectionId);
  if (grid) updateSortLabel(grid.id);
  updateLibraryCount(sectionId);
  renderActiveFilters(sectionId);
  const panel = libraryTools(sectionId).querySelector(".lib-filter-panel");
  if (!panel.classList.contains("hidden")) renderFilterPanel(sectionId);
}

function changeLibrary(sectionId, change) {
  const before = sectionNarrowed(sectionId);
  change(stateOf(sectionId));
  const after = sectionNarrowed(sectionId);
  if (!before && after && pausesCustomOrder(sectionId)) {
    showToast("Custom order is paused while you search or filter — clear them to use it again.");
  }
  refreshSection(sectionId);
}

function setLibrarySearch(sectionId, text) {
  const terms = foldText(text).split(/\s+/).filter(Boolean);
  libraryTools(sectionId).querySelector(".lib-search-clear").hidden = !text;
  if (terms.join(" ") === stateOf(sectionId).terms.join(" ")) return;
  changeLibrary(sectionId, (state) => (state.terms = terms));
}

function toggleFilter(sectionId, key, value) {
  changeLibrary(sectionId, (state) => {
    const picked = new Set(state.picks[key] ?? []);
    if (LIBRARY_FILTERS[key].single) {
      // One at a time; the one already picked, tapped again, comes off.
      const already = picked.has(value);
      picked.clear();
      if (!already) picked.add(value);
    } else if (picked.has(value)) {
      picked.delete(value);
    } else {
      picked.add(value);
    }
    state.picks[key] = picked;
  });
}

function setRatingMode(sectionId, mode) {
  if (!RATING_MODES[mode] || ratingModeOf(sectionId) === mode) return;
  changeLibrary(sectionId, (state) => (state.ratingMode = mode));
}

function clearLibraryFilters(sectionId) {
  changeLibrary(sectionId, (state) => (state.picks = {}));
}

function clearLibrarySearch(sectionId, { focus = false } = {}) {
  const input = libraryTools(sectionId).querySelector(".lib-search-input");
  input.value = "";
  setLibrarySearch(sectionId, "");
  if (focus) input.focus();
}

// Search and filters both, from a grid that came up empty.
function clearLibraryAll(sectionId) {
  const input = libraryTools(sectionId).querySelector(".lib-search-input");
  input.value = "";
  libraryTools(sectionId).querySelector(".lib-search-clear").hidden = true;
  changeLibrary(sectionId, (state) => {
    state.terms = [];
    state.picks = {};
  });
  input.focus();
}

function openFilterPanel(sectionId) {
  const tools = libraryTools(sectionId);
  closeFilterPanels();
  renderFilterPanel(sectionId);
  tools.querySelector(".lib-filter-panel").classList.remove("hidden");
  tools.querySelector(".lib-filter-btn").setAttribute("aria-expanded", "true");
}

function closeFilterPanels() {
  document.querySelectorAll(".lib-filter-panel:not(.hidden)").forEach((panel) => {
    panel.classList.add("hidden");
    panel.closest(".lib-tools").querySelector(".lib-filter-btn").setAttribute("aria-expanded", "false");
  });
}

// Signed out (data.js's clearAppData): the next account starts with nothing
// searched or filtered.
function resetLibrarySearch() {
  Object.keys(libraryState).forEach((sectionId) => delete libraryState[sectionId]);
  closeFilterPanels();
  document.querySelectorAll(".lib-tools").forEach((tools) => {
    tools.querySelector(".lib-search-input").value = "";
    tools.querySelector(".lib-search-clear").hidden = true;
    tools.querySelector(".lib-count").hidden = true;
    tools.querySelector(".lib-filter-badge").hidden = true;
    tools.querySelector(".lib-active").hidden = true;
  });
}

/* ---------- wiring ---------- */

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

  tools.querySelector(".lib-filter-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (tools.querySelector(".lib-filter-panel").classList.contains("hidden")) openFilterPanel(sectionId);
    else closeFilterPanels();
  });

  tools.addEventListener("click", (e) => {
    const chip = e.target.closest(".lf-chip");
    if (chip) toggleFilter(sectionId, chip.dataset.filter, chip.dataset.value);
    const mode = e.target.closest("[data-rating-mode]");
    if (mode) setRatingMode(sectionId, mode.dataset.ratingMode);
    const tag = e.target.closest("[data-remove-filter]");
    if (tag) toggleFilter(sectionId, tag.dataset.removeFilter, tag.dataset.value);
    if (e.target.closest("[data-clear-filters]")) clearLibraryFilters(sectionId);
    if (e.target.closest("[data-close-filters]")) closeFilterPanels();
  });
});

// "Clear search" / "Clear all" in a grid that came up empty.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lib-clear]");
  if (!btn) return;
  const sectionId = btn.closest(".section")?.id;
  if (sectionId && libraryTools(sectionId)) clearLibraryAll(sectionId);
});

// A click anywhere else closes the Filters panel; so does Escape. The path
// as the click happened, since picking a chip redraws the panel under it.
document.addEventListener("click", (e) => {
  if (!e.composedPath().some((el) => el.classList?.contains("lib-filter-wrap"))) closeFilterPanels();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFilterPanels();
});

// Another tab of the Shows Queue: its own count.
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-subtab]");
  const sectionId = tab?.closest(".section")?.id;
  if (sectionId && libraryTools(sectionId)) updateLibraryCount(sectionId);
});
