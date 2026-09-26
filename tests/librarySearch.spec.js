// Searching your library (js/librarySearch.js): the box over Movies, Shows,
// Movies To Watch and the Shows Queue. It only changes what's shown.
const { test, expect, logIn } = require("./support/fixtures");

const cardTitles = (page, gridId) => page.locator(`#${gridId} .card-title`);

test("searching the watchlist: by any words, without accents; Surprise Me, the arrows and Custom order follow it", async ({ page, backend }) => {
  backend.seed(
    "movies",
    [
      { tmdb_id: 194, title: "Amélie", release_year: 2001, watched_date: null },
      { tmdb_id: 679, title: "Aliens", release_year: 1986, watched_date: null },
      { tmdb_id: 945961, title: "Alien: Romulus", release_year: 2024, watched_date: null },
    ],
    backend.user.id
  );
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  const grid = "grid-movies-towatch";
  const search = page.locator("#lib-search-movies-towatch");
  const count = page.locator('[data-lib-section="movies-towatch"] .lib-count');
  await expect(cardTitles(page, grid)).toHaveCount(4);
  await expect(count).toBeHidden();

  // Case and accents don't matter; the "+ Add" card steps aside.
  await search.fill("AMELIE");
  await expect(cardTitles(page, grid)).toHaveText(["Amélie"]);
  await expect(count).toHaveText("Showing 1 of 4");
  await expect(page.locator(`#${grid} .ghost-card`)).toHaveCount(0);

  // Every word has to be in the title, in any order.
  await search.fill("alien");
  await expect(cardTitles(page, grid)).toHaveCount(2);
  await search.fill("romulus alien");
  await expect(cardTitles(page, grid)).toHaveText(["Alien: Romulus"]);

  // Surprise Me and the detail window's arrows stay inside the results.
  await search.fill("alien");
  await expect(cardTitles(page, grid)).toHaveCount(2);
  await page.click("#movies-surprise-btn");
  await expect(page.locator("#detail-modal .detail-title")).toHaveText(/^(Aliens|Alien: Romulus)$/);
  await page.keyboard.press("Escape");
  await page.locator(`#${grid} .card`).first().click();
  await expect(page.locator("#detail-nav-prev")).toBeDisabled();
  await page.click("#detail-nav-next");
  await expect(page.locator("#detail-nav-next")).toBeDisabled(); // two results: that's the last
  await page.keyboard.press("Escape");

  // Custom order can't be dragged while searching — and switching to it
  // then still saves the order of the whole list, not just the results.
  await page.click("#movies-towatch-sort-btn");
  await page.click('#movies-towatch-sort-menu [data-sort="custom"]');
  await expect(page.locator(`#${grid}`)).not.toHaveClass(/is-sortable/);
  await expect(count).toHaveText("Showing 2 of 4 · clear the search to reorder");
  await expect.poll(() => backend.db.movies.filter((m) => m.watched_date === null && m.position != null).length).toBe(4);

  // Nothing found: says so, with a way back.
  await search.fill("zzz");
  await expect(page.locator(`#${grid} .lib-empty`)).toContainText("Nothing here matches “zzz”.");
  await page.click(`#${grid} [data-lib-clear]`);
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(cardTitles(page, grid)).toHaveCount(4);
  await expect(page.locator(`#${grid}`)).toHaveClass(/is-sortable/);
  await expect(count).toBeHidden();
});

test("the Shows Queue's search covers all three tabs, each with its own count; logging out clears it", async ({ page, backend }) => {
  backend.seed(
    "shows",
    [
      { tmdb_id: 95396, title: "Severance", release_year: 2022, started_watching_date: null, finished_watching_date: null },
      { tmdb_id: 136315, title: "The Bear", release_year: 2022, started_watching_date: "2026-09-01", finished_watching_date: null },
    ],
    backend.user.id
  );
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  const search = page.locator("#lib-search-shows-towatch");
  const count = page.locator('[data-lib-section="shows-towatch"] .lib-count');

  await search.fill("sev");
  await expect(cardTitles(page, "grid-shows-towatch")).toHaveText(["Severance"]);
  await expect(count).toHaveText("Showing 1 of 1");

  await page.click('[data-subtab="grid-shows-watching"]');
  await expect(count).toHaveText("Showing 0 of 1");
  await expect(page.locator("#grid-shows-watching .lib-empty")).toBeVisible();
  await search.fill("bear");
  await expect(cardTitles(page, "grid-shows-watching")).toHaveText(["The Bear"]);

  // Another account on this device starts with nothing searched.
  await page.click("#logout-btn");
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  await expect(search).toHaveValue("");
  await expect(count).toBeHidden();
  await expect(cardTitles(page, "grid-shows-towatch")).toHaveText(["Severance"]);
});
