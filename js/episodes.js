/* ---------- Episodes: which ones of a show have been watched ----------

   (supabase/migrations/0009_watched_episodes.sql.) One row per episode
   ticked as watched, by its season and episode number as TMDB numbers
   them; specials (season 0) are left out. Only which episodes, never
   when: the show keeps its own started / finished dates. The database
   clears a show's episodes when it goes back to To Watch (it's started
   over), and they go with the show when it's deleted.

   What TMDB says about the episodes (names, descriptions, images, air
   dates) is looked up when needed, never stored, in the language Slate
   is in. A description TMDB hasn't translated becomes a generic line
   ("Episode 5 of season 2 of Dark."), never the other language's (the
   owner's call); an episode without an image shows the show's poster.

   In a Watching show's detail window, "Up next": a note with the episode
   after the furthest one ticked (one skipped doesn't hold it back), and
   "Watched it" to tick it and move on. With nothing ticked yet it asks
   where you are instead. */

// Show id → its ticked episodes, in order. Rebuilt on the next read after
// any change to STORE.episodes.
let episodeIndex = null;

const byEpisode = (a, b) => a.season - b.season || a.episode - b.episode;

function tickedEpisodes(showId) {
  if (!episodeIndex) {
    episodeIndex = new Map();
    STORE.episodes.forEach((row) => {
      if (!episodeIndex.has(row.show_id)) episodeIndex.set(row.show_id, []);
      episodeIndex.get(row.show_id).push(row);
    });
    episodeIndex.forEach((list) => list.sort(byEpisode));
  }
  return episodeIndex.get(showId) ?? [];
}

const isTicked = (showId, season, episode) =>
  tickedEpisodes(showId).some((row) => row.season === season && row.episode === episode);

function storeEpisode(row) {
  STORE.episodes.set(row.id, row);
  episodeIndex = null;
}

function forgetEpisode(id) {
  STORE.episodes.delete(id);
  episodeIndex = null;
}

function resetEpisodes() {
  STORE.episodes.clear();
  episodeIndex = null;
}

// What the database does too, done here at once: a show deleted, or sent
// back to To Watch, has no episodes left. Called for every change to a
// show (js/realtime.js), with the show as it was before it.
function episodesFollowShow(payload, before) {
  const gone =
    payload.eventType === "DELETE" ||
    (payload.eventType === "UPDATE" && before?.started_watching_date && !payload.new.started_watching_date);
  if (!gone) return;
  const showId = payload.eventType === "DELETE" ? payload.old.id : payload.new.id;
  tickedEpisodes(showId).forEach((row) => STORE.episodes.delete(row.id));
  episodeIndex = null;
}

// A realtime change to an episode, from this tab or another.
function handleEpisodeChange(payload) {
  let showId;
  if (payload.eventType === "DELETE") {
    showId = STORE.episodes.get(payload.old.id)?.show_id;
    if (!showId) return; // already gone here
    forgetEpisode(payload.old.id);
  } else {
    if (STORE.episodes.has(payload.new.id)) return; // the echo of one already shown
    showId = payload.new.show_id;
    storeEpisode(payload.new);
  }
  refreshUpNext(showId);
}

/* ---------- TMDB ---------- */

const TMDB_STILL = "https://image.tmdb.org/t/p/w300";

// Looked up again after a while, so a tab left open for days still learns
// of new episodes.
const EPISODES_CACHE_MS = 30 * 60 * 1000;
const episodesCache = new Map();

function cachedLookup(key, request) {
  const hit = episodesCache.get(key);
  if (hit && Date.now() - hit.at < EPISODES_CACHE_MS) return hit.promise;
  const promise = request().catch((err) => {
    episodesCache.delete(key); // a failed lookup is retried next time
    throw err;
  });
  episodesCache.set(key, { at: Date.now(), promise });
  return promise;
}

// A show's seasons (specials left out), from its details.
function showSeasons(tmdbId) {
  return cachedLookup(`tv:${tmdbId}:${TMDB_LANGUAGE}`, async () => {
    const details = await tmdbRequest(`tv/${tmdbId}`, undefined, TMDB_LANGUAGE);
    return (details.seasons ?? [])
      .filter((s) => s.season_number >= 1 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, count: s.episode_count, airDate: s.air_date || null }))
      .sort((a, b) => a.number - b.number);
  });
}

