const updateModal = document.getElementById("update-modal");
const updateForm = document.getElementById("update-form");
const updateDate = document.getElementById("update-date");
const updateReview = document.getElementById("update-review");
const updateSave = document.getElementById("update-save");
const updateCancel = document.getElementById("update-cancel");
const updateClose = document.getElementById("update-close");
const updateViewingFields = document.getElementById("update-viewing-fields");
const updateViewingNote = document.getElementById("update-viewing-note");
const updateViewingNoteCount = document.getElementById("update-viewing-note-count");
const updateDateError = document.getElementById("update-date-error");
const updateViewingsHint = document.getElementById("update-viewings-hint");

const updateStarsInput = createStarsInput(
  document.getElementById("update-stars"),
  document.getElementById("update-stars-fill"),
  document.getElementById("update-rating-value")
);

let updateRow = null;
// The viewing the date and note fields stand for: the movie's only one
// (Edit), or none yet (Mark as watched). Null with several viewings: then
// the fields are hidden, and each viewing is changed from the detail
// window's list instead (js/viewings.js).
let updateViewing = null;
let updateManyViewings = false;

const syncViewingNoteCount = () => {
  updateViewingNoteCount.textContent = `${updateViewingNote.value.length}/${VIEWING_NOTE_MAX}`;
};
updateViewingNote.addEventListener("input", syncViewingNoteCount);
updateDate.addEventListener("input", () => {
  if (updateDate.value) updateDateError.classList.add("hidden");
});

function openMarkAsWatchedModal(row, isNewInsert = false) {
  updateRow = row;
  const watched = row.watched_date != null;
  const viewings = viewingsOf(row.id);
  updateManyViewings = watched && viewings.length > 1;
  updateViewing = watched && viewings.length === 1 ? viewings[0] : null;

  updateStarsInput.set(row.rating ?? 0);
  updateDate.value = updateViewing?.watched_on || row.watched_date || localToday();
  updateViewingNote.value = updateViewing?.note ?? "";
  syncViewingNoteCount();
  updateDateError.classList.add("hidden");
  updateReview.value = row.review || "";
  updateViewingFields.classList.toggle("hidden", updateManyViewings);
  updateViewingsHint.classList.toggle("hidden", !updateManyViewings);
  updateViewingsHint.textContent = updateManyViewings
    ? `Watched ${viewings.length} times — each date and note is under “${viewings.length} viewings” in the movie's window.`
    : "";
  document.getElementById("update-title").textContent = watched
    ? "Edit"
    : isNewInsert
      ? "Add Movie"
      : "Mark as watched";
  document.getElementById("update-movie-title").textContent = row.title ?? "Untitled";
  document.getElementById("update-movie-meta").textContent =
    `${row.release_year ?? "—"} · ${formatRuntime(row.duration)}`;
  document.getElementById("update-poster").innerHTML = row.poster
    ? `<img class="update-poster-img" src="${row.poster}" alt="" />`
    : `<div class="update-poster-img update-poster-empty"></div>`;
  document
    .getElementById("update-delete")
    .classList.toggle("hidden", isNewInsert);
  updateModal.classList.remove("hidden");
}

function closeUpdateModal() {
  updateModal.classList.add("hidden");
}

// A watched movie always keeps a date (migration 0007): it can be changed,
// never emptied. Marking one watched writes watched_date, which the
// database turns into its first viewing; its note is then added to it.
updateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!updateRow) return;
  const movieId = updateRow.id;
  const wasWatched = updateRow.watched_date != null;
  const date = updateDate.value;
  if (!updateManyViewings && !date) {
    updateDateError.classList.remove("hidden");
    updateDate.focus();
    return;
  }

  updateSave.disabled = true;
  updateSave.textContent = "Saving…";
  const rating = updateStarsInput.get();
  const opinion = { rating: rating > 0 ? rating : null, review: updateReview.value.trim() || null };
  const note = updateViewingNote.value.trim() || null;

  let error = null;
  if (updateManyViewings) {
    ({ error } = await db.from("movies").update(opinion).eq("id", movieId));
  } else if (updateViewing) {
    // Edit, one viewing: its date and note, then the rating and review.
    const changed = updateViewing.watched_on !== date || (updateViewing.note ?? null) !== note;
    if (changed) {
      const res = await db.from("viewings").update({ watched_on: date, note }).eq("id", updateViewing.id).select().single();
      error = res.error;
      if (!error) storeViewing(res.data);
    }
    if (!error) ({ error } = await db.from("movies").update(opinion).eq("id", movieId));
  } else {
    // Mark as watched (or a watched movie whose viewings couldn't load).
    ({ error } = await db.from("movies").update({ ...opinion, watched_date: date }).eq("id", movieId));
    if (!error && note) {
      const res = await db.from("viewings").update({ note }).eq("movie_id", movieId).select();
      if (res.error) console.error("Viewing note error:", res.error.message);
      else res.data.forEach(storeViewing);
    }
  }

  updateSave.disabled = false;
  updateSave.textContent = "Save Changes";

  if (error) {
    console.error("Update error:", error.message);
    showToast("Could not save changes — please try again.", true);
    return;
  }

  // Shown at once, ahead of the realtime echo. A movie just marked watched
  // has no viewing here yet (the database made it): its date comes along.
  const movie = STORE.movies.get(movieId);
  if (movie) {
    Object.assign(movie, opinion);
    if (!wasWatched) movie.watched_date = date;
  }
  afterViewingsChanged(movieId);
  closeUpdateModal();
  closeDetailModal();
  showToast(wasWatched ? "Changes saved." : "Marked as watched.");
});

updateCancel.addEventListener("click", closeUpdateModal);
updateClose.addEventListener("click", closeUpdateModal);

document.getElementById("update-delete").addEventListener("click", () => {
  if (updateRow) openDeleteConfirm("movies", updateRow);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("confirm-modal").classList.contains("hidden")) return;
  if (!updateModal.classList.contains("hidden")) closeUpdateModal();
});

updateModal.addEventListener("click", (e) => {
  if (e.target === updateModal) closeUpdateModal();
});
