const infoModal = document.getElementById("info-modal");
const infoPoster = document.getElementById("info-poster");
const infoBody = document.getElementById("info-body");
const infoClose = document.getElementById("info-close");

function runtimeLine(type, details) {
  if (type === "movie") {
    return details.runtime ? `${details.runtime} min` : "Runtime unknown";
  }
  const seasons = details.number_of_seasons ?? 0;
  const episodes = details.number_of_episodes ?? 0;
  return `${seasons} season${seasons === 1 ? "" : "s"} · ${episodes} episode${episodes === 1 ? "" : "s"}`;
}

function renderInfo(type, details, added) {
  const title = details.title ?? details.name ?? "No title";
  const date = details.release_date ?? details.first_air_date ?? "";
  const year = date ? date.slice(0, 4) : "—";
  const synopsis = details.overview || "No synopsis available.";
  const genreLine = (details.genres ?? []).map((g) => g.name).join(" · ");

  infoPoster.innerHTML = details.poster_path
    ? `<img class="info-poster-img" src="${TMDB_IMG_LG}${details.poster_path}" alt="" />`
    : `<div class="info-poster-img info-poster-empty"></div>`;

  infoBody.innerHTML = `
    <div class="info-head">
      <div class="info-head-left">
        <h2 class="info-title">${escapeHtml(title)}</h2>
        ${genreLine ? `<p class="info-genre-line">${escapeHtml(genreLine)}</p>` : ""}
      </div>
      <div class="info-meta">
        <p class="info-meta-year">${year}</p>
        <p class="info-meta-runtime">${runtimeLine(type, details)}</p>
      </div>
    </div>
    <p class="info-synopsis">${escapeHtml(synopsis)}</p>
    <div class="info-actions">${addButtonHtml(details.id, added)}</div>`;
}

async function openInfoModal(type, id) {
  infoPoster.innerHTML = "";
  infoBody.innerHTML = `<p class="results-status">Loading…</p>`;
  infoModal.classList.remove("hidden");

  try {
    const [details, existing] = await Promise.all([
      tmdbDetails(type, id),
      existingTmdbIds(type, [Number(id)]),
    ]);
    renderInfo(type, details, existing.has(details.id));
  } catch (err) {
    infoBody.innerHTML = `<p class="results-status">Failed to load details.</p>`;
    console.error("TMDB error:", err.message);
  }
}

function closeInfoModal() {
  infoModal.classList.add("hidden");
}

infoClose.addEventListener("click", closeInfoModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !infoModal.classList.contains("hidden")) {
    closeInfoModal();
  }
});

infoModal.addEventListener("click", (e) => {
  if (e.target === infoModal) closeInfoModal();
});

infoBody.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".mini-add-btn");
  if (addBtn) addToLibrary(currentType, addBtn.dataset.id, addBtn);
});
