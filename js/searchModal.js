/* ---------- The TMDB search window ----------

   Results on the left, the one picked on the right (the owner's pick of
   three mockups): its poster, synopsis, trailer and where to watch it, and
   the button that adds it. The side says what it's doing: waiting for a
   pick, or loading the one picked. It searches as you type.

   Opened from To Watch or a collection, titles are picked (on the list or
   the side) and added together; from Watched, one is added and its rating
   form opens (js/addItem.js). On a phone the side takes the list's place,
   with a way back. */

const modal = document.getElementById("search-modal");
const modalTitle = document.getElementById("modal-title");
const modalInput = document.getElementById("modal-input");
const modalClear = document.getElementById("modal-clear");
const modalStatus = document.getElementById("modal-status");
const modalSplit = document.getElementById("modal-split");
const modalResults = document.getElementById("modal-results");
const modalPreview = document.getElementById("modal-preview");
const modalClose = document.getElementById("modal-close");

const batchFooter = document.getElementById("batch-footer");
const batchPicked = document.getElementById("batch-picked");
const batchAddBtn = document.getElementById("batch-add-btn");

// Long enough not to search on every letter of a word being typed.
const SEARCH_DELAY_MS = 350;

let currentType = "movie";
let batchMode = false;
let batchBusy = false;
const batchSelection = new Map(); // TMDB id → its search result, in picking order
const lastResults = new Map(); // TMDB id → search result, in TMDB's order
const haveIds = new Set(); // results already in the library (or this collection)
let searchTimer = null;
let searchToken = 0; // a newer search makes an older one's answer moot
let previewId = null; // the TMDB id the side shows, or null
// Details already fetched while the window is open, by TMDB id: going back
// to one shows it at once instead of loading it again.
const previewDetails = new Map();

const resultTitle = (item) => item.title ?? item.name ?? t("No title");
const resultYear = (item) => (item.release_date ?? item.first_air_date ?? "").slice(0, 4) || "—";

// What "already there" means depends on where the window was opened.
const haveLabel = () => (collectionAddMode ? t("In this collection") : t("In your library"));

function runtimeLine(type, details) {
  if (type === "movie") {
    return details.runtime ? t("{n} min", { n: details.runtime }) : t("Runtime unknown");
  }
  const seasons = details.number_of_seasons ?? 0;
  const episodes = details.number_of_episodes ?? 0;
  return `${tn(seasons, "{n} season", "{n} seasons")} · ${tn(episodes, "{n} episode", "{n} episodes")}`;
}

/* ---------- opening and closing ---------- */

function openModal(type) {
  const activeSection = document.querySelector(".section.active")?.id;
  batchMode =
    collectionAddMode || ["movies-towatch", "shows-towatch"].includes(activeSection);
  batchBusy = false;
  batchSelection.clear();
  lastResults.clear();
  haveIds.clear();
  previewDetails.clear();
  searchToken++;
  clearTimeout(searchTimer);

  currentType = type;
  modalTitle.textContent = type === "movie" ? t("Add Movie") : t("Add TV Show");
  modalInput.placeholder = type === "movie" ? t("Search for a movie…") : t("Search for a show…");
  modalInput.value = "";
  modalClear.hidden = true;
  setStatus("");
  modalResults.innerHTML = "";
  showPreviewHint();
  updateBatchFooter();
  modal.classList.remove("hidden");
  focusOnOpen(modalInput);
}

function closeModal() {
  if (batchBusy) return;
  modal.classList.add("hidden");
  document.getElementById("modal-back").classList.add("hidden");
  searchToken++;
  clearTimeout(searchTimer);
  // The side goes blank with it: a hidden trailer would still play.
  previewId = null;
  modalPreview.innerHTML = "";
}

function setStatus(text, isError = false) {
  modalStatus.textContent = text;
  modalStatus.classList.toggle("is-error", isError);
}

/* ---------- searching ---------- */

