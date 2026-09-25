const GRID_CONFIG = {
  "grid-movies-watched": {
    table: "movies",
    type: "movie",
    state: "watched",
    match: (row) => row.watched_date !== null,
  },
  "grid-movies-towatch": {
    table: "movies",
    type: "movie",
    state: "towatch",
    match: (row) => row.watched_date === null,
  },
  "grid-shows-watched": {
    table: "shows",
    type: "tv",
    state: "watched",
    match: (row) => row.finished_watching_date !== null && !row.is_dropped,
  },
  "grid-shows-watching": {
    table: "shows",
    type: "tv",
    state: "watching",
    match: (row) =>
      row.started_watching_date !== null &&
      row.finished_watching_date === null &&
      !row.is_dropped,
  },
  "grid-shows-dropped": {
    table: "shows",
    type: "tv",
    state: "dropped",
    match: (row) => row.is_dropped === true,
  },
  "grid-shows-towatch": {
    table: "shows",
    type: "tv",
    state: "towatch",
    match: (row) =>
      row.started_watching_date === null && row.finished_watching_date === null,
  },
};

const STORE = {
  movies: new Map(),
  shows: new Map(),
  collections: new Map(),
  collectionItems: new Map(),
};

function makeSorts(dateField) {
  return {
    recent: {
      label: "Most recent first",
      group: "By date",
      stub: "↓",
      cmp: (a, b) => (b[dateField] ?? "").localeCompare(a[dateField] ?? ""),
    },
    oldest: {
      label: "Oldest first",
      group: "By date",
      stub: "↑",
      cmp: (a, b) => (a[dateField] ?? "").localeCompare(b[dateField] ?? ""),
    },
    "rating-desc": {
      label: "Highest rated first",
      group: "By rating",
      stub: "★",
      cmp: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    },
    "rating-asc": {
      label: "Lowest rated first",
      group: "By rating",
      stub: "☆",
      cmp: (a, b) => (a.rating ?? 11) - (b.rating ?? 11),
    },
    "alpha-asc": {
      label: "A to Z",
      group: "A–Z",
      stub: "A",
      cmp: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
    },
    "alpha-desc": {
      label: "Z to A",
      group: "A–Z",
      stub: "Z",
      cmp: (a, b) => (b.title ?? "").localeCompare(a.title ?? ""),
    },
  };
}

