/* ---------- Section headers: stats + Surprise Me ----------

   Each list's header carries a slim stat strip (.hstats) in the empty space
   right of its title. The numbers are rebuilt from STORE whenever that list
   renders (renderGrid in data.js, renderCollections in collections.js) and
   only repainted when they actually changed. Shows Queue has one strip per
   subtab; subtabs.js shows the active tab's. */

/* ---------- formatting ---------- */

function formatWatchTime(minutes) {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// One segment: a big value over a small label. With `attrs` it becomes a
// button (a title or collection it names, opened on click); `text` is for a
// value that's a name rather than a number.
function hsItem(value, label, { attrs = "", text = false, cls = "" } = {}) {
  const tag = attrs ? "button" : "div";
  const classes = ["hs-item", text && "hs-text", cls].filter(Boolean).join(" ");
  return `
    <${tag} class="${classes}"${attrs ? ` type="button" ${attrs}` : ""}>
      <span class="hs-value">${value}</span>
      <span class="hs-label">${label}</span>
    </${tag}>`;
}

/* ---------- shared stats ---------- */

function listRows(gridId) {
  const cfg = GRID_CONFIG[gridId];
  return [...STORE[cfg.table].values()].filter(cfg.match);
}

function ratingItem(rows, { showCount = true } = {}) {
  const rated = rows.filter((r) => r.rating != null);
  if (!rated.length) return hsItem("–", "No ratings yet");
  const avg = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length;
  return hsItem(
    `${avg.toFixed(1)}<small>/10</small>`,
    showCount ? `Avg rating · ${rated.length} rated` : "Avg rating"
  );
}

// The genre the most titles in the list share, and the share of the list
// that has it (a title can have several genres, so these don't add to 100%).
function topGenreItem(rows) {
  const counts = new Map();
  rows.forEach((row) =>
    parseGenres(row.genres).forEach((g) => counts.set(g, (counts.get(g) || 0) + 1))
  );
  if (!counts.size) return "";
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return hsItem(escapeHtml(name), `Top genre · ${Math.round((count / rows.length) * 100)}%`, {
    text: true,
  });
}

// The title that has sat on a to-watch list the longest.
function oldestWaitingItem(rows, table) {
  const oldest = [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
  const days = daysSince(oldest.created_at);
  const label = days ? `Waiting ${plural(days, "day")}` : "Added today";
  return hsItem(escapeHtml(oldest.title ?? "Untitled"), label, {
    text: true,
    attrs: `data-open-title="${oldest.id}" data-table="${table}" title="Open ${escapeHtml(oldest.title ?? "")}"`,
  });
}

/* ---------- per section ---------- */

function moviesWatchedStats() {
  const rows = listRows("grid-movies-watched");
  if (!rows.length) return "";
  const minutes = rows.reduce((sum, r) => sum + (r.duration || 0), 0);
  const rated = rows.filter((r) => r.rating != null).map((row) => ({ table: "movies", row }));
  return (
    hsItem(rows.length, "Movies watched") +
    hsItem(formatWatchTime(minutes), "Time watched") +
    ratingItem(rows, { showCount: false }) +
    topGenreItem(rows) +
    `<div class="hs-item hs-extremes">${collectionExtremesHtml(rated)}</div>`
  );
}

function showsWatchedStats() {
  const rows = listRows("grid-shows-watched");
  if (!rows.length) return "";

  // Start → finish, for the shows that have both dates.
  const spans = rows
    .filter((r) => r.started_watching_date && r.finished_watching_date)
    .map((r) => (new Date(r.finished_watching_date) - new Date(r.started_watching_date)) / 86400000)
    .filter((d) => d >= 0);
  let finish = "";
  if (spans.length) {
    const avg = Math.round(spans.reduce((a, b) => a + b, 0) / spans.length);
    finish = hsItem(avg ? `${avg}<small>${avg === 1 ? " day" : " days"}</small>` : "Same day", "Avg time to finish");
  }

  return hsItem(rows.length, "Shows finished") + ratingItem(rows) + topGenreItem(rows) + finish;
}

function moviesTowatchStats() {
  const rows = listRows("grid-movies-towatch");
  if (!rows.length) return "";
  const minutes = rows.reduce((sum, r) => sum + (r.duration || 0), 0);
  return (
    hsItem(rows.length, minutes ? `In queue · ${formatWatchTime(minutes)}` : "In queue") +
    oldestWaitingItem(rows, "movies") +
    topGenreItem(rows)
  );
}

function showsTowatchStats() {
  const rows = listRows("grid-shows-towatch");
  if (!rows.length) return "";
  const episodes = rows.reduce((sum, r) => sum + (r.total_episodes || 0), 0);
  return (
    hsItem(rows.length, episodes ? `In queue · ${plural(episodes, "episode")}` : "In queue") +
    oldestWaitingItem(rows, "shows")
  );
}

function showsWatchingStats() {
  const rows = listRows("grid-shows-watching");
  if (!rows.length) return "";
  const stale = rows.filter((r) => daysSince(r.started_watching_date) >= STALE_WATCHING_DAYS).length;
  return (
    hsItem(rows.length, "Watching now") +
    hsItem(stale, `Started ${STALE_WATCHING_DAYS}+ days ago`, { cls: stale ? "is-alert" : "" })
  );
}

function showsDroppedStats() {
  const dropped = listRows("grid-shows-dropped").length;
  if (!dropped) return "";
  // Every show you ever started: still watching, finished or dropped.
  const started = [...STORE.shows.values()].filter(
    (r) => r.started_watching_date != null || r.is_dropped
  ).length;
  const pct = Math.round((dropped / Math.max(started, dropped)) * 100);
  return hsItem(dropped, `Dropped · ${pct}% of the shows you started`);
}

function collectionsStats() {
  const cols = [...STORE.collections.values()];
  if (!cols.length) return "";

  // Per collection, and per distinct title across all of them (a title in
  // two collections counts once toward the totals).
  const progress = cols.map((col) => {
    const resolved = collectionItemsFor(col.id).map(resolveItem).filter(Boolean);
    const watched = resolved.filter(({ table, row }) => isItemWatched(table, row)).length;
    return { watched, total: resolved.length, resolved };
  });
  const titles = new Map();
  progress.forEach(({ resolved }) =>
    resolved.forEach((r) => titles.set(`${r.table}:${r.row.id}`, r))
  );
  const titlesWatched = [...titles.values()].filter(({ table, row }) => isItemWatched(table, row)).length;

  const filled = progress.filter((p) => p.total > 0);
  const complete = filled.filter((p) => p.watched === p.total).length;

  const pct = titles.size ? Math.round((titlesWatched / titles.size) * 100) : 0;
  const overall = `
    <div class="hs-item hs-progress">
      <span class="hs-value">${pct}<small>%</small></span>
      <div class="stat-bar${titles.size && pct === 100 ? " is-complete" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct}% watched"><span style="width: ${pct}%"></span></div>
      <span class="hs-label">Watched overall</span>
    </div>`;

  return (
    hsItem(`${complete}<small>/${filled.length}</small>`, "Complete") +
    hsItem(titles.size, "Titles collected") +
    overall
  );
}

/* ---------- rendering ---------- */

const HEADER_STATS = {
  "grid-movies-watched": ["hstats-movies-watched", moviesWatchedStats],
  "grid-shows-watched": ["hstats-shows-watched", showsWatchedStats],
  "grid-movies-towatch": ["hstats-movies-towatch", moviesTowatchStats],
  "grid-shows-towatch": ["hstats-shows-towatch", showsTowatchStats],
  "grid-shows-watching": ["hstats-shows-watching", showsWatchingStats],
  "grid-shows-dropped": ["hstats-shows-dropped", showsDroppedStats],
  collections: ["hstats-collections", collectionsStats],
};

// key: a grid id, or "collections". An empty list shows no strip at all.
function renderHeaderStats(key) {
  const entry = HEADER_STATS[key];
  if (!entry) return;
  const el = document.getElementById(entry[0]);
  const html = entry[1]();
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  el.hidden = !html;
}

// A title a stat names (longest waiting, best / worst rated) opens on click.
document.addEventListener("click", (e) => {
  if (!e.target.closest(".hstats")) return;
  const titleBtn = e.target.closest("[data-open-title], .extreme-row");
  if (!titleBtn) return;
  const { table } = titleBtn.dataset;
  const id = titleBtn.dataset.openTitle ?? titleBtn.dataset.itemId;
  const row = STORE[table]?.get(id);
  if (row) openDetailModal(gridIdFor(table, row), id);
});

/* ---------- Surprise Me on the watchlists ---------- */

function initWatchlistSurprise(btnId, gridId, emptyMessage) {
  const btn = document.getElementById(btnId);
  btn.addEventListener("click", () => {
    const pool = getOrderedList(gridId);
    if (!pool.length) {
      showToast(emptyMessage);
      return;
    }
    rollSurprise(btn, pool, (row) => openDetailModal(gridId, row.id));
  });
}

initWatchlistSurprise("movies-surprise-btn", "grid-movies-towatch", "No movies on your list yet.");
initWatchlistSurprise("shows-surprise-btn", "grid-shows-towatch", "No shows waiting in your queue yet.");