// Waits for a pause in the typing, or runs at once (Enter).
function queueSearch(now = false) {
  clearTimeout(searchTimer);
  modalClear.hidden = !modalInput.value;
  if (!modalInput.value.trim()) {
    searchToken++;
    lastResults.clear();
    setStatus("");
    modalResults.innerHTML = "";
    showPreviewHint();
    return;
  }
  if (now) runSearch();
  else searchTimer = setTimeout(runSearch, SEARCH_DELAY_MS);
}

async function runSearch() {
  if (batchBusy) return;
  const query = modalInput.value.trim();
  if (!query) return;
  const token = ++searchToken;
  setStatus(t("Searching…"));

  // "[603]": a TMDB id pasted in brackets, as before (no longer advertised).
  const idMatch = query.match(/^\[(\d+)\]$/);
  try {
    const results = idMatch
      ? [await tmdbDetails(currentType, idMatch[1])]
      : await tmdbSearch(currentType, query);
    const existing = await existingTmdbIds(currentType, results.map((r) => r.id));
    if (token !== searchToken) return;
    lastResults.clear();
    haveIds.clear();
    results.forEach((r) => lastResults.set(r.id, r));
    existing.forEach((id) => haveIds.add(id));
    setStatus(results.length ? tn(results.length, "{n} result", "{n} results") : "");
    renderResults();
    // Nothing shown yet, or what was shown isn't in these results: the
    // side asks for a pick from this list.
    if (previewId == null || !lastResults.has(previewId)) showPreviewHint();
  } catch (err) {
    if (token !== searchToken) return;
    lastResults.clear();
    modalResults.innerHTML = "";
    showPreviewHint();
    setStatus(
      idMatch
        ? currentType === "movie"
          ? t("No movie found with ID {id}.", { id: idMatch[1] })
          : t("No TV show found with ID {id}.", { id: idMatch[1] })
        : t("Search failed. Please try again."),
      true
    );
    console.error("TMDB error:", err.message);
  }
}

function resultRowHtml(item) {
  const id = item.id;
  const have = haveIds.has(id);
  const picked = batchSelection.has(id);
  const poster = item.poster_path
    ? `<img class="tmdb-hit-poster" src="${TMDB_IMG}${escapeHtml(item.poster_path)}" alt="" loading="lazy" />`
    : `<span class="tmdb-hit-poster tmdb-poster-empty"></span>`;
  // Already there: said in words. Otherwise, when picking several, a round
  // pick toggle on the row itself, so a list can be picked through quickly.
  const side = have
    ? `<span class="tmdb-hit-have">${haveLabel()}</span>`
    : batchMode
      ? `<button class="tmdb-pick" type="button" data-action="pick" data-id="${id}" aria-pressed="${picked}" aria-label="${escapeHtml(t("Pick {title}", { title: resultTitle(item) }))}">${picked ? "✓" : "+"}</button>`
      : "";
  return `
    <div class="tmdb-hit${id === previewId ? " is-current" : ""}${picked ? " is-picked" : ""}${have ? " is-have" : ""}" data-id="${id}">
      <button class="tmdb-hit-main" type="button" data-action="preview" data-id="${id}">
        ${poster}
        <span class="tmdb-hit-text">
          <span class="tmdb-row-title">${escapeHtml(resultTitle(item))}</span>
          <span class="tmdb-row-year">${resultYear(item)}</span>
        </span>
      </button>
      ${side}
    </div>`;
}

function renderResults() {
  modalResults.innerHTML = lastResults.size
    ? [...lastResults.values()].map(resultRowHtml).join("")
    : `<p class="results-status">${t("No results.")}</p>`;
}

// One row redrawn in place, so the list keeps its scroll (and the
// keyboard its place: a focused button is focused again in the new row).
function refreshRow(id) {
  const row = modalResults.querySelector(`.tmdb-hit[data-id="${id}"]`);
  const item = lastResults.get(id);
  if (!row || !item) return;
  const focused = row.contains(document.activeElement) ? document.activeElement.dataset.action : null;
  row.outerHTML = resultRowHtml(item);
  if (focused) modalResults.querySelector(`.tmdb-hit[data-id="${id}"] [data-action="${focused}"]`)?.focus();
}

/* ---------- the side: hint, loading, details ---------- */

