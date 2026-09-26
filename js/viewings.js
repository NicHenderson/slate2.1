/* ---------- Viewings: every time a movie was watched ----------

   (supabase/migrations/0007_viewings.sql.) A watched movie has one or more
   viewings — a date and an optional short note — while its rating and
   review stay one per movie. The database keeps movies.watched_date the
   latest viewing, never lets a movie lose its last one, and turns a
   watched_date written straight onto a movie (marking it watched) into its
   viewing.

   In the detail window of a watched movie: the latest date; with more
   than one viewing, an "N viewings" list, and picking one swaps the
   window's content to that viewing, to change its date or note or delete
   it. "Watched it again" opens the same view, empty. With a single viewing
   there's no list: its date and note are edited from Edit
   (js/updateModal.js). Shows don't have viewings (yet). */

const VIEWING_NOTE_MAX = 200;

// Movie id → its viewings, latest first. Rebuilt on the next read after
// any change to STORE.viewings.
let viewingIndex = null;

const byLatest = (a, b) =>
  (b.watched_on ?? "").localeCompare(a.watched_on ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? "");

function viewingsOf(movieId) {
  if (!viewingIndex) {
    viewingIndex = new Map();
    STORE.viewings.forEach((v) => {
      if (!viewingIndex.has(v.movie_id)) viewingIndex.set(v.movie_id, []);
      viewingIndex.get(v.movie_id).push(v);
    });
    viewingIndex.forEach((list) => list.sort(byLatest));
  }
  return viewingIndex.get(movieId) ?? [];
}

function storeViewing(row) {
  STORE.viewings.set(row.id, row);
  viewingIndex = null;
}

function forgetViewing(id) {
  STORE.viewings.delete(id);
  viewingIndex = null;
}

function resetViewings() {
  STORE.viewings.clear();
  viewingIndex = null;
}

// What the database does too (rule 1), done here at once so the lists
// re-sort and re-count without waiting for the realtime echo.
function afterViewingsChanged(movieId) {
  const movie = STORE.movies.get(movieId);
  const latest = viewingsOf(movieId)[0]?.watched_on;
  if (movie && latest) movie.watched_date = latest;
  MOVIE_GRIDS.forEach((gridId) => renderGrid(gridId, [...STORE.movies.values()]));
}

// A realtime change to a viewing, from this tab or another.
function handleViewingChange(payload) {
  // A delete names only the viewing's id: its movie is looked up first.
  const movieId = payload.eventType === "DELETE" ? STORE.viewings.get(payload.old.id)?.movie_id : payload.new.movie_id;
  if (payload.eventType === "DELETE") forgetViewing(payload.old.id);
  else storeViewing(payload.new);
  MOVIE_GRIDS.forEach((gridId) => renderGrid(gridId, [...STORE.movies.values()]));
  // The detail window, if it's showing that movie's summary (not while a
  // viewing is being edited there).
  if (!detailModal.classList.contains("hidden") && currentDetail?.cfg.table === "movies" && !currentDetail.viewing) {
    if (!movieId || currentDetail.row.id === movieId) showDetailMain();
  }
}

/* ---------- the detail window's summary ---------- */

// "×3" on a card of a movie watched more than once.
function rewatchBadgeHtml(row) {
  const n = viewingsOf(row.id).length;
  return n > 1 ? `<span class="card-rewatch" title="Watched ${n} times">×${n}</span>` : "";
}

// The date part of a watched movie's summary: the latest date, then its
// note (one viewing) or the list of every viewing (several).
function watchedDateBlockHtml(row) {
  const viewings = viewingsOf(row.id);
  const latest = viewings[0];
  const date = formatDate(latest?.watched_on ?? row.watched_date);
  if (viewings.length <= 1) {
    const note = latest?.note ? `<p class="viewing-note-line">${escapeHtml(latest.note)}</p>` : "";
    return `<p class="detail-label">Watched on</p><p class="detail-date-value">${date}</p>${note}`;
  }
  const open = Boolean(currentDetail?.viewingsOpen);
  return `
    <p class="detail-label">Last watched</p>
    <p class="detail-date-value">${date}</p>
    <button class="viewings-toggle" type="button" data-action="toggle-viewings" aria-expanded="${open}" aria-controls="viewings-list">
      <span class="viewings-caret" aria-hidden="true">▾</span>${viewings.length} viewings
    </button>`;
}

function viewingsListHtml(row) {
  const viewings = viewingsOf(row.id);
  if (viewings.length <= 1) return "";
  const items = viewings
    .map(
      (v) => `
      <li>
        <button class="viewing-item" type="button" data-action="open-viewing" data-viewing-id="${v.id}">
          <span class="viewing-item-date">${formatDate(v.watched_on)}</span>
          ${v.note ? `<span class="viewing-item-note">${escapeHtml(v.note)}</span>` : ""}
          <span class="viewing-item-go" aria-hidden="true">›</span>
        </button>
      </li>`
    )
    .join("");
  return `<ul class="viewings-list" id="viewings-list"${currentDetail?.viewingsOpen ? "" : " hidden"}>${items}</ul>`;
}

