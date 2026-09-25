const updateModal = document.getElementById("update-modal");
const updateForm = document.getElementById("update-form");
const updateDate = document.getElementById("update-date");
const updateReview = document.getElementById("update-review");
const updateSave = document.getElementById("update-save");
const updateCancel = document.getElementById("update-cancel");
const updateClose = document.getElementById("update-close");

const updateStarsInput = createStarsInput(
  document.getElementById("update-stars"),
  document.getElementById("update-stars-fill"),
  document.getElementById("update-rating-value")
);

let updateRow = null;

function openMarkAsWatchedModal(row, isNewInsert = false) {
  updateRow = row;
  updateStarsInput.set(row.rating ?? 0);
  updateDate.value = row.watched_date || localToday();
  updateReview.value = row.review || "";
  document.getElementById("update-title").textContent = isNewInsert
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

updateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!updateRow) return;

  updateSave.disabled = true;
  updateSave.textContent = "Saving…";

  const watchedDate = updateDate.value || null;
  const rating = updateStarsInput.get();
  const { error } = await db
    .from("movies")
    .update({
      watched_date: watchedDate,
      rating: watchedDate && rating > 0 ? rating : null,
      review: watchedDate ? updateReview.value.trim() || null : null,
    })
    .eq("id", updateRow.id);

  updateSave.disabled = false;
  updateSave.textContent = "Save Changes";

  if (error) {
    console.error("Update error:", error.message);
    showToast("Could not save changes — please try again.", true);
    return;
  }

  closeUpdateModal();
  closeDetailModal();
  showToast("Marked as watched.");
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
