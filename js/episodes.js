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
   where you are instead. Past the last episode out: up to date, with the
   next one's date when TMDB knows it. A show that has ended is finished
   by ticking its last episode: the usual finish window opens, and closing
   it without saving unticks that episode again (the owner's call). A
   show finished in the usual way gets every episode out ticked. */

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
  // The episodes window follows the show too: finished or dropped
  // elsewhere, it becomes only to look at (drawn once STORE has it).
  const id = payload.eventType === "DELETE" ? payload.old.id : payload.new.id;
  if (payload.eventType === "UPDATE" && episodesWindowOpen() && episodesWindow?.showId === id) {
    setTimeout(() => renderEpisodesWindow(), 0);
  }
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
  afterEpisodesChanged(showId);
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

// A show's outline, from its details: its seasons (specials left out),
// whether it has ended (TMDB says so, or that it was canceled), and its
// next episode, when TMDB knows one.
function showOutline(tmdbId) {
  return cachedLookup(`tv:${tmdbId}:${TMDB_LANGUAGE}`, async () => {
    const details = await tmdbRequest(`tv/${tmdbId}`, undefined, TMDB_LANGUAGE);
    const seasons = (details.seasons ?? [])
      .filter((s) => s.season_number >= 1 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, count: s.episode_count, airDate: s.air_date || null }))
      .sort((a, b) => a.number - b.number);
    const next = details.next_episode_to_air;
    return {
      seasons,
      ended: details.status === "Ended" || details.status === "Canceled",
      next: next?.season_number >= 1 ? { season: next.season_number, number: next.episode_number, airDate: next.air_date || null } : null,
    };
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
  const outline = await showOutline(row.tmdb_id);
  const seasons = outline.seasons;
  const ticked = tickedEpisodes(row.id);
  // Dropped: where it stopped, nothing more (a dropped show isn't picked
  // up again: it's started over from To Watch).
  if (row.is_dropped) {
    const last = ticked[ticked.length - 1];
    if (!last) return { kind: "none" };
    const ep = (await seasonEpisodes(row.tmdb_id, last.season)).find((e) => e.number === last.episode);
    return { kind: "stopped", last: ep ?? { season: last.season, number: last.episode, name: "", overview: "" } };
  }
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
    // An ended show with its last episode ticked, still on Watching (its
    // finish window was left for later): it asks.
    const finale = await finaleOf(row);
    if (finale && isTicked(row.id, finale.season, finale.episode)) return { kind: "finished", last: lastEp };
    return { kind: "uptodate", last: lastEp, next: outline.ended ? null : outline.next };
  }
  return { kind: "next", next };
}