// One season's episodes, in order.
function seasonEpisodes(tmdbId, season) {
  return cachedLookup(`season:${tmdbId}:${season}:${TMDB_LANGUAGE}`, async () => {
    const data = await tmdbRequest(`tv/${tmdbId}/season/${season}`, undefined, TMDB_LANGUAGE);
    return (data.episodes ?? [])
      .map((ep) => ({
        season,
        number: ep.episode_number,
        name: ep.name || "",
        overview: ep.overview || "",
        still: ep.still_path || null,
        airDate: ep.air_date || null,
      }))
      .sort((a, b) => a.number - b.number);
  });
}

// Out already: an episode with no air date yet hasn't been.
const hasAired = (airDate) => Boolean(airDate) && airDate <= localToday();

/* ---------- where you are ---------- */

// What "Up next" shows for a show: the episode after the furthest one
// ticked, or, with nothing ticked, the question (and the first episode,
// for someone just starting). With nothing after it out yet: up to date.
async function upNextState(row) {
  const seasons = await showSeasons(row.tmdb_id);
  const ticked = tickedEpisodes(row.id);
  if (!ticked.length) {
    const first = seasons[0] ? (await seasonEpisodes(row.tmdb_id, seasons[0].number)).find((ep) => hasAired(ep.airDate)) : null;
    return { kind: "where", seasons, first: first ?? null };
  }
  const last = ticked[ticked.length - 1];
  const lastSeason = await seasonEpisodes(row.tmdb_id, last.season);
  let next = lastSeason.find((ep) => ep.number > last.episode);
  if (!next) {
    const following = seasons.find((s) => s.number > last.season);
    if (following) next = (await seasonEpisodes(row.tmdb_id, following.number))[0];
  }
  if (!next || !hasAired(next.airDate)) {
    const lastEp = lastSeason.find((ep) => ep.number === last.episode) ?? { season: last.season, number: last.episode, name: "" };
    return { kind: "uptodate", last: lastEp };
  }
  return { kind: "next", next };
}

/* ---------- the note ---------- */

const episodeCode = (season, episode) => t("S{s} · E{e}", { s: season, e: episode });
const episodeName = (ep) => ep.name || t("Episode {n}", { n: ep.number });

function episodeDescriptionHtml(row, ep) {
  if (ep.overview) return `<p class="up-next-desc">${escapeHtml(ep.overview)}</p>`;
  const generic = t("Episode {e} of season {s} of {title}.", { e: ep.number, s: ep.season, title: escapeHtml(row.title ?? t("Untitled")) });
  return `<p class="up-next-desc is-generic">${generic}</p>`;
}

// The episode's image clipped to the note; the show's poster without one.
function episodePhotoHtml(row, ep) {
  const src = ep?.still ? TMDB_STILL + ep.still : row.poster;
  if (!src) return "";
  const cls = ep?.still ? "up-next-still" : "up-next-still is-poster";
  return `<figure class="up-next-photo"><span class="up-next-clip" aria-hidden="true"></span><img class="${cls}" src="${escapeHtml(src)}" alt="" /></figure>`;
}

const CHECK_SVG = `<svg viewBox="0 0 40 36" aria-hidden="true"><path d="M6 19 L15 28 L35 5" /></svg>`;

function watchedItHtml(ep) {
  return `<button class="up-next-check" type="button" data-action="tick-episode" data-season="${ep.season}" data-episode="${ep.number}"><span class="up-next-box">${CHECK_SVG}</span>${t("Watched it")}</button>`;
}

