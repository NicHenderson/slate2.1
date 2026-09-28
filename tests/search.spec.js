// The TMDB search window: results on one side, the picked one's details on
// the other.
const { test, expect, logIn } = require("./support/fixtures");

// The side must never show (and so add) a title other than the last one
// picked, however late an earlier pick's details come back.
test("the details side waits for a pick, says it's loading, and only ever shows the last one picked", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.click("#movies-towatch .add-btn");
  const side = page.locator("#modal-preview");
  await expect(side).toContainText("Search for a title, then pick one to see its details here.");

  // No Search button: typing is enough.
  await page.fill("#modal-input", "a");
  await expect(page.locator("#modal-results .tmdb-row-title")).toHaveText(["Alien", "The Matrix", "Paddington 2"]);
  await expect(side).toContainText("Pick a title from the list to see its details here.");
  await expect(page.locator("#modal-results .tmdb-hit", { hasText: "Alien" })).toContainText("In your library");
  await expect(page.locator("#modal-results .tmdb-hit", { hasText: "Paddington 2" })).not.toContainText("In your library");

  // Alien's details take their time…
  let releaseAlien;
  const alienHeld = new Promise((resolve) => (releaseAlien = resolve));
  await page.route("**/functions/v1/tmdb", async (route) => {
    if (route.request().postDataJSON()?.path === "movie/348") await alienHeld;
    await route.fallback();
  });
  await page.locator("#modal-results .tmdb-hit-main", { hasText: "Alien" }).click();
  await expect(side.locator(".detail-title")).toHaveText("Alien");
  await expect(side).toContainText("Loading its details…");

  // …and Paddington 2 is picked meanwhile: its details stay, Alien's don't land.
  await page.locator("#modal-results .tmdb-hit-main", { hasText: "Paddington 2" }).click();
  await expect(side.locator(".tmdb-preview-action")).toHaveText("+ Pick");
  releaseAlien();
  await page.waitForTimeout(300);
  await expect(side.locator(".detail-title")).toHaveText("Paddington 2");

  await side.locator(".tmdb-preview-action").click();
  await expect(page.locator("#batch-picked")).toContainText("Paddington 2");
  await expect(page.locator("#batch-add-btn")).toHaveText("Add 1 movie");
});
