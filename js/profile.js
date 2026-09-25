/* ---------- Profile (Settings > Profile) ----------

   Username, bio and a favorite movie + show, stored in the `profiles`
   table (see supabase/migrations/0002_profiles.sql). Favorites are TMDB
   snapshots, not links to the user's library, so any title can be picked
   whether or not it's in their lists. Same session lifecycle as settings:
   loadProfile()/resetProfileState() are called from data.js. */

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const BIO_MAX = 160;
// TMDB poster paths look like "/abc123.jpg". Anything else read back from
// the row isn't used in an <img src>.
const POSTER_PATH_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/;
const FAVORITE_COLUMN = { movie: "favorite_movie", tv: "favorite_show" };
const FAVORITE_NOUN = { movie: "movie", tv: "show" };

const emptyProfile = () => ({ username: null, bio: null, favorite_movie: null, favorite_show: null });

let profile = emptyProfile();
let profileSaving = false;

const profileForm = document.getElementById("profile-form");
const usernameInput = document.getElementById("profile-username");
const usernameError = document.getElementById("profile-username-error");
const bioInput = document.getElementById("profile-bio");
const bioCount = document.getElementById("profile-bio-count");
const profileSaveBtn = document.getElementById("profile-save");
const favoritesEl = document.getElementById("profile-favorites");

const favoriteModal = document.getElementById("favorite-modal");
const favoriteModalTitle = document.getElementById("favorite-modal-title");
const favoriteInput = document.getElementById("favorite-input");
const favoriteSearchBtn = document.getElementById("favorite-search-btn");
const favoriteError = document.getElementById("favorite-error");
const favoriteResults = document.getElementById("favorite-results");
const favoriteClose = document.getElementById("favorite-close");

/* ---------- saving ---------- */

// Upsert only writes the columns passed in, so saving the form never
// touches the favorites and picking a favorite never touches the form.
async function saveProfileFields(fields) {
  const { data } = await db.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { error: { message: "Not signed in" } };
  return db
    .from("profiles")
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() });
}

/* ---------- username + bio ---------- */

function profileFormValues() {
  return {
    username: usernameInput.value.trim() || null,
    bio: bioInput.value.trim() || null,
  };
}

function showUsernameError(message) {
  usernameError.textContent = message;
  usernameError.classList.toggle("hidden", !message);
  usernameInput.setAttribute("aria-invalid", String(Boolean(message)));
}

function updateProfileFormState() {
  const { username, bio } = profileFormValues();
  bioCount.textContent = `${bioInput.value.length}/${BIO_MAX}`;
  profileSaveBtn.disabled = profileSaving || (username === profile.username && bio === profile.bio);
}

function renderProfileForm() {
  usernameInput.value = profile.username ?? "";
  bioInput.value = profile.bio ?? "";
  showUsernameError("");
  updateProfileFormState();
}

usernameInput.addEventListener("input", () => {
  showUsernameError("");
  updateProfileFormState();
});
bioInput.addEventListener("input", updateProfileFormState);

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (profileSaving) return;
  const values = profileFormValues();
  if (values.username && !USERNAME_RE.test(values.username)) {
    showUsernameError("Use 3–20 letters, numbers, _ or . (no spaces).");
    usernameInput.focus();
    return;
  }

  profileSaving = true;
  profileSaveBtn.textContent = "Saving…";
  updateProfileFormState();
  const { error } = await saveProfileFields(values);
  profileSaving = false;
  profileSaveBtn.textContent = "Save profile";

  if (error) {
    if (error.code === "23505") {
      showUsernameError("That username is already taken.");
      usernameInput.focus();
    } else {
      console.error("Profile save error:", error.message);
      showToast("Could not save your profile — try again.", true);
    }
    updateProfileFormState();
    return;
  }
  profile = { ...profile, ...values };
  renderProfileForm();
  showToast("Profile saved.");
});

/* ---------- favorites ---------- */

function favoriteSlotHtml(type) {
  const fav = profile[FAVORITE_COLUMN[type]];
  const noun = FAVORITE_NOUN[type];
  if (!fav) {
    return `
      <button class="favorite-empty" type="button" data-fav-action="pick" data-fav-type="${type}">
        <span class="favorite-empty-slot" aria-hidden="true">+</span>
        <span class="favorite-empty-label">Pick a ${noun}</span>
      </button>`;
  }
  const title = escapeHtml(fav.title ?? "Untitled");
  const year = String(fav.year ?? "").replace(/\D/g, "");
  const poster = POSTER_PATH_RE.test(fav.poster_path ?? "")
    ? `<img class="favorite-poster" src="${TMDB_IMG_LG}${fav.poster_path}" alt="" loading="lazy" />`
    : `<span class="favorite-poster favorite-poster-empty"></span>`;
  return `
    <button class="favorite-card" type="button" data-fav-action="pick" data-fav-type="${type}" aria-label="Change favorite ${noun} (${title})">
      ${poster}
      <span class="favorite-title">${title}</span>
      ${year ? `<span class="favorite-year">${year}</span>` : ""}
    </button>
    <button class="favorite-remove" type="button" data-fav-action="remove" data-fav-type="${type}">Remove</button>`;
}

function renderFavorites() {
  favoritesEl.querySelectorAll("[data-fav-slot]").forEach((slot) => {
    slot.querySelector(".favorite-body").innerHTML = favoriteSlotHtml(slot.dataset.favSlot);
  });
}

