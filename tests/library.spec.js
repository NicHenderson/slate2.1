// The library itself: moving a title along, and deleting safely.
const { test, expect, logIn } = require("./support/fixtures");

test("marking a watchlist title as watched moves it to Movies with its rating and review", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await page.locator('#detail-modal [data-action="mark-watched"]').click();

  await expect(page.locator("#update-movie-title")).toHaveText("The Matrix");
  await page.fill("#update-date", "2026-09-20");
  const stars = page.locator("#update-stars");
  const box = await stars.boundingBox();
  await stars.click({ position: { x: box.width * 0.75, y: box.height / 2 } }); // the 8th star
  await expect(page.locator("#update-rating-value")).toHaveText("8/10");
  await page.fill("#update-review", "Holds up.");
  await page.click("#update-save");

  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(0);
  await page.click('.nav-btn[data-section="movies-watched"]');
  await expect(page.locator("#grid-movies-watched .card-title")).toContainText(["The Matrix"]);
  expect(backend.db.movies.find((m) => m.tmdb_id === 603)).toMatchObject({ watched_date: "2026-09-20", rating: 8, review: "Holds up." });
});

test("deleting a watched title asks for its name first; a watchlist one just asks", async ({ page, backend }) => {
  await logIn(page);

  // Watched: deleted from its edit window, and only once its title is typed exactly.
  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await page.locator('#detail-modal [data-action="edit"]').click();
  await page.click("#update-delete");
  await expect(page.locator("#confirm-heading")).toHaveText("You've already watched this");
  await expect(page.locator("#confirm-yes")).toBeDisabled();
  await page.fill("#confirm-typed-input", "alien");
  await expect(page.locator("#confirm-yes")).toBeDisabled();
  await page.fill("#confirm-typed-input", "Alien");
  await page.click("#confirm-yes");
  await expect(page.locator("#grid-movies-watched .card")).toHaveCount(0);
  expect(backend.db.movies.some((m) => m.tmdb_id === 348)).toBe(false);
  // …and it leaves the collection it was in (a request of its own, just after).
  await expect.poll(() => backend.db.collection_items.length).toBe(1);

  // To watch: a plain confirmation.
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await page.locator('#detail-modal [data-action="delete"]').click();
  await expect(page.locator("#confirm-text")).toHaveText('Are you sure you want to delete this movie: "The Matrix"?');
  await page.click("#confirm-yes");
  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(0);
  await expect.poll(() => backend.db.movies.length).toBe(0);
});

// Regression: reviews, genres and posters were put into the page as HTML,
// so markup in one (say, from an imported .slate) ran in the page.
test("a review, genres and a poster are shown as text, never run as HTML", async ({ page, backend }) => {
  const alien = backend.db.movies.find((m) => m.tmdb_id === 348);
  alien.review = '<img src="x" onerror="window.__pwned = true">Loved it';
  alien.genres = "Horror<img src=x onerror=window.__pwned=1>";
  alien.poster = 'https://image.tmdb.org/t/p/w500/a.png" onload="window.__pwned = 2';
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await expect(page.locator("#detail-modal .detail-review")).toHaveText('<img src="x" onerror="window.__pwned = true">Loved it');
  await expect(page.locator("#detail-modal .detail-review img")).toHaveCount(0);
  await expect(page.locator("#detail-modal .detail-genre-line")).toHaveText("Horror<img src=x onerror=window.__pwned=1>");
  await page.locator('#detail-modal [data-action="edit"]').click(); // its poster again
  await page.click("#update-cancel");
  await page.keyboard.press("Escape");
  await page.click('.nav-btn[data-section="collections"]'); // and on its collection's cover
  await expect(page.locator("#grid-collections .booklet-stamp img").first()).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// The database keeps one copy of a title per account (migration 0004).
// Added from another tab between the search and the click: Slate says so
// instead of failing, and no second copy appears.
test("adding a title another tab just added says it's already there", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.click("#movies-towatch .add-btn");
  await page.fill("#modal-input", "paddington");
  await page.click("#modal-search-btn");
  await page.locator("#modal-results .tmdb-info-btn").first().click();
  const add = page.locator('#info-modal .info-add-btn:not([disabled])');
  await expect(add).toBeVisible();

  backend.seed("movies", [{ tmdb_id: 346648, title: "Paddington 2", watched_date: null }], backend.user.id);
  await add.click();
  await expect(page.locator(".toast")).toHaveText("Already in your library.");
  expect(backend.db.movies.filter((m) => m.tmdb_id === 346648)).toHaveLength(1);
});

// Two tabs of one account. A window open in one follows what the other
// changes, so its Edit never brings back (and saves over) the old review;
// a title deleted in the other closes its window here, saying why.
test("an open window follows another tab's changes, and closes when the title is deleted there", async ({ page, backend, context }) => {
  await logIn(page);
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await expect(page.locator("#detail-modal .detail-review")).toHaveText("Still terrifying.");

  const other = await context.newPage();
  await backend.install(other);
  await other.goto("/");
  await expect(other.locator("#app")).toBeVisible();
  await other.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await other.locator('#detail-modal [data-action="edit"]').click();
  await other.fill("#update-review", "Changed in the other tab.");
  await other.click("#update-save");
  await expect.poll(() => backend.db.movies.find((m) => m.title === "Alien").review).toBe("Changed in the other tab.");

  await expect(page.locator("#detail-modal .detail-review")).toHaveText("Changed in the other tab.");
  await page.locator('#detail-modal [data-action="edit"]').click();
  await expect(page.locator("#update-review")).toHaveValue("Changed in the other tab.");
  await page.click("#update-cancel");
  await page.keyboard.press("Escape");

  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await other.click('.nav-btn[data-section="movies-towatch"]');
  await other.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await other.locator('#detail-modal [data-action="delete"]').click();
  await other.click("#confirm-yes");
  await expect(page.locator("#detail-modal")).toBeHidden();
  await expect(page.locator(".toast").last()).toHaveText("This title was deleted in another window.");
  await expect(page.locator("#grid-movies-towatch .card")).toHaveCount(0);
  await other.close();
});

// The trailer button is there from the moment the window opens — disabled
// while TMDB is asked — so nothing in the window jumps when it answers.
test("the trailer button waits, disabled, where it will be; then turns on or says there's none", async ({ page }) => {
  let answer;
  const tmdbAnswered = new Promise((resolve) => (answer = resolve));
  await logIn(page);
  await page.route("**/functions/v1/tmdb", async (route) => {
    await tmdbAnswered;
    await route.fallback();
  });

  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  const btn = page.locator("#detail-modal .trailer-btn");
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText("▶ Watch trailer");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); // opening animation
  const before = await page.locator("#detail-modal .detail-synopsis").boundingBox();

  answer();
  await expect(btn).toBeEnabled();
  expect(await page.locator("#detail-modal .detail-synopsis").boundingBox()).toEqual(before);
  await btn.click();
  await expect(page.locator("#detail-modal .detail-trailer-frame iframe")).toHaveAttribute("src", /fake-alien-trailer/);
  await page.keyboard.press("Escape");

  // The Matrix has no trailer on TMDB: the button stays off and says so.
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await expect(btn).toHaveText("No trailer");
  await expect(btn).toBeDisabled();
});
