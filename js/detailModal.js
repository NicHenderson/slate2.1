const detailModal = document.getElementById("detail-modal");
const detailPoster = document.getElementById("detail-poster");
const detailBody = document.getElementById("detail-body");
const detailClose = document.getElementById("detail-close");
const detailNavPrev = document.getElementById("detail-nav-prev");
const detailNavNext = document.getElementById("detail-nav-next");

let currentDetail = null;

function parseGenres(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .replace(/[\[\]"']/g, "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatRuntime(minutes) {
  if (!minutes) return "Runtime unknown";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function starsHtml(rating) {
  if (rating === null || rating === undefined) {
    return `<p class="detail-unrated">Unrated</p>`;
  }
  const pct = Math.max(0, Math.min(10, rating)) * 10;
  const stars = "★".repeat(10);
  return `
    <div class="rating-row">
      <div class="stars">
        <span class="stars-base">${stars}</span>
        <span class="stars-fill" style="width: ${pct}%">${stars}</span>
      </div>
      <span class="stars-value">${rating}/10</span>
    </div>`;
}

function detailDurationLine(table, row) {
  if (table === "movies") return formatRuntime(row.duration);
  const seasons = row.total_seasons ?? 0;
  const episodes = row.total_episodes ?? 0;
  return `${seasons} season${seasons === 1 ? "" : "s"} · ${episodes} episode${episodes === 1 ? "" : "s"}`;
}

function renderDetail(cfg, row) {
  detailPoster.innerHTML = row.poster
    ? `<img class="detail-poster-img" src="${row.poster}" alt="" />`
    : `<div class="detail-poster-img detail-poster-empty"></div>`;

  const genreLine = parseGenres(row.genres).join(" · ");

  const head = `
    <div class="detail-head">
      <div class="detail-head-left">
        <h2 class="detail-title">${escapeHtml(row.title ?? "Untitled")}</h2>
        ${genreLine ? `<p class="detail-genre-line">${genreLine}</p>` : ""}
      </div>
      <div class="detail-meta">
        <p class="detail-meta-year">${row.release_year ?? "—"}</p>
        <p class="detail-meta-runtime">${detailDurationLine(cfg.table, row)}</p>
      </div>
    </div>
    <p class="detail-synopsis">${escapeHtml(row.synopsis || "No synopsis available.")}</p>
    <div class="detail-trailer"></div>`;

  const addToColHtml = `<button class="edit-btn" type="button" data-action="add-to-collection">🗂 Add to collection</button>`;

  if (cfg.state === "towatch") {
    const actionBtn =
      cfg.table === "movies"
        ? `<button class="complete-btn" type="button" data-action="mark-watched">✓ Mark as watched</button>`
        : `<button class="complete-btn" type="button" data-action="start-watching">▶ Start watching</button>`;
    detailBody.innerHTML = `
      ${head}
      <div class="detail-actions">
        ${actionBtn}
        ${addToColHtml}
        <button class="delete-btn icon-delete-btn" type="button" data-action="delete" aria-label="Delete">🗑</button>
      </div>`;
    return;
  }

  if (cfg.state === "dropped") {
    detailBody.innerHTML = `
      ${head}
      <div class="detail-section">
        <p class="detail-label">Started on</p>
        <p class="detail-date-value">${formatDate(row.started_watching_date)}</p>
      </div>
      <div class="detail-actions detail-actions-start">
        <button class="complete-btn" type="button" data-action="send-to-watchlist">↩ Send to "Shows to Watch"</button>
        ${addToColHtml}
        <button class="delete-btn icon-delete-btn" type="button" data-action="delete" aria-label="Delete">🗑</button>
      </div>`;
    return;
  }

  if (cfg.state === "watching") {
    detailBody.innerHTML = `
      ${head}
      <div class="detail-section">
        <p class="detail-label">Started on</p>
        <p class="detail-date-value">${formatDate(row.started_watching_date)}</p>
      </div>
      <div class="detail-actions detail-actions-start">
        <button class="edit-btn" type="button" data-action="edit">✎ Edit</button>
        ${addToColHtml}
        <button class="delete-btn" type="button" data-action="drop-series">⏸ Drop series</button>
      </div>`;
    return;
  }

  const dateValue =
    cfg.table === "movies"
      ? formatDate(row.watched_date)
      : `Started ${formatDate(row.started_watching_date)} · Finished ${formatDate(row.finished_watching_date)}`;
  const review = row.review
    ? `<p class="detail-review">${row.review}</p>`
    : `<p class="detail-review detail-review-empty">No review yet.</p>`;

  detailBody.innerHTML = `
    ${head}
    <div class="detail-meta-strip">
      <div class="detail-field">
        <p class="detail-label">Watched on</p>
        <p class="detail-date-value">${dateValue}</p>
      </div>
      <div class="detail-field">
        <p class="detail-label">Rating</p>
        ${starsHtml(row.rating)}
      </div>
    </div>
    <div class="detail-section">
      <p class="detail-label">Personal review</p>
      ${review}
    </div>
    <div class="detail-actions detail-actions-review">
      <button class="edit-btn" type="button" data-action="edit">✎ Edit</button>
      ${addToColHtml}
    </div>`;
}

// The prev/next arrows step through whatever list the title was actually
// opened from, not always "its" library grid — a title clicked inside a
// collection should page through that collection's own (tab-filtered,
// position-ordered) items, not jump into the full Movies/Shows library.
// openDetailModal's optional listProvider supplies that: a zero-arg function
// returning fresh {row, table} pairs in on-screen order, called live on every
// nav step so it stays correct if the underlying data changes while the
// modal is open. Without one (the plain grid-click path), it falls back to
// this grid's own current sort — same behavior as before this existed.
function detailNavList() {
  if (currentDetail.listProvider) return currentDetail.listProvider();
  const table = GRID_CONFIG[currentDetail.gridId].table;
  return getOrderedList(currentDetail.gridId).map((row) => ({ row, table }));
}

function updateDetailNav() {
  if (!currentDetail?.gridId) {
    detailNavPrev.classList.add("hidden");
    detailNavNext.classList.add("hidden");
    return;
  }
  const list = detailNavList();
  const index = list.findIndex((e) => e.row.id === currentDetail.row.id);
  detailNavPrev.classList.remove("hidden");
  detailNavNext.classList.remove("hidden");
  detailNavPrev.disabled = index <= 0;
  detailNavNext.disabled = index === -1 || index >= list.length - 1;
}

function openDetailModal(gridId, id, listProvider) {
  const cfg = GRID_CONFIG[gridId];
  const row = STORE[cfg.table].get(id);
  if (!row) return;

  currentDetail = { cfg, row, gridId, listProvider: listProvider ?? null };
  renderDetail(cfg, row);
  loadDetailTrailer(cfg.table, row);
  updateDetailNav();
  detailModal.classList.remove("hidden");
}

function navigateDetail(delta) {
  if (!currentDetail?.gridId) return;
  const list = detailNavList();
  const index = list.findIndex((e) => e.row.id === currentDetail.row.id);
  if (index === -1) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return;

  // Recompute cfg/gridId for whatever we land on, not reused from the title
  // we came from — a mixed list (a collection has both movies and shows,
  // watched and not) can step from a watched movie straight to a to-watch
  // show, which needs its own action buttons, not the previous title's.
  const { row, table } = list[nextIndex];
  const gridId = gridIdFor(table, row);
  currentDetail = { ...currentDetail, row, gridId, cfg: GRID_CONFIG[gridId] };
  renderDetail(currentDetail.cfg, row);
  loadDetailTrailer(table, row);
  updateDetailNav();
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
  // A hidden modal still plays audio, so an open trailer has to go with it.
  const trailerBtn = detailBody.querySelector('[data-action="toggle-trailer"]');
  if (trailerBtn && detailBody.querySelector(".detail-trailer-frame")) toggleTrailer(trailerBtn);
}

/* ---------- trailer ----------

   Looked up on TMDB each time a title is shown, without holding up the
   modal: the "Watch trailer" button only appears once the lookup finds one.
   The YouTube player itself isn't loaded until that button is clicked. */

// Keyed by type + TMDB id, since a movie and a show can share a TMDB id.
// Holds the promise, so a title reopened mid-lookup doesn't fetch twice.
const trailerCache = new Map();

const YOUTUBE_KEY_RE = /^[A-Za-z0-9_-]+$/;

function pickTrailer(videos) {
  const youtube = videos.filter(
    (v) => v.site === "YouTube" && YOUTUBE_KEY_RE.test(v.key ?? "")
  );
  return (
    youtube.find((v) => v.type === "Trailer" && v.official) ??
    youtube.find((v) => v.type === "Trailer") ??
    youtube.find((v) => v.type === "Teaser") ??
    null
  );
}

function fetchTrailerKey(table, tmdbId) {
  const type = table === "movies" ? "movie" : "tv";
  const cacheKey = `${type}:${tmdbId}`;
  if (!trailerCache.has(cacheKey)) {
    const request = tmdbVideos(type, tmdbId)
      .then((videos) => pickTrailer(videos)?.key ?? null)
      .catch((err) => {
        trailerCache.delete(cacheKey); // a failed lookup can be retried on the next open
        throw err;
      });
    trailerCache.set(cacheKey, request);
  }
  return trailerCache.get(cacheKey);
}

async function loadDetailTrailer(table, row) {
  if (!row.tmdb_id) return;
  let key;
  try {
    key = await fetchTrailerKey(table, row.tmdb_id);
  } catch (err) {
    console.error("Trailer error:", err.message);
    return;
  }
  // By the time TMDB answers, the modal may be showing a different title.
  if (!key || currentDetail?.row.id !== row.id) return;
  const slot = detailBody.querySelector(".detail-trailer");
  if (!slot || slot.childElementCount) return;
  slot.dataset.key = key;
  slot.innerHTML = `<button class="trailer-btn" type="button" data-action="toggle-trailer" aria-expanded="false">▶ Watch trailer</button>`;
}

function toggleTrailer(btn) {
  const slot = btn.closest(".detail-trailer");
  const frame = slot.querySelector(".detail-trailer-frame");
  if (frame) {
    frame.remove();
    btn.textContent = "▶ Watch trailer";
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "detail-trailer-frame";
  const iframe = document.createElement("iframe");
  // autoplay only ever follows this explicit click — nothing plays on open.
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(slot.dataset.key)}?autoplay=1&rel=0`;
  iframe.title = "Trailer";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  wrap.appendChild(iframe);
  slot.appendChild(wrap);
  btn.textContent = "✕ Hide trailer";
  btn.setAttribute("aria-expanded", "true");
  wrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

detailNavPrev.addEventListener("click", () => navigateDetail(-1));
detailNavNext.addEventListener("click", () => navigateDetail(1));

document.querySelector(".content").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const grid = card.closest(".card-grid");
  if (grid && GRID_CONFIG[grid.id]) openDetailModal(grid.id, card.dataset.id);
});

detailClose.addEventListener("click", closeDetailModal);

document.addEventListener("keydown", (e) => {
  if (detailModal.classList.contains("hidden")) return;
  if (!document.getElementById("update-modal").classList.contains("hidden")) return;
  if (!document.getElementById("start-modal").classList.contains("hidden")) return;

  if (e.key === "Escape") closeDetailModal();
  if (e.key === "ArrowLeft") navigateDetail(-1);
  if (e.key === "ArrowRight") navigateDetail(1);
});

detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) closeDetailModal();
});

function itemInCollection(colId, itemId) {
  return [...STORE.collectionItems.values()].some(
    (i) => i.collection_id === colId && i.item_id === itemId
  );
}

function detailColMenuHtml(row) {
  const cols = [...STORE.collections.values()].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  if (!cols.length) {
    return `
      <p class="col-menu-empty">No collections yet.</p>
      <button class="sort-option" type="button" data-action="new-collection"><span class="sort-stub">+</span><span class="sort-option-label">Create collection</span></button>`;
  }
  return cols
    .map((c) => {
      const inCol = itemInCollection(c.id, row.id);
      return `<button class="sort-option col-pick${inCol ? " active" : ""}" type="button" data-col-id="${c.id}" ${inCol ? "disabled" : ""}><span class="sort-stub">${iconHtml(c.icon)}</span><span class="sort-option-label">${escapeHtml(c.name)}</span>${inCol ? `<span class="col-pick-check">✓</span>` : ""}</button>`;
    })
    .join("");
}

async function dropSeries(row, btn) {
  btn.disabled = true;
  const { error } = await db
    .from("shows")
    .update({ is_dropped: true })
    .eq("id", row.id);
  btn.disabled = false;

  if (error) {
    console.error("Drop series error:", error.message);
    showToast("Could not drop the series — please try again.", true);
    return;
  }
  closeDetailModal();
  showToast("Series dropped.");
}

async function sendToWatchlist(row, btn) {
  btn.disabled = true;
  const { error } = await db
    .from("shows")
    .update({
      started_watching_date: null,
      finished_watching_date: null,
      rating: null,
      review: null,
      is_dropped: false,
    })
    .eq("id", row.id);
  btn.disabled = false;

  if (error) {
    console.error("Send to watchlist error:", error.message);
    showToast("Could not move the series — please try again.", true);
    return;
  }
  closeDetailModal();
  showToast('Sent to "Shows to Watch".');
}

async function addItemToCollection(colId, table, row, btn) {
  btn.disabled = true;
  const items = [...STORE.collectionItems.values()].filter(
    (i) => i.collection_id === colId
  );
  const position = items.reduce((m, r) => Math.max(m, r.position ?? 0), 0) + 1;

  const { data, error } = await db
    .from("collection_items")
    .insert({
      collection_id: colId,
      item_id: row.id,
      item_type: table === "movies" ? "movie" : "show",
      position,
    })
    .select()
    .single();

  if (error) {
    console.error("Add to collection error:", error.message);
    btn.disabled = false;
    showToast("Could not add — please try again.", true);
    return;
  }

  STORE.collectionItems.set(data.id, data);
  renderCollections();
  if (typeof refreshOpenCollection === "function") refreshOpenCollection();
  const menu = document.getElementById("detail-col-menu");
  if (menu) menu.innerHTML = detailColMenuHtml(row);
  showToast("Added to collection.");
}

detailBody.addEventListener("click", (e) => {
  if (!currentDetail) return;
  const trailerBtn = e.target.closest('[data-action="toggle-trailer"]');
  if (trailerBtn) {
    toggleTrailer(trailerBtn);
    return;
  }
  if (e.target.closest('[data-action="mark-watched"]')) {
    openMarkAsWatchedModal(currentDetail.row);
    // This row's own delete icon is right there in the towatch detail
    // view we're opening from — a second one here would be redundant.
    // The "edit" branch below (an already-watched title, whose detail
    // view has no delete icon of its own) reopens this same modal
    // without this line, so its own toggle("hidden", isNewInsert) call
    // is what un-hides it again there.
    document.getElementById("update-delete").classList.add("hidden");
  }
  if (e.target.closest('[data-action="start-watching"]')) {
    openStartWatchingModal(currentDetail.row);
    // Same reasoning as update-delete above.
    document.getElementById("start-delete").classList.add("hidden");
  }
  if (e.target.closest('[data-action="edit"]')) {
    if (currentDetail.cfg.table === "movies") {
      openMarkAsWatchedModal(currentDetail.row);
    } else {
      openStartWatchingModal(currentDetail.row);
    }
  }
  if (e.target.closest('[data-action="delete"]')) {
    openDeleteConfirm(currentDetail.cfg.table, currentDetail.row);
  }
  if (e.target.closest('[data-action="drop-series"]')) {
    dropSeries(currentDetail.row, e.target.closest('[data-action="drop-series"]'));
  }
  if (e.target.closest('[data-action="send-to-watchlist"]')) {
    sendToWatchlist(
      currentDetail.row,
      e.target.closest('[data-action="send-to-watchlist"]')
    );
  }
  if (e.target.closest('[data-action="add-to-collection"]')) {
    const btn = e.target.closest('[data-action="add-to-collection"]');
    const menu = document.getElementById("detail-col-menu");
    const wasHidden = menu.classList.contains("hidden");
    menu.classList.add("hidden");
    if (wasHidden) {
      menu.innerHTML = detailColMenuHtml(currentDetail.row);
      menu.classList.remove("hidden");
      positionDetailColMenu(menu, btn);
    }
  }
});

// The menu lives outside #detail-body (a sibling in .detail-panel, not
// nested inside it) so it can float free of detail-body's overflow-x:hidden
// — that clip exists to stop long reviews from causing a horizontal
// scrollbar, but it also cropped this dropdown whenever the trigger button
// wasn't flush with the panel's left edge (the towatch/watching action rows,
// where "Add to collection" sits in the middle of three buttons). Because it
// now lives outside detail-body, its own clicks (.col-pick, new-collection)
// need their own listener instead of relying on detailBody's delegation.
document.getElementById("detail-col-menu").addEventListener("click", (e) => {
  const menu = e.currentTarget;
  const pick = e.target.closest(".col-pick");
  if (pick && !pick.disabled) {
    addItemToCollection(
      pick.dataset.colId,
      currentDetail.cfg.table,
      currentDetail.row,
      pick
    );
  }
  if (e.target.closest('[data-action="new-collection"]')) {
    menu.classList.add("hidden");
    openCreateCollectionModal();
  }
});

// Position the floating menu against the trigger button's real on-screen
// rect, clamped to the panel's bounds — opens upward by default (matching
// the old CSS-only behavior) but flips below when there isn't room above.
function positionDetailColMenu(menu, btn) {
  const panel = btn.closest(".detail-panel");
  const panelRect = panel.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const gap = 6;
  const edgePad = 8;

  // Cap the menu's own width to what the panel can actually offer before
  // measuring it, so a narrow panel can't leave maxLeft < minLeft below —
  // the CSS min-width alone isn't enough on a panel narrower than it.
  menu.style.maxWidth = `${Math.max(180, panelRect.width - edgePad * 2)}px`;
  const menuRect = menu.getBoundingClientRect();

  let left = btnRect.left;
  left = Math.min(left, panelRect.right - menuRect.width - edgePad);
  left = Math.max(left, panelRect.left + edgePad);

  let top = btnRect.top - menuRect.height - gap;
  if (top < edgePad) top = btnRect.bottom + gap;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

document.addEventListener("click", (e) => {
  const menu = document.getElementById("detail-col-menu");
  if (!menu || menu.classList.contains("hidden")) return;
  if (e.target.closest('[data-action="add-to-collection"]')) return;
  if (e.target.closest("#detail-col-menu")) return;
  menu.classList.add("hidden");
});