function showPreviewHint() {
  const had = previewId;
  previewId = null;
  if (had != null) refreshRow(had);
  modalSplit.classList.remove("is-previewing");
  modalPreview.innerHTML = `
    <div class="tmdb-preview-hint">
      <p class="tmdb-preview-hand">${
        lastResults.size ? t("Pick a title from the list to see its details here.") : t("Search for a title, then pick one to see its details here.")
      }</p>
    </div>`;
}

// The poster, stamped "In your library" (or "In this collection") when
// the title is already there.
function previewPosterHtml(id, path) {
  const poster = path
    ? `<img class="tmdb-preview-poster" src="${TMDB_IMG_LG}${escapeHtml(path)}" alt="" />`
    : `<div class="tmdb-preview-poster tmdb-poster-empty"></div>`;
  return `<div class="tmdb-preview-poster-wrap">${poster}${haveIds.has(id) ? previewStampHtml() : ""}</div>`;
}

const previewStampHtml = () => `<span class="tmdb-have-stamp">${haveLabel()}</span>`;

// What the side's main button says, and whether it can be pressed.
function previewActionHtml(id) {
  if (haveIds.has(id)) {
    return `<button class="tmdb-go-btn tmdb-preview-action" type="button" data-id="${id}" disabled>${haveLabel()}</button>`;
  }
  if (batchMode) {
    const picked = batchSelection.has(id);
    return `<button class="tmdb-go-btn tmdb-preview-action${picked ? " is-picked" : ""}" type="button" data-action="pick" data-id="${id}" aria-pressed="${picked}">${picked ? t("✓ Picked") : t("+ Pick")}</button>`;
  }
  return `<button class="tmdb-go-btn tmdb-preview-action" type="button" data-action="add" data-id="${id}">${t("+ Add")}</button>`;
}

function refreshPreviewAction() {
  const btn = modalPreview.querySelector(".tmdb-preview-action");
  if (btn && previewId != null && !btn.textContent.endsWith("…")) btn.outerHTML = previewActionHtml(previewId);
}

async function showPreview(id, { retry = false } = {}) {
  const item = lastResults.get(id);
  if (!item) return;
  // Already on the side, loaded or on its way: nothing to redo.
  if (id === previewId && !retry) {
    modalSplit.classList.add("is-previewing");
    return;
  }
  const had = previewId;
  previewId = id;
  if (had != null && had !== id) refreshRow(had);
  refreshRow(id);
  modalSplit.classList.add("is-previewing");

  const known = previewDetails.get(id);
  if (known) {
    renderPreviewDetails(known);
    modalPreview.scrollTop = 0;
    return;
  }

  // Straight away: what the search already knows, and that the rest is on its way.
  modalPreview.innerHTML = `
    <button class="tmdb-preview-back" type="button" data-action="back">${t("← Results")}</button>
    <div class="tmdb-preview-scroll"><div class="tmdb-preview-body">
      <div class="tmdb-preview-top">
        ${previewPosterHtml(id, item.poster_path)}
        <div class="tmdb-preview-head">
          <h3 class="detail-title">${escapeHtml(resultTitle(item))}</h3>
          <p class="detail-meta-runtime">${resultYear(item)}</p>
        </div>
      </div>
      <div class="tmdb-preview-loading" role="status">
        <span class="tmdb-preview-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        ${t("Loading its details…")}
      </div>
    </div></div>`;
  modalPreview.scrollTop = 0;

  try {
    const details = await tmdbDetails(currentType, id);
    previewDetails.set(id, details);
    if (previewId !== id) return;
    renderPreviewDetails(details);
  } catch (err) {
    if (previewId !== id) return;
    console.error("TMDB error:", err.message);
    modalPreview.querySelector(".tmdb-preview-loading").outerHTML = `
      <div class="tmdb-preview-failed" role="alert">
        ${t("Couldn't load its details.")}
        <button class="tmdb-preview-retry" type="button" data-action="retry">${t("Try again")}</button>
      </div>`;
  }
}

