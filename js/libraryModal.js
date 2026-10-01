const libraryModal = document.getElementById("library-modal");
const libraryTitle = document.getElementById("library-title");
const libraryFilter = document.getElementById("library-filter");
const libraryResults = document.getElementById("library-results");
const libraryClose = document.getElementById("library-close");
const librarySearchHint = document.getElementById("library-search-hint");
const libraryPickerTools = document.getElementById("library-tools");
const libraryTabs = document.getElementById("library-tabs");
const libraryShowWatched = document.getElementById("library-show-watched");
const libraryFooter = document.getElementById("library-footer");
const libraryCount = document.getElementById("library-count");
const libraryAddBtn = document.getElementById("library-add-btn");
const modalBack = document.getElementById("modal-back");

let libraryType = "movie";
let dualSearchOpen = false;

// Collection mode only: ids ticked so far, kept across the Movies / Shows tabs.
const librarySelection = new Set();

function openAddFlow(type) {
  if (type === "collection") {
    openCreateCollectionModal();
    return;
  }
  if (type === "collection-titles") {
    // "+ Add" inside an open collection: same modal as Movies / Shows, with
    // Movies | Shows tabs over your To Watch lists and multi-select.
    collectionAddMode = true;
    librarySelection.clear();
    openLibraryModal(colTab); // opens on the tab you're looking at
    return;
  }
  collectionAddMode = false;
  const active = document.querySelector(".section.active")?.id;
  if (active === "movies-watched" || active === "shows-watched") {
    openLibraryModal(type);
  } else {
    openModal(type);
  }
}

// Collection mode: is this row on its To Watch list (movies to watch,
// the Shows Queue)?
function isToWatchRow(row) {
  const gridId = libraryType === "movie" ? "grid-movies-towatch" : "grid-shows-towatch";
  return GRID_CONFIG[gridId].match(row);
}

function pendingRows() {
  if (collectionAddMode) {
    // What isn't in the collection yet: the To Watch list, and with "Show
    // watched ones too" everything else after it (watched, and for shows
    // also watching and dropped), each stamped with where it stands.
    const table = libraryType === "movie" ? "movies" : "shows";
    const inCollection = new Set(
      collectionItemsFor(openCollectionId).map((i) => i.item_id)
    );
    const rows = [...STORE[table].values()].filter((r) => !inCollection.has(r.id));
    const toWatch = rows.filter(isToWatchRow);
    return libraryShowWatched.checked ? [...toWatch, ...rows.filter((r) => !isToWatchRow(r))] : toWatch;
  }
  if (libraryType === "movie") {
    return [...STORE.movies.values()].filter((r) => r.watched_date === null);
  }
  return [...STORE.shows.values()].filter(
    (r) => r.finished_watching_date === null
  );
}

function libraryRowHtml(row) {
  const poster = row.poster
    ? `<img class="add-poster" src="${escapeHtml(row.poster)}" alt="" loading="lazy" />`
    : `<div class="add-poster add-poster-empty"></div>`;
  const selected = collectionAddMode && librarySelection.has(row.id);
  const stamp = collectionAddMode ? libraryStamp(row) : "";
  return `
    <div class="add-card library-row${selected ? " selected" : ""}" data-id="${row.id}">
      <div class="add-card-inner">
        ${poster}
        ${stamp ? `<span class="add-stamp">${stamp}</span>` : ""}
        ${collectionAddMode ? `<span class="add-check" aria-hidden="true">✓</span>` : ""}
      </div>
      <p class="add-title">${escapeHtml(row.title ?? t("Untitled"))}</p>
      ${cardGlanceHtml(libraryType === "movie" ? "grid-movies-towatch" : "grid-shows-towatch", row)}
    </div>`;
}

// Where a title that isn't to watch stands, stamped on its poster.
function libraryStamp(row) {
  if (isToWatchRow(row)) return "";
  if (libraryType === "movie") return t("Seen");
  if (row.is_dropped) return t("Abandoned");
  return row.finished_watching_date ? t("Seen") : t("Watching");
}

function renderLibraryList() {
  const q = libraryFilter.value.trim().toLowerCase();
  const rows = pendingRows().filter((r) =>
    (r.title ?? "").toLowerCase().includes(q)
  );
  const emptyText = collectionAddMode
    ? libraryShowWatched.checked
      ? q
        ? t("No matches in your library.")
        : t("Everything is already in this collection.")
      : q
        ? t("No matches in your To Watch list.")
        : t("Nothing left on your To Watch list to add.")
    : q
      ? t("No matches in your library.")
      : t("Nothing pending yet.");
  libraryResults.innerHTML = rows.length
    ? rows.map(libraryRowHtml).join("")
    : `<p class="results-status">${emptyText}</p>`;
}

