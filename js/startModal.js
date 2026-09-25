const startModal = document.getElementById("start-modal");
const startForm = document.getElementById("start-form");
const startDate = document.getElementById("start-date");
const startFinishDate = document.getElementById("start-finish-date");
const startExtra = document.getElementById("start-extra");
const startReview = document.getElementById("start-review");
const startSave = document.getElementById("start-save");
const startCancel = document.getElementById("start-cancel");
const startClose = document.getElementById("start-close");

const startStarsInput = createStarsInput(
  document.getElementById("start-stars"),
  document.getElementById("start-stars-fill"),
  document.getElementById("start-rating-value")
);

let startRow = null;

function syncStartExtra() {
  const finished = Boolean(startFinishDate.value);
  startExtra.classList.toggle("hidden", !finished);
  startReview.required = finished;
}

startFinishDate.addEventListener("input", syncStartExtra);

function openStartWatchingModal(row, isNewInsert = false) {
  startRow = row;
  startStarsInput.set(row.rating ?? 0);
  startDate.value = row.started_watching_date || localToday();
  startFinishDate.value = row.finished_watching_date || "";
  startReview.value = row.review || "";
  document.getElementById("start-title").textContent = isNewInsert
    ? "Add TV Show"
    : "Start watching";
  document.getElementById("start-show-title").textContent = row.title ?? "Untitled";
  document.getElementById("start-show-meta").textContent =
    `${row.release_year ?? "—"} · ${detailDurationLine("shows", row)}`;
  document.getElementById("start-poster").innerHTML = row.poster
    ? `<img class="update-poster-img" src="${row.poster}" alt="" />`
    : `<div class="update-poster-img update-poster-empty"></div>`;
  document
    .getElementById("start-delete")
    .classList.toggle("hidden", isNewInsert);
  syncStartExtra();
  startModal.classList.remove("hidden");
}

function closeStartModal() {
  startModal.classList.add("hidden");
}

startForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!startRow) return;

  const finished = startFinishDate.value || null;
  const payload = {
    started_watching_date: startDate.value || null,
    finished_watching_date: finished,
  };

  if (finished) {
    const rating = startStarsInput.get();
    if (rating <= 0) {
      showToast("A rating is required when you set a finish date.", true);
      return;
    }
    payload.rating = rating;
    payload.review = startReview.value.trim();
  } else {
    payload.rating = null;
    payload.review = null;
  }

  startSave.disabled = true;
  startSave.textContent = "Saving…";

  const { error } = await db.from("shows").update(payload).eq("id", startRow.id);

  startSave.disabled = false;
  startSave.textContent = "Save Changes";

  if (error) {
    console.error("Update error:", error.message);
    showToast("Could not save changes — please try again.", true);
    return;
  }

  closeStartModal();
  closeDetailModal();
  showToast(finished ? "Marked as watched." : "Started watching.");
});

startCancel.addEventListener("click", closeStartModal);
startClose.addEventListener("click", closeStartModal);

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
