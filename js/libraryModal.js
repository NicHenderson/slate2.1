const libraryModal = document.getElementById("library-modal");
const libraryTitle = document.getElementById("library-title");
const libraryFilter = document.getElementById("library-filter");
const libraryResults = document.getElementById("library-results");
const libraryClose = document.getElementById("library-close");
const librarySearchHint = document.getElementById("library-search-hint");
const libraryTabs = document.getElementById("library-tabs");
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

function pendingRows() {
  if (collectionAddMode) {
    // Everything on the matching To Watch list that isn't in the collection yet.
    const gridId = libraryType === "movie" ? "grid-movies-towatch" : "grid-shows-towatch";
    const inCollection = new Set(
      collectionItemsFor(openCollectionId).map((i) => i.item_id)
    );
    return [...STORE[GRID_CONFIG[gridId].table].values()].filter(
      (r) => GRID_CONFIG[gridId].match(r) && !inCollection.has(r.id)
    );
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
    ? `<img class="add-poster" src="${row.poster}" alt="" loading="lazy" />`
    : `<div class="add-poster add-poster-empty"></div>`;
  const selected = collectionAddMode && librarySelection.has(row.id);
  return `
    <div class="add-card library-row${selected ? " selected" : ""}" data-id="${row.id}">
      <div class="add-card-inner">
        ${poster}
        ${collectionAddMode ? `<span class="add-check" aria-hidden="true">✓</span>` : ""}
      </div>
      <p class="add-title">${escapeHtml(row.title ?? "Untitled")}</p>
    </div>`;
}

function renderLibraryList() {
  const q = libraryFilter.value.trim().toLowerCase();
  const rows = pendingRows().filter((r) =>
    (r.title ?? "").toLowerCase().includes(q)
  );
  const emptyText = collectionAddMode
    ? q
      ? "No matches in your To Watch list."
      : "Nothing left on your To Watch list to add."
    : q
      ? "No matches in your library."
      : "Nothing pending yet.";
  libraryResults.innerHTML = rows.length
    ? rows.map(libraryRowHtml).join("")
    : `<p class="results-status">${emptyText}</p>`;
}

function updateLibraryFooter() {
  const n = librarySelection.size;
  libraryCount.textContent = `${n} selected`;
  libraryAddBtn.textContent = `Add Selected (${n})`;
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
    ? "Add Titles"
    : type === "movie"
      ? "Add Movie"
      : "Add TV Show";
  libraryTabs.classList.toggle("hidden", !collectionAddMode);
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
  libraryAddBtn.textContent = "Adding…";
  try {
    const ids = [...librarySelection];
    const added = await addLibraryTitlesToCollection(ids);
    librarySelection.clear();
    refreshCollectionAfterAdd(collectionTypeOfIds(ids));
    closeLibraryModal();
    showToast(`Added ${added} title${added === 1 ? "" : "s"}.`);
  } catch (err) {
    console.error("Add to collection error:", err.message);
    showToast("Could not add titles — try again.", true);
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