function upNextHtml(row, state) {
  if (state.kind === "next") {
    const ep = state.next;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("Up next {code}", { code: `<span class="up-next-code">${episodeCode(ep.season, ep.number)}</span>` })}</p>
        <p class="up-next-name">${escapeHtml(episodeName(ep))}</p>
        ${episodeDescriptionHtml(row, ep)}
        <div class="up-next-row">${watchedItHtml(ep)}</div>
      </div>
      ${episodePhotoHtml(row, ep)}`;
  }
  if (state.kind === "uptodate") {
    const ep = state.last;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("You're up to date!")}</p>
        <p class="up-next-hint">${t("You've watched up to {code}, {name}.", { code: episodeCode(ep.season, ep.number), name: escapeHtml(episodeName(ep)) })}</p>
      </div>
      ${episodePhotoHtml(row, ep)}`;
  }
  // Nothing ticked yet: up to which episode, or the first one.
  const aired = state.seasons.filter((s) => hasAired(s.airDate));
  const seasonOptions = aired.map((s) => `<option value="${s.number}">${t("Season {n}", { n: s.number })}</option>`).join("");
  const first = state.first;
  return `
    <div class="up-next-text">
      <p class="up-next-head">${t("Where are you?")}</p>
      <p class="up-next-hint">${t("You haven't ticked any episode of {title} yet.", { title: escapeHtml(row.title ?? t("Untitled")) })}</p>
      ${
        aired.length
          ? `<div class="up-next-pick">
              <label for="up-next-season">${t("I've watched up to")}</label>
              <select id="up-next-season" class="up-next-select">${seasonOptions}</select>
              <select id="up-next-episode" class="up-next-select" aria-label="${t("Episode")}" disabled></select>
              <button class="up-next-pick-btn" type="button" data-action="tick-up-to" disabled>${t("Tick them")}</button>
            </div>`
          : ""
      }
      ${
        first
          ? `<p class="up-next-or">${t("Just starting?")}</p>
             <p class="up-next-hint">${t("The first one is {code}, {name}.", { code: episodeCode(first.season, first.number), name: escapeHtml(episodeName(first)) })}</p>
             <div class="up-next-row">${watchedItHtml(first)}</div>`
          : ""
      }
    </div>
    ${first ? episodePhotoHtml(row, first) : ""}`;
}

// renderDetail's slot for the note: a Watching show from TMDB only. While
// it loads, it's already about the note's size, its photo frame included,
// so the window barely moves when the episode arrives (the owner noticed
// the jump from a thin strip).
function upNextSlotHtml(row) {
  if (!row.tmdb_id) return "";
  return `
    <div class="up-next is-loading" data-show-id="${row.id}" aria-live="polite">
      <div class="up-next-text"><p class="up-next-loading">${t("Loading episodes…")}</p></div>
      <figure class="up-next-photo"><span class="up-next-clip" aria-hidden="true"></span><span class="up-next-still"></span></figure>
    </div>`;
}

// What's left of the change in height, eased rather than jumped, with the
// new content fading in over it.
function easeNoteHeight(slot, from) {
  const to = slot.offsetHeight;
  if (motionReduced() || !slot.animate) return;
  if (Math.abs(to - from) > 2) {
    slot.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 260, easing: "ease-out" });
  }
  [...slot.children].forEach((child) => child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }));
}

// Fills the slot, if renderDetail left one. The note keeps what it shows
// until the new one is ready, so nothing flickers when it moves on.
async function loadUpNext(row) {
  const slot = detailBody.querySelector(".up-next");
  if (!slot || slot.dataset.showId !== row.id) return;
  let html;
  try {
    const state = await upNextState(row);
    html = upNextHtml(row, state);
  } catch (err) {
    console.error("Episodes error:", err.message);
    html = `<div class="up-next-text"><p class="up-next-hint">${t("Couldn't load the episodes. Please try again later.")}</p></div>`;
  }
  // By the time TMDB answers, the window may be showing something else.
  if (!slot.isConnected || currentDetail?.row.id !== row.id) return;
  const from = slot.offsetHeight;
  const firstFill = slot.classList.contains("is-loading");
  slot.classList.remove("is-loading");
  slot.innerHTML = html;
  // Moving on to the next episode redraws it too: only the first fill, or
  // a change of size, is eased.
  if (firstFill || slot.offsetHeight !== from) easeNoteHeight(slot, from);
  fillEpisodePicker(row);
}

// The note of the show open in the detail window, redrawn after its
// episodes changed (here or in another tab).
function refreshUpNext(showId) {
  if (detailModal.classList.contains("hidden") || currentDetail?.row.id !== showId) return;
  // Not while its episodes are being saved: that redraws it when it's done.
  if (detailBody.querySelector(".up-next.is-saving")) return;
  loadUpNext(currentDetail.row);
}

