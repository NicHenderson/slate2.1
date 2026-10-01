/* ---------- Profile (Settings > Profile) ----------

   Username, bio and a favorite movie + show, stored in the `profiles`
   table (see supabase/migrations/0002_profiles.sql). Favorites are TMDB
   snapshots, not links to the user's library, so any title can be picked
   whether or not it's in their lists.

   Everything on the card is a draft until "Save profile" (at the bottom)
   writes it in one upsert — picking a favorite included. Same session
   lifecycle as settings: loadProfile()/resetProfileState() are called
   from data.js. */

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const BIO_MAX = 160;
// TMDB poster paths look like "/abc123.jpg". Anything else read back from
// the row isn't used in an <img src>.
const POSTER_PATH_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/;
const FAVORITE_COLUMN = { movie: "favorite_movie", tv: "favorite_show" };
// Whole sentences for each kind: other languages change more than the noun.
const FAVORITE_TEXT = {
  movie: {
    pick: t("Pick a movie"),
    change: (title) => t("Change favorite movie ({title})", { title }),
    prompt: t("Search TMDB for any movie — it doesn't need to be in your lists."),
  },
  tv: {
    pick: t("Pick a show"),
    change: (title) => t("Change favorite show ({title})", { title }),
    prompt: t("Search TMDB for any show — it doesn't need to be in your lists."),
  },
};

const emptyProfile = () => ({ username: null, bio: null, favorite_movie: null, favorite_show: null });

let savedProfile = emptyProfile(); // what the account holds
let draftFavorites = { favorite_movie: null, favorite_show: null }; // username/bio drafts live in the inputs
let accountInfo = { email: "", createdAt: null, defaultUsername: "" };
let profileSaving = false;

const profileForm = document.getElementById("profile-form");
const usernameInput = document.getElementById("profile-username");
const usernameError = document.getElementById("profile-username-error");
const bioInput = document.getElementById("profile-bio");
const bioCount = document.getElementById("profile-bio-count");
const profileSaveBtn = document.getElementById("profile-save");
const profileDirtyNote = document.getElementById("profile-dirty");
const favoritesEl = document.getElementById("profile-favorites");
const previewEl = document.getElementById("profile-preview");

const favoriteModal = document.getElementById("favorite-modal");
const favoriteModalTitle = document.getElementById("favorite-modal-title");
const favoriteInput = document.getElementById("favorite-input");
const favoriteSearchBtn = document.getElementById("favorite-search-btn");
const favoriteError = document.getElementById("favorite-error");
const favoriteResults = document.getElementById("favorite-results");
const favoriteClose = document.getElementById("favorite-close");

/* ---------- draft state ---------- */

function draftProfile() {
  return {
    username: usernameInput.value.trim() || null,
    bio: bioInput.value.trim() || null,
    ...draftFavorites,
  };
}

const favoriteId = (fav) => fav?.tmdb_id ?? null;

function isProfileDirty() {
  const d = draftProfile();
  return (
    d.username !== savedProfile.username ||
    d.bio !== savedProfile.bio ||
    favoriteId(d.favorite_movie) !== favoriteId(savedProfile.favorite_movie) ||
    favoriteId(d.favorite_show) !== favoriteId(savedProfile.favorite_show)
  );
}

function updateProfileFormState() {
  const dirty = isProfileDirty();
  bioCount.textContent = `${bioInput.value.length}/${BIO_MAX}`;
  profileSaveBtn.disabled = profileSaving || !dirty;
  profileDirtyNote.classList.toggle("hidden", !dirty || profileSaving);
  renderProfilePreview();
}

function resetDraftToSaved() {
  usernameInput.value = savedProfile.username ?? "";
  bioInput.value = savedProfile.bio ?? "";
  draftFavorites = {
    favorite_movie: savedProfile.favorite_movie,
    favorite_show: savedProfile.favorite_show,
  };
  showUsernameError("");
}

function showUsernameError(message) {
  usernameError.textContent = message;
  usernameError.classList.toggle("hidden", !message);
  usernameInput.setAttribute("aria-invalid", String(Boolean(message)));
}

