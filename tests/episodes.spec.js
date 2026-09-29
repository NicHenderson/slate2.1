// Episode tracking (js/episodes.js): where you are in a show you're
// watching, saved one episode at a time. Losing a tick loses your place.
const { test, expect, logIn } = require("./support/fixtures");

// The seeded Dark, back to Watching: started, not finished.
function watchingDark(backend) {
  const dark = backend.db.shows.find((s) => s.tmdb_id === 70523);
  Object.assign(dark, { started_watching_date: "2026-09-01", finished_watching_date: null, rating: null });
  return dark;
}

async function openWatching(page, title) {
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await page.click('[data-subtab="grid-shows-watching"]');
  await page.locator("#grid-shows-watching .card", { hasText: title }).click();
}

const ticked = (backend, show) =>
  backend.db.watched_episodes
    .filter((e) => e.show_id === show.id)
    .map((e) => `${e.season}x${e.episode}`)
    .sort();

test("where you are in a show: asked, ticked, saved, and started over from To Watch", async ({ page, backend }) => {
  const dark = watchingDark(backend);
  await logIn(page);
  await openWatching(page, "Dark");

  // Nothing ticked: it asks, rather than assuming the first episode.
  const note = page.locator("#detail-modal .up-next");
  await expect(note.locator(".up-next-head")).toHaveText("Where are you?");
  await expect(note.locator("#up-next-season option")).toHaveText(["Season 1", "Season 2", "Season 3"]); // no specials
  await expect(note.locator("#up-next-episode")).toBeEnabled();
  await note.locator("#up-next-episode").selectOption("3");
  await note.locator('[data-action="tick-up-to"]').click();
  await expect(note.locator(".up-next-head")).toHaveText("Up next S1 · E4");
  await expect(note.locator(".up-next-name")).toHaveText("Double Lives");
  expect(ticked(backend, dark)).toEqual(["1x1", "1x2", "1x3"]);

  // Watched it: saved, and on to the next one.
  await note.locator('[data-action="tick-episode"]').click();
  await expect(note.locator(".up-next-head")).toHaveText("Up next S1 · E5");
  expect(ticked(backend, dark)).toEqual(["1x1", "1x2", "1x3", "1x4"]);

  // The next one is after the furthest ticked, even with one skipped.
  backend.seed("watched_episodes", [{ show_id: dark.id, season: 2, episode: 3 }], backend.user.id);
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await openWatching(page, "Dark");
  await expect(note.locator(".up-next-head")).toHaveText("Up next S2 · E4");

  // Dropped and sent back to To Watch, it starts over: no episodes left.
  await page.locator('#detail-modal [data-action="drop-series"]').click();
  await page.click('[data-subtab="grid-shows-dropped"]');
  await page.locator("#grid-shows-dropped .card", { hasText: "Dark" }).click();
  await page.locator('#detail-modal [data-action="send-to-watchlist"]').click();
  await expect.poll(() => ticked(backend, dark)).toEqual([]);
  await page.click('[data-subtab="grid-shows-towatch"]');
  await page.locator("#grid-shows-towatch .card", { hasText: "Dark" }).click();
  await page.locator('#detail-modal [data-action="start-watching"]').click();
  await page.fill("#start-date", "2026-09-10");
  await page.click("#start-save");
  await openWatching(page, "Dark");
  await expect(note.locator(".up-next-head")).toHaveText("Where are you?");
});

test.describe("in Spanish", () => {
  test.use({ locale: "es-CL" });

  test("an episode TMDB hasn't described in Spanish gets a generic line, never the English one", async ({ page, backend }) => {
    const dark = watchingDark(backend);
    backend.seed("watched_episodes", [1, 2, 3].map((episode) => ({ show_id: dark.id, season: 1, episode })), backend.user.id);
    await logIn(page);
    await openWatching(page, "Dark");
    const note = page.locator("#detail-modal .up-next");
    await expect(note.locator(".up-next-head")).toHaveText("Sigues con T1 · E4");
    await expect(note.locator(".up-next-name")).toHaveText("Vidas dobles");
    await expect(note.locator(".up-next-desc")).toHaveText("Episodio 4 de la temporada 1 de Dark.");
  });
});

