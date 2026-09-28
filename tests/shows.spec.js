// Shows, end to end: a show's own path through the lists — queue,
// watching, finished — which movies don't share.
const { test, expect, logIn } = require("./support/fixtures");

test("a show goes from the queue to watching to finished, and is saved at every step", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await expect(page.locator("#grid-shows-towatch .card")).toHaveCount(0);

  // Added from TMDB: into the queue, with its seasons and episodes.
  await page.click('#shows-towatch .add-btn[data-type="tv"]');
  await page.fill("#modal-input", "game of thrones");
  await page.press("#modal-input", "Enter");
  await expect(page.locator("#modal-results .tmdb-row-title")).toHaveText(["Game of Thrones"]);
  await page.locator("#modal-results .tmdb-pick").click();
  await page.locator("#batch-add-btn").click();

  await expect(page.locator("#grid-shows-towatch .card-title")).toHaveText(["Game of Thrones"]);
  await expect(page.locator("#hstats-shows-towatch")).toContainText("In queue · 73 episodes");
  const saved = () => backend.db.shows.find((s) => s.tmdb_id === 1399);
  expect(saved()).toMatchObject({ title: "Game of Thrones", total_seasons: 8, total_episodes: 73, started_watching_date: null, user_id: backend.user.id });

  // Started: off the queue, onto Watching.
  await page.locator("#grid-shows-towatch .card", { hasText: "Game of Thrones" }).click();
  await expect(page.locator("#detail-modal .detail-meta-runtime")).toHaveText("8 seasons · 73 episodes");
  await page.locator('#detail-modal [data-action="start-watching"]').click();
  await expect(page.locator("#start-show-title")).toHaveText("Game of Thrones");
  await page.fill("#start-date", "2026-09-01");
  await page.click("#start-save");

  await expect(page.locator("#grid-shows-towatch .card")).toHaveCount(0);
  await page.click('[data-subtab="grid-shows-watching"]');
  await expect(page.locator("#grid-shows-watching .card-title")).toHaveText(["Game of Thrones"]);
  await expect.poll(() => saved().started_watching_date).toBe("2026-09-01");

  // Finished: never in the future, never before it started; a rating and
  // review are optional (both given here), then it's on Shows with the rest.
  await page.locator("#grid-shows-watching .card", { hasText: "Game of Thrones" }).click();
  await page.locator('#detail-modal [data-action="edit"]').click();
  await expect(page.locator("#start-extra")).toBeHidden();
  await page.fill("#start-finish-date", "2099-01-01");
  await expect(page.locator(".date-future-note")).toBeVisible();
  await page.click("#start-save");
  await expect(page.locator("#start-modal")).toBeVisible();
  expect(saved().finished_watching_date).toBeNull();
  await page.fill("#start-finish-date", "2026-08-20");
  await expect(page.locator(".date-future-note")).toHaveCount(0);
  await expect(page.locator("#start-extra")).toBeVisible();
  await page.click("#start-save");
  await expect(page.locator("#start-dates-error")).toBeVisible();
  expect(saved().finished_watching_date).toBeNull();
  await page.fill("#start-finish-date", "2026-09-20");
  await expect(page.locator("#start-dates-error")).toBeHidden();
  await page.fill("#start-review", "The ending, though.");

  const hearts = page.locator("#start-hearts");
  const box = await hearts.boundingBox();
  await hearts.click({ position: { x: box.width * 0.55, y: box.height / 2 } }); // the 6th heart
  await expect(page.locator("#start-rating-value")).toHaveText("6/10");
  await page.click("#start-save");

  await expect(page.locator("#grid-shows-watching .card")).toHaveCount(0);
  await page.click('.nav-btn[data-section="shows-watched"]');
  await expect(page.locator("#grid-shows-watched .card-title")).toContainText(["Game of Thrones", "Dark"]);
  await expect
    .poll(saved)
    .toMatchObject({ started_watching_date: "2026-09-01", finished_watching_date: "2026-09-20", rating: 6, review: "The ending, though." });
});

test("a dropped show goes back to the queue, starting over", async ({ page, backend }) => {
  const [lost] = backend.seed(
    "shows",
    [{ tmdb_id: 4607, title: "Lost", total_seasons: 6, total_episodes: 118, started_watching_date: "2026-03-01", rating: 4, review: "Lost me.", is_dropped: true }],
    backend.user.id
  );
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await page.click('[data-subtab="grid-shows-dropped"]');
  await page.locator("#grid-shows-dropped .card", { hasText: "Lost" }).click();
  await page.locator('#detail-modal [data-action="send-to-watchlist"]').click();

  // Saved as never started, and the window closes saying so.
  await expect(page.locator("#detail-modal")).toBeHidden();
  await expect(page.locator(".toast")).toHaveText('Moved back to "To Watch".');
  expect(backend.db.shows.find((s) => s.id === lost.id)).toMatchObject({
    started_watching_date: null,
    finished_watching_date: null,
    rating: null,
    review: null,
    is_dropped: false,
  });
  await expect(page.locator("#grid-shows-dropped .card")).toHaveCount(0);
  await page.click('[data-subtab="grid-shows-towatch"]');
  await expect(page.locator("#grid-shows-towatch .card-title")).toHaveText(["Lost"]);
});
