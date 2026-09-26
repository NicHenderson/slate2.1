// Searching your library (js/librarySearch.js): the box over Movies, Shows,
// Movies To Watch and the Shows Queue. It only changes what's shown.
const { test, expect, logIn } = require("./support/fixtures");

const cardTitles = (page, gridId) => page.locator(`#${gridId} .card-title`);

test("searching the watchlist: by any words, without accents; Surprise Me and the arrows follow it; Custom order pauses", async ({ page, backend }) => {
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
  const sortedBy = page.locator("#movies-towatch-current-sort-label");
  await expect(cardTitles(page, grid)).toHaveCount(4);
  await expect(count).toBeHidden();

  // The list is on Custom order before searching.
  await page.click("#movies-towatch-sort-btn");
  await page.click('#movies-towatch-sort-menu [data-sort="custom"]');
  await expect(page.locator(`#${grid}`)).toHaveClass(/is-sortable/);
  await expect.poll(() => backend.db.movies.filter((m) => m.watched_date === null && m.position != null).length).toBe(4);

  // Case and accents don't matter; the "+ Add" card steps aside. Custom
  // order pauses — nothing to drag, the default sort instead — and says so.
  await search.fill("AMELIE");
  await expect(cardTitles(page, grid)).toHaveText(["Amélie"]);
  await expect(count).toHaveText("Showing 1 of 4");
  await expect(page.locator(`#${grid} .ghost-card`)).toHaveCount(0);
  await expect(page.locator(".toast").last()).toHaveText("Custom order is paused while you search or filter — clear them to use it again.");
  await expect(page.locator(`#${grid}`)).not.toHaveClass(/is-sortable/);
  await expect(sortedBy).toHaveText("Recently added");
  await page.click("#movies-towatch-sort-btn");
  await expect(page.locator('#movies-towatch-sort-menu [data-sort="custom"]')).toBeDisabled();
  await expect(page.locator("#movies-towatch-sort-menu .sort-locked-note")).toHaveText("Temporarily locked — clear your search and filters first.");
  // Other sorts still work while searching.
  await page.click('#movies-towatch-sort-menu [data-sort="alpha-asc"]');
  await expect(sortedBy).toHaveText("A to Z");

  // Every word has to be in the title, in any order.
  await search.fill("alien");
  await expect(cardTitles(page, grid)).toHaveText(["Alien: Romulus", "Aliens"]);
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

  // Nothing found: says so, with a way back. Picked by hand, A to Z stays.
  await search.fill("zzz");
  await expect(page.locator(`#${grid} .lib-empty`)).toContainText("Nothing here matches “zzz”.");
  await page.click(`#${grid} [data-lib-clear]`);
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(cardTitles(page, grid)).toHaveCount(4);
  await expect(count).toBeHidden();
  await expect(sortedBy).toHaveText("A to Z");

  // Back on Custom order and searched again, then cleared: Custom returns.
  await page.click("#movies-towatch-sort-btn");
  await page.click('#movies-towatch-sort-menu [data-sort="custom"]');
  await search.fill("alien");
  await expect(sortedBy).toHaveText("Recently added");
  await page.click('[data-lib-section="movies-towatch"] .lib-search-clear');
  await expect(sortedBy).toHaveText("Custom order");
  await expect(page.locator(`#${grid}`)).toHaveClass(/is-sortable/);
});

// Watched movies with a bit of everything to filter by. Alien (1979, 117
// min, Horror + Science Fiction, 9/10, watched 2026) comes with the seed.
const WATCHED = [
  { tmdb_id: 747, title: "Shaun of the Dead", release_year: 2004, duration: 99, genres: "Comedy, Horror", rating: 8, watched_date: "2025-10-31" },
  { tmdb_id: 46838, title: "Tucker and Dale vs. Evil", release_year: 2010, duration: 89, genres: "Comedy, Horror", rating: null, watched_date: "2026-03-01" },
  { tmdb_id: 346648, title: "Paddington 2", release_year: 2017, duration: 104, genres: "Adventure, Comedy, Family", rating: 10, watched_date: "2025-12-24" },
  { tmdb_id: 949, title: "Heat", release_year: 1995, duration: 170, genres: "Crime, Drama, Action", rating: 9, watched_date: "2024-05-05" },
];

