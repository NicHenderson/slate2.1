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