function renderPreviewDetails(details) {
  const id = details.id;
  const genreLine = (details.genres ?? []).map((g) => genreName(englishGenre(g))).join(" · ");
  const date = details.release_date ?? details.first_air_date ?? "";
  // What scrolls is wrapped apart from the way back, so on a phone the
  // details can be a sheet of their own over the results (css/responsive.css).
  modalPreview.innerHTML = `
    <button class="tmdb-preview-back" type="button" data-action="back">${t("← Results")}</button>
    <div class="tmdb-preview-scroll"><div class="tmdb-preview-body">
      <div class="tmdb-preview-top">
        ${previewPosterHtml(id, details.poster_path)}
        <div class="tmdb-preview-head">
          <h3 class="detail-title">${escapeHtml(details.title ?? details.name ?? t("No title"))}</h3>
          <p class="detail-meta-runtime">${date ? date.slice(0, 4) : "—"} · ${runtimeLine(currentType, details)}</p>
          ${genreLine ? `<p class="detail-genre-line">${escapeHtml(genreLine)}</p>` : ""}
        </div>
      </div>
      <p class="detail-synopsis">${escapeHtml(details.overview || t("No synopsis available."))}</p>
      <div class="tmdb-preview-actions">
        ${previewActionHtml(id)}
        <div class="detail-trailer">${TRAILER_BTN_LOADING}</div>
      </div>
      ${whereToWatchSlotHtml()}
    </div></div>`;
  // On a phone the synopsis is cut to three lines; "more" opens it there.
  markCut(modalPreview.querySelector(".detail-synopsis"));
  const stillShowing = () => previewId === id && !modal.classList.contains("hidden");
  loadPreviewTrailer(id, stillShowing);
  loadWhereToWatch(modalPreview.querySelector(".where-to-watch"), currentType, id, stillShowing);
}

// The same trailer lookup (and button) as the detail window's.
async function loadPreviewTrailer(id, stillShowing) {
  let key = null;
  let failed = false;
  try {
    key = await fetchTrailerKey(currentType === "movie" ? "movies" : "shows", id);
  } catch (err) {
    console.error("Trailer error:", err.message);
    failed = true;
  }
  const btn = modalPreview.querySelector(".trailer-btn");
  if (!stillShowing() || !btn) return;
  btn.removeAttribute("aria-busy");
  if (!key) {
    btn.textContent = failed ? t("Trailer unavailable") : t("No trailer");
    return;
  }
  btn.closest(".detail-trailer").dataset.key = key;
  btn.disabled = false;
}

/* ---------- picking and adding ---------- */

function togglePick(id) {
  const item = lastResults.get(id);
  if (!item || haveIds.has(id) || batchBusy) return;
  if (batchSelection.has(id)) batchSelection.delete(id);
  else batchSelection.set(id, item);
  refreshRow(id);
  if (previewId === id) refreshPreviewAction();
  updateBatchFooter();
}

// A title that's in now (added here, or from another window): it can't be
// picked or added again.
function markResultAdded(id) {
  const tmdbId = Number(id);
  haveIds.add(tmdbId);
  batchSelection.delete(tmdbId);
  refreshRow(tmdbId);
  if (previewId === tmdbId) {
    const btn = modalPreview.querySelector(".tmdb-preview-action");
    if (btn) btn.outerHTML = previewActionHtml(tmdbId);
    const wrap = modalPreview.querySelector(".tmdb-preview-poster-wrap");
    if (wrap && !wrap.querySelector(".tmdb-have-stamp")) wrap.insertAdjacentHTML("beforeend", previewStampHtml());
  }
  updateBatchFooter();
}

// Only there once something's picked: what will be added, each with a ×.
function updateBatchFooter() {
  const n = batchSelection.size;
  batchFooter.classList.toggle("hidden", !batchMode || (n === 0 && !batchBusy));
  if (batchBusy) return;
  batchPicked.innerHTML = [...batchSelection.values()]
    .map(
      (item) => `<span class="batch-chip">${escapeHtml(resultTitle(item))}<button type="button" data-unpick="${item.id}" aria-label="${escapeHtml(t("Remove {title}", { title: resultTitle(item) }))}">×</button></span>`
    )
    .join("");
  batchAddBtn.textContent =
    currentType === "movie" ? tn(n, "Add {n} movie", "Add {n} movies") : tn(n, "Add {n} show", "Add {n} shows");
  batchAddBtn.disabled = n === 0;
}

