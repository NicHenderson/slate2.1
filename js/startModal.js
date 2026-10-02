const startModal = document.getElementById("start-modal");
const startForm = document.getElementById("start-form");
const startDate = document.getElementById("start-date");
const startFinishDate = document.getElementById("start-finish-date");
const startExtra = document.getElementById("start-extra");
const startReview = document.getElementById("start-review");
const startSave = document.getElementById("start-save");
const startCancel = document.getElementById("start-cancel");
const startClose = document.getElementById("start-close");
const startDatesError = document.getElementById("start-dates-error");

const startHeartsInput = createHeartsInput(
  document.getElementById("start-hearts"),
  document.getElementById("start-rating-value")
);

let startRow = null;
// Told whether the window was saved when it closes: set by
// openFinishShowModal (ticking a show's last episode, js/episodes.js).
let startAfterClose = null;
// Opened over the search right after adding the show there: saving closes
// the search too (as js/updateModal.js does for a movie).
let startFromSearch = false;

function syncStartExtra() {
  const finished = Boolean(startFinishDate.value);
  startExtra.classList.toggle("hidden", !finished);
}

// A show kept watching after something new came out (js/episodes.js) is
// still rated and reviewed from before: finishing it again says so, and
// that they can stay (the owner's pick, mockup 1d). No other show being
// watched has a rating or review: they're only saved with a finished date,
// and emptied when it's cleared by hand.
//
// A finished show with something new since (edited rather than kept
// watching) gets the same note, saying so and offering to keep watching
// it (the owner's idea), once TMDB has said so.
function syncRefinishNote() {
  const row = startRow;
  const rated = row.rating != null || Boolean(row.review);
  const reopened = !row.finished_watching_date && rated;
  showRefinishNote(reopened ? "before" : null);
  if (!row.finished_watching_date || !rated || row.is_dropped) return;
  newSinceFinished(row)
    .then((news) => {
      if (news && startRow === row && !startModal.classList.contains("hidden")) showRefinishNote("news");
    })
    .catch(() => {}); // nothing said: the form works as before
}

// Which note shows: "before" (kept watching), "news" (not yet), or none.
function showRefinishNote(kind) {
  document.getElementById("start-refinish-note").classList.toggle("hidden", !kind);
  document.getElementById("start-refinish-before").classList.toggle("hidden", kind !== "before");
  document.getElementById("start-refinish-news").classList.toggle("hidden", kind !== "news");
  document.getElementById("start-refinish-keep").classList.toggle("hidden", kind !== "news");
}

// A show can't be finished before it was started: unlike a date in the
// future, that one is refused, as it would give "Avg time to finish" a
// negative number of days.
const datesOutOfOrder = () =>
  Boolean(startDate.value && startFinishDate.value) && startFinishDate.value < startDate.value;

function syncDatesError() {
  if (!datesOutOfOrder()) startDatesError.classList.add("hidden");
}

startFinishDate.addEventListener("input", () => {
  syncStartExtra();
  syncDatesError();
});
startDate.addEventListener("input", syncDatesError);

function openStartWatchingModal(row, isNewInsert = false) {
  startRow = row;
  startAfterClose = null;
  startFromSearch = isNewInsert;
  clearStaleNote(startForm);
  startHeartsInput.set(row.rating ?? 0);
  startDate.value = row.started_watching_date || localToday();
  startFinishDate.value = row.finished_watching_date || "";
  startReview.value = row.review || "";
  startDatesError.classList.add("hidden");
  syncRefinishNote();
  syncFutureNote(startDate);
  syncFutureNote(startFinishDate);
  // Named for what it does: a show already started is being edited.
  document.getElementById("start-title").textContent = isNewInsert
    ? t("Add TV Show")
    : row.started_watching_date
      ? t("Edit")
      : t("Start watching");
  document.getElementById("start-show-title").textContent = row.title ?? t("Untitled");
  document.getElementById("start-show-meta").textContent =
    `${row.release_year ?? "—"} · ${detailDurationLine("shows", row)}`;
  document.getElementById("start-poster").innerHTML = row.poster
    ? `<img class="update-poster-img" src="${escapeHtml(row.poster)}" alt="" />`
    : `<div class="update-poster-img update-poster-empty"></div>`;
  document
    .getElementById("start-delete")
    .classList.toggle("hidden", isNewInsert);
  syncStartExtra();
  startModal.classList.remove("hidden");
}

// The same window, to finish a Watching show: today's date already in
// "Finished on", so the rating and review show at once.
function openFinishShowModal(row, afterClose = null) {
  openStartWatchingModal(row);
  startAfterClose = afterClose;
  document.getElementById("start-title").textContent = t("Finished it?");
  startFinishDate.value = localToday();
  syncStartExtra();
  syncFutureNote(startFinishDate);
}

function closeStartModal(saved = false) {
  startModal.classList.add("hidden");
  const after = startAfterClose;
  startAfterClose = null;
  after?.(saved);
}

startForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!startRow) return;

  if (futureDateIn(startDate, startFinishDate)) return;
  if (datesOutOfOrder()) {
    startDatesError.classList.remove("hidden");
    startFinishDate.focus();
    return;
  }

  const finished = startFinishDate.value || null;
  const newlyFinished = Boolean(finished) && !startRow.finished_watching_date;
  const payload = {
    started_watching_date: startDate.value || null,
    finished_watching_date: finished,
  };

  // The rating and review are optional, as for a movie, and only asked
  // with a finished date. A finished date cleared by hand takes them with
  // it (Slate's rule, the owner's); a show being watched keeps what it
  // has: one kept watching after a new season keeps its own (js/episodes.js).
  if (finished) {
    const rating = startHeartsInput.get();
    payload.rating = rating > 0 ? rating : null;
    payload.review = startReview.value.trim() || null;
  } else if (startRow.finished_watching_date) {
    payload.rating = null;
    payload.review = null;
  }

  startSave.disabled = true;
  startSave.textContent = t("Saving…");

  const { data, error } = await db.from("shows").update(payload).eq("id", startRow.id).select().single();

  startSave.disabled = false;
  startSave.textContent = t("Save Changes");

  if (error) {
    console.error("Update error:", error.message);
    showToast(t("Could not save changes — please try again."), true);
    return;
  }

  closeStartModal(true);
  closeDetailModal();
  if (startFromSearch) closeModal();
  applyLocalChange("shows", "UPDATE", data);
  showToast(finished ? t("Marked as watched.") : t("Started watching."));
  // A finished show has every episode ticked (js/episodes.js).
  if (newlyFinished) tickAllEpisodes(data);
});

startCancel.addEventListener("click", () => closeStartModal());

// From the note: out of Edit, and asked as the detail window's button asks.
document.getElementById("start-refinish-keep").addEventListener("click", () => {
  const row = STORE.shows.get(startRow.id) ?? startRow;
  closeStartModal();
  confirmKeepWatching(row);
});
startClose.addEventListener("click", () => closeStartModal());

document.getElementById("start-delete").addEventListener("click", () => {
  if (startRow) openDeleteConfirm("shows", startRow);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("confirm-modal").classList.contains("hidden")) return;
  if (!startModal.classList.contains("hidden")) closeStartModal();
});

startModal.addEventListener("click", (e) => {
  if (e.target === startModal) closeStartModal();
});
