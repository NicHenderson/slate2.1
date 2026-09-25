/* ---------- Dashboard ----------

   Reads entirely from STORE (the same in-memory source every other view uses),
   so it stays correct on realtime updates: renderDashboard() is re-run from
   loadData() and from the realtime handlers after STORE has been mutated.
   Cards, star ratings, detail modals and collection cards are all reused. */

const dashSection = document.getElementById("dashboard");
const surpriseBtn = document.getElementById("surprise-btn");

/* ---------- state predicates ---------- */

function isMovieWatched(m) {
  return m.watched_date != null;
}
function isShowWatched(s) {
  return s.finished_watching_date != null;
}
function isShowWatching(s) {
  return (
    s.started_watching_date != null &&
    s.finished_watching_date == null &&
    !s.is_dropped
  );
}

/* ---------- helpers ---------- */

function formatWatchTime(minutes) {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// The app treats movie/show ids as unique across both tables (see resolveItem
// in collections.js); resolve the owning table the same way.
function tableForId(id) {
  if (STORE.movies.has(id)) return "movies";
  if (STORE.shows.has(id)) return "shows";
  return null;
}

function byCreatedDesc(a, b) {
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

// A show sitting in "watching" this long without being finished or dropped
// gets a nudge on its Continue Watching card instead of a silent forever-open tab.
const STALE_WATCHING_DAYS = 30;

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

/* ---------- section renderers ---------- */

function renderDashStats() {
  const movies = [...STORE.movies.values()];
  const shows = [...STORE.shows.values()];

  const watchedMovies = movies.filter(isMovieWatched);
  const watchedShows = shows.filter(isShowWatched);
  const showsCount = shows.filter(
    (s) => isShowWatched(s) || isShowWatching(s)
  ).length;

  document.getElementById("stat-movies").textContent = watchedMovies.length;
  document.getElementById("stat-shows").textContent = showsCount;

  const totalMinutes = watchedMovies.reduce(
    (sum, m) => sum + (m.duration || 0),
    0
  );
  document.getElementById("stat-time").textContent =
    formatWatchTime(totalMinutes);

  const rated = [...watchedMovies, ...watchedShows].filter(
    (r) => r.rating != null
  );
  const ratingEl = document.getElementById("stat-rating");
  if (rated.length) {
    const avg = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length;
    ratingEl.textContent = avg.toFixed(1);
  } else {
    ratingEl.textContent = "–";
  }
}

// Like cardHtml, but with a "started N days ago" line instead of a rating —
// what turns this row from a trophy shelf into something worth checking.
function dashContinueCardHtml(show) {
  const poster = show.poster
    ? `<img class="card-poster" src="${show.poster}" alt="" loading="lazy" />`
    : `<div class="card-poster card-poster-empty"></div>`;
  const days = daysSince(show.started_watching_date);
  const stale = days != null && days >= STALE_WATCHING_DAYS;
  const meta =
    days == null ? "" : days === 0 ? "Started today" : days === 1 ? "Started yesterday" : `Started ${days}d ago`;
  return `
    <article class="card dash-continue-card${stale ? " is-stale" : ""}" data-id="${show.id}">
      ${poster}
      <p class="card-title">${escapeHtml(show.title ?? "Untitled")}</p>
      ${meta ? `<p class="dash-continue-meta">${meta}</p>` : ""}
    </article>`;
}

function renderDashContinue() {
  const el = document.getElementById("dash-continue");
  const shows = [...STORE.shows.values()]
    .filter(isShowWatching)
    .sort((a, b) =>
      (a.started_watching_date ?? "").localeCompare(b.started_watching_date ?? "")
    ); // oldest start first: the most overdue show leads, not the newest.

  if (!shows.length) {
    el.innerHTML = `
      <div class="dash-empty">
        <p>Nothing in progress right now.</p>
        <button class="dash-empty-btn" type="button" data-goto="shows-towatch">
          Browse Shows to Watch →
        </button>
      </div>`;
    return;
  }
  el.innerHTML = shows.map(dashContinueCardHtml).join("");
}

/* ---------- Up Next: the head of each watchlist, plus a standing pick ---------- */

// Kept across renders (a realtime update to some unrelated title shouldn't
// reshuffle it); only a fresh roll — or the current pick no longer being
// to-watch — replaces it. { table, id }, not the row itself, so it always
// reads the row's current data instead of a possibly stale copy.
let tonightPick = null;

function towatchPool() {
  return [
    ...[...STORE.movies.values()].map((row) => ({ table: "movies", id: row.id })),
    ...[...STORE.shows.values()].map((row) => ({ table: "shows", id: row.id })),
  ].filter(({ table, id }) => itemStatus(table, STORE[table].get(id)) === "towatch");
}

function rollTonightPick() {
  const pool = towatchPool();
  tonightPick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function dashFeatureHtml(label, row, extra = "") {
  return `
    <div class="dash-feature">
      <div class="dash-feature-label-row">
        <p class="dash-feature-label">${label}</p>
        ${extra}
      </div>
      ${cardHtml(row, false)}
    </div>`;
}

function renderDashUpNext() {
  const el = document.getElementById("dash-upnext");
  // getOrderedList (data.js) applies each grid's own active sort — Custom
  // order included, so a hand-arranged watchlist really does say what's next.
  const nextMovie = getOrderedList("grid-movies-towatch")[0];
  const nextShow = getOrderedList("grid-shows-towatch")[0];

  let pickRow = tonightPick && STORE[tonightPick.table].get(tonightPick.id);
  if (!pickRow || itemStatus(tonightPick.table, pickRow) !== "towatch") {
    rollTonightPick();
    pickRow = tonightPick && STORE[tonightPick.table].get(tonightPick.id);
  }

  const features = [];
  if (nextMovie) features.push(dashFeatureHtml("Next Movie", nextMovie));
  if (nextShow) features.push(dashFeatureHtml("Next Show", nextShow));
  if (pickRow) {
    features.push(
      dashFeatureHtml(
        "Tonight's Pick",
        pickRow,
        `<button class="dash-reroll-btn" type="button" title="Reroll">🎲</button>`
      )
    );
  }

  if (!features.length) {
    el.innerHTML = `
      <div class="dash-empty">
        <p>Your watchlists are empty.</p>
        <button class="dash-empty-btn" type="button" data-goto="movies-towatch">
          Browse Movies to Watch →
        </button>
      </div>`;
    return;
  }
  el.innerHTML = features.join("");
}

/* ---------- Almost Done: collections one or two titles from complete ---------- */

const ALMOST_DONE_MIN_ITEMS = 2; // a single-title collection can't be "almost" anything

function collectionProgress(colId) {
  const resolved = collectionItemsFor(colId).map(resolveItem).filter(Boolean);
  const watched = resolved.filter(({ table, row }) => isItemWatched(table, row)).length;
  return { watched, total: resolved.length };
}

function renderDashNudges() {
  const el = document.getElementById("dash-nudges");
  const almost = [...STORE.collections.values()]
    .map((col) => ({ col, ...collectionProgress(col.id) }))
    .filter(({ watched, total }) => total >= ALMOST_DONE_MIN_ITEMS && watched > 0 && watched < total)
    .sort(
      (a, b) =>
        b.watched / b.total - a.watched / a.total || // closest to finished first…
        a.total - a.watched - (b.total - b.watched) // …then fewest titles left
    )
    .slice(0, 4);

  if (!almost.length) {
    el.innerHTML = `<p class="dash-empty-text">Nothing close to finishing right now.</p>`;
    return;
  }

  el.innerHTML = almost
    .map(
      ({ col, watched, total }) => `
      <button class="dash-nudge" type="button" data-col-id="${col.id}">
        <span class="dash-nudge-icon" aria-hidden="true">${iconHtml(col.icon || "🎬")}</span>
        <span class="dash-nudge-body">
          <span class="dash-nudge-name">${escapeHtml(col.name ?? "Untitled")}</span>
          <span class="dash-nudge-progress">${watched}/${total} watched — ${total - watched} to go</span>
        </span>
      </button>`
    )
    .join("");
}

function renderDashRecent() {
  const el = document.getElementById("dash-recent");
  const recent = [...STORE.movies.values(), ...STORE.shows.values()]
    .sort(byCreatedDesc)
    .slice(0, 8);

  if (!recent.length) {
    el.innerHTML = `<p class="dash-empty-text">Nothing added yet.</p>`;
    return;
  }
  el.innerHTML = recent.map((row) => cardHtml(row, false)).join("");
}

function renderDashTopRated() {
  const el = document.getElementById("dash-toprated");
  const rated = [...STORE.movies.values(), ...STORE.shows.values()]
    .filter((r) => r.rating != null)
    .sort((a, b) => b.rating - a.rating || byCreatedDesc(a, b))
    .slice(0, 8);

  if (!rated.length) {
    el.innerHTML = `<p class="dash-empty-text">No rated titles yet.</p>`;
    return;
  }
  el.innerHTML = rated.map((row) => cardHtml(row, true)).join("");
}

function renderDashGenres() {
  const el = document.getElementById("dash-genres");
  const watched = [
    ...[...STORE.movies.values()].filter(isMovieWatched),
    ...[...STORE.shows.values()].filter(isShowWatched),
  ];

  const counts = new Map();
  watched.forEach((row) => {
    parseGenres(row.genres).forEach((g) => {
      counts.set(g, (counts.get(g) || 0) + 1);
    });
  });

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!top.length) {
    el.innerHTML = `<p class="dash-empty-text">Watch something to see your top genres.</p>`;
    return;
  }

  const max = top[0][1];
  el.innerHTML = top
    .map(
      ([genre, count]) => `
      <div class="genre-row">
        <span class="genre-name">${genre}</span>
        <div class="genre-bar-track">
          <div class="genre-bar" style="width: ${(count / max) * 100}%"></div>
        </div>
        <span class="genre-count">${count}</span>
      </div>`
    )
    .join("");
}

function renderDashCollections() {
  const countEl = document.getElementById("dash-col-count");
  const el = document.getElementById("dash-collections");
  const cols = [...STORE.collections.values()];

  countEl.textContent = `${cols.length} total`;

  const recent = [...cols].sort(byCreatedDesc).slice(0, 4);
  if (!recent.length) {
    el.innerHTML = `<p class="dash-empty-text">No collections yet.</p>`;
    return;
  }
  el.innerHTML = recent
    .map((c) => collectionCardHtml(c, collectionItemsFor(c.id)))
    .join("");
}

function renderDashboard() {
  renderDashStats();
  renderDashContinue();
  renderDashUpNext();
  renderDashNudges();
  renderDashRecent();
  renderDashTopRated();
  renderDashGenres();
  renderDashCollections();
}

/* ---------- interactions ---------- */

dashSection.addEventListener("click", (e) => {
  // Empty-state navigation buttons ("Browse Shows to Watch").
  const goto = e.target.closest("[data-goto]");
  if (goto) {
    document.querySelector(`.nav-btn[data-section="${goto.dataset.goto}"]`)?.click();
    return;
  }

  // Tonight's Pick's own dice re-rolls just that card, not the whole board.
  if (e.target.closest(".dash-reroll-btn")) {
    rollTonightPick();
    renderDashUpNext();
    return;
  }

  // Almost Done nudges open straight into that collection.
  const nudge = e.target.closest(".dash-nudge");
  if (nudge) {
    openCollectionView(nudge.dataset.colId);
    return;
  }

  // Collection cards navigate to the collection detail view.
  const colCard = e.target.closest(".collection-card");
  if (colCard) {
    openCollectionView(colCard.dataset.colId);
    return;
  }

  // Title cards open the shared detail modal.
  const card = e.target.closest(".card");
  if (card && card.dataset.id) {
    const table = tableForId(card.dataset.id);
    if (!table) return;
    const row = STORE[table].get(card.dataset.id);
    openDetailModal(gridIdFor(table, row), card.dataset.id);
  }
});

surpriseBtn.addEventListener("click", () => {
  const pool = towatchPool();
  if (!pool.length) {
    showToast("Add something to your watchlist first.");
    return;
  }
  // Shares its pick with the Tonight's Pick card below, so the header
  // shortcut and the board don't disagree about what got rolled.
  tonightPick = pool[Math.floor(Math.random() * pool.length)];
  renderDashUpNext();
  const row = STORE[tonightPick.table].get(tonightPick.id);
  openDetailModal(gridIdFor(tonightPick.table, row), tonightPick.id);
});
