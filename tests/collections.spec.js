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
