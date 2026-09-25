const modal = document.getElementById("search-modal");
const modalTitle = document.getElementById("modal-title");
const modalInput = document.getElementById("modal-input");
const modalError = document.getElementById("modal-error");
const modalResults = document.getElementById("modal-results");
const modalClose = document.getElementById("modal-close");
const modalSearchBtn = document.getElementById("modal-search-btn");

const batchFooter = document.getElementById("batch-footer");
const batchCount = document.getElementById("batch-count");
const batchAddBtn = document.getElementById("batch-add-btn");

let currentType = "movie";
let batchMode = false;
let batchBusy = false;
const batchSelection = new Map();
const lastResults = new Map();

function updateBatchFooter() {
  const n = batchSelection.size;
  batchCount.textContent = `${n} selected`;
  batchAddBtn.textContent = `Add Selected (${n})`;
  batchAddBtn.disabled = n === 0;
}

function openModal(type) {
  const activeSection = document.querySelector(".section.active")?.id;
  batchMode =
    collectionAddMode || ["movies-towatch", "shows-towatch"].includes(activeSection);
  batchBusy = false;
  batchSelection.clear();
  lastResults.clear();
  updateBatchFooter();
  batchFooter.classList.toggle("hidden", !batchMode);

  currentType = type;
  modalTitle.textContent = type === "movie" ? "Add Movie" : "Add TV Show";
  modalInput.value = "";
  modalResults.innerHTML = "";
  hideError();
  modal.classList.remove("hidden");
  modalInput.focus();
}

function closeModal() {
  if (batchBusy) return;
  modal.classList.add("hidden");
  document.getElementById("modal-back").classList.add("hidden");
}

function showError(message) {
  modalError.textContent = message;
  modalError.classList.remove("hidden");
}

function hideError() {
  modalError.classList.add("hidden");
}

function addButtonHtml(id, added = false) {
  return added
    ? `<button class="mini-add-btn" type="button" data-id="${id}" disabled>Added</button>`
    : `<button class="mini-add-btn" type="button" data-id="${id}">+ Add</button>`;
}

// Same "add this TMDB title" action as addButtonHtml() above, styled to
// match the ticket-stub row it lives in here instead of the info modal's
// own button style.
function tmdbAddButtonHtml(id, added = false) {
  return added
    ? `<button class="tmdb-add-btn added" type="button" data-id="${id}" disabled>Added</button>`
    : `<button class="tmdb-add-btn" type="button" data-id="${id}">+ Add</button>`;
}

function resultRow(item, added) {
  const title = item.title ?? item.name ?? "No title";
  const date = item.release_date ?? item.first_air_date ?? "";
  const year = date ? date.slice(0, 4) : "—";
  const poster = item.poster_path
    ? `<img class="tmdb-poster" src="${TMDB_IMG}${item.poster_path}" alt="" loading="lazy" />`
    : `<div class="tmdb-poster tmdb-poster-empty"></div>`;

  const action = batchMode
    ? `<input type="checkbox" class="row-check" data-id="${item.id}"
        ${batchSelection.has(item.id) ? "checked" : ""} ${added ? "disabled" : ""}
        title="${added ? "Already in your library" : "Select"}" />`
    : tmdbAddButtonHtml(item.id, added);

  return `
    <div class="tmdb-row">
      <span class="tmdb-stub">${poster}</span>
      <div class="tmdb-info">
        <p class="tmdb-row-title">${escapeHtml(title)}</p>
        <p class="tmdb-row-year">${year}</p>
      </div>
      <div class="tmdb-row-actions">
        <button class="tmdb-info-btn" type="button" data-id="${item.id}">Info</button>
        ${action}
      </div>
    </div>`;
}

async function runSearch() {
  if (batchBusy) return;
  const query = modalInput.value.trim();

  if (!query) {
    showError("Enter a title to search");
    return;
  }

  hideError();
  modalResults.innerHTML = `<p class="results-status">Searching…</p>`;

  const idMatch = query.match(/^\[(\d+)\]$/);

  try {
    const results = idMatch
      ? [await tmdbDetails(currentType, idMatch[1])]
      : await tmdbSearch(currentType, query);
    const existing = await existingTmdbIds(
      currentType,
      results.map((r) => r.id)
    );
    lastResults.clear();
    results.forEach((r) => lastResults.set(r.id, r));
    modalResults.innerHTML = results.length
      ? results.map((item) => resultRow(item, existing.has(item.id))).join("")
      : `<p class="results-status">No results.</p>`;
  } catch (err) {
    modalResults.innerHTML = "";
    showError(
      idMatch
        ? `No ${currentType === "movie" ? "movie" : "TV show"} found with ID ${idMatch[1]}.`
        : "Search failed. Please try again."
    );
    console.error("TMDB error:", err.message);
  }
}

document.querySelectorAll(".add-btn").forEach((btn) => {
  btn.addEventListener("click", () => openAddFlow(btn.dataset.type));
});

document.querySelector(".content").addEventListener("click", (e) => {
  const ghost = e.target.closest(".ghost-card");
  if (ghost) openAddFlow(ghost.dataset.type);
});

modalSearchBtn.addEventListener("click", runSearch);
modalClose.addEventListener("click", closeModal);

modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("info-modal").classList.contains("hidden")) return;
  if (!modal.classList.contains("hidden")) closeModal();
});

modalResults.addEventListener("click", (e) => {
  const infoBtn = e.target.closest(".tmdb-info-btn");
  if (infoBtn) openInfoModal(currentType, infoBtn.dataset.id);

  const addBtn = e.target.closest(".tmdb-add-btn");
  if (addBtn) addToLibrary(currentType, addBtn.dataset.id, addBtn);
});

modalResults.addEventListener("change", (e) => {
  const check = e.target.closest(".row-check");
  if (!check) return;
  const id = Number(check.dataset.id);
  if (check.checked) batchSelection.set(id, lastResults.get(id));
  else batchSelection.delete(id);
  updateBatchFooter();
});

async function runBatchAdd() {
  if (batchBusy || !batchSelection.size) return;

  batchBusy = true;
  const items = [...batchSelection.values()];
  batchAddBtn.disabled = true;
  modalInput.disabled = true;
  modalSearchBtn.disabled = true;
  modalClose.disabled = true;

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    batchCount.textContent = `Adding ${i + 1} of ${items.length}…`;
    const item = items[i];
    try {
      if (collectionAddMode) {
        const result = await addTmdbTitleToCollection(currentType, item.id);
        if (result === "added") ok++;
        else skipped++;
        continue;
      }
      const existing = await fetchExistingIds(currentType, [item.id]);
      if (existing.has(item.id)) {
        skipped++;
        continue;
      }
      const details = await tmdbDetails(currentType, item.id);
      const table = currentType === "movie" ? "movies" : "shows";
      const { error } = await db
        .from(table)
        .insert(buildRecord(currentType, details));
      if (error) throw new Error(error.message);
      ok++;
    } catch (err) {
      console.error("Batch item failed:", item.id, err.message);
      failed++;
    }
  }

  batchBusy = false;
  batchSelection.clear();
  modalInput.disabled = false;
  modalSearchBtn.disabled = false;
  modalClose.disabled = false;
  updateBatchFooter();
  if (collectionAddMode) refreshCollectionAfterAdd(ok > 0 ? currentType : undefined);

  showToast(
    `Added ${ok} · Skipped ${skipped} · Failed ${failed}`,
    failed > 0
  );
  closeModal();
}

batchAddBtn.addEventListener("click", runBatchAdd);

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