// To-watch items have no rating yet (that's only set once something's
// actually watched) and no watched/started date, so makeSorts()'s options
// don't fit — this is its own set, built around what a watchlist actually
// has: when it was added, its title, its release year, and (new) a
// hand-picked order. Shared object: movies-towatch and shows-towatch sort
// by the exact same fields, nothing table-specific about any of it.
const WATCHLIST_SORTS = {
  recent: {
    label: "Recently added",
    group: "By date added",
    stub: "↓",
    cmp: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  },
  oldest: {
    label: "Oldest added",
    group: "By date added",
    stub: "↑",
    cmp: (a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  },
  "alpha-asc": {
    label: "A to Z",
    group: "A–Z",
    stub: "A",
    cmp: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  },
  "alpha-desc": {
    label: "Z to A",
    group: "A–Z",
    stub: "Z",
    cmp: (a, b) => (b.title ?? "").localeCompare(a.title ?? ""),
  },
  "release-desc": {
    label: "Newest release first",
    group: "By release year",
    stub: "↓",
    cmp: (a, b) => (b.release_year ?? -Infinity) - (a.release_year ?? -Infinity),
  },
  "release-asc": {
    label: "Oldest release first",
    group: "By release year",
    stub: "↑",
    cmp: (a, b) => (a.release_year ?? Infinity) - (b.release_year ?? Infinity),
  },
};

const GRID_SORTS = {
  "grid-movies-watched": {
    options: makeSorts("watched_date"),
    storageKey: "slate-movie-sort",
  },
  "grid-shows-watched": {
    options: makeSorts("finished_watching_date"),
    storageKey: "slate_sort_shows_watched",
  },
  "grid-shows-watching": {
    options: makeSorts("started_watching_date"),
    storageKey: "slate_sort_shows_watching",
  },
  "grid-shows-dropped": {
    options: makeSorts("started_watching_date"),
    storageKey: "slate_sort_shows_dropped",
  },
  "grid-movies-towatch": {
    options: WATCHLIST_SORTS,
    storageKey: "slate_sort_movies_towatch",
  },
  "grid-shows-towatch": {
    options: WATCHLIST_SORTS,
    storageKey: "slate_sort_shows_towatch",
  },
};

const activeSorts = {};
Object.entries(GRID_SORTS).forEach(([gridId, cfg]) => {
  const saved = localStorage.getItem(cfg.storageKey);
  activeSorts[gridId] = cfg.options[saved] ? saved : "recent";
});

const MOVIE_GRIDS = Object.keys(GRID_CONFIG).filter(
  (id) => GRID_CONFIG[id].table === "movies"
);
const SHOW_GRIDS = Object.keys(GRID_CONFIG).filter(
  (id) => GRID_CONFIG[id].table === "shows"
);

function cardHtml(item, showRating = false) {
  const poster = item.poster
    ? `<img class="card-poster" src="${item.poster}" alt="" loading="lazy" />`
    : `<div class="card-poster card-poster-empty"></div>`;
  const rating = showRating
    ? `<div class="card-rating">${starsHtml(item.rating)}</div>`
    : "";
  return `
    <article class="card" data-id="${item.id}">
      ${poster}
      <p class="card-title">${escapeHtml(item.title ?? "Untitled")}</p>
      ${rating}
    </article>`;
}

function ghostCardHtml(type) {
  const label = type === "movie" ? "Add Movie" : "Add TV Show";
  return `
    <button class="ghost-card" type="button" data-type="${type}">
      <span class="ghost-slot"><span class="ghost-plus">+</span></span>
      <span class="ghost-label">+ ${label}</span>
    </button>`;
}

const NO_GHOST_GRIDS = new Set(["grid-shows-watching", "grid-shows-dropped"]);

function ensureGhost(grid, type) {
  if (NO_GHOST_GRIDS.has(grid.id)) {
    grid.querySelectorAll(".ghost-card").forEach((g) => g.remove());
    return;
  }
  const ghosts = grid.querySelectorAll(".ghost-card");
  ghosts.forEach((ghost, i) => {
    if (i > 0) ghost.remove();
  });
  if (!ghosts.length) {
    grid.insertAdjacentHTML("beforeend", ghostCardHtml(type));
  } else if (grid.lastElementChild !== ghosts[0]) {
    grid.appendChild(ghosts[0]);
  }
}

/* ---------- pagination ----------

   Card grids page instead of scrolling forever, so a huge library doesn't
   turn into endless scrolling. Earlier this measured the actual viewport
   height and fit as many rows as would visually fit above the pagination
   bar — precise, but it meant every render depended on real card height
   (which a placeholder probe card could only estimate, not match exactly),
   on web fonts having actually finished loading (metrics differ before/
   after), and on the .content scrollbar's own width (which changes
   depending on whether THIS page happens to need scrolling). Every one of
   those turned into a real bug at some point: wrong-sized flashes on first
   load, the pagination bar jumping between pages, an unnecessary near-
   empty trailing page. Rows per page are fixed instead now — not measured
   at all — so none of that can happen again; the trade-off is that a very
   tall screen can be left with a little empty space below the last row,
   and a short one may need a touch of scrolling to see it. Only the column
   count is still measured (from the grid's own resolved track list), since
   that's a plain function of width, not of content, fonts, or scrollbars —
   nothing about it can come out "wrong" the way row height could. */

const PAGE_GROUP_SIZE = 3;
const ROWS_PER_PAGE = 2;
const DEFAULT_ITEMS_PER_PAGE = 24; // used only while a grid is still hidden

const gridPageState = {}; // gridId -> { page, itemsPerPage }

function isGridVisible(grid) {
  return !!grid && grid.offsetParent !== null;
}

function measureItemsPerPage(grid) {
  const columns = Math.max(
    getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
    1
  );
  return { itemsPerPage: columns * ROWS_PER_PAGE, columns };
}

function paginationHtml(page, totalPages) {
  if (totalPages <= 1) return "";
  const groupStart = Math.floor((page - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1;
  const groupEnd = Math.min(groupStart + PAGE_GROUP_SIZE - 1, totalPages);

  let numbers = "";
  for (let p = groupStart; p <= groupEnd; p++) {
    numbers += `<button class="page-num${p === page ? " active" : ""}" type="button" data-page="${p}">${p}</button>`;
  }

  const prevPage = Math.max(1, groupStart - PAGE_GROUP_SIZE);
  const nextPage = groupEnd + 1;
  const prevDisabled = groupStart === 1 ? "disabled" : "";
  const nextDisabled = groupEnd >= totalPages ? "disabled" : "";

  return `
    <div class="pagination">
      <button class="page-nav" type="button" data-page="${prevPage}" ${prevDisabled} aria-label="Previous pages">‹</button>
      ${numbers}
      <button class="page-nav" type="button" data-page="${nextPage}" ${nextDisabled} aria-label="Next pages">›</button>
    </div>`;
}

function renderPaginationBar(gridId, grid, page, totalPages) {
  let slot = grid.nextElementSibling;
  if (!slot || !slot.classList.contains("pagination-slot")) {
    slot = document.createElement("div");
    slot.className = "pagination-slot";
    grid.insertAdjacentElement("afterend", slot);
  }
  slot.dataset.grid = gridId;
  slot.innerHTML = paginationHtml(page, totalPages);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pagination-slot button[data-page]");
  if (!btn || btn.disabled) return;
  const gridId = btn.closest(".pagination-slot").dataset.grid;
  const state = (gridPageState[gridId] ??= { page: 1, itemsPerPage: null });
  state.page = Number(btn.dataset.page);
  renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
  // Only worth resetting scroll if the user actually scrolled away from the
  // top of a long list — snapping back is what makes "page 2" start from
  // the top instead of leaving them looking at whatever happened to be at
  // their old scroll offset. At scrollTop 0 the grid is already fully in
  // view, so this used to fire anyway and scroll by whatever sliver of
  // room .content had (a couple px from rounding, or more since the
  // min-height reservation above can itself put .content just barely past
  // one screen) — invisible as "scrolling" but very visible as the
  // pagination bar (and everything below the fold) shifting for no
  // apparent reason on every single page change.
  const content = document.querySelector(".content");
  if (content && content.scrollTop > 0) {
    document.getElementById(gridId)?.scrollIntoView({ block: "start" });
  }
});

// Called by navigation.js / subtabs.js once a section or subtab actually
// reveals a grid — grids hidden at load time can't measure their column
// count (a hidden element has no resolved width), so that's deferred until
// they're first shown. Column count depends only on the grid's own width,
// which is already correct the instant the section's `display` switches on
// (getComputedStyle forces a synchronous layout, so there's nothing to wait
// for here) — no fonts, no animation, no timer.
function ensureGridMeasured(gridId) {
  const cfg = GRID_CONFIG[gridId];
  if (!cfg) return;
  const grid = document.getElementById(gridId);
  if (!isGridVisible(grid)) return;
  const state = gridPageState[gridId];
  if (state && state.itemsPerPage != null) return;
  renderGrid(gridId, [...STORE[cfg.table].values()]);
}

function remeasureVisibleGrids() {
  Object.keys(GRID_CONFIG).forEach((gridId) => {
    const grid = document.getElementById(gridId);
    if (!isGridVisible(grid)) return;
    gridPageState[gridId] = { page: 1, itemsPerPage: null };
    renderGrid(gridId, [...STORE[GRID_CONFIG[gridId].table].values()]);
  });
}

// Column count is a function of width, so an actual window resize (not
// fonts, not an animation frame) is the only thing left that can change it.
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(remeasureVisibleGrids, 200);
});