async function runBatchAdd() {
  if (batchBusy || !batchSelection.size) return;

  batchBusy = true;
  const items = [...batchSelection.values()];
  batchAddBtn.disabled = true;
  modalInput.disabled = true;
  modalClear.disabled = true;
  modalClose.disabled = true;

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    batchPicked.textContent = t("Adding {n} of {total}…", { n: i + 1, total: items.length });
    const item = items[i];
    try {
      if (collectionAddMode) {
        const result = await addTmdbTitleToCollection(currentType, item.id);
        if (result === "added") ok++;
        else skipped++;
        continue;
      }
      const existing = await fetchExistingIds(currentType, [item.id]);
      if (existing.has(item.id)) {
        skipped++;
        continue;
      }
      const details = await tmdbDetails(currentType, item.id);
      const table = currentType === "movie" ? "movies" : "shows";
      const { data, error } = await db
        .from(table)
        .insert(buildRecord(currentType, details))
        .select()
        .single();
      if (error?.code === UNIQUE_VIOLATION) {
        skipped++; // added from elsewhere since the check above
        continue;
      }
      if (error) throw new Error(error.message);
      applyLocalChange(table, "INSERT", data);
      ok++;
    } catch (err) {
      console.error("Batch item failed:", item.id, err.message);
      failed++;
    }
  }

  batchBusy = false;
  batchSelection.clear();
  modalInput.disabled = false;
  modalClear.disabled = false;
  modalClose.disabled = false;
  updateBatchFooter();
  if (collectionAddMode) refreshCollectionAfterAdd(ok > 0 ? currentType : undefined);

  showToast(
    t("Added {added} · Skipped {skipped} · Failed {failed}", { added: ok, skipped, failed }),
    failed > 0
  );
  closeModal();
}

/* ---------- events ---------- */

document.querySelectorAll(".add-btn").forEach((btn) => {
  btn.addEventListener("click", () => openAddFlow(btn.dataset.type));
});

document.querySelector(".content").addEventListener("click", (e) => {
  const ghost = e.target.closest(".ghost-card");
  if (ghost) openAddFlow(ghost.dataset.type);
});

modalInput.addEventListener("input", () => queueSearch());

modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") queueSearch(true);
});

modalClear.addEventListener("click", () => {
  modalInput.value = "";
  queueSearch(true);
  modalInput.focus();
});

modalClose.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

modalResults.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = Number(el.dataset.id);
  if (el.dataset.action === "pick") togglePick(id);
  if (el.dataset.action === "preview") showPreview(id);
});

modalPreview.addEventListener("click", (e) => {
  const trailerBtn = e.target.closest('[data-action="toggle-trailer"]');
  if (trailerBtn) {
    toggleTrailer(trailerBtn);
    return;
  }
  // On a phone the trailer plays over the window: a tap on the dim closes it.
  if (detailPhoneLayout.matches && e.target.classList.contains("detail-trailer-frame")) {
    toggleTrailer(modalPreview.querySelector('[data-action="toggle-trailer"]'));
    return;
  }
  const cut = e.target.closest(".detail-synopsis.is-cut");
  if (cut) {
    cut.classList.remove("is-cut");
    cut.classList.add("is-open");
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "pick") togglePick(Number(el.dataset.id));
  if (action === "add") addToLibrary(currentType, el.dataset.id, el);
  if (action === "retry" && previewId != null) showPreview(previewId, { retry: true });
  if (action === "back") {
    const id = previewId;
    // On a phone the details slide down off the results first.
    slideAway(modalPreview, () => {
      showPreviewHint();
      modalResults.querySelector(`.tmdb-hit[data-id="${id}"] .tmdb-hit-main`)?.focus();
    });
  }
});

batchPicked.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-unpick]");
  if (chip) togglePick(Number(chip.dataset.unpick));
});

batchAddBtn.addEventListener("click", runBatchAdd);

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