usernameInput.addEventListener("input", () => {
  showUsernameError("");
  updateProfileFormState();
});
bioInput.addEventListener("input", updateProfileFormState);

// A reload would lose picks and edits that were never saved.
window.addEventListener("beforeunload", (e) => {
  if (!isProfileDirty()) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ---------- saving ---------- */

async function upsertProfile(fields) {
  const { data } = await db.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { error: { message: "Not signed in" } };
  return db
    .from("profiles")
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() });
}

// A username left empty isn't an error: saving fills in the default one
// (see below), so every account always ends up with a username.
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (profileSaving || !isProfileDirty()) return;
  const draft = draftProfile();
  if (draft.username && !USERNAME_RE.test(draft.username)) {
    showUsernameError(t("Use 3–20 letters, numbers, _ or . (no spaces)."));
    usernameInput.focus();
    return;
  }

  profileSaving = true;
  profileSaveBtn.textContent = t("Saving…");
  updateProfileFormState();
  const result = draft.username
    ? { ...(await upsertProfile(draft)), username: draft.username }
    : await upsertWithDefaultUsername(draft);
  profileSaving = false;
  profileSaveBtn.textContent = t("Save profile");

  if (result.error) {
    if (result.error.code === "23505" && draft.username) {
      showUsernameError(t("That username is already taken."));
      usernameInput.focus();
    } else {
      console.error("Profile save error:", result.error.message);
      showToast(t("Could not save your profile — try again."), true);
    }
    updateProfileFormState();
    return;
  }
  savedProfile = { ...draft, username: result.username };
  usernameInput.value = result.username;
  updateProfileFormState();
  showToast(draft.username ? t("Profile saved.") : t("Profile saved — your username is @{username}.", { username: result.username }));
});

/* ---------- default username ----------

   The part of the account's email before the "@"
   ("juan.aguilera@hotmail.com" -> "juan.aguilera"), cleaned up to fit the
   username rules. Used when an account has no username yet, and whenever
   the field is saved empty. If someone already has it, random digits are
   appended until the unique index lets one through. */

const randomDigits = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");

function usernameFromEmail(email) {
  let name = String(email ?? "").split("@")[0].replace(/[^A-Za-z0-9_.]/g, "_").slice(0, 20);
  if (name.length < 3) name = `${name || "user"}_${randomDigits(3)}`;
  return name;
}