// Shared by renderGrid and the detail modal's prev/next navigation, so
// "the card next to this one" always means the same thing in both places.
function getOrderedList(gridId) {
  const cfg = GRID_CONFIG[gridId];
  let visible = [...STORE[cfg.table].values()].filter(cfg.match);
  const sortCfg = GRID_SORTS[gridId];
  if (sortCfg) {
    visible = visible.sort(sortCfg.options[activeSorts[gridId]].cmp);
  }
  return visible;
}

function renderGrid(gridId, rows) {
  const cfg = GRID_CONFIG[gridId];
  const grid = document.getElementById(gridId);
  const state = (gridPageState[gridId] ??= { page: 1, itemsPerPage: null });

  let visible = rows.filter(cfg.match);
  const sortCfg = GRID_SORTS[gridId];
  if (sortCfg) {
    visible = [...visible].sort(sortCfg.options[activeSorts[gridId]].cmp);
  }

  const showRating = cfg.state === "watched";
  if (state.itemsPerPage == null && isGridVisible(grid)) {
    const measured = measureItemsPerPage(grid);
    state.itemsPerPage = measured.itemsPerPage;
    state.columns = measured.columns;
  }
  const capacity = state.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE;
  const showsGhost = !NO_GHOST_GRIDS.has(gridId);

  // The "+ Add" ghost card only belongs on the true last page — every other
  // page is packed with real items at full capacity. If the list happens to
  // fill the last page exactly, the ghost gets a page of its own rather than
  // spilling that page into a 3rd row. A short last page (1-2 leftover
  // items) used to get folded into the previous one instead of standing on
  // its own — reasonable when pages could still grow a bit to absorb it,
  // but with a fixed row count there's no slack to absorb *into*: tacking a
  // couple more items onto an already-full page just pushes it into a 3rd
  // row, needing exactly the scroll this whole redesign was meant to avoid.
  // A short trailing page is the smaller cost.
  const realPages = Math.max(1, Math.ceil(visible.length / capacity));
  const lastPageCount = visible.length - (realPages - 1) * capacity;
  const ghostNeedsOwnPage =
    showsGhost && visible.length > 0 && lastPageCount === capacity;
  const totalPages = ghostNeedsOwnPage ? realPages + 1 : realPages;
  state.page = Math.min(Math.max(state.page, 1), totalPages);

  const pageItems =
    state.page <= realPages
      ? visible.slice((state.page - 1) * capacity, state.page * capacity)
      : [];

  grid.innerHTML = pageItems.map((row) => cardHtml(row, showRating)).join("");
  if (showsGhost && state.page === totalPages) {
    ensureGhost(grid, cfg.type);
  } else {
    grid.querySelectorAll(".ghost-card").forEach((g) => g.remove());
  }
  // Keeps a short last page (or a lone ghost card bumped to its own page)
  // from rendering a shorter grid than a full page would, which would
  // otherwise leave everything pinned below it (the pagination bar) sitting
  // at a different height depending on the page — measured from a genuinely
  // full page of real cards (real poster art included) the first time one
  // renders, and only ever grown from there, never shrunk.
  if (pageItems.length === capacity) {
    grid.style.minHeight = "";
    const naturalHeight = grid.getBoundingClientRect().height;
    if (!state.minHeight || naturalHeight > state.minHeight) {
      state.minHeight = naturalHeight;
    }
  }
  grid.style.minHeight = state.minHeight ? `${state.minHeight}px` : "";
  renderPaginationBar(gridId, grid, state.page, totalPages);
}