test("the last episode of a show that has ended finishes it; closing that window unticks it", async ({ page, backend }) => {
  const dark = watchingDark(backend);
  const seasons = [10, 8, 8];
  const upTo = [];
  seasons.forEach((count, i) => {
    for (let e = 1; e <= count; e++) if (!(i === 2 && e === 8)) upTo.push({ show_id: dark.id, season: i + 1, episode: e });
  });
  backend.seed("watched_episodes", upTo, backend.user.id);
  await logIn(page);
  await openWatching(page, "Dark");
  const note = page.locator("#detail-modal .up-next");
  await expect(note.locator(".up-next-head")).toHaveText("Up next S3 · E8");

  // Ticked: the usual finish window asks. Closed without saving: unticked.
  await note.locator('[data-action="tick-episode"]').click();
  await expect(page.locator("#start-modal")).toBeVisible();
  await expect(page.locator("#start-title")).toHaveText("Finished it?");
  await page.click("#start-cancel");
  await expect(page.locator(".toast").last()).toHaveText("Not saved: S3 · E8 unticked again.");
  expect(ticked(backend, dark)).toHaveLength(25);
  await expect(note.locator(".up-next-head")).toHaveText("Up next S3 · E8");

  // Saved: finished, with every episode ticked.
  await note.locator('[data-action="tick-episode"]').click();
  await page.click("#start-save");
  await expect(page.locator("#start-modal")).toBeHidden();
  await expect.poll(() => dark.finished_watching_date).not.toBeNull();
  expect(ticked(backend, dark)).toHaveLength(26);
});

test("a show finished the usual way gets every episode ticked", async ({ page, backend }) => {
  const [got] = backend.seed(
    "shows",
    [{ tmdb_id: 1399, title: "Game of Thrones", total_seasons: 8, total_episodes: 73, started_watching_date: "2026-08-01", finished_watching_date: null }],
    backend.user.id
  );
  backend.seed("watched_episodes", [{ show_id: got.id, season: 1, episode: 1 }], backend.user.id);
  await logIn(page);
  await openWatching(page, "Game of Thrones");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2026-09-20");
  await page.click("#start-save");
  await expect.poll(() => ticked(backend, got).length).toBe(73);

  // Finished on a date in the past: only what was out by then. Severance's
  // season 2 came out in 2025, after it.
  const [sev] = backend.seed(
    "shows",
    [{ tmdb_id: 95396, title: "Severance", total_seasons: 3, total_episodes: 19, started_watching_date: "2022-02-20", finished_watching_date: null }],
    backend.user.id
  );
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await openWatching(page, "Severance");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2022-05-01");
  await page.click("#start-save");
  await expect.poll(() => ticked(backend, sev).length).toBe(9);
  expect(ticked(backend, sev).every((e) => e.startsWith("1x"))).toBe(true);
});

test("up to date with a show still airing: when the next one airs", async ({ page, backend }) => {
  const [sev] = backend.seed(
    "shows",
    [{ tmdb_id: 95396, title: "Severance", total_seasons: 3, total_episodes: 29, started_watching_date: "2026-08-01", finished_watching_date: null }],
    backend.user.id
  );
  const out = [];
  [9, 10].forEach((count, i) => {
    for (let e = 1; e <= count; e++) out.push({ show_id: sev.id, season: i + 1, episode: e });
  });
  backend.seed("watched_episodes", out, backend.user.id);
  await logIn(page);
  await openWatching(page, "Severance");
  const note = page.locator("#detail-modal .up-next");
  await expect(note.locator(".up-next-head")).toHaveText("You're up to date!");
  await expect(note.locator(".up-next-hint").last()).toHaveText("The next one, S3 · E1, airs on Jan 15, 2099.");
  await expect(note.locator('[data-action="tick-episode"]')).toHaveCount(0);

  // The card too: TMDB counts 29 with the season announced, 19 are out.
  await expect.poll(() => sev.total_episodes).toBe(19);
  await page.keyboard.press("Escape");
  await expect(page.locator("#grid-shows-watching .card", { hasText: "Severance" }).locator(".card-episode-code")).toHaveText("Up to date");
});

