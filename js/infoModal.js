const infoModal = document.getElementById("info-modal");
const infoPoster = document.getElementById("info-poster");
const infoBody = document.getElementById("info-body");
const infoClose = document.getElementById("info-close");

function runtimeLine(type, details) {
  if (type === "movie") {
    return details.runtime ? t("{n} min", { n: details.runtime }) : t("Runtime unknown");
  }
  const seasons = details.number_of_seasons ?? 0;
  const episodes = details.number_of_episodes ?? 0;
  return `${tn(seasons, "{n} season", "{n} seasons")} · ${tn(episodes, "{n} episode", "{n} episodes")}`;
}

function renderInfo(type, details, added) {
  const title = details.title ?? details.name ?? t("No title");
  const date = details.release_date ?? details.first_air_date ?? "";
  const year = date ? date.slice(0, 4) : "—";
  const synopsis = details.overview || t("No synopsis available.");
  const genreLine = (details.genres ?? []).map((g) => genreName(englishGenre(g))).join(" · ");

  infoPoster.innerHTML = details.poster_path
    ? `<img class="detail-poster-img" src="${TMDB_IMG_LG}${escapeHtml(details.poster_path)}" alt="" />`
    : `<div class="detail-poster-img detail-poster-empty"></div>`;

  const addBtn = added
    ? `<button class="complete-btn info-add-btn" type="button" data-id="${details.id}" disabled>${t("Added")}</button>`
    : `<button class="complete-btn info-add-btn" type="button" data-id="${details.id}">${t("+ Add")}</button>`;
  infoBody.innerHTML = `
    <div class="detail-head">
      <div class="detail-head-left">
        <h2 class="detail-title">${escapeHtml(title)}</h2>
        ${genreLine ? `<p class="detail-genre-line">${escapeHtml(genreLine)}</p>` : ""}
      </div>
      <div class="detail-meta">
        <p class="detail-meta-year">${year}</p>
        <p class="detail-meta-runtime">${runtimeLine(type, details)}</p>
      </div>
    </div>
    <p class="detail-synopsis">${escapeHtml(synopsis)}</p>
    <div class="detail-trailer">${TRAILER_BTN_LOADING}</div>
    <div class="detail-actions">${addBtn}</div>
    ${whereToWatchSlotHtml()}`;
  const stillShowing = () => infoShowing === `${type}:${details.id}`;
  loadInfoTrailer(type, details.id, stillShowing);
  // Where to watch it (js/whereToWatch.js), unless the window moved on.
  loadWhereToWatch(infoBody.querySelector(".where-to-watch"), type, details.id, stillShowing);
}

// The same trailer lookup (and button) as the detail window's.
async function loadInfoTrailer(type, tmdbId, stillShowing) {
  let key = null;
  let failed = false;
  try {
    key = await fetchTrailerKey(type === "movie" ? "movies" : "shows", tmdbId);
  } catch (err) {
    console.error("Trailer error:", err.message);
    failed = true;
  }
  const btn = infoBody.querySelector(".trailer-btn");
  if (!stillShowing() || !btn) return;
  btn.removeAttribute("aria-busy");
  if (!key) {
    btn.textContent = failed ? t("Trailer unavailable") : t("No trailer");
    return;
  }
  btn.closest(".detail-trailer").dataset.key = key;
  btn.disabled = false;
}

// Which title the window shows ("movie:348"), for answers that arrive late.
let infoShowing = null;

async function openInfoModal(type, id) {
  infoShowing = `${type}:${id}`;
  infoPoster.innerHTML = "";
  infoBody.innerHTML = `<p class="results-status">${t("Loading…")}</p>`;
  infoModal.classList.remove("hidden");

  try {
    const [details, existing] = await Promise.all([
      tmdbDetails(type, id),
      existingTmdbIds(type, [Number(id)]),
    ]);
    renderInfo(type, details, existing.has(details.id));
  } catch (err) {
    infoBody.innerHTML = `<p class="results-status">${t("Failed to load details.")}</p>`;
    console.error("TMDB error:", err.message);
  }
}

function closeInfoModal() {
  infoModal.classList.add("hidden");
  infoShowing = null;
  // A hidden window still plays sound: the trailer goes with it.
  infoBody.querySelector(".detail-trailer-frame")?.remove();
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
  const trailerBtn = e.target.closest('[data-action="toggle-trailer"]');
  if (trailerBtn) toggleTrailer(trailerBtn);
  const addBtn = e.target.closest(".info-add-btn");
  if (addBtn) addToLibrary(currentType, addBtn.dataset.id, addBtn);
});
