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
function isMovieToWatch(m) {
  return m.watched_date == null;
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
function isShowToWatch(s) {
  return s.started_watching_date == null && s.finished_watching_date == null;
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

function renderDashContinue() {
  const el = document.getElementById("dash-continue");
  const shows = [...STORE.shows.values()]
    .filter(isShowWatching)
    .sort((a, b) =>
      (b.started_watching_date ?? "").localeCompare(a.started_watching_date ?? "")
    );

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
  el.innerHTML = shows.map((row) => cardHtml(row, false)).join("");
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
  const pool = [
    ...[...STORE.movies.values()]
      .filter(isMovieToWatch)
      .map((row) => ({ row, table: "movies" })),
    ...[...STORE.shows.values()]
      .filter(isShowToWatch)
      .map((row) => ({ row, table: "shows" })),
  ];

  if (!pool.length) {
    showToast("Add something to your watchlist first.");
    return;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  openDetailModal(gridIdFor(pick.table, pick.row), pick.row.id);
});
