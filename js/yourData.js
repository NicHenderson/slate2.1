/* ---------- Settings > Your Data ----------

   Export: everything the user has logged (movies, shows, collections and
   what's in them) as one .slate file, downloaded on the spot. Nothing from
   the profile or settings goes in it: the file carries content, not
   preferences, so it can be brought into any account.

   A .slate file is readable JSON:

     {
       "slate": "backup", "version": 1, "exported_at": "…", "about": "…",
       "counts": { "movies": 29, "shows": 20, "collections": 4, "collection_items": 17 },
       "movies": [ { "id": "…", "tmdb_id": 76341, "title": "…", "rating": 8, … } ],
       "shows":  [ … ],
       "collections": [ { "id": "…", "name": "…", "icon": "👻", "position": 1,
                          "items": [ { "item_type": "movie", "item_id": "…", "position": 1 } ] } ]
     }

   Rows keep every column but user_id (whoever imports becomes the owner).
   The ids only tie a collection's items to the titles in the same file. */

const SLATE_FILE_VERSION = 1;
const EXPORT_PAGE_SIZE = 1000; // Supabase's default cap on rows per request

const dataExportBtn = document.getElementById("data-export-btn");
const dataExportSummary = document.getElementById("data-export-summary");

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// What the file would hold right now, from what's on screen. Called by the
// grid renders (data.js, collections.js) so it follows every change.
function renderDataSummary() {
  if (!dataExportSummary) return;
  dataExportSummary.textContent =
    `${plural(STORE.movies.size, "movie")}, ${plural(STORE.shows.size, "show")} and ` +
    plural(STORE.collections.size, "collection");
}