test("filters narrow Movies: all the genres picked, any of the decades or lengths, a rating at least / at most / exactly, the year watched", async ({ page, backend }) => {
  backend.seed("movies", WATCHED, backend.user.id);
  await logIn(page);
  const tools = page.locator('[data-lib-section="movies-watched"]');
  const panel = tools.locator(".lib-filter-panel");
  const chip = (group, name) => panel.locator(".lf-group", { hasText: group }).locator(".lf-chip", { hasText: name });
  const shown = () => cardTitles(page, "grid-movies-watched");
  await expect(shown()).toHaveCount(5);

  await tools.locator(".lib-filter-btn").click();
  await expect(panel.locator(".lf-label")).toHaveText([/^Genre/, "Decade", "Length", "Rating", "Watched in"]);
  // Most common genres first, each with how many titles have it.
  await expect(panel.locator(".lf-group").first().locator(".lf-chip").first()).toHaveText(/^Comedy\s*3$/);

  // Genres: titles with all of them — horror comedies.
  await chip("Genre", "Horror").click();
  await chip("Genre", "Comedy").click();
  await expect(panel).toBeVisible(); // picking doesn't close the panel
  await expect(shown()).toHaveText(["Tucker and Dale vs. Evil", "Shaun of the Dead"]);
  await expect(tools.locator(".lib-count")).toHaveText("Showing 2 of 5");
  await expect(tools.locator(".lib-filter-badge")).toHaveText(" · 2");
  await expect(tools.locator(".lib-tag")).toHaveText(["Horror✕", "Comedy✕"]);
  await panel.locator("[data-close-filters]").click();
  await expect(panel).toBeHidden();

  // A tag takes its filter off; "Clear filters" takes them all.
  await tools.locator(".lib-tag", { hasText: "Horror" }).click();
  await expect(shown()).toHaveCount(3);
  await tools.locator(".lib-tags-clear").click();
  await expect(shown()).toHaveCount(5);
  await expect(tools.locator(".lib-active")).toBeHidden();

  // Decades and lengths: any of those picked.
  await tools.locator(".lib-filter-btn").click();
  await chip("Decade", "2010s").click();
  await chip("Decade", "2000s").click();
  await expect(shown()).toHaveCount(3);
  await panel.locator(".lf-clear").click();
  await chip("Length", "Under 90 min").click();
  await chip("Length", "Over 2 h").click();
  await expect(shown()).toHaveText(["Tucker and Dale vs. Evil", "Heat"]);
  await panel.locator(".lf-clear").click();

  // Rating: one number, compared at least / at most / exactly. Ratings:
  // Alien 9, Shaun 8, Paddington 2 10, Heat 9, Tucker and Dale unrated.
  const rating = (value) => panel.locator(`.lf-chip[data-filter="rating"][data-value="${value}"]`);
  const mode = (name) => panel.locator(".lf-mode", { hasText: name });
  await expect(mode("At least")).toHaveAttribute("aria-pressed", "true");
  await expect(rating("8")).toHaveText(/^8\s*4$/); // what each number would leave, in this mode
  await rating("9").click();
  await expect(shown()).toHaveCount(3);
  await expect(tools.locator(".lib-tag")).toHaveText(["Rated 9+✕"]);
  await mode("At most").click();
  await expect(rating("8")).toHaveText(/^8\s*1$/);
  await expect(shown()).toHaveText(["Alien", "Shaun of the Dead", "Heat"]);
  await expect(tools.locator(".lib-tag")).toHaveText(["Rated 9 or less✕"]);
  await mode("Exactly").click();
  await expect(shown()).toHaveText(["Alien", "Heat"]);
  await expect(tools.locator(".lib-tag")).toHaveText(["Rated exactly 9✕"]);
  await rating("10").click(); // one number at a time
  await expect(shown()).toHaveText(["Paddington 2"]);
  await rating("10").click(); // tapped again, it comes off
  await expect(shown()).toHaveCount(5);
  await rating("unrated").click();
  await expect(shown()).toHaveText(["Tucker and Dale vs. Evil"]);
  await rating("unrated").click();

  // The year it was watched, with the search on top: each narrows further.
  await chip("Watched in", "2025").click();
  await expect(shown()).toHaveCount(2);
  await page.keyboard.press("Escape");
  await tools.locator(".lib-search-input").fill("zzz");
  await expect(page.locator("#grid-movies-watched .lib-empty")).toContainText("Nothing here matches your search and filters.");
  await page.click("#grid-movies-watched [data-lib-clear]"); // "Clear all": both
  await expect(tools.locator(".lib-search-input")).toHaveValue("");
  await expect(shown()).toHaveCount(5);
});

test("the Shows Queue's search covers all three tabs, each with its own count; logging out clears it", async ({ page, backend }) => {
  backend.seed(
    "shows",
    [
      { tmdb_id: 95396, title: "Severance", release_year: 2022, total_seasons: 2, genres: "Drama, Mystery", started_watching_date: null, finished_watching_date: null },
      { tmdb_id: 136315, title: "The Bear", release_year: 2022, total_seasons: 4, genres: "Comedy, Drama", started_watching_date: "2026-09-01", finished_watching_date: null },
    ],
    backend.user.id
  );
  await logIn(page);
  await page.click('.nav-btn[data-section="shows-towatch"]');
  const search = page.locator("#lib-search-shows-towatch");
  const count = page.locator('[data-lib-section="shows-towatch"] .lib-count');

  // The queue's filters: nothing about ratings or when it was watched.
  await page.locator('[data-lib-section="shows-towatch"] .lib-filter-btn').click();
  await expect(page.locator('[data-lib-section="shows-towatch"] .lf-label')).toHaveText([/^Genre/, "Decade", "Length"]);
  await page.keyboard.press("Escape");

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
