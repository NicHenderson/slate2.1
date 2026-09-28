// Where to watch (js/whereToWatch.js): streaming services for titles not
// watched yet, from TMDB's watch providers (tests/support/tmdbCatalog.js),
// for the browser's country or the one picked in Settings.
const { test, expect, logIn } = require("./support/fixtures");

test.use({ locale: "en-CL" }); // a browser in Chile (in English: Slate would be in Spanish otherwise)

test("a title to watch shows where to watch it in the browser's country, below its buttons; a watched one doesn't", async ({ page }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();

  const where = page.locator("#detail-modal .where-to-watch");
  await expect(where.locator(".wtw-title")).toHaveText("Where to watch · Chile");
  // Below the buttons, so nothing above moves when it arrives.
  await expect(page.locator("#detail-modal .detail-actions + .where-to-watch")).toHaveCount(1);
  await expect(where.locator(".wtw-kind")).toHaveText(["Stream", "Rent", "Buy"]);
  const netflix = where.locator(".wtw-group", { hasText: "Stream" }).locator(".wtw-provider");
  await expect(netflix).toHaveAttribute("aria-label", "Netflix");
  await expect(netflix).toHaveAttribute("href", "https://www.themoviedb.org/movie/603/watch?locale=CL");
  await expect(netflix).toHaveAttribute("target", "_blank");
  await expect(where.locator(".wtw-group", { hasText: "Buy" }).locator(".wtw-provider")).toHaveCount(2);
  await expect(where.locator(".wtw-credit")).toHaveText("Availability by JustWatch.");

  // Already watched: nothing to find.
  await page.keyboard.press("Escape");
  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await expect(page.locator("#detail-modal .detail-title")).toHaveText("Alien");
  await expect(page.locator("#detail-modal .where-to-watch")).toHaveCount(0);
});

test("the search's details side says so when TMDB knows nowhere to watch it, or can't be asked", async ({ page }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.click("#movies-towatch .add-btn");
  await page.fill("#modal-input", "paddington");
  await page.press("#modal-input", "Enter");
  await page.locator("#modal-results .tmdb-hit-main").first().click();
  await expect(page.locator("#modal-preview .wtw-none")).toHaveText(
    "We couldn't find where to watch this in Chile — sorry. You can pick another country in Settings."
  );

  // TMDB unreachable for this: a plain "couldn't check", nothing broken.
  await page.route("**/functions/v1/tmdb", (route) =>
    route.request().postDataJSON()?.path?.endsWith("/watch/providers") ? route.fulfill({ status: 500, body: "{}" }) : route.fallback()
  );
  await page.fill("#modal-input", "inception");
  await page.press("#modal-input", "Enter");
  await page.locator("#modal-results .tmdb-hit-main").first().click();
  await expect(page.locator("#modal-preview .wtw-none")).toHaveText("Couldn't check where to watch right now.");
});

test("another country picked in Settings is saved to the account and used everywhere", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="settings"]');
  await page.click('[data-settings-page="lang"]');
  const country = page.locator("#setting-watch-region");
  await expect(country.locator("option").first()).toHaveText("Automatic (Chile)");
  await expect(country.locator("option")).toHaveCount(4); // automatic + TMDB's three countries
  await country.selectOption("US");
  await expect.poll(() => backend.db.user_settings[0]?.settings?.watchRegion).toBe("US");

  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  const where = page.locator("#detail-modal .where-to-watch");
  await expect(where.locator(".wtw-title")).toHaveText("Where to watch · United States");
  await expect(where.locator(".wtw-provider")).toHaveAttribute("aria-label", "Max");
  await page.keyboard.press("Escape");

  // A show, from the search: "free with ads" reads as Free.
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await page.click("#shows-towatch .add-btn");
  await page.fill("#modal-input", "game of thrones");
  await page.press("#modal-input", "Enter");
  await page.locator("#modal-results .tmdb-hit-main").first().click();
  await expect(page.locator("#modal-preview .wtw-kind")).toHaveText(["Stream", "Free"]);
  await expect(page.locator("#modal-preview .wtw-group", { hasText: "Free" }).locator(".wtw-provider")).toHaveAttribute("aria-label", "Pluto TV");
});