// Resolves to { username } on success, { error } otherwise.
async function upsertWithDefaultUsername(fields) {
  const base = accountInfo.defaultUsername || usernameFromEmail(accountInfo.email);
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 15)}_${randomDigits(4)}`;
    const { error } = await upsertProfile({ ...fields, username });
    if (!error) return { username };
    if (error.code !== "23505") return { error };
    lastError = error;
  }
  return { error: lastError };
}

/* ---------- favorites ---------- */

function favoriteSlotHtml(type) {
  const fav = draftFavorites[FAVORITE_COLUMN[type]];
  const text = FAVORITE_TEXT[type];
  if (!fav) {
    return `
      <button class="favorite-empty" type="button" data-fav-action="pick" data-fav-type="${type}">
        <span class="favorite-empty-slot" aria-hidden="true">+</span>
        <span class="favorite-empty-label">${text.pick}</span>
      </button>`;
  }
  const title = escapeHtml(fav.title ?? t("Untitled"));
  const year = String(fav.year ?? "").replace(/\D/g, "");
  const poster = POSTER_PATH_RE.test(fav.poster_path ?? "")
    ? `<img class="favorite-poster" src="${TMDB_IMG_LG}${fav.poster_path}" alt="" loading="lazy" />`
    : `<span class="favorite-poster favorite-poster-empty"></span>`;
  return `
    <button class="favorite-card" type="button" data-fav-action="pick" data-fav-type="${type}" aria-label="${text.change(title)}">
      ${poster}
      <span class="favorite-title">${title}</span>
      ${year ? `<span class="favorite-year">${year}</span>` : ""}
    </button>
    <button class="favorite-remove" type="button" data-fav-action="remove" data-fav-type="${type}">${t("Remove")}</button>`;
}

function renderFavorites() {
  favoritesEl.querySelectorAll("[data-fav-slot]").forEach((slot) => {
    slot.querySelector(".favorite-body").innerHTML = favoriteSlotHtml(slot.dataset.favSlot);
  });
}

function setDraftFavorite(type, value) {
  draftFavorites = { ...draftFavorites, [FAVORITE_COLUMN[type]]: value };
  renderFavorites();
  updateProfileFormState();
}

favoritesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fav-action]");
  if (!btn) return;
  if (btn.dataset.favAction === "pick") openFavoritePicker(btn.dataset.favType);
  if (btn.dataset.favAction === "remove") setDraftFavorite(btn.dataset.favType, null);
});

/* ---------- profile preview ----------

   How the profile reads, live from the draft: username, bio, favorites,
   member-since and a few library counts (from STORE, already in memory).
   The circle shows the username's first character until avatars exist. */

function previewFavoriteHtml(fav, kind) {
  if (!fav) return "";
  const poster = POSTER_PATH_RE.test(fav.poster_path ?? "")
    ? `<img class="pp-fav-poster" src="${TMDB_IMG}${fav.poster_path}" alt="" loading="lazy" />`
    : `<span class="pp-fav-poster favorite-poster-empty"></span>`;
  return `
    <div class="pp-fav">
      ${poster}
      <div class="pp-fav-text">
        <span class="pp-fav-kind">${kind}</span>
        <span class="pp-fav-title">${escapeHtml(fav.title ?? t("Untitled"))}</span>
      </div>
    </div>`;
}

function renderProfilePreview() {
  const draft = draftProfile();
  // An empty field previews the name saving it would fill in.
  const username = draft.username ?? accountInfo.defaultUsername;
  const initial = escapeHtml((username.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase());
  const favorites =
    previewFavoriteHtml(draft.favorite_movie, t("Movie")) + previewFavoriteHtml(draft.favorite_show, t("Show"));
  const since = accountInfo.createdAt
    ? new Date(accountInfo.createdAt).toLocaleDateString(LOCALE, { month: "short", year: "numeric" })
    : null;
  // This file loads before data.js, whose STORE the very first render
  // (at script load) can't see yet.
  const lib = typeof STORE === "undefined" ? null : STORE;
  const movies = lib ? [...lib.movies.values()].filter((m) => m.watched_date !== null).length : 0;
  const shows = lib ? [...lib.shows.values()].filter((s) => s.finished_watching_date !== null && !s.is_dropped).length : 0;
  const collections = lib ? lib.collections.size : 0;
  const stat = (n, label) =>
    `<div class="pp-stat"><span class="pp-num">${n}</span><span class="pp-label">${label}</span></div>`;

  previewEl.innerHTML = `
    <div class="pp-head">
      <span class="pp-monogram" aria-hidden="true">${initial}</span>
      <div class="pp-names">
        <p class="pp-username">${username ? `@${escapeHtml(username)}` : t("No username yet")}</p>
        ${since ? `<p class="pp-since">${t("Member since {date}", { date: since })}</p>` : ""}
      </div>
    </div>
    <p class="pp-bio${draft.bio ? "" : " is-empty"}">${draft.bio ? escapeHtml(draft.bio) : t("No bio yet.")}</p>
    ${favorites ? `<div class="pp-favs">${favorites}</div>` : ""}
    <div class="pp-stats">
      ${stat(movies, tn(movies, "Movie", "Movies"))}
      ${stat(shows, tn(shows, "Show", "Shows"))}
      ${stat(collections, tn(collections, "Collection", "Collections"))}
    </div>`;
}

// Library counts change while the user is elsewhere in the app.
document
  .querySelector('.nav-btn[data-section="settings"]')
  .addEventListener("click", renderProfilePreview);

/* ---------- favorite picker (TMDB search) ---------- */

let pickerType = "movie";
let pickerResults = new Map();
let pickerSearchSeq = 0;
let pickerSearchTimer = null;

function pickerPromptHtml() {
  return `<p class="results-status">${FAVORITE_TEXT[pickerType].prompt}</p>`;
}

function openFavoritePicker(type) {
  pickerType = type;
  pickerResults = new Map();
  favoriteModalTitle.textContent = type === "movie" ? t("Favorite movie") : t("Favorite show");
  favoriteInput.value = "";
  favoriteInput.placeholder = type === "movie" ? t("Search movies") : t("Search TV shows");
  favoriteError.classList.add("hidden");
  favoriteResults.innerHTML = pickerPromptHtml();
  favoriteModal.classList.remove("hidden");
  focusOnOpen(favoriteInput);
}

function closeFavoritePicker() {
  clearTimeout(pickerSearchTimer);
  pickerSearchSeq++; // drop any search still in flight
  favoriteModal.classList.add("hidden");
}

function pickerRowHtml(item) {
  const title = escapeHtml(item.title ?? item.name ?? t("Untitled"));
  const date = item.release_date ?? item.first_air_date ?? "";
  const poster = item.poster_path
    ? `<img class="tmdb-poster" src="${TMDB_IMG}${escapeHtml(item.poster_path)}" alt="" loading="lazy" />`
    : `<div class="tmdb-poster tmdb-poster-empty"></div>`;
  const current = favoriteId(draftFavorites[FAVORITE_COLUMN[pickerType]]) === item.id;
  const action = current
    ? `<button class="tmdb-add-btn added" type="button" disabled>${t("Current")}</button>`
    : `<button class="tmdb-add-btn" type="button" data-pick-id="${item.id}">${t("Choose")}</button>`;
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
  favoriteResults.innerHTML = `<p class="results-status">${t("Searching…")}</p>`;
  try {
    const results = await tmdbSearch(pickerType, query);
    if (seq !== pickerSearchSeq) return;
    pickerResults = new Map(results.map((r) => [r.id, r]));
    favoriteResults.innerHTML = results.length
      ? results.map(pickerRowHtml).join("")
      : `<p class="results-status">${t("No results.")}</p>`;
  } catch (err) {
    if (seq !== pickerSearchSeq) return;
    console.error("TMDB error:", err.message);
    favoriteResults.innerHTML = "";
    favoriteError.textContent = t("Search failed. Please try again.");
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

// On a phone the whole row picks it (css/responsive.css draws it as one).
const favoritePhoneLayout = matchMedia("(max-width: 640px)");

favoriteResults.addEventListener("click", (e) => {
  const btn =
    e.target.closest("[data-pick-id]") ??
    (favoritePhoneLayout.matches ? e.target.closest(".tmdb-row")?.querySelector("[data-pick-id]") : null);
  if (!btn) return;
  const item = pickerResults.get(Number(btn.dataset.pickId));
  if (!item) return;
  const date = item.release_date ?? item.first_air_date ?? "";
  closeFavoritePicker();
  setDraftFavorite(pickerType, {
    tmdb_id: item.id,
    title: item.title ?? item.name ?? "Untitled",
    year: date.slice(0, 4) || null,
    poster_path: item.poster_path ?? null,
  });
});

/* ---------- session lifecycle ---------- */

function renderProfile() {
  resetDraftToSaved();
  renderFavorites();
  updateProfileFormState();
}

async function loadProfile() {
  const { data: sessionData } = await db.auth.getSession();
  const user = sessionData.session?.user;
  // Computed once per session: for very short emails it includes random
  // digits, which would otherwise change on every render.
  accountInfo = {
    email: user?.email ?? "",
    createdAt: user?.created_at ?? null,
    defaultUsername: user ? usernameFromEmail(user.email) : "",
  };
  usernameInput.placeholder = accountInfo.defaultUsername || t("yourname");

  const { data, error } = await db
    .from("profiles")
    .select("username, bio, favorite_movie, favorite_show")
    .maybeSingle();
  if (error) {
    console.error("Profile load error:", error.message);
    return;
  }
  savedProfile = { ...emptyProfile(), ...(data ?? {}) };
  if (!savedProfile.username && user) {
    const { username, error: claimError } = await upsertWithDefaultUsername({});
    if (username) savedProfile.username = username;
    else console.error("Default username error:", claimError?.message);
  }
  renderProfile();
}

function resetProfileState() {
  savedProfile = emptyProfile();
  accountInfo = { email: "", createdAt: null, defaultUsername: "" };
  usernameInput.placeholder = t("yourname");
  closeFavoritePicker();
  renderProfile();
}

renderProfile();
