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
