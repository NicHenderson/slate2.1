/* ---------- Settings > Your Data ----------

   Export: everything the user has logged (movies, shows, collections and
   what's in them) as one .slate file, downloaded on the spot. Nothing from
   the profile or settings goes in it: the file carries content, not
   preferences, so it can be brought into any account.

   A .slate file is readable JSON:

     {
       "slate": "backup", "version": 2, "exported_at": "…", "about": "…",
       "counts": { "movies": 29, "shows": 20, "collections": 4, "collection_items": 17, "viewings": 23 },
       "movies": [ { "id": "…", "tmdb_id": 76341, "title": "…", "rating": 8, …,
                     "viewings": [ { "watched_on": "2024-10-31", "created_at": "…" }, … ] } ],
       "shows":  [ … ],
       "collections": [ { "id": "…", "name": "…", "icon": "👻", "position": 1,
                          "items": [ { "item_type": "movie", "item_id": "…", "position": 1 } ] } ]
     }

   Rows keep every column but user_id (whoever imports becomes the owner).
   The ids only tie a collection's items to the titles in the same file.
   A movie's viewings (js/viewings.js) are listed oldest first; its
   watched_date is still there, the latest of them.

   Version 1 (before viewings) had no "viewings": each watched movie of a
   version 1 file comes in with one viewing, on its watched_date. */

const SLATE_FILE_VERSION = 2;

const dataExportBtn = document.getElementById("data-export-btn");
const dataExportSummary = document.getElementById("data-export-summary");

// "2 movies, 1 show and 3 collections": the whole library in one phrase.
function libraryCounts(movies, shows, collections) {
  return t("{movies}, {shows} and {collections}", {
    movies: tn(movies, "{n} movie", "{n} movies"),
    shows: tn(shows, "{n} show", "{n} shows"),
    collections: tn(collections, "{n} collection", "{n} collections"),
  });
}

// What the file would hold right now, from what's on screen. Called by the
// grid renders (data.js, collections.js) so it follows every change.
function renderDataSummary() {
  if (!dataExportSummary) return;
  dataExportSummary.textContent = libraryCounts(STORE.movies.size, STORE.shows.size, STORE.collections.size);
}

