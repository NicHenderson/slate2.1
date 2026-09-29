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

function syncStartExtra() {
  const finished = Boolean(startFinishDate.value);
  startExtra.classList.toggle("hidden", !finished);
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
  clearStaleNote(startForm);
  startHeartsInput.set(row.rating ?? 0);
  startDate.value = row.started_watching_date || localToday();
  startFinishDate.value = row.finished_watching_date || "";
  startReview.value = row.review || "";
  startDatesError.classList.add("hidden");
  syncFutureNote(startDate);
  syncFutureNote(startFinishDate);
  document.getElementById("start-title").textContent = isNewInsert
    ? t("Add TV Show")
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

  // The rating and review are optional, as for a movie.
  if (finished) {
    const rating = startHeartsInput.get();
    payload.rating = rating > 0 ? rating : null;
    payload.review = startReview.value.trim() || null;
  } else {
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
  applyLocalChange("shows", "UPDATE", data);
  showToast(finished ? t("Marked as watched.") : t("Started watching."));
  // A finished show has every episode ticked (js/episodes.js).
  if (newlyFinished) tickAllEpisodes(data);
});

startCancel.addEventListener("click", () => closeStartModal());
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
