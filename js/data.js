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
  viewings: new Map(), // every time a movie was watched (js/viewings.js)
};

function makeSorts(dateField) {
  return {
    recent: {
      label: t("Most recent first"),
      group: t("By date"),
      stub: "↓",
      cmp: (a, b) => (b[dateField] ?? "").localeCompare(a[dateField] ?? ""),
    },
    oldest: {
      label: t("Oldest first"),
      group: t("By date"),
      stub: "↑",
      cmp: (a, b) => (a[dateField] ?? "").localeCompare(b[dateField] ?? ""),
    },
    "rating-desc": {
      label: t("Highest rated first"),
      group: t("By rating"),
      stub: "★",
      cmp: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    },
    "rating-asc": {
      label: t("Lowest rated first"),
      group: t("By rating"),
      stub: "☆",
      cmp: (a, b) => (a.rating ?? 11) - (b.rating ?? 11),
    },
    "alpha-asc": {
      label: t("A to Z"),
      group: t("A–Z"),
      stub: "A",
      cmp: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
    },
    "alpha-desc": {
      label: t("Z to A"),
      group: t("A–Z"),
      stub: "Z",
      cmp: (a, b) => (b.title ?? "").localeCompare(a.title ?? ""),
    },
  };
}

// To-watch items have no rating yet (that's only set once something's
// actually watched) and no watched/started date, so makeSorts()'s options
// don't fit — this is its own set, built around what a watchlist actually
// has: when it was added, its title, its release year, and a
// hand-picked order. Shared object: movies-towatch and shows-towatch sort
// by the exact same fields, nothing table-specific about any of it.
const WATCHLIST_SORTS = {
  recent: {
    label: t("Recently added"),
    group: t("By date added"),
    stub: "↓",
    cmp: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  },
  oldest: {
    label: t("Oldest added"),
    group: t("By date added"),
    stub: "↑",
    cmp: (a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  },
  "alpha-asc": {
    label: t("A to Z"),
    group: t("A–Z"),
    stub: "A",
    cmp: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  },
  "alpha-desc": {
    label: t("Z to A"),
    group: t("A–Z"),
    stub: "Z",
    cmp: (a, b) => (b.title ?? "").localeCompare(a.title ?? ""),
  },
  "release-desc": {
    label: t("Newest release first"),
    group: t("By release year"),
    stub: "↓",
    cmp: (a, b) => (b.release_year ?? -Infinity) - (a.release_year ?? -Infinity),
  },
  "release-asc": {
    label: t("Oldest release first"),
    group: t("By release year"),
    stub: "↑",
    cmp: (a, b) => (a.release_year ?? Infinity) - (b.release_year ?? Infinity),
  },
  // Drag-to-reorder (js/watchlistOrder.js). Titles with no position yet
  // (anything added after the order was set) go last, in the order added.
  custom: {
    label: t("Custom order"),
    group: t("Custom"),
    stub: "≡",
    cmp: (a, b) =>
      (a.position ?? Infinity) - (b.position ?? Infinity) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
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

// A sort picked in a list's own menu wins; otherwise the account's default
// sort (Settings > Defaults, via js/settings.js), otherwise most recent.
const activeSorts = {};
Object.entries(GRID_SORTS).forEach(([gridId, cfg]) => {
  const saved = localStorage.getItem(cfg.storageKey);
  const fallback = cfg.options[currentSettings.defaultSort] ? currentSettings.defaultSort : "recent";
  activeSorts[gridId] = cfg.options[saved] ? saved : fallback;
});

// The sort a grid is shown in: the one picked, except that Custom order is
// paused while the section is searched or filtered (js/librarySearch.js) —
// the account's default sort stands in until it's all cleared.
function effectiveSort(gridId) {
  const key = activeSorts[gridId];
  if (key !== "custom" || !isLibraryFiltered(gridId)) return key;
  const options = GRID_SORTS[gridId].options;
  return options[currentSettings.defaultSort] && currentSettings.defaultSort !== "custom" ? currentSettings.defaultSort : "recent";
}

const MOVIE_GRIDS = Object.keys(GRID_CONFIG).filter(
  (id) => GRID_CONFIG[id].table === "movies"
);
const SHOW_GRIDS = Object.keys(GRID_CONFIG).filter(
  (id) => GRID_CONFIG[id].table === "shows"
);

// Whole days from a date ("2026-06-10" or a full timestamp) until now.
function daysSince(date) {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
}

// A show still "watching" this long after it was started reads as stalled:
// its card (and Shows Queue > Watching's header stats) call it out.
const STALE_WATCHING_DAYS = 30;

function startedAgoHtml(row) {
  const days = daysSince(row.started_watching_date);
  if (days == null) return "";
  const text = days === 0 ? t("Started today") : days === 1 ? t("Started yesterday") : t("Started {n}d ago", { n: days });
  const stale = days >= STALE_WATCHING_DAYS ? " is-stale" : "";
  return `<p class="card-meta${stale}">${text}</p>`;
}

// extra: markup for under the title (the rating, a "Started 12d ago" line).
function cardHtml(item, showRating = false, extra = "") {
  const poster = item.poster
    ? `<img class="card-poster" src="${escapeHtml(item.poster)}" alt="" loading="lazy" />`
    : `<div class="card-poster card-poster-empty"></div>`;
  const rating = showRating
    ? `<div class="card-rating">${starsHtml(item.rating)}</div>`
    : "";
  return `
    <article class="card" data-id="${item.id}">
      ${poster}
      <p class="card-title">${escapeHtml(item.title ?? t("Untitled"))}</p>
      ${rating}${extra}
    </article>`;
}

function ghostCardHtml(type) {
  const label = type === "movie" ? t("+ Add Movie") : t("+ Add TV Show");
  return `
    <button class="ghost-card" type="button" data-type="${type}">
      <span class="ghost-slot"><span class="ghost-plus">+</span></span>
      <span class="ghost-label">${label}</span>
    </button>`;
}

const NO_GHOST_GRIDS = new Set(["grid-shows-watching", "grid-shows-dropped"]);

// Shared by renderGrid and the detail modal's prev/next navigation, so
// "the card next to this one" always means the same thing in both places.
// The grid's titles as it shows them: its status, the section's search
// (js/librarySearch.js) and its sort. Also what the detail window's arrows
// and Surprise Me go through. `searched: false` ignores the search — for
// saving an order, which must cover the whole list.
function getOrderedList(gridId, { searched = true } = {}) {
  const cfg = GRID_CONFIG[gridId];
  let visible = [...STORE[cfg.table].values()]
    .filter(cfg.match)
    .filter((row) => !searched || libraryMatches(gridId, row));
  const sortCfg = GRID_SORTS[gridId];
  if (sortCfg) {
    visible = visible.sort(sortCfg.options[effectiveSort(gridId)].cmp);
  }
  return visible;
}

// Grids whose "Custom order" sort turns on drag-to-reorder, with the hint
// shown above each while it's on.
const CUSTOM_SORT_HINTS = {
  "grid-movies-towatch": "movies-towatch-drag-hint",
  "grid-shows-towatch": "shows-towatch-drag-hint",
};

function isCustomSorted(gridId) {
  return gridId in CUSTOM_SORT_HINTS && activeSorts[gridId] === "custom";
}

function gridHtml(gridId, rows) {
  const cfg = GRID_CONFIG[gridId];
  let visible = rows.filter(cfg.match).filter((row) => libraryMatches(gridId, row));
  const sortCfg = GRID_SORTS[gridId];
  if (sortCfg) {
    visible = [...visible].sort(sortCfg.options[effectiveSort(gridId)].cmp);
  }
  const showRating = cfg.state === "watched";
  const extra =
    cfg.state === "watching" ? startedAgoHtml : gridId === "grid-movies-watched" ? rewatchBadgeHtml : () => "";
  // Searched: only what matches — no "+ Add" card among the results.
  if (isLibraryFiltered(gridId)) {
    return visible.length ? visible.map((row) => cardHtml(row, showRating, extra(row))).join("") : libraryEmptyHtml(gridId);
  }
  return (
    visible.map((row) => cardHtml(row, showRating, extra(row))).join("") +
    (NO_GHOST_GRIDS.has(gridId) ? "" : ghostCardHtml(cfg.type))
  );
}

// A grid shows its whole list (the page itself scrolls), "+ Add" card last.
// Like paintGrid in collections.js: a render that wouldn't change anything
// leaves the DOM alone, and none happens mid-drag (it would pull the card
// out from under the pointer); the drag's end catches up on it instead.
function renderGrid(gridId, rows) {
  if (dragActive) {
    pendingRender = true;
    return;
  }
  if (typeof renderHeaderStats === "function") renderHeaderStats(gridId);
  if (typeof renderDataSummary === "function") renderDataSummary();
  const grid = document.getElementById(gridId);
  // A searched grid can't be reordered (js/librarySearch.js says why).
  const draggable = isCustomSorted(gridId) && !isLibraryFiltered(gridId);
  grid.classList.toggle("is-sortable", draggable);
  const hint = CUSTOM_SORT_HINTS[gridId] && document.getElementById(CUSTOM_SORT_HINTS[gridId]);
  if (hint) hint.hidden = !draggable || rows.filter(GRID_CONFIG[gridId].match).length < 2;
  updateLibraryCount(LIBRARY_SECTION_OF_GRID[gridId]);

  const html = gridHtml(gridId, rows);
  if (grid._html === html) return;
  grid._html = html;
  grid.innerHTML = html;
}

function renderError(gridIds, message) {
  gridIds.forEach((gridId) => {
    const cfg = GRID_CONFIG[gridId];
    const grid = document.getElementById(gridId);
    grid.innerHTML = `<p class="grid-empty">${message}</p>` + ghostCardHtml(cfg.type);
    grid._html = null;
  });
}

async function loadData() {
  loadSettings(); // independent of everything below; applies the theme as soon as it resolves
  loadProfile();

  // Whole tables, however long (fetchAllRows, supabaseClient.js); each
  // settles as { data, error } so one failing table doesn't sink the rest.
  const [moviesRes, showsRes, colsRes, colItemsRes, viewingsRes] = await Promise.all(
    ["movies", "shows", "collections", "collection_items", "viewings"].map((table) =>
      fetchAllRows(table).then(
        (data) => ({ data, error: null }),
        (error) => ({ data: null, error })
      )
    )
  );

  // Before the movie grids, whose cards count them. Without them, a movie
  // still shows its latest date (watched_date); it just can't list others.
  if (viewingsRes.error) {
    console.error("Viewings error:", viewingsRes.error.message);
  } else {
    viewingsRes.data.forEach(storeViewing);
  }

  if (moviesRes.error) {
    renderError(MOVIE_GRIDS, t("Could not load movies."));
    console.error("Movies error:", moviesRes.error.message);
  } else {
    moviesRes.data.forEach((row) => STORE.movies.set(row.id, row));
    MOVIE_GRIDS.forEach((id) => renderGrid(id, moviesRes.data));
  }

  if (showsRes.error) {
    renderError(SHOW_GRIDS, t("Could not load shows."));
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
  renderProfilePreview(); // its library counts

  subscribeRealtime();
}

/* ---------- session lifecycle (driven by js/auth.js) ---------- */

// Reset every grid (and the collections grid) back to a loading state.
function resetGrids() {
  Object.keys(GRID_CONFIG).forEach((gridId) => {
    const grid = document.getElementById(gridId);
    if (grid) {
      grid.innerHTML = `<p class="loading">${t("Loading…")}</p>`;
      grid._html = null;
    }
  });
  const colGrid = document.getElementById("grid-collections");
  if (colGrid) {
    colGrid.innerHTML = `<p class="loading">${t("Loading…")}</p>`;
    colGrid._html = null; // see paintGrid in collections.js
  }
  // Header stats describe the signed-in library; none until the next load.
  // (#app only: the landing page's mockups use the same strip.)
  document.querySelectorAll("#app .hstats").forEach((el) => {
    el.innerHTML = "";
    el._html = null;
    el.hidden = true;
  });
}

// Wipe all in-memory data and rendered cards left over from a previous session.
function clearAppData() {
  STORE.movies.clear();
  STORE.shows.clear();
  STORE.collections.clear();
  STORE.collectionItems.clear();
  resetViewings();
  resetSettingsState();
  resetProfileState();
  resetLibrarySearch();
  resetGrids();
}
