// Postgres's code for "that row already exists" (a unique index said no).
const UNIQUE_VIOLATION = "23505";

async function fetchExistingIds(type, ids) {
  if (!ids.length) return new Set();
  const table = type === "movie" ? "movies" : "shows";

  const { data, error } = await db
    .from(table)
    .select("tmdb_id")
    .in("tmdb_id", ids);

  if (error) {
    console.error("Duplicate check error:", error.message);
    return new Set();
  }
  return new Set(data.map((row) => row.tmdb_id));
}

// True while the "+ Add" modals were opened from inside a collection: the
// same library / TMDB modals as Movies and Shows, but picking a title links
// it to the open collection (collections.js) instead of the usual result.
// openAddFlow() in libraryModal.js sets and resets it.
let collectionAddMode = false;

// TMDB ids to show as "Added" in search results / the info modal. Normally
// that means "already in your library"; in a collection it means "already in
// this collection", so a library title that isn't in it yet stays selectable.
async function existingTmdbIds(type, ids) {
  if (!collectionAddMode) return fetchExistingIds(type, ids);
  const table = type === "movie" ? "movies" : "shows";
  const inCollection = new Set(
    collectionItemsFor(openCollectionId).map((i) => i.item_id)
  );
  return new Set(
    [...STORE[table].values()]
      .filter((r) => ids.includes(r.tmdb_id) && inCollection.has(r.id))
      .map((r) => r.tmdb_id)
  );
}

function showToast(message, isError = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " toast-error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function buildRecord(type, details) {
  const date = details.release_date ?? details.first_air_date ?? "";

  const base = {
    tmdb_id: details.id,
    title: details.title ?? details.name ?? "Untitled",
    poster: details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null,
    synopsis: details.overview || null,
    release_year: date ? Number(date.slice(0, 4)) : null,
    genres: (details.genres ?? []).map((g) => g.name).join(", ") || null,
    rating: null,
    review: null,
  };

  if (type === "movie") {
    return {
      ...base,
      duration: details.runtime ?? null,
      watched_date: null,
    };
  }

  return {
    ...base,
    total_seasons: details.number_of_seasons ?? null,
    total_episodes: details.number_of_episodes ?? null,
    started_watching_date: null,
    finished_watching_date: null,
  };
}

async function addToLibrary(type, id, btn) {
  const table = type === "movie" ? "movies" : "shows";
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Adding…";

  try {
    const details = await tmdbDetails(type, id);
    const { data: inserted, error } = await db
      .from(table)
      .insert(buildRecord(type, details))
      .select()
      .single();
    // Already there after all (added from another tab since the search):
    // the database keeps one copy per title (migration 0004).
    if (error?.code === UNIQUE_VIOLATION) {
      btn.textContent = "Added";
      showToast("Already in your library.");
      return;
    }
    if (error) throw new Error(error.message);

    btn.textContent = "Added";
    if (collectionAddMode) {
      STORE[table].set(inserted.id, inserted);
      await bindToOpenCollection(table, inserted);
      refreshCollectionAfterAdd(type);
      showToast("Added to your library and this collection.");
    } else {
      showToast("Added to your library.");
    }

    const activeSection = document.querySelector(".section.active")?.id;
    if (inserted) {
      if (type === "movie" && activeSection === "movies-watched") {
        openMarkAsWatchedModal(inserted, true);
      } else if (type === "tv" && activeSection === "shows-watched") {
        openStartWatchingModal(inserted, true);
      }
    }
  } catch (err) {
    console.error("Add error:", err.message);
    btn.textContent = originalText;
    btn.disabled = false;
    showToast("Could not add — please try again.", true);
  }
}
