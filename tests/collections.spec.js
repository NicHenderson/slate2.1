// Collections: making one, and filling it from the library.
const { test, expect, logIn } = require("./support/fixtures");

test("a new collection needs a name and an icon, then shows up and is saved", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="collections"]');
  await page.click("#grid-collections .booklet-ghost");
  await page.fill("#collection-name", "Rainy days");
  await page.click("#collection-save");
  await expect(page.locator("#collection-error")).toHaveText("Pick an icon for the collection.");

  // The icon list opens by itself for a new collection.
  await expect(page.locator("#icon-current")).toHaveAttribute("aria-expanded", "true");
  await page.fill("#icon-search", "umbrella");
  await page.locator("#icon-grid .icon-cell:visible").first().click();
  await page.click("#collection-save");
  await expect(page.locator("#collection-modal")).toBeHidden();
  await expect(page.locator("#grid-collections .collection-card")).toHaveCount(2);
  await expect(page.locator("#grid-collections")).toContainText("Rainy days");
  const saved = backend.db.collections.find((c) => c.name === "Rainy days");
  expect(saved).toMatchObject({ user_id: backend.user.id });
  expect(saved.icon).toBeTruthy();
});

test("opening a collection shows its titles, and titles can be added from the watchlist", async ({ page, backend }) => {
  backend.seed("movies", [{ tmdb_id: 949, title: "Heat", watched_date: null }], backend.user.id);
  await logIn(page);
  await page.click('.nav-btn[data-section="collections"]');
  await page.locator("#grid-collections .collection-card", { hasText: "Sci-fi night" }).click();
  await expect(page.locator("#col-detail-name")).toHaveText("Sci-fi night");
  await expect(page.locator("#col-detail-grid")).toContainText("Alien");
  await expect(page.locator("#col-detail-grid")).toContainText("The Matrix");

  await page.click('#collection-view .add-btn[data-type="collection-titles"]');
  // Only what's on the watchlist and not in here yet: Heat (The Matrix is in already).
  await expect(page.locator("#library-results .add-title")).toHaveText(["Heat"]);
  await page.locator("#library-results .library-row", { hasText: "Heat" }).click();
  await page.click("#library-add-btn");
  await expect(page.locator("#col-detail-grid")).toContainText("Heat");
  const heat = backend.db.movies.find((m) => m.tmdb_id === 949);
  await expect.poll(() => backend.db.collection_items.filter((i) => i.item_id === heat.id).length).toBe(1);
});

test("“Show watched ones too” lists watched titles, stamped, and adds them; switched off, it lets go of them", async ({ page, backend }) => {
  backend.seed("movies", [
    { tmdb_id: 949, title: "Heat", watched_date: "2025-01-01" },
    { tmdb_id: 438631, title: "Dune", watched_date: null },
  ], backend.user.id);
  await logIn(page);
  await page.click('.nav-btn[data-section="collections"]');
  await page.locator("#grid-collections .collection-card", { hasText: "Sci-fi night" }).click();
  await page.click('#collection-view .add-btn[data-type="collection-titles"]');
  await expect(page.locator("#library-results .add-title")).toHaveText(["Dune"]);

  const toggle = page.locator(".library-watched-toggle");
  await toggle.click();
  await expect(page.locator("#library-results .add-title")).toHaveText(["Dune", "Heat"]);
  const heat = page.locator("#library-results .library-row", { hasText: "Heat" });
  await expect(heat.locator(".add-stamp")).toHaveText("Seen");
  await heat.click();
  await expect(page.locator("#library-count")).toHaveText("1 selected");

  // Off: Heat is gone from the list, and from what would be added.
  await toggle.click();
  await expect(page.locator("#library-results .add-title")).toHaveText(["Dune"]);
  await expect(page.locator("#library-count")).toHaveText("0 selected");

  await toggle.click();
  await heat.click();
  await page.click("#library-add-btn");
  await expect(page.locator("#col-detail-grid")).toContainText("Heat");
  const heatRow = backend.db.movies.find((m) => m.tmdb_id === 949);
  await expect.poll(() => backend.db.collection_items.filter((i) => i.item_id === heatRow.id).length).toBe(1);
});

// Regression: a title added from TMDB inside a collection only reached the
// To Watch list with its realtime echo, so when that was late (or lost)
// it wasn't there until a reload. Here the echo never comes.
test("a title added from TMDB in a collection is on To Watch at once, echo or not", async ({ page, backend }) => {
  await logIn(page);
  backend.hooks.holdRealtime = true;
  await page.click('.nav-btn[data-section="collections"]');
  await page.locator("#grid-collections .collection-card", { hasText: "Sci-fi night" }).click();
  await page.click('#collection-view .add-btn[data-type="collection-titles"]');
  await page.click("#library-search-hint");
  await page.fill("#modal-input", "paddington");
  await page.press("#modal-input", "Enter");
  await page.locator("#modal-results .tmdb-pick").first().click();
  await page.click("#batch-add-btn");
  await expect(page.locator("#col-detail-grid")).toContainText("Paddington 2");

  await page.click('.nav-btn[data-section="movies-towatch"]');
  await expect(page.locator("#grid-movies-towatch .card-title")).toContainText(["Paddington 2"]);
});