// Every row of a table, however many: the app's own load reads one page,
// which is fine for drawing grids but a backup must never come up short.
// Pages until the exact count is reached (not until a short page, which a
// lower server-side cap would fake).
async function fetchAllRows(table) {
  const rows = [];
  for (;;) {
    const { data, error, count } = await db
      .from(table)
      .select("*", { count: "exact" })
      .order("created_at")
      .order("id")
      .range(rows.length, rows.length + EXPORT_PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (!data.length || rows.length >= (count ?? 0)) return rows;
  }
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
  const [movies, shows, collections, items] = await Promise.all(
    ["movies", "shows", "collections", "collection_items"].map(fetchAllRows)
  );

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
    },
    movies: movies.map((row) => withoutKeys(row, ["user_id"])),
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
  dataExportBtn.textContent = "Exporting…";
  const reset = () => {
    dataExportBtn.disabled = false;
    dataExportBtn.textContent = "Export data";
  };
  try {
    const file = await buildSlateBackup();
    downloadFile(file.name, file.text);
    dataExportBtn.textContent = "Downloaded ✓";
    showToast(`Saved ${file.name}`);
    dataExportReset = setTimeout(reset, 2000);
  } catch (err) {
    console.error("Export failed:", err);
    reset();
    showToast("Could not export your data. Nothing was downloaded.", true);
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
// Only TMDB's own image host: anything else would be the file making the
// page load whatever it likes.
const optPoster = (v) =>
  typeof v === "string" && v.startsWith("https://image.tmdb.org/") ? v : null;

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
    return { ...base, duration: optInt(row.duration), watched_date: optDate(row.watched_date) };
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
    // An emoji or one of the app's own "icon:name:color" values: short, and
    // nothing that could read as markup.
    icon: typeof col.icon === "string" && col.icon.length <= 32 && !/[<>"'&]/.test(col.icon) ? col.icon : null,
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
    throw new ImportError("This file is far too big to be a Slate backup.");
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new ImportError("This isn't a Slate backup — it couldn't be read as one.");
  }
  if (!data || typeof data !== "object" || data.slate !== "backup") {
    throw new ImportError("This isn't a Slate backup — it couldn't be read as one.");
  }
  if (!isInt(data.version) || data.version < 1) {
    throw new ImportError("This Slate file is damaged: it doesn't say which version it is.");
  }
  if (data.version > SLATE_FILE_VERSION) {
    throw new ImportError(
      "This file was made by a newer version of Slate. Refresh the page and try again."
    );
  }
  if (![data.movies, data.shows, data.collections].every(Array.isArray)) {
    throw new ImportError("This Slate file is damaged: part of it is missing.");
  }

  const movies = readTitleRows(data.movies, "movie");
  const shows = readTitleRows(data.shows, "show");
  const collections = data.collections.map(readCollection).filter(Boolean);
  const skipped = movies.skipped + shows.skipped + (data.collections.length - collections.length);

  if (!movies.kept.length && !shows.kept.length && !collections.length) {
    throw new ImportError("This backup is empty — there's nothing in it to import.");
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

function importReduceMotion() {
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-reduce-motion") === "true"
  );
}

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
  importToken++;
  importParsed = null;
  importModal.classList.add("hidden");
}

function showImportReading(fileName) {
  setImportHeader("Import data", "Reading your file", fileName);
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
      <p class="import-reading-title">Reading file…</p>
      <p class="import-reading-hint">Checking every title before showing you anything.</p>
      <div class="import-progress" aria-hidden="true"><span></span></div>
    </div>`
  );
}

function showImportError(fileName, message) {
  setImportHeader("Import data", "That file won't open", fileName);
  setImportView(
    "error",
    `<div class="import-error">
      <span class="import-error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 L21.5 20 L2.5 20 Z"/><line x1="12" y1="9.7" x2="12" y2="14.2"/><circle cx="12" cy="17.2" r="0.75" fill="currentColor" stroke="none"/></svg>
      </span>
      <p class="import-error-text" role="alert">${escapeHtml(message)}</p>
      <p class="import-note">Nothing in your account was touched.</p>
    </div>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="cancel-btn" data-import-action="close">Close</button>
        <button type="button" class="modal-search-btn" data-import-action="pick">Choose another file</button>
      </div>
    </div>`
  );
  importBody.querySelector('[data-import-action="pick"]').focus();
}

// "41 watched · 24 to watch", leaving out the parts that are zero.
function breakdown(parts) {
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}

function showImportSummary(fileName, parsed) {
  importParsed = parsed;
  const { movies, shows, collections, skipped } = parsed;
  const count = (rows, gridId) => rows.filter(GRID_CONFIG[gridId].match).length;
  const itemCount = collections.reduce((n, col) => n + col.items.length, 0);

  // A fan of the most recently added posters: proof at a glance that this
  // is the right file.
  const posters = [...movies, ...shows]
    .filter((row) => row.poster)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 5);

  const stat = (num, label, sub) => `
    <div class="import-stat">
      <span class="import-stat-num">${num}</span>
      <span class="import-stat-label">${label}</span>
      <span class="import-stat-sub">${sub || "&nbsp;"}</span>
    </div>`;

  const shownCols = collections.slice(0, 6);
  const chips = shownCols
    .map(
      (col) =>
        `<li class="import-chip"><span class="import-chip-icon">${iconHtml(escapeHtml(col.icon ?? ""))}</span>${escapeHtml(col.name)}<span class="import-chip-count">${col.items.length}</span></li>`
    )
    .join("");
  const moreCols = collections.length - shownCols.length;

  const exported = parsed.exportedAt
    ? `Exported ${new Date(parsed.exportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
    : "Export date unknown";
  setImportHeader("Import data · What's inside", fileName.replace(/\.slate$/i, ""), exported);

  setImportView(
    "summary",
    `${posters.length ? `<div class="import-fan" aria-hidden="true">${posters.map((row) => `<span class="import-fan-card"><img src="${escapeHtml(row.poster)}" alt="" /></span>`).join("")}</div>` : ""}
    <div class="import-stats">
      ${stat(movies.length, movies.length === 1 ? "Movie" : "Movies", breakdown([[count(movies, "grid-movies-watched"), "watched"], [count(movies, "grid-movies-towatch"), "to watch"]]))}
      ${stat(shows.length, shows.length === 1 ? "Show" : "Shows", breakdown([[count(shows, "grid-shows-watched"), "finished"], [count(shows, "grid-shows-watching"), "watching"], [count(shows, "grid-shows-towatch"), "to watch"], [count(shows, "grid-shows-dropped"), "dropped"]]))}
      ${stat(collections.length, collections.length === 1 ? "Collection" : "Collections", itemCount ? `${plural(itemCount, "title")} inside` : "")}
    </div>
    ${chips ? `<ul class="import-chips">${chips}${moreCols > 0 ? `<li class="import-chip import-chip-more">+${moreCols} more</li>` : ""}</ul>` : ""}
    ${skipped ? `<p class="import-warn">${skipped} ${skipped === 1 ? "entry" : "entries"} in this file couldn't be read and will be left out.</p>` : ""}
    <p class="import-note">Nothing changes in your account until you choose how to import it.</p>
    <div class="update-actions import-actions">
      <span></span>
      <div class="update-actions-right">
        <button type="button" class="cancel-btn" data-import-action="close">Cancel</button>
        <button type="button" class="modal-search-btn" data-import-action="continue">Continue</button>
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
      err instanceof ImportError ? err.message : "This file couldn't be read. Try exporting it again.";
  }
  const minimum = importReduceMotion() ? 0 : IMPORT_MIN_READING_MS;
  const left = minimum - (performance.now() - started);
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
  if (action === "continue") {
    // Stage 2 stops here: choosing how to import (add / replace) comes next.
    closeImportModal();
    showToast("Choosing how to import comes in the next step — nothing was changed.");
  }
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