// An ended show's last episode ({ season, episode }), or null for a show
// that's still going.
async function finaleOf(row) {
  const outline = await showOutline(row.tmdb_id);
  const lastSeason = outline.seasons[outline.seasons.length - 1];
  if (!outline.ended || !lastSeason) return null;
  const episodes = await seasonEpisodes(row.tmdb_id, lastSeason.number);
  const last = episodes[episodes.length - 1];
  return last ? { season: lastSeason.number, episode: last.number } : null;
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

const SEE_ALL_HTML = `<button class="up-next-all" type="button" data-action="open-episodes">${t("See all episodes →")}</button>`;

function watchedItHtml(ep) {
  return `<button class="up-next-check" type="button" data-action="tick-episode" data-season="${ep.season}" data-episode="${ep.number}"><span class="up-next-box">${CHECK_SVG}</span>${t("Watched it")}</button>`;
}

function upNextHtml(row, state) {
  if (state.kind === "none") return "";
  if (state.kind === "stopped") {
    const ep = state.last;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("Stopped at {code}", { code: `<span class="up-next-code">${episodeCode(ep.season, ep.number)}</span>` })}</p>
        <p class="up-next-name">${escapeHtml(episodeName(ep))}</p>
        ${episodeDescriptionHtml(row, ep)}
        <div class="up-next-row">${SEE_ALL_HTML}</div>
      </div>
      ${episodePhotoHtml(row, ep)}`;
  }
  if (state.kind === "next") {
    const ep = state.next;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("Up next {code}", { code: `<span class="up-next-code">${episodeCode(ep.season, ep.number)}</span>` })}</p>
        <p class="up-next-name">${escapeHtml(episodeName(ep))}</p>
        ${episodeDescriptionHtml(row, ep)}
        <div class="up-next-row">${watchedItHtml(ep)}${SEE_ALL_HTML}</div>
      </div>
      ${episodePhotoHtml(row, ep)}`;
  }
  if (state.kind === "uptodate") {
    const ep = state.last;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("You're up to date!")}</p>
        <p class="up-next-hint">${t("You've watched up to {code}, {name}.", { code: episodeCode(ep.season, ep.number), name: escapeHtml(episodeName(ep)) })}</p>
        ${
          state.next?.airDate
            ? `<p class="up-next-hint">${t("The next one, {code}, airs on {date}.", { code: episodeCode(state.next.season, state.next.number), date: formatDate(state.next.airDate) })}</p>`
            : ""
        }
        <div class="up-next-row">${SEE_ALL_HTML}</div>
      </div>
      ${episodePhotoHtml(row, ep)}`;
  }
  if (state.kind === "finished") {
    const ep = state.last;
    return `
      <div class="up-next-text">
        <p class="up-next-head">${t("Finished it?")}</p>
        <p class="up-next-hint">${t("You've ticked the last episode of {title}.", { title: escapeHtml(row.title ?? t("Untitled")) })}</p>
        <div class="up-next-row"><button class="up-next-pick-btn" type="button" data-action="finish-show">${t("Mark it as finished")}</button>${SEE_ALL_HTML}</div>
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
      <div class="up-next-row">${SEE_ALL_HTML}</div>
    </div>
    ${first ? episodePhotoHtml(row, first) : ""}`;
}

// renderDetail's slot for the note: a Watching show from TMDB only. While
// it loads, it's already about the note's size, its photo frame included,
// so the window barely moves when the episode arrives (the owner noticed
// the jump from a thin strip).
function upNextSlotHtml(row) {
  if (!row.tmdb_id) return "";
  if (row.is_dropped && !tickedEpisodes(row.id).length) return "";
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
  // A dropped show with nothing ticked (any more) has no note.
  if (!html) {
    slot.remove();
    return;
  }
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
    // An ended show's last episode: time to finish it.
    const finale = await finaleOf(row).catch(() => null);
    if (finale && list.some((ep) => ep.season === finale.season && ep.episode === finale.episode)) {
      if (currentDetail?.row.id === row.id) loadUpNext(row);
      openFinishFromFinale(row, finale);
      return;
    }
    showToast(message);
  }
  if (currentDetail?.row.id === row.id) loadUpNext(row);
}

// The usual finish window (js/startModal.js), opened by ticking the last
// episode: closed without saving, that episode goes back to unticked.
function openFinishFromFinale(row, finale) {
  openFinishShowModal(STORE.shows.get(row.id) ?? row, async (saved) => {
    if (saved) {
      closeEpisodesWindow();
      return;
    }
    // Closed because the show was just deleted from it: nothing to undo.
    await null;
    if (!STORE.shows.has(row.id)) return;
    const ep = tickedEpisodes(row.id).find((e) => e.season === finale.season && e.episode === finale.episode);
    if (!ep) return;
    const { error } = await db.from("watched_episodes").delete().eq("id", ep.id);
    if (error) {
      console.error("Episode untick error:", error.message);
      return;
    }
    forgetEpisode(ep.id);
    afterEpisodesChanged(row.id);
    showToast(t("Not saved: {code} unticked again.", { code: episodeCode(finale.season, finale.episode) }));
  });
}

// A show just finished (js/startModal.js): every episode out gets ticked.
// The seasons before the latest one out are taken whole, as TMDB counts
// them; the latest one, episode by episode (its last ones may not be out).
async function tickAllEpisodes(row) {
  if (!row.tmdb_id) return;
  try {
    const aired = (await showOutline(row.tmdb_id)).seasons.filter((s) => hasAired(s.airDate));
    const latest = aired.pop();
    const list = [];
    aired.forEach((s) => {
      for (let e = 1; e <= s.count; e++) list.push({ season: s.number, episode: e });
    });
    if (latest) {
      (await seasonEpisodes(row.tmdb_id, latest.number))
        .filter((ep) => hasAired(ep.airDate))
        .forEach((ep) => list.push({ season: latest.number, episode: ep.number }));
    }
    if (!(await tickEpisodes(row, list))) throw new Error("the episodes weren't saved");
  } catch (err) {
    console.error("Tick all episodes error:", err.message);
    showToast(t("Couldn't tick all of its episodes."), true);
  }
}

// "Up to here": every episode of the seasons before it (as TMDB counts
// them, those that are out) and this season's up to it.
async function episodesUpTo(row, season, episode) {
  const { seasons } = await showOutline(row.tmdb_id);
  const list = [];
  seasons
    .filter((s) => s.number < season && hasAired(s.airDate))
    .forEach((s) => {
      for (let e = 1; e <= s.count; e++) list.push({ season: s.number, episode: e });
    });
  (await seasonEpisodes(row.tmdb_id, season))
    .filter((ep) => ep.number <= episode && hasAired(ep.airDate))
    .forEach((ep) => list.push({ season, episode: ep.number }));
  return list;
}

async function tickUpTo(row, button) {
  const season = Number(detailBody.querySelector("#up-next-season")?.value);
  const episode = Number(detailBody.querySelector("#up-next-episode")?.value);
  if (!season || !episode) return;
  const list = await episodesUpTo(row, season, episode);
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
  if (action === "open-episodes") openEpisodesWindow(currentDetail.row);
  if (action === "finish-show") openFinishShowModal(STORE.shows.get(currentDetail.row.id) ?? currentDetail.row);
});

detailBody.addEventListener("change", (e) => {
  if (e.target.id === "up-next-season" && currentDetail) fillEpisodePicker(currentDetail.row);
});

/* ---------- the episodes window ----------

   "See all episodes →": every episode of the show, one season at a time
   under tabs like To Watch / Watching / Dropped (the owner's pick of
   three mockups), each with a hand-drawn box to tick or untick it on
   its own, or "Tick up to here" for it and every one before. It opens on
   the season of the next episode, scrolled to it. A finished or dropped
   show's list is only to look at (the owner's call): a finished one shows
   every episode out as watched (shows finished before episodes were
   tracked have none stored), a dropped one where it stopped. */

const episodesModal = document.getElementById("episodes-modal");
const episodesBody = document.getElementById("episodes-body");

// The show it's open on and the season shown.
let episodesWindow = null;

const episodesWindowOpen = () => !episodesModal.classList.contains("hidden");

async function openEpisodesWindow(row) {
  episodesWindow = { showId: row.id, season: null };
  episodesBody.innerHTML = `<p class="ep-loading">${t("Loading episodes…")}</p>`;
  episodesModal.classList.remove("hidden");
  try {
    const { seasons } = await showOutline(row.tmdb_id);
    if (episodesWindow?.showId !== row.id) return;
    // The season of the next episode, else of the last one ticked, else the first.
    const state = isFinishedShow(row) ? null : await upNextState(row).catch(() => null);
    const at = state?.next?.season ?? state?.last?.season ?? seasons[0]?.number ?? 1;
    episodesWindow.season = at;
    await renderEpisodesWindow({ scrollToNext: true });
  } catch (err) {
    console.error("Episodes error:", err.message);
    if (episodesWindow?.showId === row.id) {
      episodesBody.innerHTML = `<p class="ep-loading">${t("Couldn't load the episodes. Please try again later.")}</p>`;
    }
  }
}

const isFinishedShow = (row) => Boolean(row.finished_watching_date) && !row.is_dropped;
const isReadOnlyShow = (row) => isFinishedShow(row) || row.is_dropped === true;

// As the window shows it: a finished show has watched everything out.
const shownAsTicked = (row, ep) => (isFinishedShow(row) ? hasAired(ep.airDate) : isTicked(row.id, ep.season, ep.number));

function closeEpisodesWindow() {
  episodesModal.classList.add("hidden");
  episodesWindow = null;
}

// Closed along with a show deleted elsewhere (js/detailModal.js). Says
// whether it was open on it.
function closeEpisodesWindowOf(showId) {
  if (!episodesWindowOpen() || episodesWindow?.showId !== showId) return false;
  closeEpisodesWindow();
  return true;
}

// `mark`: the episode flagged, as { season, number, label }: the next one,
// or where a dropped show stopped.
function episodeRowHtml(row, ep, mark) {
  const done = shownAsTicked(row, ep);
  const out = hasAired(ep.airDate);
  const readOnly = isReadOnlyShow(row);
  const isMarked = mark && mark.season === ep.season && mark.number === ep.number;
  const cls = [done ? "is-done" : "", out ? "" : "is-unaired", isMarked ? "is-next" : ""].join(" ").trim();
  const label = `${episodeCode(ep.season, ep.number)} · ${escapeHtml(episodeName(ep))}`;
  const about = out
    ? ep.overview
      ? `<p class="ep-desc">${escapeHtml(ep.overview)}</p>`
      : `<p class="ep-desc is-generic">${t("Episode {e} of season {s} of {title}.", { e: ep.number, s: ep.season, title: escapeHtml(row.title ?? t("Untitled")) })}</p>`
    : `<p class="ep-air">${ep.airDate ? t("Airs on {date}", { date: formatDate(ep.airDate) }) : t("Not out yet")}</p>`;
  const src = ep.still ? TMDB_STILL + ep.still : row.poster;
  return `
    <li class="ep-row ${cls}" data-season="${ep.season}" data-episode="${ep.number}">
      <button class="ep-box-btn" type="button" data-action="toggle-episode" data-season="${ep.season}" data-episode="${ep.number}" aria-pressed="${done}" aria-label="${label}"${out && !readOnly ? "" : " disabled"}>
        <span class="up-next-box">${CHECK_SVG}</span>
      </button>
      <div class="ep-main">
        <p class="ep-line"><span class="ep-num">${t("E{n}", { n: ep.number })}</span> <span class="ep-name">${escapeHtml(episodeName(ep))}</span>${isMarked ? ` <span class="ep-flag">${mark.label}</span>` : ""}</p>
        ${about}
        ${out && !readOnly ? `<button class="ep-upto" type="button" data-action="tick-up-to-here" data-season="${ep.season}" data-episode="${ep.number}">${t("Tick up to here")}</button>` : ""}
      </div>
      ${src ? `<figure class="ep-photo"><img class="${ep.still ? "" : "is-poster"}" src="${escapeHtml(src)}" alt="" loading="lazy" /></figure>` : ""}
    </li>`;
}

// Draws the window from what's known now: the show's seasons, the season
// shown (looked up if it isn't yet) and what's ticked.
async function renderEpisodesWindow({ scrollToNext = false } = {}) {
  const win = episodesWindow;
  const row = win && STORE.shows.get(win.showId);
  if (!row) return;
  const { seasons } = await showOutline(row.tmdb_id);
  const shown = await seasonEpisodes(row.tmdb_id, win.season).catch(() => null);
  const state = isFinishedShow(row) ? null : await upNextState(row).catch(() => null);
  if (episodesWindow !== win) return; // closed, or opened on another show meanwhile

  // Counted from TMDB's seasons: what's out, and how much of it is ticked.
  const outIn = (s) => (hasAired(s.airDate) ? s.count : 0);
  const out = seasons.reduce((n, s) => n + outIn(s), 0);
  const tickedCount = (s) =>
    isFinishedShow(row) ? outIn(s) : tickedEpisodes(row.id).filter((e) => e.season === s.number).length;
  const watched = Math.min(out, seasons.reduce((n, s) => n + tickedCount(s), 0));
  const pct = out ? Math.round((watched / out) * 100) : 0;
  const tabs = seasons
    .map(
      (s) => `<button class="ep-tab" type="button" role="tab" data-action="episodes-season" data-season="${s.number}" aria-selected="${s.number === win.season}">${t("Season {n}", { n: s.number })}<small>${outIn(s) ? `${tickedCount(s)}/${outIn(s)}` : "—"}</small></button>`
    )
    .join("");
  const mark =
    state?.kind === "next"
      ? { season: state.next.season, number: state.next.number, label: t("Up next") }
      : state?.kind === "stopped"
        ? { season: state.last.season, number: state.last.number, label: t("Stopped here") }
        : null;
  const note = isFinishedShow(row)
    ? t("You finished it: every episode counts as watched. This list is just to look at.")
    : row.is_dropped
      ? t("You dropped it. This list is just to look at: to start it over, move it back to To Watch.")
      : "";
  const list = shown
    ? shown.map((ep) => episodeRowHtml(row, ep, mark)).join("")
    : `<li class="ep-loading">${t("Couldn't load the episodes. Please try again later.")}</li>`;

  const listEl = episodesBody.querySelector(".ep-list");
  const keepScroll = listEl && !scrollToNext ? listEl.scrollTop : 0;
  episodesBody.innerHTML = `
    <div class="ep-head">
      <div class="ep-head-text">
        <h2 class="ep-title" id="episodes-title">${t("{title} · Episodes", { title: escapeHtml(row.title ?? t("Untitled")) })}</h2>
        <p class="ep-sub">${tn(seasons.length, "{n} season", "{n} seasons")} · ${tn(out, "{n} episode out", "{n} episodes out")}</p>
      </div>
      <div class="ep-progress">
        <p class="ep-progress-text">${t("{a} of {b} watched", { a: watched, b: out })}</p>
        <div class="ep-bar" aria-hidden="true"><span style="width: ${pct}%"></span></div>
      </div>
    </div>
    ${note ? `<p class="ep-read-only">${note}</p>` : ""}
    <div class="ep-tabs" role="tablist">${tabs}</div>
    <ul class="ep-list">${list}</ul>`;
  const newList = episodesBody.querySelector(".ep-list");
  if (scrollToNext) {
    const at = newList.querySelector(".is-next");
    if (at) newList.scrollTop = at.offsetTop - newList.offsetTop - 12;
  } else {
    newList.scrollTop = keepScroll;
  }
}

// Ticks or unticks one episode from the window.
async function toggleEpisodeInWindow(button) {
  const row = STORE.shows.get(episodesWindow?.showId);
  if (!row || isReadOnlyShow(row)) return;
  const season = Number(button.dataset.season);
  const episode = Number(button.dataset.episode);
  const code = episodeCode(season, episode);
  const ticked = tickedEpisodes(row.id).find((e) => e.season === season && e.episode === episode);
  button.disabled = true;
  if (ticked) {
    const { error } = await db.from("watched_episodes").delete().eq("id", ticked.id);
    if (error) {
      console.error("Episode untick error:", error.message);
      showToast(t("Couldn't save that. Please try again."), true);
      button.disabled = false;
      return;
    }
    forgetEpisode(ticked.id);
    showToast(t("{code} unticked.", { code }));
  } else {
    button.querySelector(".up-next-box")?.parentElement.classList.add("is-checked");
    if (!(await tickEpisodes(row, [{ season, episode }]))) {
      showToast(t("Couldn't save that. Please try again."), true);
      button.disabled = false;
      return;
    }
    const finale = await finaleOf(row).catch(() => null);
    if (finale && finale.season === season && finale.episode === episode) {
      afterEpisodesChanged(row.id);
      openFinishFromFinale(row, finale);
      return;
    }
    showToast(t("{code} ticked.", { code }));
  }
  afterEpisodesChanged(row.id);
}

// "Tick up to here": this episode and every one before it.
async function tickUpToHereInWindow(button) {
  const row = STORE.shows.get(episodesWindow?.showId);
  if (!row || isReadOnlyShow(row)) return;
  const season = Number(button.dataset.season);
  const episode = Number(button.dataset.episode);
  button.disabled = true;
  let list;
  try {
    list = await episodesUpTo(row, season, episode);
  } catch (err) {
    console.error("Episodes error:", err.message);
    list = null;
  }
  if (!list || !(await tickEpisodes(row, list))) {
    showToast(t("Couldn't save that. Please try again."), true);
    button.disabled = false;
    return;
  }
  const finale = await finaleOf(row).catch(() => null);
  if (finale && list.some((ep) => ep.season === finale.season && ep.episode === finale.episode)) {
    afterEpisodesChanged(row.id);
    openFinishFromFinale(row, finale);
    return;
  }
  showToast(t("Ticked up to {code}.", { code: episodeCode(season, episode) }));
  afterEpisodesChanged(row.id);
}

// The window and the note, after a show's episodes changed.
function afterEpisodesChanged(showId) {
  if (episodesWindowOpen() && episodesWindow?.showId === showId && episodesWindow.season) renderEpisodesWindow();
  refreshUpNext(showId);
}

episodesBody.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "episodes-season" && episodesWindow) {
    episodesWindow.season = Number(button.dataset.season);
    renderEpisodesWindow({ scrollToNext: true });
  }
  if (button.dataset.action === "toggle-episode") toggleEpisodeInWindow(button);
  if (button.dataset.action === "tick-up-to-here") tickUpToHereInWindow(button);
});

document.getElementById("episodes-close").addEventListener("click", closeEpisodesWindow);

episodesModal.addEventListener("click", (e) => {
  if (e.target === episodesModal) closeEpisodesWindow();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !episodesWindowOpen()) return;
  // The finish window or a confirmation above it takes Escape itself.
  if (!startModal.classList.contains("hidden") || !confirmModal.classList.contains("hidden")) return;
  closeEpisodesWindow();
});