function updateLibraryFooter() {
  const n = librarySelection.size;
  libraryCount.textContent = tn(n, "{n} selected", "{n} selected");
  libraryAddBtn.textContent = t("Add Selected ({n})", { n });
  libraryAddBtn.disabled = n === 0;
}

function syncLibraryTabs() {
  libraryTabs.querySelectorAll("[data-ctab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.ctab === libraryType);
  });
}

function openLibraryModal(type) {
  libraryType = type;
  dualSearchOpen = false;
  libraryTitle.textContent = collectionAddMode
    ? t("Add Titles")
    : type === "movie"
      ? t("Add Movie")
      : t("Add TV Show");
  libraryPickerTools.classList.toggle("hidden", !collectionAddMode);
  libraryShowWatched.checked = false; // off every time the window opens
  libraryFooter.classList.toggle("hidden", !collectionAddMode);
  syncLibraryTabs();
  updateLibraryFooter();
  libraryFilter.value = "";
  renderLibraryList();
  libraryModal.classList.remove("hidden");
  libraryFilter.focus();
}

function closeLibraryModal() {
  libraryModal.classList.add("hidden");
}

libraryFilter.addEventListener("input", renderLibraryList);

libraryShowWatched.addEventListener("change", () => {
  // Hiding them again lets go of any watched ones picked meanwhile: nothing
  // is added that isn't on screen.
  if (!libraryShowWatched.checked) {
    librarySelection.forEach((id) => {
      const row = STORE.movies.get(id) ?? STORE.shows.get(id);
      if (row && !GRID_CONFIG[STORE.movies.has(id) ? "grid-movies-towatch" : "grid-shows-towatch"].match(row)) {
        librarySelection.delete(id);
      }
    });
    updateLibraryFooter();
  }
  renderLibraryList();
});

libraryTabs.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-ctab]");
  if (!tab || tab.dataset.ctab === libraryType) return;
  libraryType = tab.dataset.ctab;
  dualSearchOpen = false; // the TMDB search re-opens for the new type
  syncLibraryTabs();
  renderLibraryList();
});

libraryResults.addEventListener("click", (e) => {
  const rowEl = e.target.closest(".library-row");
  if (!rowEl) return;

  if (collectionAddMode) {
    // Toggle in place (no re-render) so the grid keeps its scroll position.
    const id = rowEl.dataset.id;
    if (librarySelection.has(id)) librarySelection.delete(id);
    else librarySelection.add(id);
    rowEl.classList.toggle("selected", librarySelection.has(id));
    updateLibraryFooter();
    return;
  }

  const store = libraryType === "movie" ? STORE.movies : STORE.shows;
  const row = store.get(rowEl.dataset.id);
  if (!row) return;

  closeLibraryModal();
  if (libraryType === "movie") openMarkAsWatchedModal(row);
  else openStartWatchingModal(row);
});

libraryAddBtn.addEventListener("click", async () => {
  if (!librarySelection.size || !openCollectionId) return;
  libraryAddBtn.disabled = true;
  libraryAddBtn.textContent = t("Adding…");
  try {
    const ids = [...librarySelection];
    const added = await addLibraryTitlesToCollection(ids);
    librarySelection.clear();
    refreshCollectionAfterAdd(collectionTypeOfIds(ids));
    closeLibraryModal();
    showToast(tn(added, "Added {n} title.", "Added {n} titles."));
  } catch (err) {
    console.error("Add to collection error:", err.message);
    showToast(t("Could not add titles — try again."), true);
  }
  updateLibraryFooter();
});

librarySearchHint.addEventListener("click", () => {
  libraryModal.classList.add("hidden");
  modalBack.classList.remove("hidden");
  if (!dualSearchOpen) {
    openModal(libraryType);
    modalBack.classList.remove("hidden");
    dualSearchOpen = true;
  } else {
    modal.classList.remove("hidden");
    modalInput.focus();
  }
});

modalBack.addEventListener("click", () => {
  modal.classList.add("hidden");
  renderLibraryList();
  updateLibraryFooter();
  libraryModal.classList.remove("hidden");
  libraryFilter.focus();
});

libraryClose.addEventListener("click", closeLibraryModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !libraryModal.classList.contains("hidden")) {
    closeLibraryModal();
  }
});

libraryModal.addEventListener("click", (e) => {
  if (e.target === libraryModal) closeLibraryModal();
});
