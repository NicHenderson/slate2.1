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

// How many of a show's episodes are out, from its details: TMDB's own
// count includes episodes announced but not out yet, and a show still
// airing would never read as up to date against it. Counted up to the
// last episode out (specials left out); TMDB's count when it names none.
function episodesOut(details) {
  const total = details.number_of_episodes > 0 ? details.number_of_episodes : null;
  const last = details.last_episode_to_air;
  if (!(last?.season_number >= 1 && last.episode_number >= 1)) return total;
  const before = (details.seasons ?? [])
    .filter((s) => s.season_number >= 1 && s.season_number < last.season_number)
    .reduce((n, s) => n + (s.episode_count || 0), 0);
  const out = before + last.episode_number;
  return total ? Math.min(out, total) : out;
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
    const last = details.last_episode_to_air;
    return {
      seasons,
      lastOut: last?.season_number >= 1 && last.episode_number >= 1 ? { season: last.season_number, number: last.episode_number } : null,
      // TMDB's own counts, for the show's saved ones (refreshShowCounts).
      totalEpisodes: episodesOut(details),
      totalSeasons: details.number_of_seasons > 0 ? details.number_of_seasons : null,
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

// How many of a season's episodes are out: up to TMDB's last episode out
// (a season still airing has only some); by its first air date when TMDB
// names none.
function outInSeason(outline, s) {
  const last = outline.lastOut;
  if (!last) return hasAired(s.airDate) ? s.count : 0;
  if (s.number < last.season) return s.count;
  return s.number === last.season ? Math.min(s.count, last.number) : 0;
}

/* ---------- new since it was finished ----------

   A finished show gets new episodes when a season (or episodes) comes out
   after its finished date: those count as new, whatever came out by then
   as watched. Only the date says so, not what's ticked: a show finished
   before episodes were tracked has nothing stored, and an earlier Slate
   ticked everything out on the day a show was marked as finished, even
   with a finished date in the past. */

// The date a finished show's episodes are measured against: none (all out
// counts as watched, as before) when it's before the show even started
// airing, a date that can't be right.
function finishedCutoff(row, outline) {
  const finished = row.finished_watching_date;
  const first = outline.seasons.find((s) => s.airDate)?.airDate;
  return finished && first && finished >= first ? finished : null;
}

// As the finished show's list shows it: watched if out by its finished date.
const seenWhenFinished = (cutoff, ep) => hasAired(ep.airDate) && (!cutoff || ep.airDate <= cutoff);

// Each season of a finished show, as { number, out, seen }: the ones before
// the season airing on its finished date seen whole, the ones after it new,
// and that one looked up episode by episode.
async function finishedSeasons(row) {
  const outline = await showOutline(row.tmdb_id);
  const cutoff = finishedCutoff(row, outline);
  const current = cutoff && [...outline.seasons].reverse().find((s) => s.airDate && s.airDate <= cutoff);
  let currentSeen = 0;
  let currentOut = 0;
  if (current) {
    const episodes = await seasonEpisodes(row.tmdb_id, current.number);
    currentOut = episodes.filter((ep) => hasAired(ep.airDate)).length;
    currentSeen = episodes.filter((ep) => seenWhenFinished(cutoff, ep)).length;
  }
  return outline.seasons.map((s) => {
    const out = outInSeason(outline, s);
    if (!current || s.number < current.number) return { number: s.number, out, seen: out };
    if (s.number === current.number) return { number: s.number, out: currentOut, seen: currentSeen };
    return { number: s.number, out, seen: 0 };
  });
}

// What's new in a finished show, or null: { count, seasons (the numbers
// with something new), whole (how many of them are new from the start,
// or 0 when some are new only in part) }.
async function newSinceFinished(row) {
  if (!isFinishedShow(row) || !row.tmdb_id) return null;
  const seasons = (await finishedSeasons(row)).filter((s) => s.seen < s.out);
  if (!seasons.length) return null;
  return {
    count: seasons.reduce((n, s) => n + s.out - s.seen, 0),
    seasons: seasons.map((s) => s.number),
    whole: seasons.every((s) => s.seen === 0) ? seasons.length : 0,
  };
}

// Its headline: "New season!", "2 new seasons!", or "New episodes!" when
// some of it is in a season already seen in part.
function newSinceHeadline(news) {
  if (news.whole === 1) return t("New season!");
  if (news.whole > 1) return t("{n} new seasons!", { n: news.whole });
  return t("New episodes!");
}

function newSinceText(news) {
  if (news.seasons.length === 1) {
    return tn(news.count, "Since you finished it, {n} episode of season {s} came out.", "Since you finished it, {n} episodes of season {s} came out.", { s: news.seasons[0] });
  }
  const list = new Intl.ListFormat(LOCALE, { type: "conjunction" }).format(news.seasons.map(String));
  return tn(news.count, "Since you finished it, {n} episode came out, in seasons {list}.", "Since you finished it, {n} episodes came out, in seasons {list}.", { list });
}

// renderDetail's slot for it, in a finished show's window: empty (and
// taking no room) until TMDB says there's something new.
function newSeasonSlotHtml(row) {
  return row.tmdb_id ? `<div class="new-season hidden" data-show-id="${row.id}" aria-live="polite"></div>` : "";
}

// Fills the slot, if renderDetail left one: the note, and the stamp on
// the poster (the owner's pick: mockup 1a's note with 1b's stamp).
async function loadNewSeason(row) {
  const slot = detailBody.querySelector(".new-season");
  if (!slot || slot.dataset.showId !== row.id) return;
  let news;
  try {
    news = await newSinceFinished(row);
  } catch (err) {
    console.error("Episodes error:", err.message);
    return; // nothing to say: the window stays as it was
  }
  if (!news || !slot.isConnected || currentDetail?.row.id !== row.id) return;
  const headline = newSinceHeadline(news);
  slot.innerHTML = `
    <p class="up-next-head new-season-head">${headline}</p>
    <p class="up-next-hint">${newSinceText(news)}</p>
    <div class="up-next-row">${SEE_ALL_HTML}</div>`;
  slot.classList.remove("hidden");
  // The note has its own "See all episodes →".
  detailBody.querySelector(".detail-see-all")?.classList.add("hidden");
  detailPoster.querySelector(".new-season-stamp")?.remove();
  detailPoster.insertAdjacentHTML("beforeend", `<span class="new-season-stamp" aria-hidden="true">${headline}</span>`);
  easeNoteHeight(slot, 0);
}

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
      afterEpisodesChanged(row.id);
      openFinishFromFinale(row, finale);
      return;
    }
    showToast(message);
  }
  afterEpisodesChanged(row.id);
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
    // What was out by the date it was finished: one finished in the past
    // hadn't seen what came out after (that's new, newSinceFinished).
    const outline = await showOutline(row.tmdb_id);
    const cutoff = finishedCutoff(row, outline);
    const outBy = (date) => hasAired(date) && (!cutoff || date <= cutoff);
    const aired = outline.seasons.filter((s) => outBy(s.airDate));
    const latest = aired.pop();
    const list = [];
    aired.forEach((s) => {
      for (let e = 1; e <= s.count; e++) list.push({ season: s.number, episode: e });
    });
    if (latest) {
      (await seasonEpisodes(row.tmdb_id, latest.number))
        .filter((ep) => outBy(ep.airDate))
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
    // The season of the next episode, else of the last one ticked, else the
    // first; a finished show's first with something new, else its first.
    const state = isFinishedShow(row) ? null : await upNextState(row).catch(() => null);
    const news = isFinishedShow(row) ? await newSinceFinished(row).catch(() => null) : null;
    const at = news?.seasons[0] ?? state?.next?.season ?? state?.last?.season ?? seasons[0]?.number ?? 1;
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

// As the window shows it: a finished show has watched everything out by
// its finished date (`cutoff`, finishedCutoff).
const shownAsTicked = (row, ep, cutoff) =>
  isFinishedShow(row) ? seenWhenFinished(cutoff, ep) : isTicked(row.id, ep.season, ep.number);

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
// or where a dropped show stopped. A finished show's new ones (out since
// it was finished) are flagged "New".
function episodeRowHtml(row, ep, mark, cutoff) {
  const done = shownAsTicked(row, ep, cutoff);
  const out = hasAired(ep.airDate);
  const readOnly = isReadOnlyShow(row);
  const isNew = isFinishedShow(row) && out && !done;
  if (isNew) mark = { season: ep.season, number: ep.number, label: t("New") };
  const isMarked = mark && mark.season === ep.season && mark.number === ep.number;
  const cls = [done ? "is-done" : "", out ? "" : "is-unaired", isMarked ? "is-next" : "", isNew ? "is-new" : ""].join(" ").trim();
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
  const outline = await showOutline(row.tmdb_id);
  const { seasons } = outline;
  const shown = await seasonEpisodes(row.tmdb_id, win.season).catch(() => null);
  const state = isFinishedShow(row) ? null : await upNextState(row).catch(() => null);
  const finished = isFinishedShow(row) ? await finishedSeasons(row) : null;
  if (episodesWindow !== win) return; // closed, or opened on another show meanwhile

  // Counted from TMDB's seasons: what's out, and how much of it is ticked
  // (a finished show's, what was out by its finished date).
  const counts = seasons.map((s) =>
    finished
      ? finished.find((f) => f.number === s.number)
      : { number: s.number, out: outInSeason(outline, s), seen: tickedEpisodes(row.id).filter((e) => e.season === s.number).length }
  );
  const out = counts.reduce((n, c) => n + c.out, 0);
  const watched = Math.min(out, counts.reduce((n, c) => n + Math.min(c.seen, c.out), 0));
  const hasNews = Boolean(finished) && watched < out;
  const pct = out ? Math.round((watched / out) * 100) : 0;
  const tabs = counts
    .map(
      (c) => `<button class="ep-tab" type="button" role="tab" data-action="episodes-season" data-season="${c.number}" aria-selected="${c.number === win.season}">${t("Season {n}", { n: c.number })}<small>${c.out ? `${Math.min(c.seen, c.out)}/${c.out}` : "—"}</small>${finished && c.seen < c.out ? `<span class="ep-tab-new">${t("new")}</span>` : ""}</button>`
    )
    .join("");
  const mark =
    state?.kind === "next"
      ? { season: state.next.season, number: state.next.number, label: t("Up next") }
      : state?.kind === "stopped"
        ? { season: state.last.season, number: state.last.number, label: t("Stopped here") }
        : null;
  const note = hasNews
    ? t("You finished it on {date}: everything out by then counts as watched. What came out later doesn't.", { date: formatDate(row.finished_watching_date) })
    : isFinishedShow(row)
      ? t("You finished it: every episode counts as watched. This list is just to look at.")
      : row.is_dropped
        ? t("You dropped it. This list is just to look at: to start it over, move it back to To Watch.")
        : "";
  const list = shown
    ? shown.map((ep) => episodeRowHtml(row, ep, mark, finished && finishedCutoff(row, outline))).join("")
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
    const at = newList.querySelector(".is-next, .is-new");
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

// The window, the note and the cards, after a show's episodes changed.
function afterEpisodesChanged(showId) {
  if (episodesWindowOpen() && episodesWindow?.showId === showId && episodesWindow.season) renderEpisodesWindow();
  refreshUpNext(showId);
  SHOW_GRIDS.forEach((gridId) => renderGrid(gridId, [...STORE.shows.values()]));
}

/* ---------- the card ----------

   On a Watching show's card, under its title: the last episode ticked in
   handwriting ("S2 · E5", not the next one), how many of all, and a bar
   of the whole show (the owner's pick of three mockups). On a dropped
   one's, where it stopped. Cards are drawn from what's stored, with no
   lookup: the total is the show's saved count of episodes out, which its
   window keeps up to date (refreshShowCounts). */

function episodeProgressHtml(row) {
  if (!row.tmdb_id) return "";
  const ticked = tickedEpisodes(row.id);
  const total = row.total_episodes > 0 ? row.total_episodes : 0;
  // Nothing ticked yet: an empty bar that looks it (the owner found a
  // "Where are you?" on the card ugly; the window still asks).
  if (!ticked.length) {
    if (row.is_dropped) return "";
    return `<div class="card-episode is-empty"><p class="card-episode-line">${total ? `<span class="card-episode-count">0/${total}</span>` : ""}</p><span class="card-episode-bar" aria-hidden="true"></span></div>`;
  }
  const last = ticked[ticked.length - 1];
  const code = episodeCode(last.season, last.episode);
  const count = ticked.length;
  const label = row.is_dropped ? t("Stopped at {code}", { code }) : total && count >= total ? t("Up to date") : code;
  const countHtml = row.is_dropped || !total ? "" : `<span class="card-episode-count">${count}/${total}</span>`;
  const bar = total
    ? `<span class="card-episode-bar" aria-hidden="true"><span style="width: ${Math.min(100, Math.round((count / total) * 100))}%"></span></span>`
    : "";
  return `<div class="card-episode"><p class="card-episode-line"><span class="card-episode-code">${label}</span>${countHtml}</p>${bar}</div>`;
}

// A show's saved episode and season counts, brought up to date with
// TMDB's whenever its window opens: they're saved when the show is added,
// and a show still airing grows (the card's bar would pass 100%).
async function refreshShowCounts(row) {
  if (!row.tmdb_id) return;
  let outline;
  try {
    outline = await showOutline(row.tmdb_id);
  } catch {
    return; // the window says so where it needs to
  }
  const current = STORE.shows.get(row.id);
  if (!current) return;
  const changes = {};
  if (outline.totalEpisodes && outline.totalEpisodes !== current.total_episodes) changes.total_episodes = outline.totalEpisodes;
  if (outline.totalSeasons && outline.totalSeasons !== current.total_seasons) changes.total_seasons = outline.totalSeasons;
  if (!Object.keys(changes).length) return;
  const { data, error } = await db.from("shows").update(changes).eq("id", row.id).select().single();
  if (error) {
    console.error("Show counts error:", error.message);
    return;
  }
  applyLocalChange("shows", "UPDATE", data);
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