/* ---------- one viewing, in the detail window ---------- */

// `viewing` null: a new one ("Watched it again").
function openViewingView(movie, viewing) {
  currentDetail.viewing = { id: viewing?.id ?? null };
  const count = viewingsOf(movie.id).length;
  const deletable = viewing && count > 1;
  const note = viewing?.note ?? "";
  detailBody.innerHTML = `
    <button class="viewing-back" type="button" data-action="back-to-summary">← Back to ${escapeHtml(movie.title ?? "Untitled")}</button>
    <p class="viewing-eyebrow">${viewing ? "Viewing" : "Watched it again"}</p>
    <h2 class="detail-title">${escapeHtml(movie.title ?? "Untitled")}</h2>
    <form class="viewing-form" id="viewing-form" novalidate>
      <label class="field-label" for="viewing-date">Watched on</label>
      <input type="date" id="viewing-date" class="field-input" required value="${viewing?.watched_on ?? localToday()}" />
      <p class="field-error hidden" id="viewing-date-error" role="alert">Pick the day you watched it.</p>
      <div class="field-label-row">
        <label class="field-label" for="viewing-note">Note <span class="field-optional">(optional)</span></label>
        <span class="field-counter" id="viewing-note-count">${note.length}/${VIEWING_NOTE_MAX}</span>
      </div>
      <input type="text" id="viewing-note" class="field-input" maxlength="${VIEWING_NOTE_MAX}" value="${escapeHtml(note)}" placeholder="At the cinema, with friends, the director's cut…" />
      <p class="viewing-error hidden" id="viewing-error" role="alert"></p>
      <div class="detail-actions viewing-actions">
        ${deletable ? `<button class="delete-btn" type="button" data-action="delete-viewing">🗑 Delete viewing</button>` : ""}
        <button class="complete-btn" type="submit" id="viewing-save">${viewing ? "Save" : "Add viewing"}</button>
      </div>
    </form>`;
  updateDetailNav();
  document.getElementById("viewing-date").focus();
}

function backToSummary() {
  currentDetail.viewing = null;
  showDetailMain();
}

function viewingError(message) {
  const el = document.getElementById("viewing-error");
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

async function saveViewing() {
  const movie = currentDetail.row;
  const id = currentDetail.viewing?.id;
  const dateInput = document.getElementById("viewing-date");
  const dateError = document.getElementById("viewing-date-error");
  const date = dateInput.value;
  dateError.classList.toggle("hidden", Boolean(date));
  if (!date) {
    dateInput.focus();
    return;
  }
  const note = document.getElementById("viewing-note").value.trim() || null;
  const btn = document.getElementById("viewing-save");
  btn.disabled = true;
  viewingError("");

  const request = id
    ? db.from("viewings").update({ watched_on: date, note }).eq("id", id)
    : db.from("viewings").insert({ movie_id: movie.id, watched_on: date, note });
  const { data, error } = await request.select().single();
  btn.disabled = false;
  if (error) {
    console.error("Viewing save error:", error.message);
    viewingError("Couldn't save this viewing. Please try again.");
    return;
  }
  storeViewing(data);
  afterViewingsChanged(movie.id);
  currentDetail.viewingsOpen = true;
  backToSummary();
  showToast(id ? "Viewing saved." : "Viewing added.");
}

function deleteViewing() {
  const movie = currentDetail.row;
  const viewing = STORE.viewings.get(currentDetail.viewing?.id);
  if (!viewing) return;
  openViewingDeleteConfirm(movie, viewing, async () => {
    const { error } = await db.from("viewings").delete().eq("id", viewing.id);
    if (error) return error;
    forgetViewing(viewing.id);
    afterViewingsChanged(movie.id);
    backToSummary();
    showToast("Viewing deleted.");
    return null;
  });
}

detailBody.addEventListener("click", (e) => {
  if (!currentDetail || currentDetail.cfg.table !== "movies") return;
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "toggle-viewings") {
    currentDetail.viewingsOpen = !currentDetail.viewingsOpen;
    const list = document.getElementById("viewings-list");
    if (list) list.hidden = !currentDetail.viewingsOpen;
    e.target.closest("[data-action]").setAttribute("aria-expanded", String(currentDetail.viewingsOpen));
  }
  if (action === "open-viewing") {
    const viewing = STORE.viewings.get(e.target.closest("[data-viewing-id]").dataset.viewingId);
    if (viewing) openViewingView(currentDetail.row, viewing);
  }
  if (action === "watched-again") openViewingView(currentDetail.row, null);
  if (action === "back-to-summary") backToSummary();
  if (action === "delete-viewing") deleteViewing();
});

detailBody.addEventListener("submit", (e) => {
  if (e.target.id !== "viewing-form") return;
  e.preventDefault();
  saveViewing();
});

detailBody.addEventListener("input", (e) => {
  if (e.target.id === "viewing-note") {
    document.getElementById("viewing-note-count").textContent = `${e.target.value.length}/${VIEWING_NOTE_MAX}`;
  }
  if (e.target.id === "viewing-date" && e.target.value) {
    document.getElementById("viewing-date-error").classList.add("hidden");
  }
});
