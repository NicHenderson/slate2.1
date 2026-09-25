const confirmModal = document.getElementById("confirm-modal");
const confirmModalPanel = document.querySelector(".confirm-modal");
const confirmHeading = document.getElementById("confirm-heading");
const confirmWarningIcon = document.getElementById("confirm-warning-icon");
const confirmText = document.getElementById("confirm-text");
const confirmTypedCheck = document.getElementById("confirm-typed-check");
const confirmTypedInput = document.getElementById("confirm-typed-input");
const confirmError = document.getElementById("confirm-error");
const confirmYes = document.getElementById("confirm-yes");
const confirmCancel = document.getElementById("confirm-cancel");

let pendingDelete = null;
let requiredTypedTitle = null;

const DELETE_NOUNS = { movies: "movie", shows: "show", collections: "collection" };

// A movie counts as watched once it has a watched_date; a show counts as
// watched once it has actually been finished (not just started/watching).
function isAlreadyWatched(table, row) {
  if (table === "movies") return row.watched_date != null;
  if (table === "shows") return row.finished_watching_date != null;
  return false;
}

function openDeleteConfirm(table, row) {
  pendingDelete = { table, row };
  const noun = DELETE_NOUNS[table] ?? "item";
  const title = row.title ?? row.name;
  const watched = isAlreadyWatched(table, row);

  confirmModalPanel.classList.toggle("confirm-danger", watched);
  confirmWarningIcon.classList.toggle("hidden", !watched);
  confirmTypedCheck.classList.toggle("hidden", !watched);

  if (watched) {
    requiredTypedTitle = title;
    confirmHeading.textContent = "You've already watched this";
    confirmText.innerHTML = `You've already watched <strong>"${escapeHtml(title)}"</strong> — deleting it now means losing your rating and review for good. If you're sure, type <strong>"${escapeHtml(title)}"</strong> below and press Delete.`;
    confirmTypedInput.value = "";
    confirmTypedInput.placeholder = title;
    confirmYes.disabled = true;
  } else {
    requiredTypedTitle = null;
    confirmHeading.textContent = "Delete";
    confirmText.textContent = `Are you sure you want to delete this ${noun}: "${title}"?`;
    confirmYes.disabled = false;
  }

  confirmError.classList.add("hidden");
  confirmModal.classList.remove("hidden");
  if (watched) confirmTypedInput.focus();
}

function closeConfirmModal() {
  confirmModal.classList.add("hidden");
}

confirmTypedInput.addEventListener("input", () => {
  if (requiredTypedTitle == null) return;
  confirmYes.disabled = confirmTypedInput.value.trim() !== requiredTypedTitle;
});

confirmYes.addEventListener("click", async () => {
  if (!pendingDelete) return;
  // Belt-and-suspenders: the button is already disabled until the typed
  // title matches, but never delete a watched title on a technicality.
  if (requiredTypedTitle != null && confirmTypedInput.value.trim() !== requiredTypedTitle) {
    return;
  }

  confirmYes.disabled = true;
  confirmYes.textContent = "Deleting…";

  const { error } = await db
    .from(pendingDelete.table)
    .delete()
    .eq("id", pendingDelete.row.id);

  confirmYes.disabled = false;
  confirmYes.textContent = "Yes, delete";

  if (error) {
    console.error("Delete error:", error.message);
    confirmError.textContent = "Could not delete — please try again.";
    confirmError.classList.remove("hidden");
    return;
  }

  const deletedTable = pendingDelete.table;
  const deletedId = pendingDelete.row.id;
  closeConfirmModal();
  closeUpdateModal();
  closeStartModal();
  closeDetailModal();
  if (deletedTable === "collections") {
    STORE.collections.delete(deletedId);
    closeCollectionView();
    renderCollections();
  } else {
    // A deleted movie/show can still be sitting in one or more collections —
    // without this, its collection_items row(s) would outlive it, and every
    // collection view would have to keep silently filtering out dead
    // references forever. Realtime's own DELETE handler cleans up STORE and
    // re-renders once this echoes back, same as it does for the row above.
    const { error: cleanupError } = await db
      .from("collection_items")
      .delete()
      .eq("item_id", deletedId);
    if (cleanupError) {
      console.error("Collection cleanup error:", cleanupError.message);
    }
  }
  showToast("Deleted from your library.");
});

confirmCancel.addEventListener("click", closeConfirmModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmModal.classList.contains("hidden")) {
    closeConfirmModal();
  }
});

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});
