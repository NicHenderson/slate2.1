// Rewatches (js/viewings.js, migration 0007): a watched movie's viewings —
// each a date and an optional note — listed in its detail window, with the
// movie's date always its latest viewing and never lost. The seed's Alien
// (watched 2026-08-01) starts with one viewing, as 0007 left every movie.
const { test, expect, logIn } = require("./support/fixtures");

const alienOf = (backend) => backend.db.movies.find((m) => m.tmdb_id === 348);
const viewingsOf = (backend, movie) =>
  backend.db.viewings.filter((v) => v.movie_id === movie.id).map((v) => v.watched_on).sort();

async function openAlien(page) {
  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "Alien" }).click();
  await expect(page.locator("#detail-modal .detail-title")).toHaveText("Alien");
}

test("“Watched it again” adds a viewing: the latest date, the list, the card's ×2 and the movie's date follow", async ({ page, backend }) => {
  await logIn(page);
  await openAlien(page);
  const detail = page.locator("#detail-modal");
  await expect(detail.locator(".detail-field .detail-label").first()).toHaveText("Watched on");
  await expect(detail.locator(".detail-field .detail-date-value").first()).toHaveText("Aug 1, 2026");
  await expect(detail.locator(".viewings-toggle")).toHaveCount(0); // one viewing: nothing more to show

  await detail.locator('[data-action="watched-again"]').click();
  await expect(detail.locator(".viewing-eyebrow")).toHaveText("Watched it again");
  await expect(page.locator("#detail-nav-next")).toBeHidden(); // no stepping to another title meanwhile
  await detail.locator("#viewing-date").fill("2026-09-20");
  await detail.locator("#viewing-note").fill("At the cinema, 4K restoration");
  await detail.locator("#viewing-save").click();

  // Back on the summary: the latest date, and the two viewings listed.
  await expect(page.locator(".toast").last()).toHaveText("Viewing added.");
  await expect(detail.locator(".detail-field .detail-label").first()).toHaveText("Last watched");
  await expect(detail.locator(".detail-field .detail-date-value").first()).toHaveText("Sep 20, 2026");
  await expect(detail.locator(".viewings-toggle")).toHaveText(/2 viewings/);
  await expect(detail.locator(".viewing-item-date")).toHaveText(["Sep 20, 2026", "Aug 1, 2026"]);
  await expect(detail.locator(".viewing-item-note")).toHaveText(["At the cinema, 4K restoration"]);
  await expect(page.locator("#detail-nav-next")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#grid-movies-watched .card", { hasText: "Alien" }).locator(".card-rewatch")).toHaveText("×2");
  expect(viewingsOf(backend, alienOf(backend))).toEqual(["2026-08-01", "2026-09-20"]);
  await expect.poll(() => alienOf(backend).watched_date).toBe("2026-09-20");
});

test("a viewing opened from the list changes its date and note, and is deleted only once the title is typed — never the last one", async ({ page, backend }) => {
  const alien = alienOf(backend);
  backend.seed("viewings", [{ movie_id: alien.id, watched_on: "2024-10-31", note: "Halloween" }], backend.user.id);
  await logIn(page);
  await openAlien(page);
  const detail = page.locator("#detail-modal");

  await detail.locator(".viewings-toggle").click();
  await detail.locator(".viewing-item", { hasText: "Oct 31, 2024" }).click();
  await expect(detail.locator(".viewing-eyebrow")).toHaveText("Viewing");
  await expect(detail.locator("#viewing-note")).toHaveValue("Halloween");

  // A date can be changed, never emptied.
  await detail.locator("#viewing-date").fill("");
  await detail.locator("#viewing-save").click();
  await expect(detail.locator("#viewing-date-error")).toHaveText("Pick the day you watched it.");
  await detail.locator("#viewing-date").fill("2024-11-01");
  await detail.locator("#viewing-note").fill("The day after Halloween");
  await detail.locator("#viewing-save").click();
  await expect(detail.locator(".viewing-item-date")).toHaveText(["Aug 1, 2026", "Nov 1, 2024"]);
  expect(backend.db.viewings.find((v) => v.watched_on === "2024-11-01")?.note).toBe("The day after Halloween");

  // Escape from a viewing goes back to the summary, not out of the window.
  await detail.locator(".viewing-item", { hasText: "Nov 1, 2024" }).click();
  await page.keyboard.press("Escape");
  await expect(detail.locator(".viewings-toggle")).toBeVisible();

  // Deleting one: the title has to be typed first.
  await detail.locator(".viewing-item", { hasText: "Nov 1, 2024" }).click();
  await detail.locator('[data-action="delete-viewing"]').click();
  await expect(page.locator("#confirm-heading")).toHaveText("Delete this viewing");
  await expect(page.locator("#confirm-yes")).toBeDisabled();
  await page.fill("#confirm-typed-input", "alien");
  await expect(page.locator("#confirm-yes")).toBeDisabled();
  await page.fill("#confirm-typed-input", "Alien");
  await page.click("#confirm-yes");
  await expect(page.locator(".toast").last()).toHaveText("Viewing deleted.");
  await expect(detail.locator(".viewings-toggle")).toHaveCount(0);
  expect(viewingsOf(backend, alien)).toEqual(["2026-08-01"]);

  // The last one can't be deleted: there's no way to it but Edit, which
  // changes its date and note, and refuses an empty date.
  await detail.locator('[data-action="edit"]').click();
  await expect(page.locator("#update-title")).toHaveText("Edit");
  await expect(page.locator("#update-date")).toHaveValue("2026-08-01");
  await page.fill("#update-date", "");
  await page.click("#update-save");
  await expect(page.locator("#update-date-error")).toBeVisible();
  expect(alien.watched_date).toBe("2026-08-01");
  await page.fill("#update-date", "2026-07-15");
  await page.fill("#update-viewing-note", "Double bill with Aliens");
  await page.click("#update-save");
  await expect(page.locator(".toast").last()).toHaveText("Changes saved.");
  await expect.poll(() => alien.watched_date).toBe("2026-07-15");
  expect(backend.db.viewings.filter((v) => v.movie_id === alien.id)).toEqual([
    expect.objectContaining({ watched_on: "2026-07-15", note: "Double bill with Aliens" }),
  ]);
});

test("marking a movie watched makes its first viewing, with its note; with several, Edit keeps to the rating and review", async ({ page, backend }) => {
  await logIn(page);
  await page.click('.nav-btn[data-section="movies-towatch"]');
  await page.locator("#grid-movies-towatch .card", { hasText: "The Matrix" }).click();
  await page.locator('#detail-modal [data-action="mark-watched"]').click();
  await page.fill("#update-date", "2026-09-01");
  await page.fill("#update-viewing-note", "First time!");
  await page.click("#update-save");
  await expect(page.locator(".toast").last()).toHaveText("Marked as watched.");
  const matrix = backend.db.movies.find((m) => m.tmdb_id === 603);
  await expect
    .poll(() => backend.db.viewings.filter((v) => v.movie_id === matrix.id))
    .toEqual([expect.objectContaining({ watched_on: "2026-09-01", note: "First time!" })]);

  // A second viewing: Edit no longer shows a date, and says where they are.
  backend.seed("viewings", [{ movie_id: matrix.id, watched_on: "2026-09-10" }], backend.user.id);
  await page.reload();
  await page.click('.nav-btn[data-section="movies-watched"]');
  await page.locator("#grid-movies-watched .card", { hasText: "The Matrix" }).click();
  await page.locator('#detail-modal [data-action="edit"]').click();
  await expect(page.locator("#update-viewing-fields")).toBeHidden();
  await expect(page.locator("#update-viewings-hint")).toContainText("Watched 2 times");
  await page.fill("#update-review", "Better the second time.");
  await page.click("#update-save");
  await expect.poll(() => matrix.review).toBe("Better the second time.");
  expect(viewingsOf(backend, matrix)).toEqual(["2026-09-01", "2026-09-10"]);
});