// "Where are you?": the season picked's episodes that are out.
async function fillEpisodePicker(row) {
  const seasonSelect = detailBody.querySelector("#up-next-season");
  const episodeSelect = detailBody.querySelector("#up-next-episode");
  if (!seasonSelect || !episodeSelect) return;
  const season = Number(seasonSelect.value);
  episodeSelect.disabled = true;
  detailBody.querySelector('[data-action="tick-up-to"]').disabled = true;
  let episodes = [];
  try {
    episodes = (await seasonEpisodes(row.tmdb_id, season)).filter((ep) => hasAired(ep.airDate));
  } catch (err) {
    console.error("Episodes error:", err.message);
  }
  // The season may have changed again, or the note gone, meanwhile.
  if (!episodeSelect.isConnected || Number(seasonSelect.value) !== season) return;
  episodeSelect.innerHTML = episodes
    .map((ep) => `<option value="${ep.number}">${t("E{n} · {name}", { n: ep.number, name: escapeHtml(episodeName(ep)) })}</option>`)
    .join("");
  episodeSelect.disabled = !episodes.length;
  detailBody.querySelector('[data-action="tick-up-to"]').disabled = !episodes.length;
}

/* ---------- ticking ---------- */

const motionReduced = () =>
  document.documentElement.dataset.reduceMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Saves the episodes of `list` ([{ season, episode }]) not ticked yet.
// Returns whether it worked.
async function tickEpisodes(row, list) {
  const missing = list.filter((ep) => !isTicked(row.id, ep.season, ep.episode));
  if (!missing.length) return true;
  const { data, error } = await db
    .from("watched_episodes")
    .insert(missing.map((ep) => ({ show_id: row.id, season: ep.season, episode: ep.episode })))
    .select();
  if (error) {
    console.error("Episode save error:", error.message);
    return false;
  }
  data.forEach(storeEpisode);
  return true;
}

// The note's own saves: marked busy meanwhile, redrawn when done.
async function saveFromNote(row, list, button, message) {
  const slot = button.closest(".up-next");
  slot.classList.add("is-saving");
  slot.querySelectorAll("button, select").forEach((el) => (el.disabled = true));
  // "Watched it" draws its tick first (the saving happens meanwhile).
  const drawn = button.classList.contains("up-next-check") && !motionReduced()
    ? new Promise((resolve) => setTimeout(resolve, 420))
    : Promise.resolve();
  button.classList.add("is-checked");
  const [ok] = await Promise.all([tickEpisodes(row, list), drawn]);
  slot.classList.remove("is-saving");
  if (!ok) {
    showToast(t("Couldn't save that. Please try again."), true);
  } else {
    showToast(message);
  }
  if (currentDetail?.row.id === row.id) loadUpNext(row);
}

async function tickUpTo(row, button) {
  const season = Number(detailBody.querySelector("#up-next-season")?.value);
  const episode = Number(detailBody.querySelector("#up-next-episode")?.value);
  if (!season || !episode) return;
  // Every episode of the seasons before it (as TMDB counts them) and this
  // season's up to the one picked.
  const seasons = await showSeasons(row.tmdb_id);
  const list = [];
  seasons
    .filter((s) => s.number < season)
    .forEach((s) => {
      for (let e = 1; e <= s.count; e++) list.push({ season: s.number, episode: e });
    });
  (await seasonEpisodes(row.tmdb_id, season))
    .filter((ep) => ep.number <= episode)
    .forEach((ep) => list.push({ season, episode: ep.number }));
  saveFromNote(row, list, button, t("Ticked up to {code}.", { code: episodeCode(season, episode) }));
}

detailBody.addEventListener("click", (e) => {
  if (!currentDetail || currentDetail.cfg.table !== "shows") return;
  const button = e.target.closest("[data-action]");
  const action = button?.dataset.action;
  if (action === "tick-episode") {
    const season = Number(button.dataset.season);
    const episode = Number(button.dataset.episode);
    saveFromNote(currentDetail.row, [{ season, episode }], button, t("{code} ticked.", { code: episodeCode(season, episode) }));
  }
  if (action === "tick-up-to") tickUpTo(currentDetail.row, button);
});

detailBody.addEventListener("change", (e) => {
  if (e.target.id === "up-next-season" && currentDetail) fillEpisodePicker(currentDetail.row);
});