test("the episodes window: each episode ticked or unticked on its own, and saved", async ({ page, backend }) => {
  const dark = watchingDark(backend);
  backend.seed("watched_episodes", [1, 2, 3].map((episode) => ({ show_id: dark.id, season: 1, episode })), backend.user.id);
  await logIn(page);
  await openWatching(page, "Dark");
  await page.locator("#detail-modal .up-next-all").click();

  // It opens on the next episode's season, which it marks.
  const win = page.locator("#episodes-modal");
  await expect(win.locator('.ep-tab[aria-selected="true"]')).toHaveText("Season 13/10");
  await expect(win.locator(".ep-row.is-next .ep-name")).toHaveText("Double Lives");
  await expect(win.locator(".ep-progress-text")).toHaveText("3 of 26 watched");

  // Skipping one ahead, and unticking one behind.
  await win.locator('.ep-row[data-episode="6"] .ep-box-btn').click();
  await expect(win.locator(".ep-progress-text")).toHaveText("4 of 26 watched");
  await win.locator('.ep-row[data-episode="2"] .ep-box-btn').click();
  await expect(win.locator(".ep-progress-text")).toHaveText("3 of 26 watched");
  expect(ticked(backend, dark)).toEqual(["1x1", "1x3", "1x6"]);

  // Another season.
  await win.locator('.ep-tab[data-season="2"]').click();
  await win.locator('.ep-row[data-episode="1"] .ep-box-btn').click();
  await expect(win.locator('.ep-tab[data-season="2"]')).toHaveText("Season 21/8");
  expect(ticked(backend, dark)).toEqual(["1x1", "1x3", "1x6", "2x1"]);

  // Closed, the note is where the window left it: after the furthest one.
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await expect(page.locator("#detail-modal .up-next-head")).toHaveText("Up next S2 · E2");
});

test("Tick up to here: that episode and every one before it, earlier seasons too", async ({ page, backend }) => {
  const dark = watchingDark(backend);
  backend.seed("watched_episodes", [{ show_id: dark.id, season: 1, episode: 2 }], backend.user.id);
  await logIn(page);
  await openWatching(page, "Dark");
  await page.locator("#detail-modal .up-next-all").click();
  const win = page.locator("#episodes-modal");
  await win.locator('.ep-tab[data-season="2"]').click();
  const row = win.locator('.ep-row[data-episode="3"]');
  await row.hover();
  await row.locator('[data-action="tick-up-to-here"]').click();
  await expect(win.locator(".ep-progress-text")).toHaveText("13 of 26 watched");
  expect(ticked(backend, dark)).toHaveLength(13); // season 1's ten and season 2's first three
  await expect(page.locator(".toast").last()).toHaveText("Ticked up to S2 · E3.");
});

