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

// TMDB's genres, by id: a title saves them in English whatever the
// language it was added in (js/addItem.js), so one genre is one filter
// option; each shows in the page's language (GENRE_NAMES). One missing
// here (TMDB adds one now and then) is saved and shown as TMDB named it.
const TMDB_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};
const englishGenre = (genre) => TMDB_GENRES[genre.id] ?? genre.name;

const GENRE_NAMES = {
  Action: t("Action"),
  Adventure: t("Adventure"),
  Animation: t("Animation"),
  Comedy: t("Comedy"),
  Crime: t("Crime"),
  Documentary: t("Documentary"),
  Drama: t("Drama"),
  Family: t("Family"),
  Fantasy: t("Fantasy"),
  History: t("History"),
  Horror: t("Horror"),
  Music: t("Music"),
  Mystery: t("Mystery"),
  Romance: t("Romance"),
  "Science Fiction": t("Science Fiction"),
  "TV Movie": t("TV Movie"),
  Thriller: t("Thriller"),
  War: t("War"),
  Western: t("Western"),
  "Action & Adventure": t("Action & Adventure"),
  Kids: t("Kids"),
  News: t("News"),
  Reality: t("Reality"),
  "Sci-Fi & Fantasy": t("Sci-Fi & Fantasy"),
  Soap: t("Soap"),
  Talk: t("Talk"),
  "War & Politics": t("War & Politics"),
};
const genreName = (genre) => GENRE_NAMES[genre] ?? genre;

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(LOCALE, {
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

// A date after today in a "when did you watch it" field is refused (the
// owner's call): Slate says so the moment it's picked, and the form won't
// save until it's changed. Date fields opt in with data-future-note; the
// forms call it again after filling a field in, which fires no input event.
const isFutureDate = (input) => Boolean(input.value) && input.value > localToday();

function syncFutureNote(input) {
  const future = isFutureDate(input);
  let note = input.nextElementSibling?.classList.contains("date-future-note") ? input.nextElementSibling : null;
  input.classList.toggle("is-future", future);
  if (!future) {
    note?.remove();
    return;
  }
  if (!note) {
    note = document.createElement("p");
    note.className = "date-future-note";
    note.setAttribute("role", "alert");
    input.after(note);
  }
  note.textContent = t("Sure you watched this on {date}? That hasn't happened yet 👀", { date: formatDate(input.value) });
}

document.addEventListener("input", (e) => {
  if (e.target.matches?.("input[type=date][data-future-note]")) syncFutureNote(e.target);
});

// On saving: the first of these fields holding a future date, shown and
// focused, or null when none does.
function futureDateIn(...inputs) {
  const input = inputs.find((el) => el && isFutureDate(el));
  if (!input) return null;
  syncFutureNote(input);
  input.focus();
  return input;
}

function formatRuntime(minutes) {
  if (!minutes) return t("Runtime unknown");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t("{h}h {m}m", { h, m }) : t("{m}m", { m });
}

// A rating as ten hearts (css/hearts.css), filled up to it, and "9/10"
// beside them for reading (and for screen readers: the hearts are hidden).
function heartsHtml(rating) {
  if (rating === null || rating === undefined) {
    return `<p class="detail-unrated">${t("Unrated")}</p>`;
  }
  const pct = Math.max(0, Math.min(10, rating)) * 10;
  return `
    <div class="rating-row">
      <span class="hearts" aria-hidden="true"><span class="hearts-fill" style="width: ${pct}%"></span></span>
      <span class="hearts-value">${rating}/10</span>
    </div>`;
}

function detailDurationLine(table, row) {
  if (table === "movies") return formatRuntime(row.duration);
  const seasons = row.total_seasons ?? 0;
  const episodes = row.total_episodes ?? 0;
  return `${tn(seasons, "{n} season", "{n} seasons")} · ${tn(episodes, "{n} episode", "{n} episodes")}`;
}

function renderDetail(cfg, row) {
  detailPoster.innerHTML = row.poster
    ? `<img class="detail-poster-img" src="${escapeHtml(row.poster)}" alt="" />`
    : `<div class="detail-poster-img detail-poster-empty"></div>`;

  const genreLine = parseGenres(row.genres).map(genreName).join(" · ");

  // On a phone the poster is a small polaroid beside the title (the one
  // beside the window is hidden there; css/responsive.css).
  const headPoster = `<figure class="detail-head-poster" aria-hidden="true">${
    row.poster ? `<img src="${escapeHtml(row.poster)}" alt="" />` : `<span class="detail-poster-empty"></span>`
  }</figure>`;
  const head = `
    <div class="detail-head">
      ${headPoster}
      <div class="detail-head-left">
        <h2 class="detail-title">${escapeHtml(row.title ?? t("Untitled"))}</h2>
        ${genreLine ? `<p class="detail-genre-line">${escapeHtml(genreLine)}</p>` : ""}
      </div>
      <div class="detail-meta">
        <p class="detail-meta-year">${row.release_year ?? "—"}</p>
        <p class="detail-meta-runtime">${detailDurationLine(cfg.table, row)}</p>
      </div>
    </div>
    <p class="detail-synopsis">${escapeHtml(row.synopsis || t("No synopsis available."))}</p>
    <div class="detail-trailer">${row.tmdb_id ? TRAILER_BTN_LOADING : ""}</div>`;

  const addToColHtml = `<button class="edit-btn" type="button" data-action="add-to-collection">${t("🗂 Add to collection")}</button>`;
  // Not watched yet: where to watch it, below the buttons (js/whereToWatch.js).
  const whereHtml = row.tmdb_id ? whereToWatchSlotHtml() : "";

  if (cfg.state === "towatch") {
    const actionBtn =
      cfg.table === "movies"
        ? `<button class="complete-btn" type="button" data-action="mark-watched">${t("✓ Mark as watched")}</button>`
        : `<button class="complete-btn" type="button" data-action="start-watching">${t("▶ Start watching")}</button>`;
    detailBody.innerHTML = `
      ${head}
      <div class="detail-actions">
        ${actionBtn}
        ${addToColHtml}
        <button class="delete-btn icon-delete-btn" type="button" data-action="delete" aria-label="${t("Delete")}">🗑</button>
      </div>
      ${whereHtml}`;
    return;
  }

  if (cfg.state === "dropped") {
    // Under the date: where it stopped (js/episodes.js).
    detailBody.innerHTML = `
      ${head}
      <div class="detail-section">
        <p class="detail-label">${t("Started on")}</p>
        <p class="detail-date-value">${formatDate(row.started_watching_date)}</p>
      </div>
      ${upNextSlotHtml(row)}
      <div class="detail-actions detail-actions-start">
        <button class="complete-btn" type="button" data-action="send-to-watchlist">${t('↩ Back to "To Watch"')}</button>
        ${addToColHtml}
        <button class="delete-btn icon-delete-btn" type="button" data-action="delete" aria-label="${t("Delete")}">🗑</button>
      </div>
      ${whereHtml}`;
    return;
  }

  if (cfg.state === "watching") {
    // Under the date: where you are in it (js/episodes.js).
    detailBody.innerHTML = `
      ${head}
      <div class="detail-section">
        <p class="detail-label">${t("Started on")}</p>
        <p class="detail-date-value">${formatDate(row.started_watching_date)}</p>
      </div>
      ${upNextSlotHtml(row)}
      <div class="detail-actions detail-actions-start">
        <button class="edit-btn" type="button" data-action="edit">${t("✎ Edit")}</button>
        ${addToColHtml}
        <button class="delete-btn" type="button" data-action="drop-series">${t("⏸ Drop series")}</button>
      </div>
      ${whereHtml}`;
    return;
  }

  // A movie's date part lists its viewings (js/viewings.js); a show's is its span.
  // A watched movie's date has "Watched it again" under it (js/viewings.js
  // handles it): an action on that date, where the owner wanted it.
  const dateHtml =
    cfg.table === "movies"
      ? `${watchedDateBlockHtml(row)}<button class="again-btn" type="button" data-action="watched-again">${t("↻ Watched it again")}</button>`
      : `<p class="detail-label">${t("Watched on")}</p><p class="detail-date-value">${t("Started {start} · Finished {end}", { start: formatDate(row.started_watching_date), end: formatDate(row.finished_watching_date) })}</p>`;
  const review = row.review
    ? `<p class="detail-review">${escapeHtml(row.review)}</p>`
    : `<p class="detail-review detail-review-empty">${t("No review yet.")}</p>`;

  detailBody.innerHTML = `
    ${head}
    <div class="detail-meta-strip">
      <div class="detail-field${cfg.table === "movies" ? " detail-field-again" : ""}">
        ${dateHtml}
      </div>
      <div class="detail-field">
        <p class="detail-label">${t("Rating")}</p>
        ${heartsHtml(row.rating)}
      </div>
    </div>
    ${cfg.table === "movies" ? viewingsListHtml(row) : ""}
    ${cfg.table === "shows" ? newSeasonSlotHtml(row) : ""}
    ${cfg.table === "shows" && row.tmdb_id ? `<div class="detail-section detail-see-all">${SEE_ALL_HTML}</div>` : ""}
    <div class="detail-section">
      <p class="detail-label">${t("Personal review")}</p>
      ${review}
    </div>
    <div class="detail-actions detail-actions-review">
      <button class="edit-btn" type="button" data-action="edit">${t("✎ Edit")}</button>
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
  // No stepping to another title while one of this one's viewings is open.
  if (!currentDetail?.gridId || currentDetail.viewing) {
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

  // viewing: one of the movie's viewings open in the window (js/viewings.js);
  // viewingsOpen: its list of viewings unfolded.
  currentDetail = { cfg, row, gridId, listProvider: listProvider ?? null, viewing: null, viewingsOpen: false };
  showDetailMain();
  detailModal.classList.remove("hidden");
  // Measured once it shows: hidden, nothing has a height.
  markCutText();
}

// The title's summary, drawn from what STORE holds now.
function showDetailMain() {
  const { cfg } = currentDetail;
  const row = STORE[cfg.table].get(currentDetail.row.id) ?? currentDetail.row;
  currentDetail.row = row;
  renderDetail(cfg, row);
  markCutText();
  loadDetailTrailer(cfg.table, row);
  loadDetailWhereToWatch(cfg.table, row);
  loadUpNext(row);
  loadNewSeason(row);
  if (cfg.table === "shows") refreshShowCounts(row);
  updateDetailNav();
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
  currentDetail = { ...currentDetail, row, gridId, cfg: GRID_CONFIG[gridId], viewing: null, viewingsOpen: false };
  showDetailMain();
}

// Fills the "Where to watch" slot renderDetail left, if it left one.
function loadDetailWhereToWatch(table, row) {
  const slot = detailBody.querySelector(".where-to-watch");
  loadWhereToWatch(slot, table === "movies" ? "movie" : "tv", row.tmdb_id, () => currentDetail?.row.id === row.id);
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
  closeDetailNote();
  // A show's episodes window goes with it (js/episodes.js).
  closeEpisodesWindow();
  // A hidden modal still plays audio, so an open trailer has to go with it.
  const trailerBtn = detailBody.querySelector('[data-action="toggle-trailer"]');
  if (trailerBtn && detailBody.querySelector(".detail-trailer-frame")) toggleTrailer(trailerBtn);
}

/* ---------- a phone: one screen, no scrolling ----------

   On a phone the window fits one screen (the owner's call): the synopsis
   is cut to two lines and the review to three (css/responsive.css), each
   then ending in "more", and a tap on it shows the whole text on a note
   taped over the window. */

const detailPhoneLayout = matchMedia("(max-width: 640px)");
const detailNote = document.getElementById("detail-note");

function markCutText() {
  detailBody.querySelectorAll(".detail-synopsis, .detail-review:not(.detail-review-empty)").forEach((el) => {
    const cut = detailPhoneLayout.matches && el.scrollHeight > el.clientHeight + 1;
    el.classList.toggle("is-cut", cut);
    if (cut) el.dataset.more = t("more");
  });
}

function openDetailNote(el) {
  const review = el.classList.contains("detail-review");
  document.getElementById("detail-note-label").textContent = review ? t("Personal review") : (currentDetail.row.title ?? t("Untitled"));
  document.getElementById("detail-note-text").textContent = el.textContent;
  detailNote.classList.toggle("is-review", review);
  detailNote.classList.remove("hidden");
}

function closeDetailNote() {
  detailNote.classList.add("hidden");
}

// Measured again when the room changes, or a font arrives (the review's
// hand takes more room than the font shown until then).
const remarkCutText = () => {
  if (!detailModal.classList.contains("hidden") && currentDetail && !currentDetail.viewing) markCutText();
};
detailPhoneLayout.addEventListener("change", () => {
  remarkCutText();
  if (!detailPhoneLayout.matches) closeDetailNote();
});
document.fonts?.addEventListener?.("loadingdone", remarkCutText);

detailNote.addEventListener("click", (e) => {
  if (e.target === detailNote || e.target.closest("#detail-note-close")) closeDetailNote();
});

/* ---------- trailer ----------

   Looked up on TMDB each time a title is shown, without holding up the
   modal. The "Watch trailer" button is there from the start, disabled,
   so nothing shifts when the lookup answers: it turns on once a trailer
   is found, or says there isn't one. The YouTube player itself isn't
   loaded until that button is clicked. */

const TRAILER_BTN_LOADING = `<button class="trailer-btn" type="button" data-action="toggle-trailer" aria-expanded="false" disabled aria-busy="true">${t("▶ Watch trailer")}</button>`;

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
  let key = null;
  let failed = false;
  try {
    key = await fetchTrailerKey(table, row.tmdb_id);
  } catch (err) {
    console.error("Trailer error:", err.message);
    failed = true;
  }
  // By the time TMDB answers, the modal may be showing a different title.
  if (currentDetail?.row.id !== row.id) return;
  const slot = detailBody.querySelector(".detail-trailer");
  const btn = slot?.querySelector(".trailer-btn");
  if (!btn || !btn.disabled) return;
  btn.removeAttribute("aria-busy");
  if (!key) {
    btn.textContent = failed ? t("Trailer unavailable") : t("No trailer");
    return;
  }
  slot.dataset.key = key;
  btn.disabled = false;
}

function toggleTrailer(btn) {
  const slot = btn.closest(".detail-trailer");
  const frame = slot.querySelector(".detail-trailer-frame");
  if (frame) {
    frame.remove();
    btn.textContent = t("▶ Watch trailer");
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "detail-trailer-frame";
  const iframe = document.createElement("iframe");
  // autoplay only ever follows this explicit click — nothing plays on open.
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(slot.dataset.key)}?autoplay=1&rel=0`;
  iframe.title = t("Trailer");
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  wrap.appendChild(iframe);
  slot.appendChild(wrap);
  btn.textContent = t("✕ Hide trailer");
  btn.setAttribute("aria-expanded", "true");
  wrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- following live changes ----------
   A title can change while a window shows it: in another tab or on another
   device (realtime), or by this tab's own save. The windows follow, so
   nothing old is shown, or saved back over the newer version: once, an Edit
   opened after another tab had changed the review brought the old text
   back, and saving would have put it back in place of the new one. */

// Field by field: a realtime echo lists a row's fields in another order
// than the save's own answer (the server builds it as jsonb), so comparing
// the two as text once warned of a change elsewhere right after adding a
// movie from Movies, whose form opens at once.
const sameRow = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
};

// Called by js/realtime.js after STORE has taken the change. `before` is the
// title as STORE held it until now.
function followLiveChange(table, payload, before) {
  if (payload.eventType === "DELETE") {
    closeWindowsOf(table, payload.old.id);
    return;
  }
  const row = STORE[table].get(payload.new.id);
  // The echo of a change already shown: nothing to redraw.
  if (!row || (before && sameRow(before, row))) return;
  noteStaleForms(table, row);
  if (detailModal.classList.contains("hidden") || !currentDetail) return;
  if (currentDetail.cfg.table !== table || currentDetail.row.id !== row.id) return;
  // One of its viewings open for editing stays as it is; going back to the
  // summary draws it from STORE anyway.
  if (currentDetail.viewing) return;
  // It may have moved lists (a show finished elsewhere): new buttons too.
  const gridId = gridIdFor(table, row);
  currentDetail = { ...currentDetail, row, gridId, cfg: GRID_CONFIG[gridId] };
  showDetailMain();
}

// Deleted elsewhere: every window showing it closes, and says why. A delete
// made here closes its windows first, so this says nothing then.
function closeWindowsOf(table, id) {
  let closed = false;
  const open = (el) => !el.classList.contains("hidden");
  if (open(detailModal) && currentDetail?.cfg.table === table && currentDetail.row.id === id) {
    closeDetailModal();
    closed = true;
  }
  if (table === "movies" && open(updateModal) && updateRow?.id === id) {
    closeUpdateModal();
    closed = true;
  }
  if (table === "shows" && open(startModal) && startRow?.id === id) {
    closeStartModal();
    closed = true;
  }
  if (table === "shows" && closeEpisodesWindowOf(id)) closed = true;
  if (open(confirmModal) && pendingDelete?.table === table && pendingDelete.row?.id === id) {
    closeConfirmModal();
    closed = true;
  }
  if (closed) showToast(t("This title was deleted in another window."));
}

// An Edit form open on a title that just changed elsewhere isn't refilled
// under the user's hands: it says so, and offers the new version.
function noteStaleForms(table, row) {
  if (table === "movies" && !updateModal.classList.contains("hidden") && updateRow?.id === row.id && !updateSave.disabled) {
    showStaleNote(updateForm, () => reopenKeepingDelete("update-delete", () => openMarkAsWatchedModal(STORE.movies.get(row.id) ?? row)));
  }
  if (table === "shows" && !startModal.classList.contains("hidden") && startRow?.id === row.id && !startSave.disabled) {
    showStaleNote(startForm, () => reopenKeepingDelete("start-delete", () => openStartWatchingModal(STORE.shows.get(row.id) ?? row)));
  }
}

// The form's delete button is shown or not by where it was opened from:
// reopening it with the new version keeps that as it was.
function reopenKeepingDelete(deleteId, reopen) {
  const hidden = document.getElementById(deleteId).classList.contains("hidden");
  reopen();
  document.getElementById(deleteId).classList.toggle("hidden", hidden);
}

function showStaleNote(form, reload) {
  clearStaleNote(form);
  const note = document.createElement("p");
  note.className = "form-stale";
  note.setAttribute("role", "status");
  note.textContent = t("This title just changed in another window. Saving now would replace that change.");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "form-stale-load";
  btn.textContent = t("Load the changes");
  btn.addEventListener("click", reload);
  note.append(" ", btn);
  form.prepend(note);
}

function clearStaleNote(form) {
  form.querySelector(".form-stale")?.remove();
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
  if (!document.getElementById("episodes-modal").classList.contains("hidden")) return;
  if (!document.getElementById("update-modal").classList.contains("hidden")) return;
  if (!document.getElementById("start-modal").classList.contains("hidden")) return;

  if (!document.getElementById("confirm-modal").classList.contains("hidden")) return;

  // A viewing open (js/viewings.js): Escape goes back to the summary, and
  // the arrows are the date field's, not the window's.
  if (!detailNote.classList.contains("hidden")) {
    if (e.key === "Escape") closeDetailNote();
    return;
  }
  if (currentDetail?.viewing) {
    if (e.key === "Escape") backToSummary();
    return;
  }
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
      <p class="col-menu-empty">${t("No collections yet.")}</p>
      <button class="sort-option" type="button" data-action="new-collection"><span class="sort-stub">+</span><span class="sort-option-label">${t("Create collection")}</span></button>`;
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
  const { data, error } = await db
    .from("shows")
    .update({ is_dropped: true })
    .eq("id", row.id)
    .select()
    .single();
  btn.disabled = false;

  if (error) {
    console.error("Drop series error:", error.message);
    showToast(t("Could not drop the series — please try again."), true);
    return;
  }
  closeDetailModal();
  applyLocalChange("shows", "UPDATE", data);
  showToast(t("Series dropped."));
}

async function sendToWatchlist(row, btn) {
  btn.disabled = true;
  const { data, error } = await db
    .from("shows")
    .update({
      started_watching_date: null,
      finished_watching_date: null,
      rating: null,
      review: null,
      is_dropped: false,
    })
    .eq("id", row.id)
    .select()
    .single();
  btn.disabled = false;

  if (error) {
    console.error("Send to watchlist error:", error.message);
    showToast(t("Could not move the series — please try again."), true);
    return;
  }
  closeDetailModal();
  applyLocalChange("shows", "UPDATE", data);
  showToast(t('Moved back to "To Watch".'));
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
    showToast(t("Could not add — please try again."), true);
    return;
  }

  STORE.collectionItems.set(data.id, data);
  renderCollections();
  if (typeof refreshOpenCollection === "function") refreshOpenCollection();
  const menu = document.getElementById("detail-col-menu");
  if (menu) menu.innerHTML = detailColMenuHtml(row);
  showToast(t("Added to collection."));
}

detailBody.addEventListener("click", (e) => {
  if (!currentDetail) return;
  const trailerBtn = e.target.closest('[data-action="toggle-trailer"]');
  if (trailerBtn) {
    toggleTrailer(trailerBtn);
    return;
  }
  // On a phone the trailer plays over the window, the rest dimmed: a tap
  // on the dim (the frame's own box, around the player) closes it.
  if (detailPhoneLayout.matches && e.target.classList.contains("detail-trailer-frame")) {
    toggleTrailer(detailBody.querySelector('[data-action="toggle-trailer"]'));
    return;
  }
  const cut = e.target.closest(".is-cut");
  if (cut) {
    openDetailNote(cut);
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