// Optimistic, but rolled back on failure: unlike a setting, a favorite that
// silently didn't save would reappear as the old one on the next login.
async function setFavorite(type, value) {
  const column = FAVORITE_COLUMN[type];
  const previous = profile[column];
  profile = { ...profile, [column]: value };
  renderFavorites();

  const { error } = await saveProfileFields({ [column]: value });
  if (error) {
    console.error("Favorite save error:", error.message);
    profile = { ...profile, [column]: previous };
    renderFavorites();
    showToast("Could not save your favorite — try again.", true);
    return;
  }
  showToast(value ? `Favorite ${FAVORITE_NOUN[type]} updated.` : `Favorite ${FAVORITE_NOUN[type]} removed.`);
}

favoritesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fav-action]");
  if (!btn) return;
  if (btn.dataset.favAction === "pick") openFavoritePicker(btn.dataset.favType);
  if (btn.dataset.favAction === "remove") setFavorite(btn.dataset.favType, null);
});

/* ---------- favorite picker (TMDB search) ---------- */

let pickerType = "movie";
let pickerResults = new Map();
let pickerSearchSeq = 0;
let pickerSearchTimer = null;

function pickerPromptHtml() {
  return `<p class="results-status">Search TMDB for any ${FAVORITE_NOUN[pickerType]} — it doesn't need to be in your lists.</p>`;
}

function openFavoritePicker(type) {
  pickerType = type;
  pickerResults = new Map();
  favoriteModalTitle.textContent = type === "movie" ? "Favorite movie" : "Favorite show";
  favoriteInput.value = "";
  favoriteInput.placeholder = type === "movie" ? "Search movies" : "Search TV shows";
  favoriteError.classList.add("hidden");
  favoriteResults.innerHTML = pickerPromptHtml();
  favoriteModal.classList.remove("hidden");
  favoriteInput.focus();
}

function closeFavoritePicker() {
  clearTimeout(pickerSearchTimer);
  pickerSearchSeq++; // drop any search still in flight
  favoriteModal.classList.add("hidden");
}

function pickerRowHtml(item) {
  const title = escapeHtml(item.title ?? item.name ?? "Untitled");
  const date = item.release_date ?? item.first_air_date ?? "";
  const poster = item.poster_path
    ? `<img class="tmdb-poster" src="${TMDB_IMG}${escapeHtml(item.poster_path)}" alt="" loading="lazy" />`
    : `<div class="tmdb-poster tmdb-poster-empty"></div>`;
  const current = profile[FAVORITE_COLUMN[pickerType]]?.tmdb_id === item.id;
  const action = current
    ? `<button class="tmdb-add-btn added" type="button" disabled>Current</button>`
    : `<button class="tmdb-add-btn" type="button" data-pick-id="${item.id}">Choose</button>`;
  return `
    <div class="tmdb-row">
      <span class="tmdb-stub">${poster}</span>
      <div class="tmdb-info">
        <p class="tmdb-row-title">${title}</p>
        <p class="tmdb-row-year">${date ? date.slice(0, 4) : "—"}</p>
      </div>
      <div class="tmdb-row-actions">${action}</div>
    </div>`;
}

// Searches as you type (debounced) as well as on Enter / the button. A
// sequence number drops responses that arrive after a newer search began.
async function runFavoriteSearch() {
  clearTimeout(pickerSearchTimer);
  const query = favoriteInput.value.trim();
  favoriteError.classList.add("hidden");
  if (!query) {
    pickerSearchSeq++;
    favoriteResults.innerHTML = pickerPromptHtml();
    return;
  }
  const seq = ++pickerSearchSeq;
  favoriteResults.innerHTML = `<p class="results-status">Searching…</p>`;
  try {
    const results = await tmdbSearch(pickerType, query);
    if (seq !== pickerSearchSeq) return;
    pickerResults = new Map(results.map((r) => [r.id, r]));
    favoriteResults.innerHTML = results.length
      ? results.map(pickerRowHtml).join("")
      : `<p class="results-status">No results.</p>`;
  } catch (err) {
    if (seq !== pickerSearchSeq) return;
    console.error("TMDB error:", err.message);
    favoriteResults.innerHTML = "";
    favoriteError.textContent = "Search failed. Please try again.";
    favoriteError.classList.remove("hidden");
  }
}

favoriteInput.addEventListener("input", () => {
  clearTimeout(pickerSearchTimer);
  pickerSearchTimer = setTimeout(runFavoriteSearch, 350);
});
favoriteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runFavoriteSearch();
});
favoriteSearchBtn.addEventListener("click", runFavoriteSearch);
favoriteClose.addEventListener("click", closeFavoritePicker);

favoriteModal.addEventListener("click", (e) => {
  if (e.target === favoriteModal) closeFavoritePicker();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !favoriteModal.classList.contains("hidden")) closeFavoritePicker();
});

favoriteResults.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pick-id]");
  if (!btn) return;
  const item = pickerResults.get(Number(btn.dataset.pickId));
  if (!item) return;
  const date = item.release_date ?? item.first_air_date ?? "";
  closeFavoritePicker();
  setFavorite(pickerType, {
    tmdb_id: item.id,
    title: item.title ?? item.name ?? "Untitled",
    year: date.slice(0, 4) || null,
    poster_path: item.poster_path ?? null,
  });
});

/* ---------- session lifecycle ---------- */

function renderProfile() {
  renderProfileForm();
  renderFavorites();
}

async function loadProfile() {
  const { data, error } = await db
    .from("profiles")
    .select("username, bio, favorite_movie, favorite_show")
    .maybeSingle();
  if (error) {
    console.error("Profile load error:", error.message);
    return;
  }
  profile = { ...emptyProfile(), ...(data ?? {}) };
  renderProfile();
}

function resetProfileState() {
  profile = emptyProfile();
  closeFavoritePicker();
  renderProfile();
}

renderProfile();
