// Libraries past 1,000 rows. Supabase answers at most 1,000 rows per request
// (the fake does too) — without saying so — so anything read in one go
// silently loses the rest. Regression: the library load did exactly that.
const { test, expect, logIn } = require("./support/fixtures");

const EXTRA = 1200;

test.beforeEach(async ({ backend }) => {
  const movies = backend.seed(
    "movies",
    Array.from({ length: EXTRA }, (_, i) => ({
      tmdb_id: 900000 + i,
      title: `Film ${String(i + 1).padStart(4, "0")}`,
      watched_date: "2026-01-01",
      rating: 7,
    })),
    backend.user.id
  );
  // The seeded "Sci-fi night" already holds 2 titles: past 1,000 in total.
  const col = backend.db.collections.find((c) => c.name === "Sci-fi night");
  backend.seed(
    "collection_items",
    movies.slice(0, 1100).map((m, i) => ({ collection_id: col.id, item_type: "movie", item_id: m.id, position: i + 3 }))
  );
});

test("every title shows, and the counts add up, past 1,000 rows", async ({ page }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-watched"]');
  await expect(page.locator("#grid-movies-watched .card[data-id]")).toHaveCount(EXTRA + 1);
  await expect(page.locator("#movies-watched .hs-item", { hasText: "Movies watched" }).locator(".hs-value")).toHaveText(String(EXTRA + 1));

  await page.click('.nav-btn[data-section="settings"]');
  await expect(page.locator("#data-export-summary")).toHaveText(`${EXTRA + 2} movies, 1 show and 1 collection`);
});

test("a collection past 1,000 titles shows all of them", async ({ page }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="collections"]');
  await page.locator("#grid-collections .collection-card", { hasText: "Sci-fi night" }).click();
  await expect(page.locator("#col-detail-count")).toHaveText("1102 movies");
});

test("without a total row count, it still reads every page", async ({ page, backend }) => {
  backend.hooks.hideCount = true;
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-watched"]');
  await expect(page.locator("#grid-movies-watched .card[data-id]")).toHaveCount(EXTRA + 1);
});