function withoutKeys(row, keys) {
  const copy = { ...row };
  keys.forEach((key) => delete copy[key]);
  return copy;
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Reads everything fresh from the database (not STORE, which may be a page
// short or a realtime echo behind) and builds the file. All or nothing: any
// failed read throws, so a partial backup is never produced.
async function buildSlateBackup() {
  const [movies, shows, collections, items, viewings] = await Promise.all(
    ["movies", "shows", "collections", "collection_items", "viewings"].map(fetchAllRows)
  );

  // Only the date and when it was logged: the id and movie_id mean nothing
  // outside this account (and the note column is unused).
  const viewingsByMovie = new Map();
  viewings.forEach((v) => {
    const list = viewingsByMovie.get(v.movie_id) ?? [];
    list.push({ watched_on: v.watched_on, created_at: v.created_at });
    viewingsByMovie.set(v.movie_id, list);
  });
  viewingsByMovie.forEach((list) => list.sort(byOldestViewing));

  const titleIds = new Set([...movies, ...shows].map((row) => row.id));
  const itemsByCollection = new Map();
  items
    // An item whose title is gone would point at nothing on import.
    .filter((item) => titleIds.has(item.item_id))
    .forEach((item) => {
      const list = itemsByCollection.get(item.collection_id) ?? [];
      list.push(withoutKeys(item, ["id", "collection_id", "user_id"]));
      itemsByCollection.set(item.collection_id, list);
    });

  const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
  const fileCollections = collections.sort(byPos).map((col) => ({
    ...withoutKeys(col, ["user_id"]),
    items: (itemsByCollection.get(col.id) ?? []).sort(byPos),
  }));

  const backup = {
    slate: "backup",
    version: SLATE_FILE_VERSION,
    exported_at: new Date().toISOString(),
    about: "A Slate backup. Bring it back from Settings → Your Data in Slate.",
    counts: {
      movies: movies.length,
      shows: shows.length,
      collections: fileCollections.length,
      collection_items: fileCollections.reduce((n, col) => n + col.items.length, 0),
      viewings: movies.reduce((n, row) => n + (viewingsByMovie.get(row.id)?.length ?? 0), 0),
    },
    movies: movies.map((row) => ({ ...withoutKeys(row, ["user_id"]), viewings: viewingsByMovie.get(row.id) ?? [] })),
    shows: shows.map((row) => withoutKeys(row, ["user_id"])),
    collections: fileCollections,
  };

  return {
    name: `slate-backup-${todayStamp()}.slate`,
    text: JSON.stringify(backup, null, 2),
    counts: backup.counts,
  };
}

// octet-stream rather than application/json: some browsers (Safari) tack
// a ".json" onto the name to match a JSON type, and the file must stay .slate.
function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let dataExportReset = null;

async function exportData() {
  clearTimeout(dataExportReset);
  dataExportBtn.disabled = true;
  dataExportBtn.textContent = t("Exporting…");
  const reset = () => {
    dataExportBtn.disabled = false;
    dataExportBtn.textContent = t("Export data");
  };
  try {
    const file = await buildSlateBackup();
    downloadFile(file.name, file.text);
    dataExportBtn.textContent = t("Downloaded ✓");
    showToast(t("Saved {file}", { file: file.name }));
    dataExportReset = setTimeout(reset, 2000);
  } catch (err) {
    console.error("Export failed:", err);
    reset();
    showToast(t("Could not export your data. Nothing was downloaded."), true);
  }
}

dataExportBtn?.addEventListener("click", exportData);

/* ---------- Import: read the file and show what's inside ----------

   Nothing here writes to the account: a file is read, checked and
   summarised, and the summary is where the user decides whether to go on.
   The file can come from anyone (a friend's backup, a hand-edited one), so
   everything in it is treated as untrusted: rows are rebuilt from the known
   columns only, with each value type-checked, and every string that reaches
   the page goes through escapeHtml. */

const IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const IMPORT_MIN_READING_MS = 1600; // long enough for the reading animation to land

const dataImportBtn = document.getElementById("data-import-btn");
const dataImportInput = document.getElementById("data-import-input");
const importModal = document.getElementById("import-modal");
const importEyebrow = document.getElementById("import-eyebrow");
const importTitle = document.getElementById("import-title");
const importMeta = document.getElementById("import-meta");
const importBody = document.getElementById("import-body");

class ImportError extends Error {}

const isInt = (v) => Number.isInteger(v);
const optInt = (v, min = 0) => (isInt(v) && v >= min ? v : null);
const optText = (v, max = 20000) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const optDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const optTimestamp = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const optRating = (v) => (typeof v === "number" && v >= 0 && v <= 10 ? v : null);
// Only an image on TMDB's own host, as Slate saves them: anything else
// would be the file making the page load whatever it likes (or, with a
// quote in it, slipping markup in).
const optPoster = (v) =>
  typeof v === "string" && /^https:\/\/image\.tmdb\.org\/[\w/.-]+$/.test(v) ? v : null;

const byOldestViewing = (a, b) =>
  a.watched_on.localeCompare(b.watched_on) || (a.created_at ?? "").localeCompare(b.created_at ?? "");

// More than anyone could watch one movie: a cap on what a file can make
// the import write.
const IMPORT_MAX_VIEWINGS = 1000;

// A movie's viewings, oldest first: the file's own list (version 2), or,
// without one (version 1), a single viewing on its watched_date.
function readViewings(row) {
  const listed = (Array.isArray(row.viewings) ? row.viewings : [])
    .slice(0, IMPORT_MAX_VIEWINGS)
    .map((v) => (v && typeof v === "object" ? { watched_on: optDate(v.watched_on), created_at: optTimestamp(v.created_at) } : null))
    .filter((v) => v?.watched_on);
  if (listed.length) return listed.sort(byOldestViewing);
  const date = optDate(row.watched_date);
  return date ? [{ watched_on: date, created_at: null }] : [];
}

// A title as the import will write it, or null when it can't be (no TMDB id
// or no title). Unknown columns are dropped; a bad optional value is emptied.
function readTitleRow(row, type) {
  if (!row || typeof row !== "object") return null;
  const tmdbId = optInt(row.tmdb_id, 1);
  const title = optText(row.title, 500);
  if (!tmdbId || !title) return null;
  const base = {
    ref: typeof row.id === "string" ? row.id : null, // ties collection items to it
    tmdb_id: tmdbId,
    title,
    poster: optPoster(row.poster),
    synopsis: optText(row.synopsis),
    release_year: optInt(row.release_year, 1800),
    genres: optText(row.genres, 500),
    created_at: optTimestamp(row.created_at),
    review: optText(row.review),
    rating: optRating(row.rating),
    position: optInt(row.position, 1),
  };
  if (type === "movie") {
    // Its date is its latest viewing, as the database keeps it.
    const viewings = readViewings(row);
    return { ...base, duration: optInt(row.duration), watched_date: viewings.at(-1)?.watched_on ?? null, viewings };
  }
  return {
    ...base,
    total_seasons: optInt(row.total_seasons),
    total_episodes: optInt(row.total_episodes),
    started_watching_date: optDate(row.started_watching_date),
    finished_watching_date: optDate(row.finished_watching_date),
    is_dropped: row.is_dropped === true,
  };
}

function readCollection(col) {
  if (!col || typeof col !== "object") return null;
  const name = optText(col.name, 200);
  if (!name) return null;
  const items = (Array.isArray(col.items) ? col.items : [])
    .filter(
      (item) =>
        item &&
        (item.item_type === "movie" || item.item_type === "show") &&
        typeof item.item_id === "string"
    )
    .map((item) => ({
      item_type: item.item_type,
      item_ref: item.item_id,
      position: optInt(item.position, 1),
      created_at: optTimestamp(item.created_at),
    }));
  return {
    name: name.trim(),
    // An emoji or one of the app's own "icon:name:color" values, with
    // nothing that could read as markup. The column is required (not null,
    // no default: see supabase/migrations/0003_library.sql), so one that
    // can't be used becomes a star rather than failing the whole import.
    icon:
      typeof col.icon === "string" && col.icon.trim() && col.icon.length <= 64 && !/[<>"'&]/.test(col.icon)
        ? col.icon
        : "⭐",
    position: optInt(col.position, 1),
    created_at: optTimestamp(col.created_at),
    items,
  };
}

// Reads rows of one kind, keeping the first of any title the file lists
// twice. Returns the rows and how many were left out.
function readTitleRows(rows, type) {
  const seen = new Set();
  const kept = [];
  rows.forEach((row) => {
    const clean = readTitleRow(row, type);
    if (!clean || seen.has(clean.tmdb_id)) return;
    seen.add(clean.tmdb_id);
    kept.push(clean);
  });
  return { kept, skipped: rows.length - kept.length };
}

async function readSlateFile(file) {
  if (file.size > IMPORT_MAX_BYTES) {
    throw new ImportError(t("This file is far too big to be a Slate backup."));
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new ImportError(t("This isn't a Slate backup — it couldn't be read as one."));
  }
  if (!data || typeof data !== "object" || data.slate !== "backup") {
    throw new ImportError(t("This isn't a Slate backup — it couldn't be read as one."));
  }
  if (!isInt(data.version) || data.version < 1) {
    throw new ImportError(t("This Slate file is damaged: it doesn't say which version it is."));
  }
  if (data.version > SLATE_FILE_VERSION) {
    throw new ImportError(
      t("This file was made by a newer version of Slate. Refresh the page and try again.")
    );
  }
  if (![data.movies, data.shows, data.collections].every(Array.isArray)) {
    throw new ImportError(t("This Slate file is damaged: part of it is missing."));
  }

  const movies = readTitleRows(data.movies, "movie");
  const shows = readTitleRows(data.shows, "show");
  const collections = data.collections.map(readCollection).filter(Boolean);
  const skipped = movies.skipped + shows.skipped + (data.collections.length - collections.length);

  if (!movies.kept.length && !shows.kept.length && !collections.length) {
    throw new ImportError(t("This backup is empty — there's nothing in it to import."));
  }
  return {
    exportedAt: optTimestamp(data.exported_at),
    movies: movies.kept,
    shows: shows.kept,
    collections,
    skipped,
  };
}

/* ---------- the import window ---------- */

let importToken = 0; // a newer file (or closing) makes an older read's result moot
let importParsed = null;
let importFileName = "";
let importBusy = false; // writing to the account: the window can't be closed

function setImportHeader(eyebrow, title, meta) {
  importEyebrow.textContent = eyebrow;
  importTitle.textContent = title;
  importMeta.textContent = meta;
}

function setImportView(view, html) {
  importModal.dataset.view = view;
  importBody.innerHTML = html;
}

function openImportModal() {
  importModal.classList.remove("hidden");
}

function closeImportModal() {
  if (importBusy) return;
  importToken++;
  importParsed = null;
  importModal.classList.add("hidden");
}

function showImportReading(fileName) {
  setImportHeader(t("Import data"), t("Reading your file"), fileName);
  setImportView(
    "reading",
    `<div class="import-reading" role="status">
      <div class="import-envelope" aria-hidden="true">
        <span class="import-env-back"></span>
        <span class="import-env-card"></span>
        <span class="import-env-card"></span>
        <span class="import-env-card"></span>
        <span class="import-env-front"></span>
      </div>
      <p class="import-reading-title">${t("Reading file…")}</p>
      <p class="import-reading-hint">${t("Checking every title before showing you anything.")}</p>
      <div class="import-progress" aria-hidden="true"><span></span></div>
    </div>`
  );
}

function showImportError(fileName, message) {
  setImportHeader(t("Import data"), t("That file won't open"), fileName);
  setImportView(
    "error",
    `<div class="import-error">
      <span class="import-error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 L21.5 20 L2.5 20 Z"/><line x1="12" y1="9.7" x2="12" y2="14.2"/><circle cx="12" cy="17.2" r="0.75" fill="currentColor" stroke="none"/></svg>
      </span>
      <p class="import-error-text" role="alert">${escapeHtml(message)}</p>
      <p class="import-note">${t("Nothing in your account was touched.")}</p>
    </div>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="cancel-btn" data-import-action="close">${t("Close")}</button>
        <button type="button" class="modal-search-btn" data-import-action="pick">${t("Choose another file")}</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-action="pick"]').focus();
}

// "41 watched · 24 to watch", leaving out the parts that are zero. Each
// part is [count, its text with the count in it].
function breakdown(parts) {
  return parts
    .filter(([n]) => n > 0)
    .map(([, text]) => text)
    .join(" · ");
}

function showImportSummary(fileName, parsed) {
  importParsed = parsed;
  importFileName = fileName;
  const { movies, shows, collections, skipped } = parsed;
  const count = (rows, gridId) => rows.filter(GRID_CONFIG[gridId].match).length;
  const rewatches = movies.reduce((n, row) => n + Math.max(0, row.viewings.length - 1), 0);
  const [watchedMovies, towatchMovies] = [count(movies, "grid-movies-watched"), count(movies, "grid-movies-towatch")];
  const [finishedShows, watchingShows, towatchShows, droppedShows] = ["grid-shows-watched", "grid-shows-watching", "grid-shows-towatch", "grid-shows-dropped"].map((gridId) => count(shows, gridId));
  const itemCount = collections.reduce((n, col) => n + col.items.length, 0);

  // A fan of the most recently added posters: proof at a glance that this
  // is the right file.
  const posters = [...movies, ...shows]
    .filter((row) => row.poster)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 5);

  const parts = (text) =>
    text.split(" · ").map((part) => `<span class="import-stat-part">${part}</span>`).join(" · ");
  const stat = (num, label, sub) => `
    <div class="import-stat">
      <span class="import-stat-num">${num}</span>
      <span class="import-stat-label">${label}</span>
      <span class="import-stat-sub">${sub ? parts(sub) : "&nbsp;"}</span>
    </div>`;

  // Collections are counted, never listed by name: a file can hold
  // hundreds of them (the owner's call).
  const exported = parsed.exportedAt
    ? t("Exported {date}", { date: new Date(parsed.exportedAt).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }) })
    : t("Export date unknown");
  setImportHeader(t("Import data · What's inside"), fileName.replace(/\.slate$/i, ""), exported);

  setImportView(
    "summary",
    `${posters.length ? `<div class="import-fan" aria-hidden="true">${posters.map((row) => `<span class="import-fan-card"><img src="${escapeHtml(row.poster)}" alt="" /></span>`).join("")}</div>` : ""}
    <div class="import-stats">
      ${stat(movies.length, tn(movies.length, "Movie", "Movies"), breakdown([
        [watchedMovies, tn(watchedMovies, "{n} watched", "{n} watched")],
        [towatchMovies, tn(towatchMovies, "{n} to watch", "{n} to watch")],
        [rewatches, tn(rewatches, "{n} rewatch", "{n} rewatches")],
      ]))}
      ${stat(shows.length, tn(shows.length, "Show", "Shows"), breakdown([
        [finishedShows, tn(finishedShows, "{n} finished", "{n} finished")],
        [watchingShows, tn(watchingShows, "{n} watching", "{n} watching")],
        [towatchShows, tn(towatchShows, "{n} to watch", "{n} to watch")],
        [droppedShows, tn(droppedShows, "{n} dropped", "{n} dropped")],
      ]))}
      ${stat(collections.length, tn(collections.length, "Collection", "Collections"), itemCount ? tn(itemCount, "{n} title inside", "{n} titles inside") : "")}
    </div>
    ${skipped ? `<p class="import-warn">${tn(skipped, "{n} entry in this file couldn't be read and will be left out.", "{n} entries in this file couldn't be read and will be left out.")}</p>` : ""}
    <p class="import-note">${t("Nothing changes in your account until you choose how to import it.")}</p>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="cancel-btn" data-import-action="close">${t("Cancel")}</button>
        <button type="button" class="modal-search-btn" data-import-action="continue">${t("Continue")}</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-action="continue"]').focus();
}

async function startImport(file) {
  const token = ++importToken;
  importParsed = null;
  showImportReading(file.name);
  openImportModal();
  const started = performance.now();
  let parsed = null;
  let message = null;
  try {
    parsed = await readSlateFile(file);
  } catch (err) {
    if (!(err instanceof ImportError)) console.error("Import read failed:", err);
    message =
      err instanceof ImportError ? err.message : t("This file couldn't be read. Try exporting it again.");
  }
  // Always shown for the same time, reduced motion included (the envelope
  // just holds still then): a file "read" in a blink reads as nothing done.
  const left = IMPORT_MIN_READING_MS - (performance.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  if (token !== importToken) return; // closed, or another file was picked meanwhile
  if (message) showImportError(file.name, message);
  else showImportSummary(file.name, parsed);
}

function pickImportFile() {
  // A fine pointer means a desktop file dialog, where filtering by .slate
  // helps. Phones grey out extensions they don't know, so there any file
  // can be picked and readSlateFile does the checking.
  if (matchMedia("(pointer: fine)").matches) dataImportInput.accept = ".slate";
  else dataImportInput.removeAttribute("accept");
  dataImportInput.value = ""; // the same file twice in a row must still fire "change"
  dataImportInput.click();
}

dataImportBtn?.addEventListener("click", pickImportFile);

dataImportInput?.addEventListener("change", () => {
  const file = dataImportInput.files[0];
  if (file) startImport(file);
});

importBody?.addEventListener("click", (e) => {
  const action = e.target.closest("[data-import-action]")?.dataset.importAction;
  if (action === "close") closeImportModal();
  if (action === "pick") pickImportFile();
  if (action === "continue") showImportModes();
  if (action === "back") showImportSummary(importFileName, importParsed);
  if (action === "mode") selectImportMode(e.target.closest("[data-import-mode]"));
  if (action === "run") runImport();
  if (action === "confirm-replace") runImport(true);
});

importBody?.addEventListener("input", (e) => {
  if (e.target.id === "import-confirm-input") syncReplaceConfirm();
});

document.getElementById("import-close")?.addEventListener("click", closeImportModal);

importModal?.addEventListener("click", (e) => {
  if (e.target === importModal) closeImportModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && importModal && !importModal.classList.contains("hidden")) {
    closeImportModal();
  }
});

/* ---------- Import: choosing how ---------- */

let importMode = null;

function showImportModes() {
  importMode = null;
  setImportHeader(t("Import data · How to import"), importFileName.replace(/\.slate$/i, ""), t("Choose one"));
  setImportView(
    "modes",
    `<div class="import-modes" role="radiogroup" aria-label="${t("How to import")}">
      <button type="button" class="import-mode" role="radio" aria-checked="false" data-import-action="mode" data-import-mode="add">
        <span class="import-mode-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </span>
        <span class="import-mode-text">
          <span class="import-mode-title">${t("Add to my library")}</span>
          <span class="import-mode-desc">${t("Everything you have stays. New titles and collections are added; anything already in your library is left exactly as it is.")}</span>
        </span>
      </button>
      <button type="button" class="import-mode import-mode-danger" role="radio" aria-checked="false" data-import-action="mode" data-import-mode="replace">
        <span class="import-mode-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>
        </span>
        <span class="import-mode-text">
          <span class="import-mode-title">${t("Replace everything")}</span>
          <span class="import-mode-desc">${t("Deletes everything in your account and brings in only this file.")}</span>
        </span>
      </button>
    </div>
    <div class="update-actions import-actions">
      <button type="button" class="cancel-btn" data-import-action="back">${t("Back")}</button>
      <div class="update-actions-right">
        <button type="button" class="modal-search-btn" data-import-action="run" disabled>${t("Import")}</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-mode="add"]').focus();
}

function selectImportMode(option) {
  if (!option || option.disabled) return;
  importMode = option.dataset.importMode;
  importBody.querySelectorAll("[data-import-mode]").forEach((el) => {
    el.setAttribute("aria-checked", String(el === option));
  });
  importBody.querySelector('[data-import-action="run"]').disabled = false;
}

/* ---------- Import: writing ---------- */

const IMPORT_CHUNK = 200; // rows per insert
const IMPORT_MIN_WORKING_MS = 1200;

// Inserts rows in chunks and returns every row the database wrote. Each new
// id goes into `created` as soon as it exists, so a failure further on can
// take the import back out.
async function insertRows(table, rows, created, onRows) {
  const written = [];
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK);
    // defaultToNull: false — in a multi-row insert, a column some rows leave
    // out (created_at) gets its database default, not null.
    const { data, error } = await db.from(table).insert(chunk, { defaultToNull: false }).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    (data ?? []).forEach((row) => created[table].push(row.id));
    // With row-level security a refused insert can "succeed" with nothing
    // written; treat anything short as a failure.
    if ((data?.length ?? 0) !== chunk.length) {
      throw new Error(`${table}: the insert wrote fewer rows than expected`);
    }
    written.push(...data);
    onRows(chunk.length);
  }
  return written;
}

// Undoes a failed import: the items first, then what they pointed at.
async function deleteCreated(created) {
  for (const table of ["collection_items", "collections", "movies", "shows"]) {
    const ids = created[table];
    for (let i = 0; i < ids.length; i += IMPORT_CHUNK) {
      const { error } = await db.from(table).delete().in("id", ids.slice(i, i + IMPORT_CHUNK));
      if (error) {
        console.error("Import rollback failed:", table, error.message);
        return false;
      }
    }
  }
  return true;
}

// A value the database fills in by itself (created_at) is left out rather
// than sent as null.
function withoutNulls(row, keys) {
  const copy = { ...row };
  keys.forEach((key) => {
    if (copy[key] == null) delete copy[key];
  });
  return copy;
}

// A viewing of the file's as a row for one of the account's movies.
function viewingRow(movieId, viewing) {
  return withoutNulls({ movie_id: movieId, watched_on: viewing.watched_on, created_at: viewing.created_at }, ["created_at"]);
}

// Inserting (or updating) a movie with a watched_date makes its latest
// viewing (rule 3 of migration 0007): these are the ones before it.
function earlierViewingRows(movieId, viewings) {
  return viewings.slice(0, -1).map((v) => viewingRow(movieId, v));
}

// The file's titles as rows to insert. Their custom order among themselves
// is kept, after everything already in the account — but only when the
// account uses a custom order in that table at all: one that never has
// would otherwise open with the imported titles pinned first on the day it
// switches to one. Without positions they go last, oldest first.
function titleRowsToInsert(fileRows, accountRows) {
  const accountOrdered = accountRows.some((row) => row.position != null);
  const ranked = fileRows
    .filter((row) => row.position != null)
    .sort((a, b) => a.position - b.position);
  const rank = new Map(ranked.map((row, i) => [row, i]));
  const start = nextPos(accountRows);
  return fileRows.map((row) => {
    const { ref, viewings, ...rest } = row;
    rest.position = accountOrdered && rank.has(row) ? start + rank.get(row) : null;
    return withoutNulls(rest, ["created_at"]);
  });
}

const collectionKey = (name) => name.trim().toLowerCase();

// Add mode: the account keeps everything it has. A title it already has
// (same TMDB id) is skipped and the account's copy wins; a collection with
// the same name (ignoring case) takes in the file's titles it doesn't have
// yet. Reads the account fresh first, then writes titles → collections →
// collection items. If anything fails, whatever this import created is
// deleted again.
async function importAdd(parsed, onProgress) {
  const created = { movies: [], shows: [], collections: [], collection_items: [], viewings: [] };
  onProgress(t("Checking your library…"), 0);
  const [accMovies, accShows, accCols, accItems] = await Promise.all(
    ["movies", "shows", "collections", "collection_items"].map(fetchAllRows)
  );

  const idByTmdb = {
    movie: new Map(accMovies.map((row) => [row.tmdb_id, row.id])),
    show: new Map(accShows.map((row) => [row.tmdb_id, row.id])),
  };
  const newMovies = parsed.movies.filter((row) => !idByTmdb.movie.has(row.tmdb_id));
  const newShows = parsed.shows.filter((row) => !idByTmdb.show.has(row.tmdb_id));

  // Collections: the account's, by name (the first one if it has two with
  // the same name), each with the titles it already holds.
  const byName = new Map();
  [...accCols].sort(byPosition).forEach((col) => {
    const key = collectionKey(col.name);
    if (byName.has(key)) return;
    const items = accItems.filter((item) => item.collection_id === col.id);
    byName.set(key, { id: col.id, has: new Set(items.map((item) => item.item_id)), next: nextPos(items), existed: true });
  });
  const colsToCreate = [];
  const seenKeys = new Set();
  let colPos = nextPos(accCols);
  parsed.collections.forEach((col) => {
    const key = collectionKey(col.name);
    if (byName.has(key) || seenKeys.has(key)) return;
    seenKeys.add(key);
    colsToCreate.push(
      withoutNulls({ name: col.name, icon: col.icon, position: colPos++, created_at: col.created_at }, ["created_at"])
    );
  });
  const mergedInto = new Set(
    parsed.collections.map((col) => collectionKey(col.name)).filter((key) => byName.has(key))
  );

  const itemTotal = parsed.collections.reduce((n, col) => n + col.items.length, 0);
  const earlierTotal = newMovies.reduce((n, row) => n + Math.max(0, row.viewings.length - 1), 0);
  const total = Math.max(1, newMovies.length + earlierTotal + newShows.length + colsToCreate.length + itemTotal);
  let done = 0;
  const tick = (label) => (n) => {
    done += n;
    onProgress(label, done / total);
  };

  const written = { movies: [], shows: [], collections: [], collectionItems: [] };
  try {
    onProgress(t("Adding movies…"), 0);
    written.movies = await insertRows("movies", titleRowsToInsert(newMovies, accMovies), created, tick(t("Adding movies…")));
    // Each movie's earlier viewings (its latest came with its date). They
    // go with their movie if the import is undone.
    const movieIdByTmdb = new Map(written.movies.map((row) => [row.tmdb_id, row.id]));
    const earlier = newMovies.flatMap((row) => earlierViewingRows(movieIdByTmdb.get(row.tmdb_id), row.viewings));
    await insertRows("viewings", earlier, created, tick(t("Adding movies…")));
    onProgress(t("Adding shows…"), done / total);
    written.shows = await insertRows("shows", titleRowsToInsert(newShows, accShows), created, tick(t("Adding shows…")));
    written.movies.forEach((row) => idByTmdb.movie.set(row.tmdb_id, row.id));
    written.shows.forEach((row) => idByTmdb.show.set(row.tmdb_id, row.id));

    onProgress(t("Filling collections…"), done / total);
    written.collections = await insertRows("collections", colsToCreate, created, tick(t("Filling collections…")));
    written.collections.forEach((col) => {
      byName.set(collectionKey(col.name), { id: col.id, has: new Set(), next: 1, existed: false });
    });

    // A collection item in the file names a title of the same file by its
    // id there; it's found in the account by that title's TMDB id.
    const tmdbByRef = {
      movie: new Map(parsed.movies.map((row) => [row.ref, row.tmdb_id])),
      show: new Map(parsed.shows.map((row) => [row.ref, row.tmdb_id])),
    };
    const itemRows = [];
    parsed.collections.forEach((col) => {
      const target = byName.get(collectionKey(col.name));
      [...col.items]
        .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
        .forEach((item) => {
          const itemId = idByTmdb[item.item_type].get(tmdbByRef[item.item_type].get(item.item_ref));
          if (!itemId || target.has.has(itemId)) return;
          target.has.add(itemId);
          itemRows.push(
            withoutNulls(
              { collection_id: target.id, item_id: itemId, item_type: item.item_type, position: target.next++, created_at: item.created_at },
              ["created_at"]
            )
          );
        });
    });
    done = total - itemRows.length; // items skipped as already there count as done
    written.collectionItems = await insertRows("collection_items", itemRows, created, tick(t("Filling collections…")));
  } catch (err) {
    onProgress(t("Something went wrong — undoing…"), done / total);
    err.undone = await deleteCreated(created);
    throw err;
  }

  // Every viewing, fresh: the ones the database made itself aren't in any
  // reply. If this read fails, the realtime echoes bring them anyway.
  written.viewings = newMovies.length ? await fetchAllRows("viewings").catch(() => null) : null;

  onProgress(t("Done"), 1);
  return {
    written,
    report: {
      movies: written.movies.length,
      shows: written.shows.length,
      alreadyHad: parsed.movies.length - newMovies.length + (parsed.shows.length - newShows.length),
      newCollections: written.collections.length,
      mergedCollections: mergedInto.size,
      placed: written.collectionItems.length,
    },
  };
}

// The rows the import wrote go straight into STORE and every view redraws
// (the realtime echoes that follow find nothing left to change).
function applyImported(written) {
  written.movies.forEach((row) => STORE.movies.set(row.id, row));
  written.shows.forEach((row) => STORE.shows.set(row.id, row));
  written.collections.forEach((row) => STORE.collections.set(row.id, row));
  written.collectionItems.forEach((row) => STORE.collectionItems.set(row.id, row));
  if (written.viewings) {
    resetViewings();
    written.viewings.forEach(storeViewing);
  }
  rerenderGrids(Object.keys(GRID_CONFIG));
  renderCollections();
  refreshOpenCollection();
  if (typeof renderProfilePreview === "function") renderProfilePreview();
}

// Add counts its way up, request by request. Replace is one request with
// nothing to count, so its bar just slides.
function showImportWorking(determinate) {
  setImportHeader(t("Import data · Importing"), importFileName.replace(/\.slate$/i, ""), t("Keep this page open"));
  setImportView(
    "working",
    `<div class="import-reading" role="status">
      <div class="import-envelope is-filing" aria-hidden="true">
        <span class="import-env-back"></span>
        <span class="import-env-card"></span>
        <span class="import-env-card"></span>
        <span class="import-env-card"></span>
        <span class="import-env-front"></span>
      </div>
      <p class="import-reading-title" id="import-step">${t("Checking your library…")}</p>
      ${
        determinate
          ? `<p class="import-reading-hint" id="import-percent">0%</p>
      <div class="import-progress is-determinate" aria-hidden="true"><span id="import-bar"></span></div>`
          : `<div class="import-progress" aria-hidden="true"><span></span></div>`
      }
    </div>`
  );
}

function setImportProgress(label, fraction) {
  const step = document.getElementById("import-step");
  if (!step) return;
  step.textContent = label;
  if (fraction == null || !document.getElementById("import-percent")) return;
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  document.getElementById("import-percent").textContent = `${pct}%`;
  document.getElementById("import-bar").style.width = `${pct}%`;
}

function showImportDone(report) {
  const titles = report.movies + report.shows;
  const lines = [];
  if (titles) {
    const movies = tn(report.movies, "{n} movie", "{n} movies");
    const shows = tn(report.shows, "{n} show", "{n} shows");
    lines.push(
      report.movies && report.shows
        ? t("<strong>{movies} and {shows}</strong> added to your library.", { movies, shows })
        : t("<strong>{titles}</strong> added to your library.", { titles: report.movies ? movies : shows })
    );
  }
  if (report.alreadyHad) {
    lines.push(
      tn(report.alreadyHad, "{n} title was already there and stayed exactly as it was.", "{n} titles were already there and stayed exactly as they were.")
    );
  }
  const colParts = [];
  if (report.newCollections) colParts.push(tn(report.newCollections, "{n} new collection", "{n} new collections"));
  if (report.mergedCollections) {
    colParts.push(tn(report.mergedCollections, "{n} merged into one you had", "{n} merged into ones you had"));
  }
  const placed = report.placed ? tn(report.placed, "{n} title placed in collections", "{n} titles placed in collections") : "";
  if (colParts.length || placed) lines.push(`${[colParts.join(", "), placed].filter(Boolean).join(" — ")}.`);
  const nothing = !titles && !report.newCollections && !report.placed;

  setImportHeader(
    t("Import data · Done"),
    nothing ? t("Nothing new to add") : t("Import complete"),
    importFileName.replace(/\.slate$/i, "")
  );
  setImportView(
    "done",
    `<div class="import-done">
      <span class="import-done-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </span>
      ${nothing ? `<p class="import-done-line">${t("Everything in this file was already in your library. Nothing was changed.")}</p>` : lines.map((line) => `<p class="import-done-line">${line}</p>`).join("")}
    </div>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="modal-search-btn" data-import-action="close">${t("Done")}</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-action="close"]').focus();
}

function showImportFailed(undone, message) {
  setImportHeader(t("Import data"), t("The import didn't finish"), importFileName.replace(/\.slate$/i, ""));
  setImportView(
    "error",
    `<div class="import-error">
      <span class="import-error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 L21.5 20 L2.5 20 Z"/><line x1="12" y1="9.7" x2="12" y2="14.2"/><circle cx="12" cy="17.2" r="0.75" fill="currentColor" stroke="none"/></svg>
      </span>
      <p class="import-error-text" role="alert">${
        message ??
        (undone
          ? t("Something went wrong while importing, so it was undone: your library is exactly as it was.")
          : t("Something went wrong while importing, and not everything could be undone. Some titles from the file may be in your library now — nothing you already had was changed."))
      }</p>
      <p class="import-note">${t("Check your connection and try again.")}</p>
    </div>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="cancel-btn" data-import-action="close">${t("Close")}</button>
        <button type="button" class="modal-search-btn" data-import-action="back">${t("Try again")}</button>
      </div>
    </div>`
  );
}

function warnBeforeLeaving(e) {
  e.preventDefault();
  e.returnValue = "";
}

// Add runs straight away; Replace goes through the danger screen first and
// comes back here (confirmed) from its button.
async function runImport(confirmed = false) {
  if (importBusy || !importParsed) return;
  if (importMode === "replace" && !confirmed) {
    showReplaceDanger();
    return;
  }
  if (importMode === "replace" && !replaceConfirmed()) return;
  const replace = importMode === "replace";
  const backupFirst = replace && document.getElementById("import-backup-first")?.checked === true;
  clearInterval(replaceCountdown);
  importBusy = true;
  window.addEventListener("beforeunload", warnBeforeLeaving);
  showImportWorking(!replace);
  const started = performance.now();
  let outcome;
  try {
    const result = replace
      ? await importReplace(importParsed, backupFirst, setImportProgress)
      : await importAdd(importParsed, setImportProgress);
    outcome = { ok: true, ...result };
  } catch (err) {
    console.error("Import failed:", err);
    outcome = { ok: false, undone: err.undone === true, stage: err.stage };
  }
  const left = IMPORT_MIN_WORKING_MS - (performance.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  importBusy = false;
  window.removeEventListener("beforeunload", warnBeforeLeaving);
  if (outcome.ok && replace) {
    await reloadLibrary();
    showReplaceDone(outcome.report);
  } else if (outcome.ok) {
    applyImported(outcome.written);
    showImportDone(outcome.report);
  } else if (outcome.stage === "backup") {
    showImportFailed(true, t("Your backup couldn't be downloaded, so nothing was deleted or imported."));
  } else if (outcome.stage === "unknown") {
    // Trying again is safe either way: it ends with the file's library.
    showImportFailed(
      false,
      t("Slate lost contact with the server before it could confirm the replace. Your library is either exactly as it was or exactly this file — never a mix of the two. Refresh the page to see which.")
    );
  } else if (replace) {
    showImportFailed(true, t("Something went wrong while replacing, so nothing was changed: your library is exactly as it was."));
  } else {
    showImportFailed(outcome.undone);
  }
}

/* ---------- Import: Replace everything ----------

   The one import that deletes, so it asks three times over: a screen that
   says exactly what goes, a box to type "Delete Data" into that only opens
   after a few seconds (no confirming on reflex), and — ticked unless
   unticked — a backup of the current library downloaded before anything is
   touched. */

// Typed as it reads, in whichever language that is.
const REPLACE_CONFIRM_WORD = t("Delete Data");
const REPLACE_WAIT_SECONDS = 3;
let replaceCountdown = null;

// Exactly as it reads (only spaces around it are forgiven), the same rule
// as typing a title to delete it: the owner's call.
function replaceConfirmed() {
  const input = document.getElementById("import-confirm-input");
  if (!input || input.disabled) return false;
  return input.value.trim() === REPLACE_CONFIRM_WORD;
}

function syncReplaceConfirm() {
  const btn = importBody.querySelector('[data-import-action="confirm-replace"]');
  if (btn) btn.disabled = !replaceConfirmed();
}

function showReplaceDanger() {
  const have = {
    movies: STORE.movies.size,
    shows: STORE.shows.size,
    collections: STORE.collections.size,
  };
  const incoming = importParsed;
  setImportHeader(t("Import data · Replace everything"), t("This deletes your library"), importFileName.replace(/\.slate$/i, ""));
  setImportView(
    "danger",
    `<div class="import-danger">
      <p class="import-danger-text">
        ${t("Everything in your account — <strong>{have}</strong>, with every rating and review — will be deleted and replaced by this file's {incoming}. <strong>This can't be undone.</strong>", {
          have: libraryCounts(have.movies, have.shows, have.collections),
          incoming: libraryCounts(incoming.movies.length, incoming.shows.length, incoming.collections.length),
        })}
      </p>

      <label class="import-check">
        <input type="checkbox" id="import-backup-first" checked />
        <span class="import-check-box" aria-hidden="true"></span>
        <span class="import-check-text">
          <span class="import-check-title">${t("Download a backup of my library first")}</span>
          <span class="import-check-hint">${t("Saved as a .slate file before anything is deleted, so you can always bring it back.")}</span>
        </span>
      </label>

      <label class="import-confirm-label" for="import-confirm-input">${t("To confirm, type <strong>{phrase}</strong>", { phrase: REPLACE_CONFIRM_WORD })}</label>
      <div class="import-confirm-wrap">
        <input type="text" class="field-input import-confirm-input" id="import-confirm-input" autocomplete="off" autocapitalize="off" spellcheck="false" disabled placeholder="${t("Wait {n}…", { n: REPLACE_WAIT_SECONDS })}" />
        <span class="import-confirm-timer" id="import-confirm-timer" aria-hidden="true"></span>
      </div>
    </div>
    <div class="update-actions import-actions">
      <button type="button" class="cancel-btn" data-import-action="continue">${t("Back")}</button>
      <div class="update-actions-right">
        <button type="button" class="delete-btn import-replace-btn" data-import-action="confirm-replace" disabled>${t("Delete &amp; import")}</button>
      </div>
    </div>`
  );

  // The box stays locked for a few seconds, counting down in its placeholder
  // while a ring drains beside it.
  const input = document.getElementById("import-confirm-input");
  let left = REPLACE_WAIT_SECONDS;
  clearInterval(replaceCountdown);
  replaceCountdown = setInterval(() => {
    left -= 1;
    if (!input.isConnected) {
      clearInterval(replaceCountdown);
      return;
    }
    if (left > 0) {
      input.placeholder = t("Wait {n}…", { n: left });
      return;
    }
    clearInterval(replaceCountdown);
    input.disabled = false;
    input.placeholder = REPLACE_CONFIRM_WORD;
    input.closest(".import-confirm-wrap").classList.add("is-open");
    input.focus();
  }, 1000);
  importBody.querySelector('[data-import-action="continue"]').focus();
}

// Fresh copies of every row, keyed by table.
async function snapshotAccount() {
  const [movies, shows, collections, collectionItems, viewings] = await Promise.all(
    ["movies", "shows", "collections", "collection_items", "viewings"].map(fetchAllRows)
  );
  return { movies, shows, collections, collectionItems, viewings };
}

// The file as replace_my_library() (migration 0008) takes it. Every row
// gets its id here, so the viewings and the collection items can point at
// their titles within the one call.
function replacementLibrary(parsed) {
  const idByRef = { movie: new Map(), show: new Map() };
  const titleRows = (rows, type) =>
    rows.map((row) => {
      // No watched_date: a movie's viewings set it (rule 1 of migration 0007).
      const { ref, viewings, watched_date, ...fields } = row;
      const id = crypto.randomUUID();
      if (ref && !idByRef[type].has(ref)) idByRef[type].set(ref, id);
      return { ...fields, id };
    });
  const movies = titleRows(parsed.movies, "movie");
  const shows = titleRows(parsed.shows, "show");
  const viewings = parsed.movies.flatMap((row, i) =>
    row.viewings.map((v) => ({ movie_id: movies[i].id, watched_on: v.watched_on, created_at: v.created_at }))
  );
  const collections = [];
  const items = [];
  parsed.collections.forEach((col) => {
    const id = crypto.randomUUID();
    collections.push({ id, name: col.name, icon: col.icon, position: col.position, created_at: col.created_at });
    // A collection item in the file names a title of the same file by its
    // id there.
    const seen = new Set();
    col.items.forEach((item) => {
      const itemId = idByRef[item.item_type].get(item.item_ref);
      if (!itemId || seen.has(itemId)) return;
      seen.add(itemId);
      items.push({ collection_id: id, item_type: item.item_type, item_id: itemId, position: item.position, created_at: item.created_at });
    });
  });
  return { movies, shows, viewings, collections, items };
}

// Replace mode: the backup first, if asked for (if it can't be made,
// nothing happens), then the whole swap in one call to the database. That
// call is one transaction: the library ends up all the file's or exactly as
// it was, never a mix, even if the tab closes or the connection drops
// halfway.
async function importReplace(parsed, backupFirst, onProgress) {
  if (backupFirst) {
    onProgress(t("Saving a backup of your library…"));
    try {
      const file = await buildSlateBackup();
      downloadFile(file.name.replace("slate-backup-", "slate-backup-before-import-"), file.text);
    } catch (err) {
      err.stage = "backup";
      err.undone = true;
      throw err;
    }
  }

  onProgress(t("Replacing your library…"));
  const { data, error, status } = await db.rpc("replace_my_library", { library: replacementLibrary(parsed) });
  if (error) {
    const err = new Error(`replace_my_library: ${error.message}`);
    // An answer from the database, with its error code, means the call was
    // rolled back. No answer (the connection dropped, a gateway timed out)
    // leaves it unknown: it may have gone through all the same.
    err.undone = status > 0 && Boolean(error.code);
    if (!err.undone) err.stage = "unknown";
    throw err;
  }

  onProgress(t("Done"));
  return {
    report: {
      movies: parsed.movies.length,
      shows: parsed.shows.length,
      collections: parsed.collections.length,
      removed: data?.removed ?? 0,
      backup: backupFirst,
    },
  };
}

// After a replace nearly every row changed: read the library again and
// redraw everything from it, rather than patching STORE row by row.
async function reloadLibrary() {
  try {
    const snap = await snapshotAccount();
    STORE.movies.clear();
    STORE.shows.clear();
    STORE.collections.clear();
    STORE.collectionItems.clear();
    resetViewings();
    snap.viewings.forEach(storeViewing);
    snap.movies.forEach((row) => STORE.movies.set(row.id, row));
    snap.shows.forEach((row) => STORE.shows.set(row.id, row));
    snap.collections.forEach((row) => STORE.collections.set(row.id, row));
    snap.collectionItems.forEach((row) => STORE.collectionItems.set(row.id, row));
    rerenderGrids(Object.keys(GRID_CONFIG));
    renderCollections();
    refreshOpenCollection();
    if (typeof renderProfilePreview === "function") renderProfilePreview();
  } catch (err) {
    console.error("Reload after import failed:", err);
    showToast(t("Imported — refresh the page to see everything."), true);
  }
}

function showReplaceDone(report) {
  const lines = [
    t("Your library is now this file: <strong>{library}</strong>.", { library: libraryCounts(report.movies, report.shows, report.collections) }),
  ];
  if (report.removed) {
    lines.push(tn(report.removed, "{n} title that wasn't in the file was removed.", "{n} titles that weren't in the file were removed."));
  }
  if (report.backup) lines.push(t("Your previous library was downloaded as a backup first."));
  setImportHeader(t("Import data · Done"), t("Library replaced"), importFileName.replace(/\.slate$/i, ""));
  setImportView(
    "done",
    `<div class="import-done">
      <span class="import-done-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
      </span>
      ${lines.map((line) => `<p class="import-done-line">${line}</p>`).join("")}
    </div>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="modal-search-btn" data-import-action="close">${t("Done")}</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-action="close"]').focus();
}
