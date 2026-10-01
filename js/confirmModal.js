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

// A whole sentence for each kind: in other languages "this" changes with
// the noun.
const DELETE_QUESTIONS = {
  movies: (title) => t('Are you sure you want to delete this movie: "{title}"?', { title }),
  shows: (title) => t('Are you sure you want to delete this show: "{title}"?', { title }),
  collections: (title) => t('Are you sure you want to delete this collection: "{title}"?', { title }),
};

// A movie counts as watched once it has a watched_date; a show counts as
// watched once it has actually been finished (not just started/watching).
function isAlreadyWatched(table, row) {
  if (table === "movies") return row.watched_date != null;
  if (table === "shows") return row.finished_watching_date != null;
  return false;
}

// Settings > Defaults > "Confirm before deleting" off: delete right away,
// watched titles included (the setting's hint says so).
function openDeleteConfirm(table, row) {
  if (!currentSettings.confirmDeletes) {
    deleteRecord(table, row).then((error) => {
      if (!error) return;
      console.error("Delete error:", error.message);
      showToast(t("Could not delete — please try again."), true);
    });
    return;
  }

  pendingDelete = { table, row };
  const title = row.title ?? row.name;
  const watched = isAlreadyWatched(table, row);
  asDeleteConfirm();

  confirmModalPanel.classList.toggle("confirm-danger", watched);
  confirmWarningIcon.classList.toggle("hidden", !watched);
  confirmTypedCheck.classList.toggle("hidden", !watched);

  if (watched) {
    requiredTypedTitle = title;
    confirmHeading.textContent = t("You've already watched this");
    confirmText.innerHTML = t(
      'You\'ve already watched <strong>"{title}"</strong> — deleting it now means losing your rating and review for good. If you\'re sure, type <strong>"{title}"</strong> below and press Delete.',
      { title: escapeHtml(title) }
    );
    confirmTypedInput.value = "";
    confirmTypedInput.placeholder = title;
    confirmYes.disabled = true;
  } else {
    requiredTypedTitle = null;
    confirmHeading.textContent = t("Delete");
    confirmText.textContent = DELETE_QUESTIONS[table](title);
    confirmYes.disabled = false;
  }

  confirmError.classList.add("hidden");
  confirmModal.classList.remove("hidden");
  if (watched) confirmTypedInput.focus();
}

// Deleting one of a movie's viewings (js/viewings.js): always asked, and
// only once the movie's title is typed, whatever "Confirm before deleting"
// says — a viewing can't be brought back. `run` does the delete and
// resolves to the error, or null.
function openViewingDeleteConfirm(movie, viewing, run) {
  const title = movie.title ?? t("Untitled");
  pendingDelete = { run };
  requiredTypedTitle = title;
  asDeleteConfirm();
  confirmModalPanel.classList.add("confirm-danger");
  confirmWarningIcon.classList.remove("hidden");
  confirmTypedCheck.classList.remove("hidden");
  confirmHeading.textContent = t("Delete this viewing");
  confirmText.innerHTML = t(
    'This deletes the time you watched <strong>"{title}"</strong> on <strong>{date}</strong>. It can\'t be undone. If you\'re sure, type <strong>"{title}"</strong> below and press Delete.',
    { title: escapeHtml(title), date: formatDate(viewing.watched_on) }
  );
  confirmTypedInput.value = "";
  confirmTypedInput.placeholder = title;
  confirmYes.disabled = true;
  confirmError.classList.add("hidden");
  confirmModal.classList.remove("hidden");
  confirmTypedInput.focus();
}

// Asked before something that isn't a delete (Keep watching, js/episodes.js):
// the same window, its button in the theme's color. `run` does it and
// resolves to the error, or null; `yes` / `busy` / `failed` are the
// button's label, its label meanwhile and the error shown.
function openActionConfirm({ heading, html, yes, busy, failed, run }) {
  pendingDelete = { run, yes, busy, failed };
  requiredTypedTitle = null;
  confirmModalPanel.classList.remove("confirm-danger");
  confirmModalPanel.classList.add("confirm-action");
  confirmWarningIcon.classList.add("hidden");
  confirmTypedCheck.classList.add("hidden");
  confirmHeading.textContent = heading;
  confirmText.innerHTML = html;
  confirmYes.textContent = yes;
  confirmYes.disabled = false;
  confirmError.classList.add("hidden");
  confirmModal.classList.remove("hidden");
}

// Back to a delete's look, after an action's.
function asDeleteConfirm() {
  confirmModalPanel.classList.remove("confirm-action");
  confirmYes.textContent = t("Yes, delete");
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

  const asked = pendingDelete;
  confirmYes.disabled = true;
  confirmYes.textContent = asked.busy ?? t("Deleting…");

  const error = pendingDelete.run
    ? await pendingDelete.run().then((err) => {
        if (!err) closeConfirmModal();
        return err;
      })
    : await deleteRecord(pendingDelete.table, pendingDelete.row);

  confirmYes.disabled = false;
  confirmYes.textContent = asked.yes ?? t("Yes, delete");

  if (error) {
    console.error("Delete error:", error.message);
    confirmError.textContent = asked.failed ?? t("Could not delete — please try again.");
    confirmError.classList.remove("hidden");
  }
});

// Deletes the row, closes every modal that was showing it and tidies up
// what referenced it. Resolves to the Supabase error, or null on success.
async function deleteRecord(table, row) {
  const { error } = await db.from(table).delete().eq("id", row.id);
  if (error) return error;

  closeConfirmModal();
  closeUpdateModal();
  closeStartModal();
  closeDetailModal();
  if (table === "collections") {
    STORE.collections.delete(row.id);
    closeCollectionView();
    renderCollections();
  } else {
    applyLocalChange(table, "DELETE", row);
    // A deleted movie/show can still be sitting in one or more collections —
    // without this, its collection_items row(s) would outlive it, and every
    // collection view would have to keep silently filtering out dead
    // references forever.
    const { error: cleanupError } = await db
      .from("collection_items")
      .delete()
      .eq("item_id", row.id);
    if (cleanupError) {
      console.error("Collection cleanup error:", cleanupError.message);
    } else {
      [...STORE.collectionItems.values()]
        .filter((item) => item.item_id === row.id)
        .forEach((item) => STORE.collectionItems.delete(item.id));
      renderCollections();
      refreshOpenCollection();
    }
  }
  showToast(t("Deleted from your library."));
  return null;
}

confirmCancel.addEventListener("click", closeConfirmModal);
document.getElementById("confirm-close").addEventListener("click", closeConfirmModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmModal.classList.contains("hidden")) {
    closeConfirmModal();
  }
});

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});