function renderError(gridIds, message) {
  gridIds.forEach((gridId) => {
    const cfg = GRID_CONFIG[gridId];
    document.getElementById(gridId).innerHTML =
      `<p class="grid-empty">${message}</p>` + ghostCardHtml(cfg.type);
  });
}

async function loadData() {
  const [moviesRes, showsRes, colsRes, colItemsRes] = await Promise.all([
    db.from("movies").select("*"),
    db.from("shows").select("*"),
    db.from("collections").select("*"),
    db.from("collection_items").select("*"),
  ]);

  if (moviesRes.error) {
    renderError(MOVIE_GRIDS, "Could not load movies.");
    console.error("Movies error:", moviesRes.error.message);
  } else {
    moviesRes.data.forEach((row) => STORE.movies.set(row.id, row));
    MOVIE_GRIDS.forEach((id) => renderGrid(id, moviesRes.data));
  }

  if (showsRes.error) {
    renderError(SHOW_GRIDS, "Could not load shows.");
    console.error("Shows error:", showsRes.error.message);
  } else {
    showsRes.data.forEach((row) => STORE.shows.set(row.id, row));
    SHOW_GRIDS.forEach((id) => renderGrid(id, showsRes.data));
  }

  if (colsRes.error) {
    console.error("Collections error:", colsRes.error.message);
  } else {
    colsRes.data.forEach((row) => STORE.collections.set(row.id, row));
  }
  if (colItemsRes.error) {
    console.error("Collection items error:", colItemsRes.error.message);
  } else {
    colItemsRes.data.forEach((row) => STORE.collectionItems.set(row.id, row));
  }
  renderCollections();
  if (typeof renderDashboard === "function") renderDashboard();

  subscribeRealtime();
}

/* ---------- session lifecycle (driven by js/auth.js) ---------- */

// Reset every grid (and the collections grid) back to a loading state.
function resetGrids() {
  Object.keys(GRID_CONFIG).forEach((gridId) => {
    const grid = document.getElementById(gridId);
    if (grid) grid.innerHTML = `<p class="loading">Loading…</p>`;
  });
  const colGrid = document.getElementById("grid-collections");
  if (colGrid) {
    colGrid.innerHTML = `<p class="loading">Loading…</p>`;
    colGrid._html = null; // see paintGrid in collections.js
  }
}

// Wipe all in-memory data and rendered cards left over from a previous session.
function clearAppData() {
  STORE.movies.clear();
  STORE.shows.clear();
  STORE.collections.clear();
  STORE.collectionItems.clear();
  resetGrids();
  if (typeof renderDashboard === "function") renderDashboard();
}