test("a finished or dropped show's episodes are only to look at", async ({ page, backend }) => {
  // The seeded Dark is finished, from before episodes were tracked: none stored.
  const [got] = backend.seed(
    "shows",
    [{ tmdb_id: 1399, title: "Game of Thrones", total_seasons: 8, total_episodes: 73, started_watching_date: "2026-03-01", is_dropped: true }],
    backend.user.id
  );
  backend.seed("watched_episodes", [1, 2, 3].map((episode) => ({ show_id: got.id, season: 1, episode })), backend.user.id);
  await logIn(page);

  // Finished: every episode shown as watched, nothing to tick.
  await page.click('.nav-btn[data-section="shows-watched"]');
  await page.locator("#grid-shows-watched .card", { hasText: "Dark" }).click();
  await page.locator("#detail-modal .up-next-all").click();
  const win = page.locator("#episodes-modal");
  await expect(win.locator(".ep-progress-text")).toHaveText("26 of 26 watched");
  await expect(win.locator(".ep-box-btn:not([disabled])")).toHaveCount(0);
  await expect(win.locator('[data-action="tick-up-to-here"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Dropped: where it stopped, on the note and in the list.
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await page.click('[data-subtab="grid-shows-dropped"]');
  await page.locator("#grid-shows-dropped .card", { hasText: "Game of Thrones" }).click();
  await expect(page.locator("#detail-modal .up-next-head")).toHaveText("Stopped at S1 · E3");
  await expect(page.locator('#detail-modal [data-action="tick-episode"]')).toHaveCount(0);
  await page.locator("#detail-modal .up-next-all").click();
  await expect(win.locator(".ep-row.is-next .ep-flag")).toHaveText("Stopped here");
  await expect(win.locator(".ep-box-btn:not([disabled])")).toHaveCount(0);
  expect(backend.db.watched_episodes.filter((e) => e.show_id === got.id)).toHaveLength(3);
});

test("a finished show with a season out since: the new episodes aren't counted as watched", async ({ page, backend }) => {
  // Finished in 2022, after season 1; season 2 came out in 2025.
  const [sev] = backend.seed(
    "shows",
    [{ tmdb_id: 95396, title: "Severance", total_seasons: 3, total_episodes: 19, started_watching_date: "2022-02-20", finished_watching_date: "2022-05-01", rating: 8 }],
    backend.user.id
  );
  // Ticked the day it was marked as finished, by an older Slate that
  // ticked everything out that day, season 2 included: only the finished
  // date says what was seen.
  const all = [];
  [9, 10].forEach((count, i) => {
    for (let e = 1; e <= count; e++) all.push({ show_id: sev.id, season: i + 1, episode: e });
  });
  backend.seed("watched_episodes", all, backend.user.id);
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-watched"]');

  // A show finished after everything out has nothing new to say.
  await page.locator("#grid-shows-watched .card", { hasText: "Dark" }).click();
  await expect(page.locator("#detail-modal .detail-see-all")).toBeVisible();
  await expect(page.locator("#detail-modal .new-season")).toBeHidden();
  await page.keyboard.press("Escape");

  await page.locator("#grid-shows-watched .card", { hasText: "Severance" }).click();
  const note = page.locator("#detail-modal .new-season");
  await expect(note.locator(".new-season-head")).toHaveText("New season!");
  await expect(note.locator(".up-next-hint")).toHaveText("Since you finished it, 10 episodes of season 2 came out.");
  await expect(page.locator("#detail-poster .new-season-stamp")).toHaveText("New season!");
  await expect(page.locator("#detail-modal .detail-see-all")).toBeHidden();

  // The list opens on the new season: nothing of it watched, each one "New".
  await note.locator(".up-next-all").click();
  const win = page.locator("#episodes-modal");
  await expect(win.locator(".ep-progress-text")).toHaveText("9 of 19 watched");
  await expect(win.locator('.ep-tab[aria-selected="true"]')).toHaveText("Season 20/10new");
  await expect(win.locator(".ep-row.is-new")).toHaveCount(10);
  await expect(win.locator(".ep-row.is-done")).toHaveCount(0);
  await expect(win.locator(".ep-row.is-new .ep-flag").first()).toHaveText("New");
  await expect(win.locator(".ep-box-btn:not([disabled])")).toHaveCount(0);
  await win.locator('.ep-tab[data-season="1"]').click();
  await expect(win.locator(".ep-row.is-done")).toHaveCount(9);
  await expect(win.locator(".ep-row.is-new")).toHaveCount(0);
});

test("keep watching a finished show with a new season, then finish it again: rating and review kept", async ({ page, backend }) => {
  const [sev] = backend.seed(
    "shows",
    [{ tmdb_id: 95396, title: "Severance", total_seasons: 3, total_episodes: 19, started_watching_date: "2022-02-20", finished_watching_date: "2022-05-01", rating: 8, review: "Strange and very good." }],
    backend.user.id
  );
  // Season 2 ticked by an older Slate on the day it was marked as finished.
  backend.seed("watched_episodes", [{ show_id: sev.id, season: 1, episode: 1 }, { show_id: sev.id, season: 2, episode: 3 }], backend.user.id);
  watchingDark(backend);
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-watched"]');
  await page.locator("#grid-shows-watched .card", { hasText: "Severance" }).click();

  // Asked first; cancelling changes nothing.
  await page.locator('#detail-modal .new-season [data-action="keep-watching"]').click();
  const confirm = page.locator("#confirm-modal");
  await expect(confirm.locator("#confirm-heading")).toHaveText("Keep watching Severance?");
  await expect(confirm.locator(".confirm-keep.is-gone")).toHaveText("✕ The finished date (May 1, 2022) is cleared.");
  await confirm.locator("#confirm-cancel").click();
  expect(sev.finished_watching_date).toBe("2022-05-01");

  // Back to Watching: started date, rating and review kept; what was out by
  // the finished date ticked, what came out after it not; up next, the first new one.
  await page.locator('#detail-modal .new-season [data-action="keep-watching"]').click();
  await confirm.locator("#confirm-yes").click();
  await expect(page.locator("#detail-modal .up-next-head")).toHaveText("Up next S2 · E1");
  expect(sev).toMatchObject({ started_watching_date: "2022-02-20", finished_watching_date: null, rating: 8, review: "Strange and very good." });
  expect(ticked(backend, sev)).toEqual(["1x1", "1x2", "1x3", "1x4", "1x5", "1x6", "1x7", "1x8", "1x9"]);
  await expect(page.locator("#detail-poster .new-season-stamp")).toHaveCount(0);

  // Edited without a finished date: the rating and review stay.
  await page.locator('#detail-modal [data-action="edit"]').click();
  await expect(page.locator("#start-extra")).toBeHidden();
  await page.fill("#start-date", "2022-02-21");
  await page.click("#start-save");
  await expect.poll(() => sev.started_watching_date).toBe("2022-02-21");
  expect(sev).toMatchObject({ rating: 8, review: "Strange and very good." });

  // Finished again: the note says the rating and review are from before;
  // the new date replaces the old one, and the new episodes get ticked.
  await openWatching(page, "Severance");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2026-09-20");
  await expect(page.locator("#start-refinish-note")).toBeVisible();
  await expect(page.locator("#start-review")).toHaveValue("Strange and very good.");
  await page.click("#start-save");
  await expect.poll(() => sev.finished_watching_date).toBe("2026-09-20");
  expect(sev).toMatchObject({ rating: 8, review: "Strange and very good." });
  await expect.poll(() => ticked(backend, sev).length).toBe(19);

  // A show being watched for the first time has no such note.
  await openWatching(page, "Dark");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2026-09-20");
  await expect(page.locator("#start-extra")).toBeVisible();
  await expect(page.locator("#start-refinish-note")).toBeHidden();
});

test("a finished date cleared by hand takes the rating and review with it, and finishing again says nothing about new episodes", async ({ page, backend }) => {
  const dark = backend.db.shows.find((s) => s.tmdb_id === 70523);
  dark.review = "Loved it.";
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-watched"]');
  await page.locator("#grid-shows-watched .card", { hasText: "Dark" }).click();
  await page.locator('#detail-modal [data-action="edit"]').click();
  await expect(page.locator("#start-title")).toHaveText("Edit");
  await page.fill("#start-finish-date", "");
  await page.click("#start-save");
  await expect.poll(() => dark.finished_watching_date).toBe(null);
  expect(dark).toMatchObject({ rating: null, review: null });

  await openWatching(page, "Dark");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2026-09-20");
  await expect(page.locator("#start-extra")).toBeVisible();
  await expect(page.locator("#start-refinish-note")).toBeHidden();
});

test("a finished show's card says when a new season came out, looked up once and kept", async ({ page, backend }) => {
  backend.seed(
    "shows",
    [{ tmdb_id: 95396, title: "Severance", total_seasons: 3, total_episodes: 19, started_watching_date: "2022-02-20", finished_watching_date: "2022-05-01", rating: 8 }],
    backend.user.id
  );
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-watched"]');
  const card = (title) => page.locator("#grid-shows-watched .card", { hasText: title });
  await expect(card("Severance").locator(".card-new-season")).toHaveText("New season!");
  // Dark was finished after everything it has.
  await expect.poll(() => backend.tmdbPaths.filter((p) => p === "tv/70523").length).toBe(1);
  await expect(card("Dark").locator(".card-new-season")).toHaveCount(0);

  // Kept on this device: the next visit asks TMDB nothing.
  const asked = backend.tmdbPaths.length;
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await page.click('.nav-btn[data-section="shows-watched"]');
  await expect(card("Severance").locator(".card-new-season")).toHaveText("New season!");
  await page.waitForTimeout(1500);
  expect(backend.tmdbPaths.length).toBe(asked);

  // Kept watching, it's no longer there; finished again, it has nothing new.
  await card("Severance").click();
  await page.locator('#detail-modal .new-season [data-action="keep-watching"]').click();
  await page.locator("#confirm-yes").click();
  await expect(page.locator("#detail-modal .up-next-head")).toHaveText("Up next S2 · E1");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.fill("#start-finish-date", "2026-09-20");
  await page.click("#start-save");
  await expect(card("Severance")).toBeVisible();
  await expect(card("Severance").locator(".card-new-season")).toHaveCount(0);
});

test("the card says where you are, and the saved episode count catches up with TMDB", async ({ page, backend }) => {
  const dark = watchingDark(backend);
  dark.total_episodes = 20; // saved when it was added; TMDB has 26 now
  backend.seed("watched_episodes", [1, 2, 3].map((episode) => ({ show_id: dark.id, season: 1, episode })), backend.user.id);
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await page.click('[data-subtab="grid-shows-watching"]');
  const card = page.locator("#grid-shows-watching .card", { hasText: "Dark" });
  await expect(card.locator(".card-episode-code")).toHaveText("S1 · E3");
  await expect(card.locator(".card-episode-count")).toHaveText("3/20");

  // Its window brings the count up to date; ticking moves the card on.
  await card.click();
  await expect.poll(() => dark.total_episodes).toBe(26);
  await page.locator('#detail-modal [data-action="tick-episode"]').click();
  await expect(card.locator(".card-episode-code")).toHaveText("S1 · E4");
  await expect(card.locator(".card-episode-count")).toHaveText("4/26");
});
